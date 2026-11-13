import { authenticateApiKey } from "@/lib/auth";
import { seed } from "@/lib/seed";
import {
  clearProviderCircuit,
  openProviderCircuit,
  rateLimitStatus,
  recordUsage,
  resolveCandidates,
  usageThisWeek,
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
import {
  isHardUpstreamFailure,
  upstreamFailureReason,
} from "@/lib/upstream-error";
import {
  attemptId,
  cooldownSeconds,
  isAttemptOpen,
  PROVIDER_COOLDOWN_MS,
  recordAttemptFailure,
  recordAttemptSuccess,
} from "@/lib/circuit";
import type { ChatMessage, ChatTool, ChatToolChoice } from "@/lib/ai";


const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

/** A completion is never cacheable: it bills tokens and may be personal. */
const NO_STORE = { "Cache-Control": "no-store" };

/** One endpoint that could not serve the request, and why. */
type Failure = {
  provider: string;
  reason: string;
};

/** One endpoint that was not tried at all, because it is cooling down. */
type Skipped = {
  provider: string;
  reason: string;
  seconds: number;
};

/**
 * The reason a request failed is the part the caller needs. "Something went
 * wrong" tells them nothing, so the message names every endpoint: the ones
 * that were tried and answered, and the ones that were skipped because they
 * kept failing.
 */
function failureMessage(
  model: string,
  failures: Failure[],
  skipped: Skipped[],
  phase: "streaming" | "requesting",
): string {
  const parts: string[] = [];
  for (const failure of failures) {
    parts.push(`${failure.provider}: ${failure.reason}`);
  }
  for (const skip of skipped) {
    parts.push(
      `${skip.provider}: skipped, ${skip.reason || "cooling down"} (back in ${skip.seconds}s)`,
    );
  }
  if (parts.length === 0) {
    return `Every endpoint serving "${model}" failed while ${phase}. Try again or pick another model.`;
  }
  return `Every endpoint serving "${model}" failed while ${phase}. ${parts.join(" | ")}`;
}

function limitHeaders(
  rate: Awaited<ReturnType<typeof rateLimitStatus>>,
  usage: Awaited<ReturnType<typeof usageToday>>,
  weekly: Awaited<ReturnType<typeof usageThisWeek>>,
) {
  return {
    "X-RateLimit-Limit": String(rate.limit),
    "X-RateLimit-Remaining": String(rate.remaining),
    "X-RateLimit-Reset": String(Math.ceil(rate.resetAt / 1000)),
    "X-Daily-Token-Limit": String(usage.limit),
    "X-Daily-Tokens-Used": String(usage.tokens),
    "X-Daily-Tokens-Remaining": String(usage.remaining),
    "X-Weekly-Token-Limit": String(weekly.limit),
    "X-Weekly-Tokens-Used": String(weekly.tokens),
    "X-Weekly-Tokens-Remaining": String(weekly.remaining),
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
  const weekly = await usageThisWeek(key.user_id);
  const quotaHeaders = limitHeaders(rate, usage, weekly);

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
  } else if (!event && weekly.tokens >= weekly.limit) {
    const retryAfter = Math.max(
      1,
      Math.ceil((Date.parse(weekly.resetAt) - Date.now()) / 1000),
    );
    return errorResponse(
      429,
      `Weekly fair-use limit reached (${weekly.limit} tokens). Resets at ${weekly.resetAt}.`,
      "weekly_limit",
      {
        ...quotaHeaders,
        "Retry-After": String(retryAfter),
      },
    );
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

  const allCandidates = await resolveCandidates(model);
  if (allCandidates.length === 0) {
    return errorResponse(
      404,
      `Model "${model}" is not in the pool. GET /v1/models lists what is available.`,
      "model_not_found",
      quotaHeaders,
    );
  }

  // An endpoint that is out of credit or has been failing is skipped for a
  // while, so a request does not pay for a dead round trip every time.
  const now = Date.now();
  const skipped: Skipped[] = [];
  const candidates = allCandidates.filter((candidate) => {
    const openUntil = candidate.circuit_open_until
      ? Date.parse(candidate.circuit_open_until)
      : 0;
    if (openUntil > now) {
      skipped.push({
        provider: candidate.provider_name,
        reason: candidate.circuit_reason ?? "cooling down",
        seconds: Math.ceil((openUntil - now) / 1000),
      });
      return false;
    }
    return !isAttemptOpen(attemptId(candidate.provider_id, candidate.api_key));
  });
  if (candidates.length === 0) {
    const wait = Math.max(
      cooldownSeconds(
        allCandidates.map((candidate) =>
          attemptId(candidate.provider_id, candidate.api_key),
        ),
      ),
      ...skipped.map((skip) => skip.seconds),
    );
    return errorResponse(
      503,
      `Every endpoint serving "${model}" is cooling down after repeated failures. Try again in ${wait}s, or pick another model.${skipped.length ? ` (${skipped.map((skip) => `${skip.provider}: ${skip.reason}`).join(" | ")})` : ""}`,
      "endpoints_cooling_down",
      { ...quotaHeaders, "Retry-After": String(Math.max(1, wait)) },
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

        const failures: Failure[] = [];

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
          text = "";
          let sentAnything = false;

          try {
            // The provider is set up inside the try: a client that throws
            // while it is being built must become a failed candidate, not a
            // broken stream with no error event.
            const result = stream(route, messages, {
              temperature: body.temperature,
              maxTokens: body.max_completion_tokens ?? body.max_tokens,
              tools: body.tools,
              toolChoice: body.tool_choice,
            });

            // `fullStream` exposes tool calls as well as text; `textStream`
            // would silently drop them.
            let sawToolCall = false;
            for await (const part of result.fullStream) {
              if (part.type === "text-delta") {
                text += part.text;
                sentAnything = true;
                send({
                  id,
                  object: "chat.completion.chunk",
                  created,
                  model,
                  choices: [{ index: 0, delta: { content: part.text }, finish_reason: null }],
                });
              } else if (part.type === "tool-call") {
                sawToolCall = true;
                sentAnything = true;
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
            recordAttemptSuccess(attemptId(route.provider_id, route.api_key));
            if (route.circuit_open_until) {
              // The provider served a request again, so let it back in.
              await clearProviderCircuit(route.provider_id, route.model_id);
            }
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
            controller.close();
            return;
          } catch (error) {
            const details = logUpstreamFailure(route, error);
            const reason = upstreamFailureReason(error);
            failures.push({
              provider: route.provider_name,
              reason,
            });
            recordAttemptFailure(
              attemptId(route.provider_id, route.api_key),
              isHardUpstreamFailure(error),
            );
            if (isHardUpstreamFailure(error)) {
              // The endpoint cannot serve anyone right now, so it is skipped
              // by every isolate, not only this one.
              await openProviderCircuit(
                route.provider_id,
                route.model_id,
                reason,
                PROVIDER_COOLDOWN_MS,
              );
            }
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

            if (sentAnything) {
              // The caller already has part of this answer. Falling through to
              // another endpoint would mix two answers into one stream, so the
              // answer stops here and the failure is reported.
              break;
            }
          }
        }

        console.error("[cmnai] all upstream stream candidates failed", {
          model,
          attempts: failures,
        });
        send({
          error: {
            message: failureMessage(model, failures, skipped, "streaming"),
            type: "upstream_error",
            code: "upstream_unavailable",
            details: failures,
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

  const failures: Failure[] = [];
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

      recordAttemptSuccess(attemptId(route.provider_id, route.api_key));
      if (route.circuit_open_until) {
        await clearProviderCircuit(route.provider_id, route.model_id);
      }

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
      const reason = upstreamFailureReason(error);
      failures.push({
        provider: route.provider_name,
        reason,
      });
      recordAttemptFailure(
        attemptId(route.provider_id, route.api_key),
        isHardUpstreamFailure(error),
      );
      if (isHardUpstreamFailure(error)) {
        await openProviderCircuit(
          route.provider_id,
          route.model_id,
          reason,
          PROVIDER_COOLDOWN_MS,
        );
      }
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
    failureMessage(model, failures, skipped, "requesting"),
    "upstream_unavailable",
    quotaHeaders,
  );
}
