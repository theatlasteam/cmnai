import { all, id, now, one, run } from "./db";
import { dailyTokenLimit, nextDailyReset, rateLimitPerMinute } from "./limits";
import type { ProviderMode } from "./provider-mode";
import "./provider-keys";

export type PoolModel = {
  model_key: string;
  display_name: string;
  context_window: number | null;
  provider_id: string;
  provider_name: string;
  base_url: string;
  api_key: string;
  /** The provider's own key, tried when the contributed pool key fails. */
  fallback_api_key: string | null;
  api_mode: ProviderMode;
  headers_json: string;
  priority: number;
  model_id: string;
};

export type PublicModel = {
  id: string;
  display_name: string;
  context_window: number | null;
  provider: string;
};

export async function listPublicPool(): Promise<PublicModel[]> {
  return all<PublicModel>(
    `SELECT m.model_id AS id, m.display_name, m.context_window, p.name AS provider
     FROM models m JOIN providers p ON p.id = m.provider_id
     WHERE m.status = 'approved' AND p.status = 'approved'
     ORDER BY p.priority DESC, m.display_name ASC`,
  );
}

export async function resolveCandidates(modelKey: string): Promise<PoolModel[]> {
  const rows = await all<PoolModel>(
    `SELECT m.model_id AS model_key, m.display_name, m.context_window,
            p.id AS provider_id, p.name AS provider_name, p.base_url, p.api_mode, p.headers_json,
            COALESCE(
              (SELECT pk.api_key FROM provider_keys pk
                WHERE pk.provider_id = p.id AND pk.status = 'verified'
                ORDER BY pk.last_checked_at DESC LIMIT 1),
              NULLIF(p.api_key, '')
            ) AS api_key,
            NULLIF(p.api_key, '') AS fallback_api_key,
            p.priority, m.model_id
     FROM models m JOIN providers p ON p.id = m.provider_id
     WHERE m.status = 'approved' AND p.status = 'approved' AND m.model_id = ?
       AND (EXISTS (SELECT 1 FROM provider_keys pk
                    WHERE pk.provider_id = p.id AND pk.status = 'verified')
            OR p.api_key <> '')
     ORDER BY p.priority DESC`,
    modelKey,
  );
  if (rows.length > 1) {
    for (let i = rows.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rows[i], rows[j]] = [rows[j], rows[i]];
    }
    rows.sort((a, b) => b.priority - a.priority);
  }

  // A contributed pool key can die at any time (quota exhausted, revoked).
  // After each preferred key, queue the provider's own key as a fallback so
  // one dead key cannot take the whole provider down.
  const attempts: PoolModel[] = [];
  for (const row of rows) {
    attempts.push(row);
    if (row.fallback_api_key && row.fallback_api_key !== row.api_key) {
      attempts.push({ ...row, api_key: row.fallback_api_key });
    }
  }
  return attempts;
}

export type ProviderModel = {
  model_id: string;
  display_name: string;
  context_window: number | null;
};

export type PublicProvider = {
  id: string;
  name: string;
  base_url: string;
  api_mode: ProviderMode;
  priority: number;
  verified_keys: number;
  models: ProviderModel[];
};

export async function listPublicProviders(): Promise<PublicProvider[]> {
  const [providers, models] = await Promise.all([
    all<{
      id: string;
      name: string;
      base_url: string;
      api_mode: ProviderMode;
      priority: number;
      verified_keys: number;
    }>(
      `SELECT p.id, p.name, p.base_url, p.api_mode, p.priority,
              (SELECT COUNT(*) FROM provider_keys k
                WHERE k.provider_id = p.id AND k.status = 'verified') AS verified_keys
       FROM providers p WHERE p.status = 'approved'
       ORDER BY p.priority DESC, p.name ASC`,
    ),
    all<ProviderModel & { provider_id: string }>(
      `SELECT m.provider_id, m.model_id, m.display_name, m.context_window
       FROM models m JOIN providers p ON p.id = m.provider_id
       WHERE m.status = 'approved' AND p.status = 'approved'
       ORDER BY m.display_name ASC`,
    ),
  ]);

  return providers.map((provider) => ({
    ...provider,
    models: models
      .filter((model) => model.provider_id === provider.id)
      .map(({ provider_id: _providerId, ...model }) => model),
  }));
}


export async function recordUsage(input: {
  apiKeyId: string | null;
  userId: string | null;
  providerId: string | null;
  model: string;
  promptTokens: number;
  completionTokens: number;
  status: string;
  latencyMs: number;
  error?: string | null;
  eventId?: string | null;
}): Promise<void> {
  await run(
    `INSERT INTO usage_events
      (id, api_key_id, user_id, provider_id, model, prompt_tokens, completion_tokens, status, error, latency_ms, event_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id("use_"),
    input.apiKeyId,
    input.userId,
    input.providerId,
    input.model,
    input.promptTokens,
    input.completionTokens,
    input.status,
    input.error ?? null,
    input.latencyMs,
    input.eventId ?? null,
    now(),
  );
}

export async function poolStats() {
  const [endpoints, models, requests, contributors] = await Promise.all([
    one<{ c: number }>(
      "SELECT COUNT(*) AS c FROM providers WHERE status = 'approved'",
    ),
    one<{ c: number }>(
      `SELECT COUNT(*) AS c FROM models m JOIN providers p ON p.id = m.provider_id
       WHERE m.status = 'approved' AND p.status = 'approved'`,
    ),
    one<{ c: number }>("SELECT COUNT(*) AS c FROM usage_events"),
    one<{ c: number }>(
      "SELECT COUNT(DISTINCT user_id) AS c FROM providers WHERE status = 'approved'",
    ),
  ]);
  return {
    endpoints: endpoints?.c ?? 0,
    models: models?.c ?? 0,
    requests: requests?.c ?? 0,
    contributors: contributors?.c ?? 0,
  };
}

export async function userUsage(userId: string) {
  return (await one<{ requests: number; prompt: number; completion: number }>(
    `SELECT COUNT(*) AS requests,
            COALESCE(SUM(prompt_tokens), 0) AS prompt,
            COALESCE(SUM(completion_tokens), 0) AS completion
     FROM usage_events WHERE user_id = ?`,
    userId,
  )) ?? { requests: 0, prompt: 0, completion: 0 };
}

export async function recentUsage(userId: string, limit = 8) {
  return all<{
    model: string;
    prompt_tokens: number;
    completion_tokens: number;
    status: string;
    created_at: string;
    provider_name: string | null;
  }>(
    `SELECT u.model, u.prompt_tokens, u.completion_tokens, u.status, u.created_at,
            p.name AS provider_name
     FROM usage_events u LEFT JOIN providers p ON p.id = u.provider_id
     WHERE u.user_id = ? ORDER BY u.created_at DESC LIMIT ?`,
    userId,
    limit,
  );
}

const rateBuckets = new Map<string, { count: number; reset: number }>();

export type RateLimitStatus = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
};

export function rateLimitStatus(keyId: string): RateLimitStatus {
  const limit = rateLimitPerMinute();
  const nowMs = Date.now();
  const bucket = rateBuckets.get(keyId);
  const fresh = !bucket || bucket.reset < nowMs;
  const next = fresh
    ? { count: 1, reset: nowMs + 60_000 }
    : { count: bucket.count + 1, reset: bucket.reset };

  if (!fresh && bucket.count >= limit) {
    return { allowed: false, limit, remaining: 0, resetAt: bucket.reset };
  }

  rateBuckets.set(keyId, next);
  return {
    allowed: true,
    limit,
    remaining: Math.max(0, limit - next.count),
    resetAt: next.reset,
  };
}

export function utcDayStart(daysAgo = 0): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString();
}

export type DailyUsage = {
  requests: number;
  /** Tokens charged to the personal budget (excludes event-covered usage). */
  tokens: number;
  /** Tokens spent on models an event currently covers. */
  eventTokens: number;
  isContributor: boolean;
  limit: number;
  remaining: number;
  resetAt: string;
};

export async function usageToday(userId: string): Promise<DailyUsage> {
  const row = await one<{
    requests: number;
    tokens: number;
    event_tokens: number;
    is_contributor: number;
  }>(
    `SELECT COUNT(*) AS requests,
            COALESCE(SUM(CASE WHEN event_id IS NULL
                              THEN prompt_tokens + completion_tokens
                              ELSE 0 END), 0) AS tokens,
            COALESCE(SUM(CASE WHEN event_id IS NOT NULL
                              THEN prompt_tokens + completion_tokens
                              ELSE 0 END), 0) AS event_tokens,
            EXISTS (
              SELECT 1 FROM provider_keys k
              JOIN providers p ON p.id = k.provider_id
              WHERE k.user_id = ? AND k.status = 'verified' AND p.status = 'approved'
            ) AS is_contributor
     FROM usage_events WHERE user_id = ? AND created_at >= ?`,
    userId,
    userId,
    utcDayStart(),
  );
  const tokens = row?.tokens ?? 0;
  // Evaluate current contributions, not a permanent role: pending, failed,
  // disabled keys and paused/rejected providers do not earn the higher budget.
  const isContributor = Boolean(row?.is_contributor);
  const limit = dailyTokenLimit(isContributor);
  return {
    requests: row?.requests ?? 0,
    tokens,
    eventTokens: row?.event_tokens ?? 0,
    isContributor,
    limit,
    remaining: Math.max(0, limit - tokens),
    resetAt: nextDailyReset(),
  };
}

export async function tokensUsedToday(userId: string): Promise<number> {
  return (await usageToday(userId)).tokens;
}

export type DailyUsagePoint = {
  day: string;
  requests: number;
  tokens: number;
};

export async function usageDaily(userId: string, days = 14): Promise<DailyUsagePoint[]> {
  const rows = await all<DailyUsagePoint>(
    `SELECT substr(created_at, 1, 10) AS day,
            COUNT(*) AS requests,
            COALESCE(SUM(prompt_tokens + completion_tokens), 0) AS tokens
     FROM usage_events
     WHERE user_id = ? AND created_at >= ?
     GROUP BY day ORDER BY day ASC`,
    userId,
    utcDayStart(days - 1),
  );
  const byDay = new Map(rows.map((row) => [row.day, row]));
  const points: DailyUsagePoint[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = utcDayStart(offset).slice(0, 10);
    const row = byDay.get(day);
    points.push({ day, requests: row?.requests ?? 0, tokens: row?.tokens ?? 0 });
  }
  return points;
}

export type ModelUsage = {
  model: string;
  provider: string | null;
  requests: number;
  tokens: number;
  errors: number;
};

export async function usageByModel(
  userId: string,
  days = 30,
  limit = 10,
): Promise<ModelUsage[]> {
  return all<ModelUsage>(
    `SELECT u.model,
            p.name AS provider,
            COUNT(*) AS requests,
            COALESCE(SUM(u.prompt_tokens + u.completion_tokens), 0) AS tokens,
            COALESCE(SUM(CASE WHEN u.status = 'error' THEN 1 ELSE 0 END), 0) AS errors
     FROM usage_events u LEFT JOIN providers p ON p.id = u.provider_id
     WHERE u.user_id = ? AND u.created_at >= ?
     GROUP BY u.model, p.name
     ORDER BY tokens DESC LIMIT ?`,
    userId,
    utcDayStart(days - 1),
    limit,
  );
}

export type KeyUsage = {
  key_id: string;
  name: string;
  prefix: string;
  requests: number;
  tokens: number;
};

export async function usageByKey(userId: string, days = 30): Promise<KeyUsage[]> {
  return all<KeyUsage>(
    `SELECT k.id AS key_id, k.name, k.prefix,
            COUNT(u.id) AS requests,
            COALESCE(SUM(u.prompt_tokens + u.completion_tokens), 0) AS tokens
     FROM api_keys k
     LEFT JOIN usage_events u ON u.api_key_id = k.id AND u.created_at >= ?
     WHERE k.user_id = ? AND k.revoked_at IS NULL
     GROUP BY k.id ORDER BY tokens DESC`,
    utcDayStart(days - 1),
    userId,
  );
}
