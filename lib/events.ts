import { all, id, now, one, run } from "./db";

/**
 * Events are time-boxed promos for the pool. An admin creates one from a
 * preset and then edits every field: the copy people read, the models it
 * covers, and the budget that backs it.
 *
 * Two kinds exist:
 * - `free_window`: the covered models are free for everyone for a window.
 * - `shared_quota`: every request to a covered model draws from one shared
 *   token budget instead of the caller's personal daily budget.
 */

export type EventKind = "free_window" | "shared_quota";

export type EventStatus = "draft" | "published" | "ended";

export type PoolEvent = {
  id: string;
  title: string;
  description: string;
  kind: EventKind;
  /** Comma separated model ids the event applies to. Empty means every model. */
  models: string;
  /** Total tokens the shared budget may hand out. Null for free windows. */
  quota_tokens: number | null;
  /** Tokens already handed out against the shared budget. */
  tokens_used: number;
  /** Hours the event stays live from `starts_at`. */
  duration_hours: number;
  starts_at: string;
  ends_at: string;
  status: EventStatus;
  /** Optional callout shown next to the event title. */
  badge: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Presets an admin starts from. Every field stays editable afterwards, so a
 * preset is a starting point rather than a constraint. The wording lives in
 * the dictionary; only the mechanics live here.
 */
export type EventPreset = {
  id: string;
  kind: EventKind;
  quota_tokens: number | null;
  duration_hours: number;
};

export const EVENT_PRESETS: EventPreset[] = [
  {
    id: "free_window",
    kind: "free_window",
    quota_tokens: null,
    duration_hours: 48,
  },
  {
    id: "shared_quota",
    kind: "shared_quota",
    quota_tokens: 1_000_000_000,
    duration_hours: 24 * 30,
  },
];

/** Events that are published and whose window has not closed yet. */
export function isEventLive(event: PoolEvent, at: Date = new Date()): boolean {
  if (event.status !== "published") return false;
  const now = at.getTime();
  return now >= Date.parse(event.starts_at) && now < Date.parse(event.ends_at);
}

/** Events that are published and start in the future. */
export function isEventUpcoming(event: PoolEvent, at: Date = new Date()): boolean {
  return event.status === "published" && Date.parse(event.starts_at) > at.getTime();
}

export function eventModelList(event: PoolEvent): string[] {
  return event.models
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function eventCoversModel(event: PoolEvent, model: string): boolean {
  const models = eventModelList(event);
  if (models.length === 0) return true;
  return models.includes(model);
}

/** Tokens still available in a shared budget. Null when there is no budget. */
export function sharedQuotaRemaining(event: PoolEvent): number | null {
  if (event.kind !== "shared_quota" || event.quota_tokens == null) return null;
  return Math.max(0, event.quota_tokens - event.tokens_used);
}

export async function listEvents(): Promise<PoolEvent[]> {
  return all<PoolEvent>(
    `SELECT id, title, description, kind, models, quota_tokens, tokens_used,
            duration_hours, starts_at, ends_at, status, badge, created_at, updated_at
     FROM events
     ORDER BY CASE status WHEN 'published' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END,
              starts_at DESC`,
  );
}

/** Events that anyone can see: live now, or announced for later. */
export async function listPublicEvents(): Promise<PoolEvent[]> {
  const events = await listEvents();
  return events.filter(
    (event) => isEventLive(event) || isEventUpcoming(event),
  );
}

/**
 * The live event covering a model, if any. An event that names models is
 * more specific than one that covers the whole pool, so it wins.
 */
export async function liveEventForModel(
  model: string,
): Promise<PoolEvent | undefined> {
  const events = await listEvents();
  const live = events
    .filter((event) => isEventLive(event) && eventCoversModel(event, model))
    .sort((a, b) => {
      const scope = eventModelList(a).length - eventModelList(b).length;
      if (scope !== 0) return scope;
      return Date.parse(b.starts_at) - Date.parse(a.starts_at);
    });
  return live[0];
}

export async function getEvent(
  eventId: string,
): Promise<PoolEvent | undefined> {
  return one<PoolEvent>(
    `SELECT id, title, description, kind, models, quota_tokens, tokens_used,
            duration_hours, starts_at, ends_at, status, badge, created_at, updated_at
     FROM events WHERE id = ?`,
    eventId,
  );
}

export async function createEvent(input: {
  title: string;
  description: string;
  kind: EventKind;
  models: string;
  quota_tokens: number | null;
  duration_hours: number;
  starts_at: string;
  badge: string | null;
  status: EventStatus;
  actorId: string;
}): Promise<string> {
  const eventId = id("evt_");
  const startsAt = new Date(input.starts_at);
  const endsAt = new Date(
    startsAt.getTime() + input.duration_hours * 60 * 60 * 1000,
  );
  const timestamp = now();
  await run(
    `INSERT INTO events
      (id, title, description, kind, models, quota_tokens, tokens_used,
       duration_hours, starts_at, ends_at, status, badge, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`,
    eventId,
    input.title,
    input.description,
    input.kind,
    input.models,
    input.quota_tokens,
    input.duration_hours,
    startsAt.toISOString(),
    endsAt.toISOString(),
    input.status,
    input.badge,
    timestamp,
    timestamp,
  );
  await audit(input.actorId, "event.create", eventId, input.title);
  if (input.status === "published") {
    await endOtherEvents(eventId, input.actorId);
  }
  return eventId;
}

export async function updateEvent(
  eventId: string,
  input: {
    title: string;
    description: string;
    kind: EventKind;
    models: string;
    quota_tokens: number | null;
    duration_hours: number;
    starts_at: string;
    badge: string | null;
    status: EventStatus;
  },
): Promise<void> {
  const startsAt = new Date(input.starts_at);
  const endsAt = new Date(
    startsAt.getTime() + input.duration_hours * 60 * 60 * 1000,
  );
  await run(
    `UPDATE events
     SET title = ?, description = ?, kind = ?, models = ?, quota_tokens = ?,
         duration_hours = ?, starts_at = ?, ends_at = ?, status = ?, badge = ?,
         updated_at = ?
     WHERE id = ?`,
    input.title,
    input.description,
    input.kind,
    input.models,
    input.quota_tokens,
    input.duration_hours,
    startsAt.toISOString(),
    endsAt.toISOString(),
    input.status,
    input.badge,
    now(),
    eventId,
  );
  if (input.status === "published") {
    await endOtherEvents(eventId, "");
  }
}

/**
 * Only one event runs at a time. Publishing an event ends the one it
 * replaces, so the pool never shows two competing promos.
 */
export async function endOtherEvents(
  keepEventId: string,
  actorId: string,
): Promise<void> {
  const others = await all<{ id: string }>(
    "SELECT id FROM events WHERE status = 'published' AND id <> ?",
    keepEventId,
  );
  for (const other of others) {
    await run(
      "UPDATE events SET status = 'ended', updated_at = ? WHERE id = ?",
      now(),
      other.id,
    );
    await audit(actorId, "event.ended", other.id, "Replaced by another event");
  }
}

export async function setEventStatus(
  eventId: string,
  status: EventStatus,
  actorId: string,
): Promise<void> {
  await run(
    "UPDATE events SET status = ?, updated_at = ? WHERE id = ?",
    status,
    now(),
    eventId,
  );
  await audit(actorId, `event.${status}`, eventId, null);
  if (status === "published") {
    await endOtherEvents(eventId, actorId);
  }
}

export async function deleteEvent(
  eventId: string,
  actorId: string,
): Promise<void> {
  await run("DELETE FROM events WHERE id = ?", eventId);
  await audit(actorId, "event.remove", eventId, null);
}

/**
 * Books tokens against a shared budget. The update is a single statement so
 * concurrent requests cannot hand out the same tokens twice.
 */
export async function consumeSharedQuota(
  eventId: string,
  tokens: number,
): Promise<void> {
  await run(
    "UPDATE events SET tokens_used = tokens_used + ?, updated_at = ? WHERE id = ?",
    tokens,
    now(),
    eventId,
  );
}

async function audit(
  actorId: string,
  action: string,
  targetId: string,
  detail: string | null,
): Promise<void> {
  await run(
    `INSERT INTO audit_log (id, actor_id, action, target_type, target_id, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id("aud_"),
    actorId,
    action,
    "event",
    targetId,
    detail,
    now(),
  );
}
