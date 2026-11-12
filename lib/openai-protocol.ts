import { jsonSchema } from "ai";
import type {
  AssistantModelMessage,
  ModelMessage,
  TextPart,
  ToolCallPart,
  ToolModelMessage,
  ToolResultPart,
  ToolSet,
} from "@ai-sdk/provider-utils";

/**
 * Translation between the OpenAI Chat Completions wire format that clients
 * send us and the message/tool shapes the AI SDK expects.
 *
 * These helpers are pure so they can be unit tested without touching an
 * upstream provider.
 */

/** A message in the OpenAI Chat Completions shape that clients send us. */
export type ChatMessage = {
  role: "system" | "developer" | "user" | "assistant" | "tool";
  content?: string | null;
  name?: string;
  tool_calls?: ChatToolCall[];
  tool_call_id?: string;
};

export type ChatToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

/** A tool definition in the OpenAI Chat Completions shape. */
export type ChatTool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ChatToolChoice =
  | "auto"
  | "none"
  | "required"
  | { type: "function"; function: { name: string } };

function textOf(content: ChatMessage["content"]): string {
  return typeof content === "string" ? content : "";
}

/**
 * Converts OpenAI Chat Completions messages into AI SDK model messages.
 *
 * The AI SDK expects system prompts in a dedicated `instructions` slot and
 * rejects `role: "system"` inside `messages` unless they are explicitly
 * allowed. It also expects tool calls and tool results as content parts
 * rather than the sibling `tool_calls` / `tool_call_id` fields OpenAI uses.
 */
export function toModelMessages(messages: ChatMessage[]): {
  instructions: string | undefined;
  messages: ModelMessage[];
} {
  const systemParts: string[] = [];
  const modelMessages: ModelMessage[] = [];

  for (const message of messages) {
    const text = textOf(message.content);

    if (message.role === "system" || message.role === "developer") {
      if (text) systemParts.push(text);
      continue;
    }

    if (message.role === "tool") {
      // OpenAI sends the tool result as its own message. The AI SDK wants it
      // as a tool message holding tool-result parts.
      const part: ToolResultPart = {
        type: "tool-result",
        toolCallId: message.tool_call_id ?? "",
        toolName: message.name ?? "",
        output: { type: "text", value: text },
      };
      const toolMessage: ToolModelMessage = { role: "tool", content: [part] };
      modelMessages.push(toolMessage);
      continue;
    }

    if (message.role === "assistant") {
      const content: Array<TextPart | ToolCallPart> = [];
      if (text) content.push({ type: "text", text });
      for (const call of message.tool_calls ?? []) {
        content.push({
          type: "tool-call",
          toolCallId: call.id,
          toolName: call.function.name,
          input: parseToolArguments(call.function.arguments),
        });
      }
      const assistant: AssistantModelMessage = { role: "assistant", content };
      modelMessages.push(assistant);
      continue;
    }

    modelMessages.push({ role: "user", content: text });
  }

  return {
    instructions: systemParts.length ? systemParts.join("\n\n") : undefined,
    messages: modelMessages,
  };
}

/** Tool arguments arrive as a JSON string; keep them usable even if invalid. */
function parseToolArguments(args: string): unknown {
  try {
    return JSON.parse(args);
  } catch {
    return args;
  }
}

/**
 * Converts OpenAI tool definitions into an AI SDK tool set. The JSON Schema
 * from the client is passed through untouched so the upstream sees exactly
 * what the client declared.
 */
export function toToolSet(tools: ChatTool[] | undefined): ToolSet | undefined {
  if (!tools?.length) return undefined;

  const toolSet: ToolSet = {};
  for (const tool of tools) {
    if (tool.type !== "function" || !tool.function?.name) continue;
    toolSet[tool.function.name] = {
      type: "function",
      description: tool.function.description,
      inputSchema: jsonSchema(
        (tool.function.parameters ?? {
          type: "object",
          properties: {},
        }) as never,
      ),
    } as ToolSet[string];
  }
  return Object.keys(toolSet).length ? toolSet : undefined;
}

/** Maps the OpenAI `tool_choice` value onto the AI SDK shape. */
export function toToolChoice(
  choice: ChatToolChoice | undefined,
): "auto" | "none" | "required" | { type: "tool"; toolName: string } | undefined {
  if (!choice) return undefined;
  if (choice === "auto" || choice === "none" || choice === "required") {
    return choice;
  }
  if (choice.type === "function" && choice.function?.name) {
    return { type: "tool", toolName: choice.function.name };
  }
  return undefined;
}
