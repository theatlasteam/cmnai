import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Database } from "bun:sqlite";

// The chat route is exercised against an isolated SQLite database with a
// stubbed upstream. Only the D1 transport and the upstream are mocked.
let database;
let apiKeyId;
const schema = await Bun.file(new URL("../schema.sql", import.meta.url)).text();

mock.module("../lib/db", () => ({
  one: async (sql, ...params) => database.query(sql).get(...params) ?? undefined,
  all: async (sql, ...params) => database.query(sql).all(...params),
  run: async (sql, ...params) => database.query(sql).run(...params),
  now: () => new Date().toISOString(),
  id: (prefix = "") =>
    prefix + crypto.randomUUID().replace(/-/g, "").slice(0, 24),
}));
mock.module("../lib/seed", () => ({ seed: async () => {} }));
mock.module("../lib/auth", () => ({
  authenticateApiKey: async (token) =>
    token === "test-key" ? { id: apiKeyId, user_id: "member" } : null,
}));
mock.module("../lib/ai", () => ({
  complete: async () => ({
    text: "hello",
    promptTokens: 10,
    completionTokens: 5,
    toolCalls: [],
    finishReason: "stop",
  }),
  stream: () => {
    throw new Error("Unexpected upstream stream");
  },
  estimateTokens: (text) => String(text).length,
  logUpstreamFailure: () => "Unexpected upstream request",
  promptText: (messages) => JSON.stringify(messages),
}));

const { POST } = await import("../app/v1/chat/completions/route");

const MODEL = "gemini-4-carbon";

function seedPool() {
  database.run(
    "INSERT INTO providers (id, user_id, name, base_url, api_key, status, created_at) VALUES ('provider', 'member', 'Test provider', 'https://example.test/v1', 'upstream-key', 'approved', ?)",
    [new Date().toISOString()],
  );
  database.run(
    "INSERT INTO models (id, provider_id, model_id, display_name, status, created_at) VALUES ('model', 'provider', ?, 'Gemini 4 Carbon', 'approved', ?)",
    [MODEL, new Date().toISOString()],
  );
}

function insertEvent(overrides = {}) {
  const now = Date.now();
  database.run(
    `INSERT INTO events (id, title, description, kind, models, quota_tokens, tokens_used,
                          duration_hours, starts_at, ends_at, status, badge, created_at, updated_at)
     VALUES ('evt_1', 'Shared quota', 'One pool for everyone.', ?, ?, ?, ?, 48, ?, ?, 'published', 'Shared quota', ?, ?)`,
    overrides.kind ?? "shared_quota",
    overrides.models ?? MODEL,
    overrides.quota_tokens === undefined ? 1_000_000_000 : overrides.quota_tokens,
    overrides.tokens_used ?? 0,
    new Date(now - 60_000).toISOString(),
    new Date(now + 48 * 60 * 60 * 1000).toISOString(),
    new Date(now).toISOString(),
    new Date(now).toISOString(),
  );
}

function usage(tokens) {
  database.run(
    "INSERT INTO usage_events (id, user_id, api_key_id, model, prompt_tokens, completion_tokens, status, created_at) VALUES (?, 'member', ?, 'other-model', ?, 0, 'ok', ?)",
    [crypto.randomUUID(), apiKeyId, tokens, new Date().toISOString()],
  );
}

function request(body = {}) {
  return new Request("https://example.test/v1/chat/completions", {
    method: "POST",
    headers: { authorization: "Bearer test-key", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, messages: [{ role: "user", content: "hi" }], ...body }),
  });
}

beforeEach(() => {
  database = new Database(":memory:");
  database.exec(schema);
  database.exec("PRAGMA foreign_keys = ON");
  apiKeyId = crypto.randomUUID();
  database.run(
    "INSERT INTO users (id, email, name, password_hash, created_at) VALUES ('member', 'member@example.test', 'Member', 'test', ?)",
    [new Date().toISOString()],
  );
  database.run(
    "INSERT INTO api_keys (id, user_id, name, key_hash, prefix, created_at) VALUES (?, 'member', 'Key', 'hash', 'cmn_sk_test', ?)",
    [apiKeyId, new Date().toISOString()],
  );
  seedPool();
});

describe("events shape the API budget", () => {
  test("an event covering the model lifts the personal daily limit", async () => {
    insertEvent();
    usage(200_000);

    const response = await POST(request());
    expect(response.status).toBe(200);
  });

  test("without an event the personal daily limit still applies", async () => {
    usage(200_000);

    const response = await POST(request());
    expect(response.status).toBe(429);
    expect((await response.json()).error.code).toBe("daily_limit");
  });

  test("an event for another model does not lift the limit", async () => {
    insertEvent({ models: "gpt-6.1-sol" });
    usage(200_000);

    const response = await POST(request());
    expect(response.status).toBe(429);
    expect((await response.json()).error.code).toBe("daily_limit");
  });

  test("a free window also lifts the personal daily limit", async () => {
    insertEvent({ kind: "free_window", quota_tokens: null });
    usage(200_000);

    const response = await POST(request());
    expect(response.status).toBe(200);
  });

  test("an exhausted shared quota is reported clearly", async () => {
    insertEvent({ quota_tokens: 100, tokens_used: 100 });

    const response = await POST(request());
    expect(response.status).toBe(429);
    expect((await response.json()).error.code).toBe("shared_quota_exhausted");
  });

  test("event usage is attributed to the event and spends the pool", async () => {
    insertEvent();

    const response = await POST(request());
    expect(response.status).toBe(200);

    const rows = database
      .query("SELECT event_id, prompt_tokens, completion_tokens FROM usage_events")
      .all();
    expect(rows).toHaveLength(1);
    expect(rows[0].event_id).toBe("evt_1");

    const [event] = database
      .query("SELECT tokens_used FROM events WHERE id = 'evt_1'")
      .all();
    expect(event.tokens_used).toBe(15);
  });

  test("event usage does not eat the personal daily budget", async () => {
    insertEvent();

    await POST(request());

    const row = database
      .query(
        "SELECT COALESCE(SUM(CASE WHEN event_id IS NULL THEN prompt_tokens + completion_tokens ELSE 0 END), 0) AS tokens, COALESCE(SUM(CASE WHEN event_id IS NOT NULL THEN prompt_tokens + completion_tokens ELSE 0 END), 0) AS event_tokens FROM usage_events",
      )
      .get();
    expect(row.tokens).toBe(0);
    expect(row.event_tokens).toBe(15);
  });
});
