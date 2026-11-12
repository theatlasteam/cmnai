import { authenticateApiKey } from "@/lib/auth";
import { seed } from "@/lib/seed";
import {
  rateLimitStatus,
  recordUsage,
  resolveCandidates,
  usageToday,
} from "@/lib/pool";
import {
  consumeSharedQuota,
  liveEventForModel,
  sharedQuotaRemaining,
  type PoolEvent,
} from "@/lib/events";
import {
  complete,
  estimateTokens,
  logUpstreamFailure,
  promptText,
  stream,
} from "@/lib/ai";
import type { ChatMessage, ChatTool, ChatToolChoice } from "@/lib/ai";


const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

/** A completion is never cacheable: it bills tokens and may be personal. */
const NO_STORE = { "Cache-Control": "no-store" };

function limitHeaders(
  rate: Awaited<ReturnType<typeof rateLimitStatus>>,
  usage: Awaited<ReturnType<typeof usageToday>>,
) {
  return {
    "X-RateLimit-Limit": String(rate.limit),
    "X-RateLimit-Remaining": String(rate.remaining),
    "X-RateLimit-Reset": String(Math.ceil(rate.resetAt / 1000)),
    "X-Daily-Token-Limit": String(usage.limit),
    "X-Daily-Tokens-Used": String(usage.tokens),
    "X-Daily-Tokens-Remaining": String(usage.remaining),
  };
}

function errorResponse(
  status: number,
  message: string,
  code: string,
  headers: Record<string, string> = {},
) {
  return Response.json(
    { error: { message, type: "cmnai_error", code } },
    { status, headers: { ...CORS, ...NO_STORE, ...headers } },
  );
}

type Body = {
  model?: string;
  messages?: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  tools?: ChatTool[];
  tool_choice?: ChatToolChoice;
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(request: Request) {
  await seed();
  const started = Date.now();

  const auth = request.headers.get("authorization") ?? "";
  const key = await authenticateApiKey(auth.replace(/^Bearer\s+/i, "") || null);
  if (!key) {
    return errorResponse(401, "Invalid or missing API key.", "invalid_api_key");
  }

  const rate = rateLimitStatus(key.id);
  const usage = await usageToday(key.user_id);
  const quotaHeaders = limitHeaders(rate, usage);

  if (!rate.allowed) {
    const retryAfter = Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000));
    return errorResponse(
      429,
      `Rate limit exceeded: ${rate.limit} requests per minute. Retry in ${retryAfter}s.`,
      "rate_limit",
      {
        ...quotaHeaders,
        "Retry-After": String(retryAfter),
      },
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return errorResponse(400, "Request body must be valid JSON.", "invalid_json", quotaHeaders);
  }

  const model = body.model;
  const messages = body.messages;

  // An event covering this model replaces the personal daily budget: a free
  // window lifts the cap entirely, a shared quota draws from the pool.
  const event = model ? await liveEventForModel(model) : undefined;

  if (event?.kind === "shared_quota") {
    const sharedRemaining = sharedQuotaRemaining(event);
    if (sharedRemaining !== null && sharedRemaining <= 0) {
      return errorResponse(
        429,
        `The shared quota for "${event.title}" is used up.`,
        "shared_quota_exhausted",
        quotaHeaders,
      );
    }
  } else if (!event && usage.tokens >= usage.limit) {
    const retryAfter = Math.max(
      1,
      Math.ceil((Date.parse(usage.resetAt) - Date.now()) / 1000),
    );
    return errorResponse(
      429,
      `Daily fair-use limit reached (${usage.limit} tokens). Resets at ${usage.resetAt}.`,
      "daily_limit",
      {
        ...quotaHeaders,
        "Retry-After": String(retryAfter),
      },
    );
  }

  if (!model || !Array.isArray(messages) || messages.length === 0) {
    return errorResponse(
      400,
      "`model` and a non-empty `messages` array are required.",
      "invalid_request",
      quotaHeaders,
    );
  }

  const candidates = await resolveCandidates(model);
  if (candidates.length === 0) {
    return errorResponse(
      404,
      `Model "${model}" is not in the pool. GET /v1/models lists what is available.`,
      "model_not_found",
      quotaHeaders,
    );
  }

  const id = `chatcmpl_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
  const created = Math.floor(Date.now() / 1000);

  if (body.stream) {
    const encoder = new TextEncoder();
    let text = "";
    const sseStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (payload: unknown) =>
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
          );

        const failures: string[] = [];

        // The role delta belongs to the response, not to a candidate, so it is
        // emitted once before any upstream is tried.
        send({
          id,
          object: "chat.completion.chunk",
          created,
          model,
          choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
        });

        for (const route of candidates) {
          const result = stream(route, messages, {
            temperature: body.temperature,
            maxTokens: body.max_completion_tokens ?? body.max_tokens,
            tools: body.tools,
            toolChoice: body.tool_choice,
          });
          text = "";

          try {
            // `fullStream` exposes tool calls as well as text; `textStream`
            // would silently drop them.
            let sawToolCall = false;
            for await (const part of result.fullStream) {
              if (part.type === "text-delta") {
                text += part.text;
                send({
                  id,
                  object: "chat.completion.chunk",
                  created,
                  model,
                  choices: [{ index: 0, delta: { content: part.text }, finish_reason: null }],
                });
              } else if (part.type === "tool-call") {
                sawToolCall = true;
                send({
                  id,
                  object: "chat.completion.chunk",
                  created,
                  model,
                  choices: [
                    {
                      index: 0,
                      delta: {
                        tool_calls: [
                          {
                            index: 0,
                            id: part.toolCallId,
                            type: "function",
                            function: {
                              name: part.toolName,
                              arguments: JSON.stringify(part.input ?? {}),
                            },
                          },
                        ],
                      },
                      finish_reason: null,
                    },
                  ],
                });
              } else if (part.type === "error") {
                throw part.error;
              }
            }
            if (text.length === 0 && !sawToolCall) {
              // The upstream closed its stream without producing any text (for
              // example an error page parsed as a clean end-of-stream). Treat
              // it as a failed candidate so the next fallback key is tried.
              throw new Error("Upstream stream ended without any content.");
            }
            send({
              id,
              object: "chat.completion.chunk",
              created,
              model,
              choices: [
                {
                  index: 0,
                  delta: {},
                  finish_reason: sawToolCall ? "tool_calls" : "stop",
                },
              ],
            });
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            const promptTokens = estimateTokens(promptText(messages));
            const completionTokens = estimateTokens(text);
            await recordUsage({
              apiKeyId: key.id,
              userId: key.user_id,
              providerId: route.provider_id,
              model,
              promptTokens,
              completionTokens,
              status: "ok",
              latencyMs: Date.now() - started,
              eventId: event?.id ?? null,
            });
            if (event?.kind === "shared_quota") {
              await consumeSharedQuota(event.id, promptTokens + completionTokens);
            }
            return;
          } catch (error) {
            const details = logUpstreamFailure(route, error);
            failures.push(`${route.provider_name}: ${details}`);
            await recordUsage({
              apiKeyId: key.id,
              userId: key.user_id,
              providerId: route.provider_id,
              model,
              promptTokens: 0,
              completionTokens: 0,
              status: "error",
              error: details,
              latencyMs: Date.now() - started,
            });
          }
        }

        console.error("[cmnai] all upstream stream candidates failed", {
          model,
          attempts: failures,
        });
        send({
          error: {
            message: "Every endpoint serving this model failed while streaming. Try again.",
            type: "upstream_error",
            code: "upstream_unavailable",
          },
        });
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    return new Response(sseStream, {
      headers: {
        ...CORS,
        ...quotaHeaders,
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  const failures: string[] = [];
  for (const route of candidates) {
    try {
      const completion = await complete(route, messages, {
        temperature: body.temperature,
        maxTokens: body.max_completion_tokens ?? body.max_tokens,
        tools: body.tools,
        toolChoice: body.tool_choice,
      });

      await recordUsage({
        apiKeyId: key.id,
        userId: key.user_id,
        providerId: route.provider_id,
        model,
        promptTokens: completion.promptTokens,
        completionTokens: completion.completionTokens,
        status: "ok",
        latencyMs: Date.now() - started,
        eventId: event?.id ?? null,
      });
      if (event?.kind === "shared_quota") {
        await consumeSharedQuota(
          event.id,
          completion.promptTokens + completion.completionTokens,
        );
      }

      const hasToolCalls = completion.toolCalls.length > 0;

      return Response.json(
        {
          id,
          object: "chat.completion",
          created,
          model,
          provider: route.provider_name,
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: hasToolCalls ? null : completion.text,
                ...(hasToolCalls ? { tool_calls: completion.toolCalls } : {}),
              },
              finish_reason: hasToolCalls
                ? "tool_calls"
                : completion.finishReason === "length"
                  ? "length"
                  : "stop",
            },
          ],
          usage: {
            prompt_tokens: completion.promptTokens,
            completion_tokens: completion.completionTokens,
            total_tokens: completion.promptTokens + completion.completionTokens,
          },
        },
        { headers: { ...CORS, ...NO_STORE, ...quotaHeaders } },
      );
    } catch (error) {
      const details = logUpstreamFailure(route, error);
      failures.push(`${route.provider_name}: ${details}`);
      await recordUsage({
        apiKeyId: key.id,
        userId: key.user_id,
        providerId: route.provider_id,
        model,
        promptTokens: 0,
        completionTokens: 0,
        status: "error",
        error: details,
        latencyMs: Date.now() - started,
      });
    }
  }

  console.error("[cmnai] all upstream candidates failed", {
    model,
    attempts: failures,
  });
  return errorResponse(
    503,
    "Every endpoint serving this model failed. Try again or pick another model.",
    "upstream_unavailable",
    quotaHeaders,
  );
}
