"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
  createEvent,
  deleteEvent,
  setEventStatus,
  updateEvent,
  type EventKind,
  type EventStatus,
} from "@/lib/events";
import { all } from "@/lib/db";
import { parseEventStart } from "@/lib/event-time";

export type EventActionState = {
  error?: string;
  success?: string;
};

function parseKind(value: FormDataEntryValue | null): EventKind {
  return value === "shared_quota" ? "shared_quota" : "free_window";
}

function parseStatus(value: FormDataEntryValue | null): EventStatus {
  if (value === "published" || value === "ended") return value;
  return "draft";
}

function parseNumber(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
}

function parseModels(value: FormDataEntryValue | null): string {
  if (typeof value !== "string") return "";
  return value
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean)
    .join(", ");
}

export async function createEventAction(
  _prev: EventActionState,
  formData: FormData,
): Promise<EventActionState> {
  const admin = await requireAdmin();

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "Give the event a title." };

  const kind = parseKind(formData.get("kind"));
  const quotaTokens = parseNumber(formData.get("quotaTokens"));
  if (kind === "shared_quota" && !quotaTokens) {
    return { error: "A shared quota needs a token budget." };
  }

  const startsAt = parseEventStart(formData);
  const durationHours = parseNumber(formData.get("durationHours")) ?? 48;
  if (!startsAt) return { error: "Pick when the event starts." };
  if (durationHours <= 0) return { error: "The event must last at least an hour." };

  await createEvent({
    title,
    description: String(formData.get("description") ?? "").trim(),
    kind,
    models: parseModels(formData.get("models")),
    quota_tokens: kind === "shared_quota" ? quotaTokens : null,
    duration_hours: durationHours,
    starts_at: startsAt,
    badge: String(formData.get("badge") ?? "").trim() || null,
    status: parseStatus(formData.get("status")),
    actorId: admin.id,
  });

  revalidatePath("/admin/events");
  revalidatePath("/");
  return { success: "Event created." };
}

export async function updateEventAction(
  _prev: EventActionState,
  formData: FormData,
): Promise<EventActionState> {
  const admin = await requireAdmin();

  const eventId = String(formData.get("eventId") ?? "").trim();
  if (!eventId) return { error: "Unknown event." };

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "Give the event a title." };

  const kind = parseKind(formData.get("kind"));
  const quotaTokens = parseNumber(formData.get("quotaTokens"));
  if (kind === "shared_quota" && !quotaTokens) {
    return { error: "A shared quota needs a token budget." };
  }

  const startsAt = parseEventStart(formData);
  const durationHours = parseNumber(formData.get("durationHours")) ?? 48;
  if (!startsAt) return { error: "Pick when the event starts." };

  await updateEvent(eventId, {
    title,
    description: String(formData.get("description") ?? "").trim(),
    kind,
    models: parseModels(formData.get("models")),
    quota_tokens: kind === "shared_quota" ? quotaTokens : null,
    duration_hours: durationHours,
    starts_at: startsAt,
    badge: String(formData.get("badge") ?? "").trim() || null,
    status: parseStatus(formData.get("status")),
  });

  revalidatePath("/admin/events");
  revalidatePath("/");
  return { success: "Event updated." };
}

export async function setEventStatusAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const eventId = String(formData.get("eventId") ?? "").trim();
  const status = parseStatus(formData.get("status"));
  if (!eventId) return;
  await setEventStatus(eventId, status, admin.id);
  revalidatePath("/admin/events");
  revalidatePath("/");
}

export async function deleteEventAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const eventId = String(formData.get("eventId") ?? "").trim();
  if (!eventId) return;
  await deleteEvent(eventId, admin.id);
  revalidatePath("/admin/events");
  revalidatePath("/");
}

/** Model ids an admin can attach an event to. */
export async function eventModelOptions(): Promise<string[]> {
  await requireAdmin();
  const rows = await all<{ model_id: string }>(
    `SELECT DISTINCT m.model_id
     FROM models m JOIN providers p ON p.id = m.provider_id
     WHERE m.status = 'approved' AND p.status = 'approved'
     ORDER BY m.model_id`,
  );
  return rows.map((row) => row.model_id);
}
