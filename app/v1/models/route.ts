import { seed } from "@/lib/seed";
import { listPublicPool } from "@/lib/pool";


const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

/**
 * The pool list changes rarely, so it is safe to cache at the edge. The
 * browser keeps it for a minute, shared caches for five, and a shared cache
 * may serve a stale copy for an hour while it refreshes in the background.
 */
const CACHE_CONTROL =
  "public, max-age=60, s-maxage=300, stale-while-revalidate=3600";

async function etagFor(payload: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(payload),
  );
  const bytes = new Uint8Array(digest);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `"${btoa(binary).slice(0, 32)}"`;
}

export async function GET(request: Request) {
  await seed();
  const models = await listPublicPool();
  const body = JSON.stringify({
    object: "list",
    data: models.map((model) => ({
      id: model.id,
      object: "model",
      owned_by: "cmnai-community",
      provider: model.provider,
      context_window: model.context_window,
    })),
  });

  const etag = await etagFor(body);
  const headers = { ...CORS, "Cache-Control": CACHE_CONTROL, ETag: etag };

  // A client that already has this list does not need the body again.
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers });
  }

  return new Response(body, { headers });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
