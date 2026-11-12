import { describe, expect, test } from "bun:test";

const { localStartToInstant, parseEventStart, toLocalInputValue } = await import(
  "../lib/event-time"
);

describe("event start times", () => {
  test("a wall-clock value becomes the instant the reader meant", () => {
    process.env.TZ = "Europe/Moscow";
    // 12:11 in Moscow is 09:11 UTC.
    expect(localStartToInstant("2026-11-12T12:11")).toBe(
      "2026-11-12T09:11:00.000Z",
    );
  });

  test("the same wall-clock value means a different instant in another zone", () => {
    process.env.TZ = "Europe/London";
    expect(localStartToInstant("2026-11-12T12:11")).toBe(
      "2026-11-12T12:11:00.000Z",
    );
    process.env.TZ = "UTC";
  });

  test("an empty value stays empty", () => {
    expect(localStartToInstant("")).toBe("");
    expect(localStartToInstant("not a date")).toBe("");
  });
});

describe("parsing a submitted start time", () => {
  test("the instant the browser resolved is stored as sent", () => {
    const form = new FormData();
    form.set("startsAt", "2026-11-12T09:11:00.000Z");
    form.set("startsAtLocal", "2026-11-12T12:11");

    expect(parseEventStart(form)).toBe("2026-11-12T09:11:00.000Z");
  });

  test("the wall-clock value is only a fallback", () => {
    const form = new FormData();
    form.set("startsAtLocal", "2026-11-12T12:11");

    expect(parseEventStart(form)).toBe("2026-11-12T12:11");
  });

  test("a missing start time is reported as missing", () => {
    const form = new FormData();
    expect(parseEventStart(form)).toBe("");
  });
});

describe("rendering a stored instant back into the picker", () => {
  test("the picker shows the reader's own wall-clock value", () => {
    process.env.TZ = "Europe/Moscow";
    expect(toLocalInputValue("2026-11-12T09:11:00.000Z")).toBe(
      "2026-11-12T12:11",
    );
    process.env.TZ = "UTC";
  });

  test("a round trip through the picker keeps the instant", () => {
    process.env.TZ = "Europe/Moscow";
    const instant = localStartToInstant("2026-11-12T12:11");
    const back = toLocalInputValue(instant);
    expect(back).toBe("2026-11-12T12:11");
    expect(localStartToInstant(back)).toBe(instant);
    process.env.TZ = "UTC";
  });

  test("an invalid instant renders as empty", () => {
    expect(toLocalInputValue("nonsense")).toBe("");
  });
});
