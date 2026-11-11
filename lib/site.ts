import { headers } from "next/headers";

/**
 * The public origin this request arrived on. Cloudflare sets `host` to the
 * Worker domain (or custom domain), so API examples stay correct wherever the
 * app is deployed instead of pointing at a hardcoded domain.
 */
export async function getSiteUrl(): Promise<string> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const forwardedProto = requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol =
    forwardedProto ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1")
      ? "http"
      : "https");
  return `${protocol}://${host}`;
}
