import { POST as chatCompletionsPost, OPTIONS as chatCompletionsOptions } from "../chat/completions/route";
import type { ChatMessage } from "@/lib/ai";

export const OPTIONS = chatCompletionsOptions;

type InputItem =
  | string
  | {
      role?: string;
      content?: string | Array<{ type?: string; text?: string }>;
    };

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === "object" && part !== null && "text" in part ? String(part.text ?? "") : ""))
      .join("");
  }
  return "";
}

function normalizeMessages(body: Record<string, unknown>): ChatMessage[] {
  const messages: ChatMessage[] = [];
  const system =
    typeof body.instructions === "string"
      ? body.instructions
      : typeof body.system === "string"
        ? body.system
        : undefined;
  if (system) {
    messages.push({ role: "system", content: system });
  }

  if (Array.isArray(body.messages)) {
    for (const msg of body.messages) {
      if (msg && typeof msg === "object") {
        const m = msg as Record<string, unknown>;
        messages.push({
          role: (m.role as ChatMessage["role"]) ?? "user",
          content: extractText(m.content),
        });
      }
    }
    return messages;
  }

  const input = body.input as InputItem | InputItem[] | undefined;
  if (typeof input === "string") {
    messages.push({ role: "user", content: input });
  } else if (Array.isArray(input)) {
    for (const item of input) {
      if (typeof item === "string") {
        messages.push({ role: "user", content: item });
      } else if (item && typeof item === "object") {
        messages.push({
          role: (item.role as ChatMessage["role"]) ?? "user",
          content: extractText(item.content),
        });
      }
    }
  }

  return messages;
}

export async function POST(request: Request) {
  let raw: Record<string, unknown>;
  try {
    raw = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json(
      { error: { message: "Invalid JSON body.", type: "invalid_request_error", code: "invalid_json" } },
      { status: 400 },
    );
  }

  const normalizedBody = {
    model: raw.model,
    messages: normalizeMessages(raw),
    stream: Boolean(raw.stream),
    temperature: raw.temperature,
    max_tokens: raw.max_output_tokens ?? raw.max_tokens ?? raw.max_completion_tokens,
    tools: raw.tools,
    tool_choice: raw.tool_choice,
  };

  const proxiedRequest = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify(normalizedBody),
  });

  const res = await chatCompletionsPost(proxiedRequest);
  if (!res.ok) return res;

  if (!normalizedBody.stream) {
    const data = (await res.json()) as {
      id?: string;
      created?: number;
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };
    const respId = (data.id ?? `resp_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`).replace(
      /^chatcmpl_/,
      "resp_",
    );
    const text = data.choices?.[0]?.message?.content ?? "";
    return Response.json(
      {
        id: respId,
        object: "response",
        created_at: data.created ?? Math.floor(Date.now() / 1000),
        status: "completed",
        model: data.model ?? raw.model,
        output: [
          {
            id: `msg_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`,
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text }],
          },
        ],
        usage: {
          input_tokens: data.usage?.prompt_tokens ?? 0,
          output_tokens: data.usage?.completion_tokens ?? 0,
          total_tokens: data.usage?.total_tokens ?? 0,
        },
      },
      { status: 200, headers: res.headers },
    );
  }

  if (!res.body) return res;

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  let sentCreated = false;
  let fullText = "";

  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() ?? "";

      for (const block of lines) {
        const line = block.trim();
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") {
          controller.enqueue(
            encoder.encode(
              `event: response.completed\ndata: ${JSON.stringify({ type: "response.completed", response: { status: "completed", output_text: fullText } })}\n\n`,
            ),
          );
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          continue;
        }
        try {
          const parsed = JSON.parse(payload) as {
            id?: string;
            model?: string;
            error?: unknown;
            choices?: Array<{ delta?: { content?: string } }>;
          };
          if (parsed.error) {
            controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify(parsed)}\n\n`));
            continue;
          }
          if (!sentCreated) {
            sentCreated = true;
            controller.enqueue(
              encoder.encode(
                `event: response.created\ndata: ${JSON.stringify({ type: "response.created", response: { id: (parsed.id ?? "").replace(/^chatcmpl_/, "resp_"), model: parsed.model, status: "in_progress" } })}\n\n`,
              ),
            );
          }
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            fullText += delta;
            controller.enqueue(
              encoder.encode(
                `event: response.output_text.delta\ndata: ${JSON.stringify({ type: "response.output_text.delta", delta })}\n\n`,
              ),
            );
          }
        } catch {
          // Ignore malformed SSE chunks
        }
      }
    },
  });

  return new Response(res.body.pipeThrough(transform), {
    status: res.status,
    headers: res.headers,
  });
}
