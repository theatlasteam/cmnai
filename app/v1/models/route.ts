import { seed } from "@/lib/seed";
import { listPublicPool } from "@/lib/pool";


const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

export async function GET() {
  await seed();
  const models = await listPublicPool();
  return Response.json(
    {
      object: "list",
      data: models.map((model) => ({
        id: model.id,
        object: "model",
        owned_by: "cmnai-community",
        provider: model.provider,
        context_window: model.context_window,
      })),
    },
    { headers: CORS },
  );
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
