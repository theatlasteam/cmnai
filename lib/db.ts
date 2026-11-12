import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Cloudflare D1 access layer.
 *
 * D1 is asynchronous, so every query helper returns a promise. The schema is
 * created lazily on the first query in an isolate; `schema.sql` is the source
 * of truth for applying it from the Wrangler CLI.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  status TEXT NOT NULL DEFAULT 'active',
  locale TEXT NOT NULL DEFAULT 'en',
  created_at TEXT NOT NULL,
  google_id TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  last_used_at TEXT,
  requests INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  api_key TEXT NOT NULL,
  contact TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  api_mode TEXT NOT NULL DEFAULT 'chat_completions',
  headers_json TEXT NOT NULL DEFAULT '{}',
  priority INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL,
  reviewed_at TEXT,
  reviewed_by TEXT
);

CREATE TABLE IF NOT EXISTS models (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  context_window INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  UNIQUE (provider_id, model_id)
);

CREATE TABLE IF NOT EXISTS provider_keys (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  label TEXT,
  api_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  last_checked_at TEXT,
  error TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS usage_events (
  id TEXT PRIMARY KEY,
  api_key_id TEXT REFERENCES api_keys(id) ON DELETE SET NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  provider_id TEXT REFERENCES providers(id) ON DELETE SET NULL,
  model TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  error TEXT,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'free_window',
  models TEXT NOT NULL DEFAULT '',
  quota_tokens INTEGER,
  tokens_used INTEGER NOT NULL DEFAULT 0,
  duration_hours INTEGER NOT NULL DEFAULT 48,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  badge TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS captchas (
  id TEXT PRIMARY KEY,
  answer TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_models_provider ON models(provider_id);
CREATE INDEX IF NOT EXISTS idx_usage_user ON usage_events(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_keys_user ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_provider_keys_provider ON provider_keys(provider_id, status);
`;

async function database(): Promise<D1Database> {
  const { env } = await getCloudflareContext({ async: true });
  return env.DB;
}

let ready: Promise<void> | undefined;

async function tableColumns(db: D1Database, table: string): Promise<Set<string>> {
  const { results } = await db
    .prepare(`SELECT name FROM pragma_table_info('${table}')`)
    .all<{ name: string }>();
  return new Set((results ?? []).map((column) => column.name));
}

/**
 * `CREATE TABLE IF NOT EXISTS` does not add columns to an existing database.
 * These additive migrations keep deployed D1 databases in sync with newer
 * code without requiring a manual SQL step for every column.
 */
async function ensureMigrations(db: D1Database): Promise<void> {
  const providerColumns = await tableColumns(db, "providers");
  if (!providerColumns.has("api_mode")) {
    await db
      .prepare(
        "ALTER TABLE providers ADD COLUMN api_mode TEXT NOT NULL DEFAULT 'chat_completions'",
      )
      .run();
  }
  if (!providerColumns.has("headers_json")) {
    await db
      .prepare("ALTER TABLE providers ADD COLUMN headers_json TEXT NOT NULL DEFAULT '{}'")
      .run();
  }

  const usageColumns = await tableColumns(db, "usage_events");
  if (!usageColumns.has("error")) {
    await db.prepare("ALTER TABLE usage_events ADD COLUMN error TEXT").run();
  }
  if (!usageColumns.has("event_id")) {
    await db.prepare("ALTER TABLE usage_events ADD COLUMN event_id TEXT").run();
  }

  const userColumns = await tableColumns(db, "users");
  if (!userColumns.has("google_id")) {
    await db.prepare("ALTER TABLE users ADD COLUMN google_id TEXT").run();
  }

  // The events table was added after the first release, so an existing
  // database needs it created on the fly.
  const hasEvents = await db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'events'")
    .first();
  if (!hasEvents) {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS events (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          kind TEXT NOT NULL DEFAULT 'free_window',
          models TEXT NOT NULL DEFAULT '',
          quota_tokens INTEGER,
          tokens_used INTEGER NOT NULL DEFAULT 0,
          duration_hours INTEGER NOT NULL DEFAULT 48,
          starts_at TEXT NOT NULL,
          ends_at TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'draft',
          badge TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`,
      )
      .run();
  }
}

async function ensureSchema(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const db = await database();
      const existing = await db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'meta'")
        .first();
      if (!existing) {
        const statements = SCHEMA.split(";")
          .map((statement) => statement.trim())
          .filter(Boolean);
        for (const statement of statements) {
          await db.prepare(statement).run();
        }
      }
      await ensureMigrations(db);
    })().catch((error) => {
      ready = undefined;
      throw error;
    });
  }
  await ready;
}

export async function all<T = Record<string, unknown>>(
  sql: string,
  ...params: (string | number | null)[]
): Promise<T[]> {
  await ensureSchema();
  const db = await database();
  const { results } = await db
    .prepare(sql)
    .bind(...params)
    .all<Record<string, unknown>>();
  // D1 can return null-prototype rows; React Server Components can only
  // serialize plain objects to client components.
  return (results ?? []).map((row) => ({ ...row })) as T[];
}

export async function one<T = Record<string, unknown>>(
  sql: string,
  ...params: (string | number | null)[]
): Promise<T | undefined> {
  await ensureSchema();
  const db = await database();
  const row = await db
    .prepare(sql)
    .bind(...params)
    .first<Record<string, unknown>>();
  return row ? ({ ...row } as T) : undefined;
}

export async function run(
  sql: string,
  ...params: (string | number | null)[]
): Promise<D1Result> {
  await ensureSchema();
  const db = await database();
  return db.prepare(sql).bind(...params).run();
}

export function now(): string {
  return new Date().toISOString();
}

export function id(prefix = ""): string {
  return prefix + crypto.randomUUID().replace(/-/g, "").slice(0, 24);
}
