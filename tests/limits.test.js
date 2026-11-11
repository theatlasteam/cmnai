import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { Database } from "bun:sqlite";

// Run the application's actual quota SQL against an isolated SQLite database.
// Only the D1 transport and external dependencies are mocked; no upstream
// requests or changes to the deployed database are made by these tests.
let database;
let apiKeyId;
const schema = await Bun.file(new URL("../schema.sql", import.meta.url)).text();
const envNames = [
  "CMNAI_DAILY_TOKEN_LIMIT",
  "CMNAI_CONTRIBUTOR_DAILY_TOKEN_LIMIT",
  "CMNAI_RATE_LIMIT_PER_MINUTE",
];
const originalEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));

mock.module("../lib/db", () => ({
  one: async (sql, ...params) => database.query(sql).get(...params) ?? undefined,
  all: async (sql, ...params) => database.query(sql).all(...params),
  run: async (sql, ...params) => database.query(sql).run(...params),
  now: () => new Date().toISOString(),
  id: () => crypto.randomUUID(),
}));
mock.module("../lib/seed", () => ({ seed: async () => {} }));
mock.module("../lib/auth", () => ({
  authenticateApiKey: async (token) =>
    token === "test-key" ? { id: apiKeyId, user_id: "member" } : null,
}));
mock.module("../lib/ai", () => ({
  complete: async () => { throw new Error("Unexpected upstream request"); },
  stream: () => { throw new Error("Unexpected upstream request"); },
  estimateTokens: () => 0,
  logUpstreamFailure: () => "Unexpected upstream request",
  promptText: () => "",
}));

const { dailyTokenLimit, nextDailyReset, rateLimitPerMinute } = await import("../lib/limits");
const { usageToday, utcDayStart } = await import("../lib/pool");
const { POST } = await import("../app/v1/chat/completions/route");

beforeEach(() => {
  for (const name of envNames) delete process.env[name];
  database = new Database(":memory:");
  database.exec(schema);
  database.exec("PRAGMA foreign_keys = ON");
  apiKeyId = crypto.randomUUID();
  for (const user of ["member", "other"]) {
    database.run(
      "INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, 'test', ?)",
      [user, `${user}@example.test`, user, utcDayStart()],
    );
  }
  database.run(
    "INSERT INTO providers (id, user_id, name, base_url, api_key, status, created_at) VALUES ('provider', 'other', 'Test provider', 'https://example.test/v1', '', 'approved', ?)",
    [utcDayStart()],
  );
});

afterEach(() => {
  database.close();
  for (const name of envNames) {
    if (originalEnv[name] === undefined) delete process.env[name];
    else process.env[name] = originalEnv[name];
  }
});

function contribute(status = "verified", userId = "member") {
  database.run(
    "INSERT INTO provider_keys (id, provider_id, user_id, api_key, status, created_at) VALUES (?, 'provider', ?, 'test-upstream-key', ?, ?)",
    [crypto.randomUUID(), userId, status, utcDayStart()],
  );
}

function usage(tokens, userId = "member", createdAt = utcDayStart(), keyId = null) {
  database.run(
    "INSERT INTO usage_events (id, user_id, api_key_id, model, prompt_tokens, completion_tokens, status, created_at) VALUES (?, ?, ?, 'test-model', ?, 0, 'ok', ?)",
    [crypto.randomUUID(), userId, keyId, tokens, createdAt],
  );
}

function request(body = {}) {
  return new Request("https://example.test/v1/chat/completions", {
    method: "POST",
    headers: { authorization: "Bearer test-key", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("daily token configuration", () => {
  test("members get 200k and key contributors get 2m by default", () => {
    expect(dailyTokenLimit()).toBe(200_000);
    expect(dailyTokenLimit(true)).toBe(2_000_000);
    expect(rateLimitPerMinute()).toBe(60);
  });

  test("supports independently configured budgets", () => {
    process.env.CMNAI_DAILY_TOKEN_LIMIT = "300000";
    process.env.CMNAI_CONTRIBUTOR_DAILY_TOKEN_LIMIT = "3000000";
    expect(dailyTokenLimit()).toBe(300_000);
    expect(dailyTokenLimit(true)).toBe(3_000_000);
  });

  test("contributor budget never lowers a member's budget", () => {
    process.env.CMNAI_DAILY_TOKEN_LIMIT = "4000000";
    expect(dailyTokenLimit(true)).toBe(4_000_000);
  });

  test.each(["", "bad", "NaN", "Infinity", "0", "-1", "0.5"])(
    "invalid configuration %j falls back to positive defaults",
    (value) => {
      for (const name of envNames) process.env[name] = value;
      expect(dailyTokenLimit()).toBe(200_000);
      expect(dailyTokenLimit(true)).toBe(2_000_000);
      expect(rateLimitPerMinute()).toBe(60);
    },
  );

  test("daily windows reset at midnight UTC, including year rollover", () => {
    expect(nextDailyReset(new Date("2026-12-31T23:59:59Z"))).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("contributor eligibility and accounting", () => {
  test("an account with no contribution keeps its base budget", async () => {
    expect(await usageToday("member")).toMatchObject({
      tokens: 0, requests: 0, limit: 200_000, remaining: 200_000, isContributor: false,
    });
  });

  test("an existing verified key qualifies even on someone else's provider", async () => {
    contribute();
    expect(await usageToday("member")).toMatchObject({
      tokens: 0, requests: 0, limit: 2_000_000, remaining: 2_000_000, isContributor: true,
    });
  });

  test.each(["pending", "failed", "disabled"])("a %s key does not qualify", async (status) => {
    contribute(status);
    expect((await usageToday("member")).limit).toBe(200_000);
  });

  test.each(["pending", "paused", "rejected"])("a %s provider does not qualify", async (status) => {
    contribute();
    database.run("UPDATE providers SET status = ?", [status]);
    expect((await usageToday("member")).limit).toBe(200_000);
  });

  test("other users' keys and owning a provider alone do not qualify", async () => {
    contribute("verified", "other");
    database.run("UPDATE providers SET user_id = 'member'");
    expect((await usageToday("member")).limit).toBe(200_000);
  });

  test("key and provider status changes take effect without a new API key", async () => {
    contribute();
    expect((await usageToday("member")).limit).toBe(2_000_000);
    database.run("UPDATE provider_keys SET status = 'disabled'");
    expect((await usageToday("member")).limit).toBe(200_000);
    database.run("UPDATE provider_keys SET status = 'verified'");
    expect((await usageToday("member")).limit).toBe(2_000_000);
    database.run("UPDATE providers SET status = 'paused'");
    expect((await usageToday("member")).limit).toBe(200_000);
    database.run("UPDATE providers SET status = 'approved'");
    expect((await usageToday("member")).limit).toBe(2_000_000);
  });

  test("multiple contributions don't multiply usage or the contributor budget", async () => {
    contribute();
    contribute();
    usage(30);
    expect(await usageToday("member")).toMatchObject({
      requests: 1, tokens: 30, limit: 2_000_000, remaining: 1_999_970,
    });
  });

  test("all account API keys share usage, excluding other users and previous days", async () => {
    for (const keyId of ["key-one", "key-two"]) {
      database.run(
        "INSERT INTO api_keys (id, user_id, name, prefix, key_hash, created_at) VALUES (?, 'member', ?, 'test', ?, ?)",
        [keyId, keyId, keyId, utcDayStart()],
      );
    }
    usage(100_000, "member", utcDayStart(), "key-one");
    usage(120_000, "member", utcDayStart(), "key-two");
    usage(900_000, "other");
    usage(800_000, "member", utcDayStart(1));
    contribute();
    expect(await usageToday("member")).toMatchObject({
      requests: 2, tokens: 220_000, remaining: 1_780_000,
    });
  });
});

describe("chat API enforcement and quota headers", () => {
  test.each([false, true])("members are blocked at 200k (stream=%s)", async (stream) => {
    usage(200_000);
    const response = await POST(request({ stream }));
    expect(response.status).toBe(429);
    expect((await response.json()).error.code).toBe("daily_limit");
    expect(response.headers.get("X-Daily-Token-Limit")).toBe("200000");
    expect(response.headers.get("X-Daily-Tokens-Remaining")).toBe("0");
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  test.each([false, true])("contributors can pass the old 200k limit (stream=%s)", async (stream) => {
    contribute();
    usage(250_000);
    // An incomplete body returns 400 after the quota check, without calling an upstream.
    const response = await POST(request({ stream }));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("invalid_request");
    expect(response.headers.get("X-Daily-Token-Limit")).toBe("2000000");
    expect(response.headers.get("X-Daily-Tokens-Used")).toBe("250000");
    expect(response.headers.get("X-Daily-Tokens-Remaining")).toBe("1750000");
    expect(response.headers.get("X-RateLimit-Limit")).toBe("60");
  });

  test.each([false, true])("contributors are blocked at 2m (stream=%s)", async (stream) => {
    contribute();
    usage(2_000_000);
    const response = await POST(request({ stream }));
    expect(response.status).toBe(429);
    expect((await response.json()).error.code).toBe("daily_limit");
    expect(response.headers.get("X-Daily-Token-Limit")).toBe("2000000");
    expect(response.headers.get("X-Daily-Tokens-Remaining")).toBe("0");
  });
});
