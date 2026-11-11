export type ProviderHeaders = Record<string, string>;

const HEADER_NAME = /^[A-Za-z0-9!#$%&'*+\-.^_`|~]+$/;
const BLOCKED_HEADERS = new Set(["host", "content-length", "connection"]);

/**
 * Admins can provide outbound "mask" headers as either a JSON object or one
 * `Name: value` pair per line. Values are sent upstream as-is, and are never
 * exposed in the public provider directory or in error logs.
 */
export function parseProviderHeaders(input: unknown): ProviderHeaders {
  if (typeof input !== "string" || !input.trim()) return {};

  const text = input.trim();
  let pairs: Array<[string, string]> = [];

  if (text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      pairs = Object.entries(parsed)
        .filter(([, value]) => typeof value === "string")
        .map(([key, value]) => [key, String(value)]);
    } catch {
      return {};
    }
  } else {
    pairs = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separator = line.indexOf(":");
        if (separator === -1) return ["", ""] as [string, string];
        return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
      });
  }

  const headers: ProviderHeaders = {};
  for (const [name, value] of pairs) {
    if (!name || !HEADER_NAME.test(name)) continue;
    if (BLOCKED_HEADERS.has(name.toLowerCase())) continue;
    headers[name] = value.replace(/[\r\n]+/g, " ").trim();
  }
  return headers;
}

export function headersToText(input: unknown): string {
  return Object.entries(parseProviderHeaders(input))
    .map(([name, value]) => `${name}: ${value}`)
    .join("\n");
}

export function providerHeaderNames(input: unknown): string[] {
  return Object.keys(parseProviderHeaders(input));
}
