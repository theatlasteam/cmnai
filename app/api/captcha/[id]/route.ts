import { renderCaptchaSvg } from "@/lib/captcha";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const svg = await renderCaptchaSvg(id);

  if (!svg) {
    return new Response("Captcha expired", {
      status: 404,
      headers: { "cache-control": "no-store" },
    });
  }

  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
      "x-content-type-options": "nosniff",
    },
  });
}
