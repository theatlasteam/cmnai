import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Database } from "bun:sqlite";

// The event lifecycle runs against an isolated SQLite database. Only the D1
// transport is mocked; nothing touches the deployed database.
let database;
const schema = await Bun.file(new URL("../schema.sql", import.meta.url)).text();

mock.module("../lib/db", () => ({
  one: async (sql, ...params) => database.query(sql).get(...params) ?? undefined,
  all: async (sql, ...params) => database.query(sql).all(...params),
  run: async (sql, ...params) => database.query(sql).run(...params),
  now: () => new Date().toISOString(),
  id: (prefix = "") =>
    prefix + crypto.randomUUID().replace(/-/g, "").slice(0, 24),
}));

const {
  consumeSharedQuota,
  createEvent,
  deleteEvent,
  getEvent,
  isEventLive,
  listEvents,
  liveEventForModel,
  setEventStatus,
  sharedQuotaRemaining,
  updateEvent,
} = await import("../lib/events");

function hoursFromNow(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

async function makeEvent(overrides = {}) {
  return createEvent({
    title: "Gemini 4 Carbon from 1 shared quota of 1B tokens",
    description: "One pool for everyone.",
    kind: "shared_quota",
    models: "gemini-4-carbon",
    quota_tokens: 1_000_000_000,
    duration_hours: 48,
    starts_at: new Date(Date.now() - 60_000).toISOString(),
    badge: "Shared quota",
    status: "published",
    actorId: "admin",
    ...overrides,
  });
}

beforeEach(() => {
  database = new Database(":memory:");
  database.exec(schema);
  database.exec("PRAGMA foreign_keys = ON");
});

describe("event persistence", () => {
  test("a created event lands in the list", async () => {
    const eventId = await makeEvent();
    const events = await listEvents();
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe(eventId);
    expect(events[0].kind).toBe("shared_quota");
    expect(events[0].models).toBe("gemini-4-carbon");
  });

  test("the window closes after the configured duration", async () => {
    await makeEvent({ duration_hours: 48 });
    const [event] = await listEvents();
    const hours =
      (Date.parse(event.ends_at) - Date.parse(event.starts_at)) /
      (60 * 60 * 1000);
    expect(hours).toBe(48);
  });

  test("an update rewrites the editable fields", async () => {
    const eventId = await makeEvent();
    await updateEvent(eventId, {
      title: "Gemini 4 Carbon fully free for 48 hours",
      description: "Free for everyone.",
      kind: "free_window",
      models: "gemini-4-carbon, gpt-6.1-sol",
      quota_tokens: null,
      duration_hours: 24,
      starts_at: new Date(Date.now() - 60_000).toISOString(),
      badge: "Free",
      status: "published",
    });
    const event = await getEvent(eventId);
    expect(event.title).toBe("Gemini 4 Carbon fully free for 48 hours");
    expect(event.kind).toBe("free_window");
    expect(event.quota_tokens).toBeNull();
    expect(event.models).toBe("gemini-4-carbon, gpt-6.1-sol");
  });

  test("publishing and ending move the event between states", async () => {
    const eventId = await makeEvent({ status: "draft" });
    expect(isEventLive(await getEvent(eventId))).toBe(false);

    await setEventStatus(eventId, "published", "admin");
    expect(isEventLive(await getEvent(eventId))).toBe(true);

    await setEventStatus(eventId, "ended", "admin");
    expect(isEventLive(await getEvent(eventId))).toBe(false);
  });

  test("deleting removes the event and keeps the audit trail", async () => {
    const eventId = await makeEvent();
    await deleteEvent(eventId, "admin");
    expect(await listEvents()).toHaveLength(0);
    const actions = database
      .query("SELECT action FROM audit_log WHERE target_id = ?")
      .all(eventId)
      .map((row) => row.action);
    expect(actions).toContain("event.create");
    expect(actions).toContain("event.remove");
  });
});

describe("only one event runs at a time", () => {
  test("publishing an event ends the one it replaces", async () => {
    const first = await makeEvent({ title: "First" });
    const second = await makeEvent({ title: "Second", status: "draft" });

    await setEventStatus(second, "published", "admin");

    expect((await getEvent(first)).status).toBe("ended");
    expect((await getEvent(second)).status).toBe("published");
  });

  test("creating a published event ends the running one", async () => {
    const first = await makeEvent({ title: "First" });
    const second = await makeEvent({ title: "Second" });

    expect((await getEvent(first)).status).toBe("ended");
    expect((await getEvent(second)).status).toBe("published");
  });

  test("drafts do not end a running event", async () => {
    const first = await makeEvent({ title: "First" });
    await makeEvent({ title: "Second", status: "draft" });

    expect((await getEvent(first)).status).toBe("published");
  });

  test("only the newest published event is live", async () => {
    await makeEvent({ title: "First" });
    await makeEvent({ title: "Second" });

    const live = (await listEvents()).filter((event) => isEventLive(event));
    expect(live).toHaveLength(1);
    expect(live[0].title).toBe("Second");
  });
});

describe("live event lookup", () => {
  test("a live event covering the model is found", async () => {
    await makeEvent();
    const event = await liveEventForModel("gemini-4-carbon");
    expect(event?.title).toBe(
      "Gemini 4 Carbon from 1 shared quota of 1B tokens",
    );
  });

  test("a model outside the scope does not match", async () => {
    await makeEvent();
    expect(await liveEventForModel("gpt-6.1-sol")).toBeUndefined();
  });

  test("an event without a model list covers the whole pool", async () => {
    await makeEvent({ models: "" });
    expect(await liveEventForModel("gpt-6.1-sol")).toBeDefined();
  });

  test("a draft event is never live", async () => {
    await makeEvent({ status: "draft" });
    expect(await liveEventForModel("gemini-4-carbon")).toBeUndefined();
  });

  test("an event that already ended is not live", async () => {
    await makeEvent({
      starts_at: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
      duration_hours: 1,
    });
    expect(await liveEventForModel("gemini-4-carbon")).toBeUndefined();
  });

  test("an event that starts later is not live yet", async () => {
    await makeEvent({ starts_at: hoursFromNow(2) });
    expect(await liveEventForModel("gemini-4-carbon")).toBeUndefined();
  });
});

describe("shared quota accounting", () => {
  test("spending tokens lowers the remaining budget", async () => {
    const eventId = await makeEvent();
    expect(sharedQuotaRemaining(await getEvent(eventId))).toBe(1_000_000_000);

    await consumeSharedQuota(eventId, 250_000_000);
    expect(sharedQuotaRemaining(await getEvent(eventId))).toBe(750_000_000);

    await consumeSharedQuota(eventId, 1_000);
    expect(sharedQuotaRemaining(await getEvent(eventId))).toBe(749_999_000);
  });

  test("a free window has no shared budget to spend", async () => {
    const eventId = await makeEvent({ kind: "free_window", quota_tokens: null });
    await consumeSharedQuota(eventId, 1_000);
    expect(sharedQuotaRemaining(await getEvent(eventId))).toBeNull();
  });
});
