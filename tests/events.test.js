import { describe, expect, test } from "bun:test";

const {
  EVENT_PRESETS,
  eventCoversModel,
  eventModelList,
  isEventLive,
  isEventUpcoming,
  sharedQuotaRemaining,
} = await import("../lib/events");

function makeEvent(overrides = {}) {
  const now = new Date("2026-06-01T12:00:00Z");
  return {
    id: "evt_1",
    title: "Test event",
    description: "",
    kind: "free_window",
    models: "",
    quota_tokens: null,
    tokens_used: 0,
    duration_hours: 48,
    starts_at: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
    ends_at: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
    status: "published",
    badge: null,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    ...overrides,
  };
}

describe("event presets", () => {
  test("offer a free window and a shared quota preset", () => {
    const ids = EVENT_PRESETS.map((preset) => preset.id);
    expect(ids).toContain("free_window");
    expect(ids).toContain("shared_quota");
  });

  test("the shared quota preset starts from one billion tokens", () => {
    const preset = EVENT_PRESETS.find((entry) => entry.id === "shared_quota");
    expect(preset?.quota_tokens).toBe(1_000_000_000);
  });

  test("the free window preset runs for 48 hours", () => {
    const preset = EVENT_PRESETS.find((entry) => entry.id === "free_window");
    expect(preset?.duration_hours).toBe(48);
    expect(preset?.quota_tokens).toBeNull();
  });

  test("presets only carry the mechanics, the copy is editable", () => {
    for (const preset of EVENT_PRESETS) {
      expect(preset.duration_hours).toBeGreaterThan(0);
      expect(["free_window", "shared_quota"]).toContain(preset.kind);
      expect(preset).not.toHaveProperty("title");
    }
  });
});

describe("event scope", () => {
  test("an event without models covers the whole pool", () => {
    expect(eventCoversModel(makeEvent(), "gemini-4-carbon")).toBe(true);
  });

  test("an event with models only covers those models", () => {
    const event = makeEvent({ models: "gemini-4-carbon" });
    expect(eventCoversModel(event, "gemini-4-carbon")).toBe(true);
    expect(eventCoversModel(event, "gpt-6.1-sol")).toBe(false);
  });

  test("model lists are parsed and trimmed", () => {
    const event = makeEvent({ models: " a , b ,, c " });
    expect(eventModelList(event)).toEqual(["a", "b", "c"]);
  });
});

describe("event windows", () => {
  const now = new Date("2026-06-01T12:00:00Z");

  test("a published event inside its window is live", () => {
    expect(isEventLive(makeEvent(), now)).toBe(true);
  });

  test("a draft event is never live", () => {
    expect(isEventLive(makeEvent({ status: "draft" }), now)).toBe(false);
  });

  test("an event that already ended is not live", () => {
    const past = makeEvent({
      starts_at: "2026-05-01T00:00:00Z",
      ends_at: "2026-05-02T00:00:00Z",
    });
    expect(isEventLive(past, now)).toBe(false);
  });

  test("an event that starts later is upcoming", () => {
    const future = makeEvent({
      starts_at: "2026-07-01T00:00:00Z",
      ends_at: "2026-07-02T00:00:00Z",
    });
    expect(isEventUpcoming(future, now)).toBe(true);
    expect(isEventLive(future, now)).toBe(false);
  });
});

describe("shared quota", () => {
  test("remaining tokens come from the budget minus what was used", () => {
    const event = makeEvent({
      kind: "shared_quota",
      quota_tokens: 1_000_000_000,
      tokens_used: 250_000_000,
    });
    expect(sharedQuotaRemaining(event)).toBe(750_000_000);
  });

  test("a free window has no shared budget", () => {
    expect(sharedQuotaRemaining(makeEvent())).toBeNull();
  });

  test("an exhausted budget never goes negative", () => {
    const event = makeEvent({
      kind: "shared_quota",
      quota_tokens: 100,
      tokens_used: 500,
    });
    expect(sharedQuotaRemaining(event)).toBe(0);
  });
});
