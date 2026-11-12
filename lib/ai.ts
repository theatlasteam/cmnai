import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { APICallError, generateText, streamText } from "ai";
import type { PoolModel } from "./pool";
import { parseProviderHeaders, providerHeaderNames } from "./provider-headers";
import {
  toModelMessages,
  toToolChoice,
  toToolSet,
  type ChatMessage,
  type ChatTool,
  type ChatToolChoice,
} from "./openai-protocol";

export type { ChatMessage, ChatTool, ChatToolChoice };

function providerName(route: PoolModel): string {
  return route.provider_name.replace(/\s+/g, "-").toLowerCase();
}

function providerHeaders(route: PoolModel) {
  return {
    "HTTP-Referer": "https://cmnai.dev",
    "X-Title": "cmnAI community pool",
    ...parseProviderHeaders(route.headers_json),
  };
}

/**
 * Builds the AI SDK model for the API dialect this provider speaks. cmnAI
 * always exposes /v1/chat/completions to clients, but internally a provider can
 * use Chat Completions, the OpenAI Responses API, or Anthropic Messages.
 */
export function modelFor(route: PoolModel) {
  const name = providerName(route);
  const headers = providerHeaders(route);
  const baseURL = route.base_url;

  switch (route.api_mode) {
    case "responses":
      return createOpenAI({
        name,
        baseURL,
        apiKey: route.api_key,
        headers,
      }).responses(route.model_id);
    case "anthropic_messages":
      return createAnthropic({
        name,
        baseURL,
        apiKey: route.api_key,
        headers,
      }).messages(route.model_id);
    default:
      return createOpenAICompatible({
        name,
        baseURL,
        apiKey: route.api_key,
        headers,
      }).chatModel(route.model_id);
  }
}

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function promptText(messages: ChatMessage[]): string {
  return messages
    .map((m) => `${m.role}: ${typeof m.content === "string" ? m.content : ""}`)
    .join("\n");
}

/**
 * Turns an AI SDK/provider error into one line safe to store and show to
 * admins. Upstream response bodies are truncated so a single failure cannot
 * balloon the usage table.
 */
export function upstreamErrorDetails(error: unknown): string {
  if (APICallError.isInstance(error)) {
    const body = error.responseBody?.replace(/\s+/g, " ").trim();
    if (body) return `HTTP ${error.statusCode ?? "?"}: ${body.slice(0, 1200)}`;
    return `HTTP ${error.statusCode ?? "?"}: ${error.message}`;
  }
  if (error instanceof Error) return error.message.slice(0, 1200);
  return String(error).slice(0, 1200);
}

export function logUpstreamFailure(route: PoolModel, error: unknown): string {
  const details = upstreamErrorDetails(error);
  console.error("[cmnai] upstream request failed", {
    provider: route.provider_name,
    provider_id: route.provider_id,
    base_url: route.base_url,
    model: route.model_id,
    api_mode: route.api_mode,
    mask_headers: providerHeaderNames(route.headers_json),
    error: details,
  });
  return details;
}

export type CompletionOptions = {
  temperature?: number;
  maxTokens?: number;
  tools?: ChatTool[];
  toolChoice?: ChatToolChoice;
};

export async function complete(
  route: PoolModel,
  messages: ChatMessage[],
  options: CompletionOptions = {},
) {
  const { instructions, messages: modelMessages } = toModelMessages(messages);
  const result = await generateText({
    model: modelFor(route),
    messages: modelMessages,
    ...(instructions ? { instructions } : {}),
    temperature: options.temperature,
    maxOutputTokens: options.maxTokens,
    tools: toToolSet(options.tools),
    toolChoice: toToolChoice(options.toolChoice),
  });
  const usage = result.usage as
    | { inputTokens?: number; outputTokens?: number; promptTokens?: number; completionTokens?: number }
    | undefined;
  const toolCalls = (result.toolCalls ?? []).map((call) => ({
    id: call.toolCallId,
    type: "function" as const,
    function: {
      name: call.toolName,
      arguments: JSON.stringify(call.input ?? {}),
    },
  }));
  return {
    text: result.text,
    toolCalls,
    finishReason: result.finishReason,
    promptTokens: usage?.inputTokens ?? usage?.promptTokens ?? estimateTokens(promptText(messages)),
    completionTokens:
      usage?.outputTokens ?? usage?.completionTokens ?? estimateTokens(result.text),
  };
}

export function stream(
  route: PoolModel,
  messages: ChatMessage[],
  options: CompletionOptions = {},
) {
  const { instructions, messages: modelMessages } = toModelMessages(messages);
  return streamText({
    model: modelFor(route),
    messages: modelMessages,
    ...(instructions ? { instructions } : {}),
    temperature: options.temperature,
    maxOutputTokens: options.maxTokens,
    tools: toToolSet(options.tools),
    toolChoice: toToolChoice(options.toolChoice),
  });
}
