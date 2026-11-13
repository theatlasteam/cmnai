"use server";

import { revalidatePath } from "next/cache";
import { invalidatePoolCache } from "@/lib/pool";
import { redirect } from "next/navigation";
import {
  createApiKeyForUser,
  listApiKeys,
  requireAdmin,
  requireUser,
} from "@/lib/auth";
import { all, now, one, run } from "@/lib/db";
import { consumeCaptcha } from "@/lib/captcha";
import { normalizeProviderMode } from "@/lib/provider-mode";
import {
  fetchNewApiQuotaFingerprint,
  saveProviderKey,
  verifyProviderKey,
} from "@/lib/provider-keys";

export type ActionState = {
  error?: string;
  success?: string;
  status?: "verified" | "failed";
};

export async function createKeyAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Name your key." };
  if ((await listApiKeys(user.id)).filter((k) => !k.revoked_at).length >= 10) {
    return { error: "Limit of 10 active keys reached." };
  }
  const created = await createApiKeyForUser(user.id, name);
  revalidatePath("/dashboard/keys");
  return { success: created.key };
}

export async function revokeKeyAction(formData: FormData) {
  const user = await requireUser();
  const keyId = String(formData.get("keyId") ?? "");
  await run(
    "UPDATE api_keys SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL",
    now(),
    keyId,
    user.id,
  );
  revalidatePath("/dashboard/keys");
}

export async function submitEndpointAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const baseUrl = String(formData.get("baseUrl") ?? "").trim().replace(/\/+$/, "");
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  const apiMode = normalizeProviderMode(formData.get("apiMode"));
  const modelsRaw = String(formData.get("models") ?? "");
  const contact = String(formData.get("contact") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const captchaId = String(formData.get("captchaId") ?? "");
  const captchaAnswer = String(formData.get("captchaAnswer") ?? "");

  if (!name || !baseUrl || !apiKey || !modelsRaw.trim()) {
    return { error: "Fill in the required fields." };
  }
  if (!/^https?:\/\//i.test(baseUrl)) {
    return { error: "Base URL must start with http:// or https://." };
  }
  if (!(await consumeCaptcha(captchaId, captchaAnswer))) {
    return { error: "Captcha answer was not correct." };
  }

  const models = Array.from(
    new Set(
      modelsRaw
        .split(/[,\n]/)
        .map((m) => m.trim())
        .filter(Boolean),
    ),
  );
  if (models.length === 0) return { error: "Add at least one model." };

  const providerId = crypto.randomUUID().replace(/-/g, "").slice(0, 24);
  await run(
    `INSERT INTO providers (id, user_id, name, base_url, api_key, api_mode, contact, notes, status, priority, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 100, ?)`,
    `prv_${providerId}`,
    user.id,
    name,
    baseUrl,
    "",
    apiMode,
    contact || null,
    notes || null,
    now(),
  );

  const verification = await verifyProviderKey(baseUrl, apiKey, models[0], apiMode);
  await saveProviderKey({
    providerId: `prv_${providerId}`,
    userId: user.id,
    apiKey,
    label: name,
    verified: verification.ok,
    error: verification.error ?? null,
  });

  for (const model of models) {
    await run(
      `INSERT OR IGNORE INTO models (id, provider_id, model_id, display_name, context_window, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
      `mdl_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`,
      `prv_${providerId}`,
      model,
      model,
      null,
      now(),
    );
  }

  revalidatePath("/dashboard/endpoints");
  revalidatePath("/providers");
  revalidatePath("/dashboard", "layout");
  invalidatePoolCache();
  redirect(`/dashboard/endpoints?submitted=${verification.ok ? "verified" : "unverified"}`);
}

export async function addProviderKeyAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const providerId = String(formData.get("providerId") ?? "").trim();
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();

  if (!providerId || !apiKey) return { error: "Enter an API key." };

  const provider = await one<{
    id: string;
    name: string;
    base_url: string;
    api_mode: string;
    headers_json: string;
    is_newapi: number;
  }>(
    "SELECT id, name, base_url, api_mode, headers_json, is_newapi FROM providers WHERE id = ? AND status = 'approved'",
    providerId,
  );
  if (!provider) return { error: "That provider is not available." };

  const existing = await one<{ id: string }>(
    "SELECT id FROM provider_keys WHERE provider_id = ? AND api_key = ?",
    providerId,
    apiKey,
  );
  if (existing) return { error: "This API key has already been added to this provider." };

  let quotaFingerprint: string | null = null;
  if (provider.is_newapi) {
    quotaFingerprint = await fetchNewApiQuotaFingerprint(provider.base_url, apiKey);
    if (quotaFingerprint) {
      const sameAccount = await one<{ id: string }>(
        "SELECT id FROM provider_keys WHERE provider_id = ? AND quota_fingerprint = ?",
        providerId,
        quotaFingerprint,
      );
      if (sameAccount) {
        return { error: "A key from this same account/quota is already in the pool." };
      }
    }
  }

  const firstModel = await one<{ model_id: string }>(
    "SELECT model_id FROM models WHERE provider_id = ? AND status = 'approved' ORDER BY display_name LIMIT 1",
    providerId,
  );

  const verification = await verifyProviderKey(
    provider.base_url,
    apiKey,
    firstModel?.model_id ?? null,
    provider.api_mode,
    provider.headers_json,
  );

  await saveProviderKey({
    providerId,
    userId: user.id,
    apiKey,
    label: label || provider.name,
    verified: verification.ok,
    error: verification.error ?? null,
  });

  revalidatePath("/providers");
  revalidatePath("/dashboard", "layout");
  invalidatePoolCache();

  if (!verification.ok) {
    return {
      status: "failed",
      error: verification.error ?? "The key could not be verified.",
    };
  }

  return {
    status: "verified",
    success: "Key verified and added to the pool for this provider.",
  };
}

export async function updateEndpointModelsAction(formData: FormData) {
  await requireAdmin();
  const providerId = String(formData.get("providerId") ?? "");
  const modelsRaw = String(formData.get("models") ?? "");
  const models = Array.from(
    new Set(
      modelsRaw
        .split(/[,\n]/)
        .map((m) => m.trim())
        .filter(Boolean),
    ),
  );
  if (models.length === 0) return;

  const owned = await one<{ id: string; status: string }>(
    "SELECT id, status FROM providers WHERE id = ?",
    providerId,
  );
  if (!owned) return;

  const modelStatus = owned.status === "active" ? "active" : "pending";
  await run("DELETE FROM models WHERE provider_id = ?", providerId);
  for (const model of models) {
    await run(
      `INSERT OR IGNORE INTO models (id, provider_id, model_id, display_name, context_window, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      `mdl_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`,
      providerId,
      model,
      model,
      null,
      modelStatus,
      now(),
    );
  }
  revalidatePath("/dashboard/endpoints");
  revalidatePath("/providers");
  revalidatePath("/dashboard", "layout");
  invalidatePoolCache();
}

export async function removeOwnEndpointAction(formData: FormData) {
  const user = await requireUser();
  const providerId = String(formData.get("providerId") ?? "");
  const owned = await one<{ id: string }>(
    "SELECT id FROM providers WHERE id = ? AND user_id = ? AND status IN ('pending','rejected','paused')",
    providerId,
    user.id,
  );
  if (owned) {
    await run("DELETE FROM providers WHERE id = ?", providerId);
  }
  revalidatePath("/dashboard/endpoints");
  invalidatePoolCache();
}

export async function getOwnEndpoints(userId: string) {
  return all<{
    id: string;
    name: string;
    base_url: string;
    api_mode: string;
    status: string;
    notes: string | null;
    created_at: string;
    model_count: number;
    models: string | null;
  }>(
    `SELECT p.id, p.name, p.base_url, p.api_mode, p.status, p.notes, p.created_at,
            COUNT(m.id) AS model_count,
            GROUP_CONCAT(m.model_id, ', ') AS models
     FROM providers p LEFT JOIN models m ON m.provider_id = p.id
     WHERE p.user_id = ? GROUP BY p.id ORDER BY p.created_at DESC`,
    userId,
  );
}
