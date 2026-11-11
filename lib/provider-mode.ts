export const providerModes = [
  "chat_completions",
  "responses",
  "anthropic_messages",
] as const;

export type ProviderMode = (typeof providerModes)[number];

export function normalizeProviderMode(value: unknown): ProviderMode {
  return providerModes.includes(value as ProviderMode)
    ? (value as ProviderMode)
    : "chat_completions";
}

export function providerModeLabel(mode: ProviderMode): string {
  switch (mode) {
    case "responses":
      return "OpenAI Responses API";
    case "anthropic_messages":
      return "Anthropic Messages API";
    default:
      return "OpenAI Chat Completions";
  }
}
