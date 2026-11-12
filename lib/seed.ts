import { hashPassword } from "./crypto";
import { id, now, run } from "./db";

const ADMIN_EMAIL = process.env.CMNAI_ADMIN_EMAIL ?? "admin@cmnai.dev";
const ADMIN_PASSWORD = process.env.CMNAI_ADMIN_PASSWORD ?? "cmnai-admin-2026";

/**
 * Seeding is claimed once per database, but the claim was previously made on
 * every request, which cost a D1 write each time. An isolate only needs to
 * try once; if it fails, the next request tries again.
 */
let seedAttempt: Promise<void> | undefined;

export async function seed(): Promise<void> {
  if (!seedAttempt) {
    seedAttempt = runSeed().catch((error) => {
      seedAttempt = undefined;
      throw error;
    });
  }
  return seedAttempt;
}

async function runSeed(): Promise<void> {
  // Claim the seed once, even if two isolates start at the same time.
  const claim = await run(
    "INSERT OR IGNORE INTO meta (key, value) VALUES ('seeded', ?)",
    now(),
  );
  if (!claim.meta.changes) return;

  const adminId = id("usr_");
  await run(
    `INSERT OR IGNORE INTO users (id, email, name, password_hash, role, status, locale, created_at)
     VALUES (?, ?, ?, ?, 'admin', 'active', 'en', ?)`,
    adminId,
    ADMIN_EMAIL,
    "cmnAI admin",
    await hashPassword(ADMIN_PASSWORD),
    now(),
  );

  const memberId = id("usr_");
  await run(
    `INSERT OR IGNORE INTO users (id, email, name, password_hash, role, status, locale, created_at)
     VALUES (?, ?, ?, ?, 'user', 'active', 'en', ?)`,
    memberId,
    "worker@cmnai.dev",
    "Sam Worker",
    await hashPassword("cmnai-worker-2026"),
    now(),
  );

  const providers = [
    {
      name: "OpenRouter community relay",
      base: "https://openrouter.ai/api/v1",
      status: "approved",
      priority: 120,
      note: "Primary relay contributed by the founding members.",
      models: [
        ["openai/gpt-4o-mini", "GPT-4o mini", 128000],
        ["meta-llama/llama-3.3-70b-instruct", "Llama 3.3 70B", 131072],
      ],
    },
    {
      name: "Northern Lights inference",
      base: "https://api.northern-lights.example/v1",
      status: "approved",
      priority: 100,
      note: "EU-hosted endpoint, donated spare capacity.",
      models: [
        ["qwen/qwen-2.5-72b-instruct", "Qwen 2.5 72B", 32768],
        ["mistralai/mistral-nemo", "Mistral Nemo", 128000],
      ],
    },
    {
      name: "Lagos GPU collective",
      base: "https://llm.lagos-collective.example/v1",
      status: "pending",
      priority: 100,
      note: "New contributor, waiting for first review.",
      models: [["deepseek/deepseek-chat", "DeepSeek Chat", 64000]],
    },
  ] as const;

  for (const provider of providers) {
    const providerId = id("prv_");
    await run(
      `INSERT INTO providers (id, user_id, name, base_url, api_key, contact, notes, status, priority, created_at, reviewed_at, reviewed_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      providerId,
      provider.status === "approved" ? memberId : adminId,
      provider.name,
      provider.base,
      "demo-upstream-key",
      "community@cmnai.dev",
      provider.note,
      provider.status,
      provider.priority,
      now(),
      provider.status === "approved" ? now() : null,
      provider.status === "approved" ? adminId : null,
    );

    for (const [modelId, displayName, context] of provider.models) {
      await run(
        `INSERT INTO models (id, provider_id, model_id, display_name, context_window, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        id("mdl_"),
        providerId,
        modelId,
        displayName,
        context,
        provider.status === "approved" ? "approved" : "pending",
        now(),
      );
    }
  }
}
