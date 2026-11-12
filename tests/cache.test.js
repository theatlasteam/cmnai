import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Database } from "bun:sqlite";

// The cache lives in the pool module, so the tests count the queries that
// reach the database instead of mocking the cache itself.
let database;
let queryCount = 0;
const schema = await Bun.file(new URL("../schema.sql", import.meta.url)).text();

mock.module("../lib/db", () => ({
  one: async (sql, ...params) => {
    queryCount++;
    return database.query(sql).get(...params) ?? undefined;
  },
  all: async (sql, ...params) => {
    queryCount++;
    return database.query(sql).all(...params);
  },
  run: async (sql, ...params) => {
    queryCount++;
    return database.query(sql).run(...params);
  },
  now: () => new Date().toISOString(),
  id: (prefix = "") =>
    prefix + crypto.randomUUID().replace(/-/g, "").slice(0, 24),
}));
mock.module("../lib/seed", () => ({ seed: async () => {} }));

const { invalidatePoolCache, listPublicPool, resolveCandidates } = await import(
  "../lib/pool"
);
const { GET } = await import("../app/v1/models/route");

beforeEach(() => {
  database = new Database(":memory:");
  database.exec(schema);
  database.exec("PRAGMA foreign_keys = ON");
  queryCount = 0;
  invalidatePoolCache();

  database.run(
    "INSERT INTO providers (id, user_id, name, base_url, api_key, status, created_at) VALUES ('provider', NULL, 'Test provider', 'https://example.test/v1', 'upstream-key', 'approved', ?)",
    [new Date().toISOString()],
  );
  database.run(
    "INSERT INTO models (id, provider_id, model_id, display_name, status, created_at) VALUES ('model', 'provider', 'test-model', 'Test Model', 'approved', ?)",
    [new Date().toISOString()],
  );
});

describe("pool caching", () => {
  test("the public pool list is read once and then served from cache", async () => {
    const first = await listPublicPool();
    const afterFirst = queryCount;

    const second = await listPublicPool();

    expect(queryCount).toBe(afterFirst);
    expect(second).toEqual(first);
    expect(first).toHaveLength(1);
  });

  test("candidates are cached per model", async () => {
    const first = await resolveCandidates("test-model");
    const afterFirst = queryCount;

    await resolveCandidates("test-model");
    expect(queryCount).toBe(afterFirst);

    await resolveCandidates("other-model");
    expect(queryCount).toBeGreaterThan(afterFirst);
    expect(first).toHaveLength(1);
  });

  test("dropping the cache reads the pool again", async () => {
    await listPublicPool();
    const afterFirst = queryCount;

    invalidatePoolCache();
    await listPublicPool();

    expect(queryCount).toBeGreaterThan(afterFirst);
  });

  test("a model that appears later is picked up once the cache is dropped", async () => {
    await listPublicPool();

    database.run(
      "INSERT INTO models (id, provider_id, model_id, display_name, status, created_at) VALUES ('model-2', 'provider', 'second-model', 'Second Model', 'approved', ?)",
      [new Date().toISOString()],
    );

    expect(await listPublicPool()).toHaveLength(1);
    invalidatePoolCache();
    expect(await listPublicPool()).toHaveLength(2);
  });
});

describe("models endpoint caching", () => {
  test("the response tells caches how long it stays fresh", async () => {
    const response = await GET(
      new Request("https://example.test/v1/models"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage");
    expect(response.headers.get("etag")).toBeTruthy();
  });

  test("a matching ETag answers with no body", async () => {
    const first = await GET(new Request("https://example.test/v1/models"));
    const etag = first.headers.get("etag");

    const second = await GET(
      new Request("https://example.test/v1/models", {
        headers: { "if-none-match": etag },
      }),
    );

    expect(second.status).toBe(304);
    expect(await second.text()).toBe("");
  });

  test("a different ETag returns the list again", async () => {
    const response = await GET(
      new Request("https://example.test/v1/models", {
        headers: { "if-none-match": '"stale"' },
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data[0].id).toBe("test-model");
  });
});
