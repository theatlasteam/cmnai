"use server";

import { revalidatePath } from "next/cache";
import { invalidatePoolCache } from "@/lib/pool";
import { requireAdmin } from "@/lib/auth";
import { id, now, one, run } from "@/lib/db";
import { parseProviderHeaders } from "@/lib/provider-headers";
import { normalizeProviderMode } from "@/lib/provider-mode";

async function audit(
  actorId: string,
  action: string,
  targetType: string,
  targetId: string,
  detail?: string,
) {
  await run(
    `INSERT INTO audit_log (id, actor_id, action, target_type, target_id, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id("aud_"),
    actorId,
    action,
    targetType,
    targetId,
    detail ?? null,
    now(),
  );
}

export async function createProviderAction(formData: FormData) {
  const admin = await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const baseUrl = String(formData.get("baseUrl") ?? "").trim().replace(/\/+$/, "");
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  const apiMode = normalizeProviderMode(formData.get("apiMode"));
  const headersJson = JSON.stringify(parseProviderHeaders(formData.get("maskHeaders")));
  const modelsRaw = String(formData.get("models") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();
  const priority = Number.parseInt(String(formData.get("priority") ?? "100"), 10);
  const status = String(formData.get("status") ?? "pending") === "approved" ? "approved" : "pending";

  if (!name || !baseUrl || !apiKey || !/^https?:\/\//i.test(baseUrl)) return;

  const providerId = id("prv_");
  await run(
    `INSERT INTO providers (id, user_id, name, base_url, api_key, api_mode, headers_json, contact, notes, status, priority, created_at, reviewed_at, reviewed_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
    providerId,
    admin.id,
    name,
    baseUrl,
    apiKey,
    apiMode,
    headersJson,
    notes || null,
    status,
    Number.isFinite(priority) ? Math.max(0, Math.min(1000, priority)) : 100,
    now(),
    status === "approved" ? now() : null,
    status === "approved" ? admin.id : null,
  );

  const models = Array.from(
    new Set(
      modelsRaw
        .split(/[,\n]/)
        .map((m) => m.trim())
        .filter(Boolean),
    ),
  );
  for (const model of models) {
    await run(
      `INSERT OR IGNORE INTO models (id, provider_id, model_id, display_name, context_window, status, created_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?)`,
      id("mdl_"),
      providerId,
      model,
      model,
      status === "approved" ? "approved" : "pending",
      now(),
    );
  }

  await audit(admin.id, "provider.create", "provider", providerId, name);
  revalidatePath("/admin/providers");
  revalidatePath("/admin");
  revalidatePath("/");
  invalidatePoolCache();
}

export async function reviewProviderAction(formData: FormData) {
  const admin = await requireAdmin();
  const providerId = String(formData.get("providerId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!["approve", "reject", "pause", "resume", "remove"].includes(decision)) return;

  const provider = await one<{ id: string; name: string; status: string }>(
    "SELECT id, name, status FROM providers WHERE id = ?",
    providerId,
  );
  if (!provider) return;

  if (decision === "remove") {
    await run("DELETE FROM providers WHERE id = ?", providerId);
    await audit(admin.id, "provider.remove", "provider", providerId, provider.name);
  } else {
    const status =
      decision === "approve"
        ? "approved"
        : decision === "reject"
          ? "rejected"
          : decision === "pause"
            ? "paused"
            : "approved";
    await run(
      `UPDATE providers SET status = ?, reviewed_at = ?, reviewed_by = ? WHERE id = ?`,
      status,
      now(),
      admin.id,
      providerId,
    );
    await audit(admin.id, `provider.${decision}`, "provider", providerId, provider.name);

    if (status === "approved") {
      await run(
        "UPDATE models SET status = 'approved' WHERE provider_id = ? AND status = 'pending'",
        providerId,
      );
    }
    if (status === "paused" || status === "rejected") {
      await run(
        "UPDATE models SET status = 'offline' WHERE provider_id = ? AND status = 'approved'",
        providerId,
      );
    }
  }

  revalidatePath("/admin");
  revalidatePath("/admin/providers");
  revalidatePath("/");
  revalidatePath("/providers");
  revalidatePath("/dashboard", "layout");
}
  invalidatePoolCache();

export async function reviewModelAction(formData: FormData) {
  const admin = await requireAdmin();
  const modelId = String(formData.get("modelId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!["approve", "reject"].includes(decision)) return;

  await run(
    "UPDATE models SET status = ? WHERE id = ?",
    decision === "approve" ? "approved" : "rejected",
    modelId,
  );
  await audit(admin.id, `model.${decision}`, "model", modelId);
  revalidatePath("/admin");
  revalidatePath("/admin/providers");
  revalidatePath("/");
}
  invalidatePoolCache();

export async function updateProviderAction(formData: FormData) {
  const admin = await requireAdmin();
  const providerId = String(formData.get("providerId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const baseUrl = String(formData.get("baseUrl") ?? "").trim().replace(/\/+$/, "");
  const apiMode = normalizeProviderMode(formData.get("apiMode"));
  const headersJson = JSON.stringify(parseProviderHeaders(formData.get("maskHeaders")));
  const priority = Number.parseInt(String(formData.get("priority") ?? "100"), 10);
  const notes = String(formData.get("notes") ?? "").trim();
  const isNewApi =
    formData.get("isNewApi") === "on" || formData.get("isNewApi") === "1" ? 1 : 0;

  if (!name || !/^https?:\/\//i.test(baseUrl)) return;

  await run(
    "UPDATE providers SET name = ?, base_url = ?, api_mode = ?, headers_json = ?, priority = ?, notes = ?, is_newapi = ? WHERE id = ?",
    name,
    baseUrl,
    apiMode,
    headersJson,
    Number.isFinite(priority) ? Math.max(0, Math.min(1000, priority)) : 100,
    notes || null,
    isNewApi,
    providerId,
  );
  await audit(admin.id, "provider.update", "provider", providerId, name);
  revalidatePath("/admin/providers");
  revalidatePath("/admin");
}
  invalidatePoolCache();

export async function updateUserAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const target = await one<{ id: string; role: string; status: string }>(
    "SELECT id, role, status FROM users WHERE id = ?",
    userId,
  );
  if (!target || target.id === admin.id) return;

  if (decision === "suspend" || decision === "activate") {
    const status = decision === "suspend" ? "suspended" : "active";
    await run("UPDATE users SET status = ? WHERE id = ?", status, userId);
    if (status === "suspended") {
      await run("DELETE FROM sessions WHERE user_id = ?", userId);
    }
    await audit(admin.id, `user.${decision}`, "user", userId);
  } else if (decision === "promote" || decision === "demote") {
    const role = decision === "promote" ? "admin" : "user";
    await run("UPDATE users SET role = ? WHERE id = ?", role, userId);
    await audit(admin.id, `user.${decision}`, "user", userId);
  }

  revalidatePath("/admin/users");
}
