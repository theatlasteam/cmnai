import { all, id, now, one, run } from "./db";
import { parseProviderHeaders } from "./provider-headers";
import { normalizeProviderMode } from "./provider-mode";

export type ProviderKeyRow = {
  id: string;
  provider_id: string;
  user_id: string | null;
  label: string | null;
  status: "pending" | "verified" | "failed" | "disabled";
  last_checked_at: string | null;
  error: string | null;
  created_at: string;
};

export type VerifyKeyResult = {
  ok: boolean;
  error?: string;
};

const TIMEOUT_MS = 10_000;

async function responseExcerpt(response: Response): Promise<string> {
  try {
    const text = (await response.text()).replace(/\s+/g, " ").trim();
    return text.slice(0, 600);
  } catch {
    return "";
  }
}

function failure(status: number, body: string, fallback: string): VerifyKeyResult {
  return {
    ok: false,
    error: body ? `HTTP ${status}: ${body}` : `HTTP ${status}: ${fallback}`,
  };
}

/**
 * Checks an upstream key against the provider. OpenAI-style providers are
 * checked with /models when available, then with a tiny request using the
 * provider's configured API dialect. Anthropic providers go straight to
 * /messages because they do not expose /models.
 */
export async function verifyProviderKey(
  baseUrl: string,
  apiKey: string,
  testModel?: string | null,
  apiModeInput?: string | null,
  maskHeadersInput?: string | null,
): Promise<VerifyKeyResult> {
  const root = baseUrl.replace(/\/+$/, "");
  const apiMode = normalizeProviderMode(apiModeInput);
  const isAnthropic = apiMode === "anthropic_messages";
  const customHeaders = parseProviderHeaders(maskHeadersInput);
  const auth: Record<string, string> = isAnthropic
    ? {
        ...customHeaders,
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      }
    : {
        ...customHeaders,
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      };

  try {
    if (!isAnthropic) {
      const models = await fetch(`${root}/models`, {
        headers: {
          ...customHeaders,
          authorization: `Bearer ${apiKey}`,
        },
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (models.ok) return { ok: true };
      if (models.status === 401 || models.status === 403) {
        return {
          ok: false,
          error: `Invalid API key (HTTP ${models.status}). ${await responseExcerpt(models)}`.trim(),
        };
      }
    }

    if (!testModel) {
      return {
        ok: false,
        error: isAnthropic
          ? "Add a model to test the Anthropic endpoint."
          : "Endpoint has no model to test and /models did not respond successfully.",
      };
    }

    const testUrl =
      apiMode === "responses"
        ? `${root}/responses`
        : apiMode === "anthropic_messages"
          ? `${root}/messages`
          : `${root}/chat/completions`;

    const testBody =
      apiMode === "responses"
        ? {
            model: testModel,
            input: "ping",
            max_output_tokens: 16,
            stream: false,
          }
        : apiMode === "anthropic_messages"
          ? {
              model: testModel,
              max_tokens: 1,
              messages: [{ role: "user", content: "ping" }],
              stream: false,
            }
          : {
              model: testModel,
              messages: [{ role: "user", content: "ping" }],
              max_tokens: 1,
              stream: false,
            };

    const test = await fetch(testUrl, {
      method: "POST",
      headers: auth,
      body: JSON.stringify(testBody),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (test.ok) return { ok: true };
    if (test.status === 401 || test.status === 403) {
      return {
        ok: false,
        error: `Invalid API key (HTTP ${test.status}). ${await responseExcerpt(test)}`.trim(),
      };
    }
    return failure(test.status, await responseExcerpt(test), "The test request was rejected.");
  } catch {
    return { ok: false, error: "Could not reach the endpoint in time." };
  }
}

export async function fetchNewApiQuotaFingerprint(
  baseUrl: string,
  apiKey: string,
): Promise<string | null> {
  const root = baseUrl.trim().replace(/\/+$/, "").replace(/\/v1$/i, "");
  const headers = { Authorization: `Bearer ${apiKey.trim()}` };
  try {
    const res = await fetch(`${root}/api/usage/token`, {
      headers,
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const json = (await res.json()) as {
        data?: { total_granted?: number; total_used?: number; total_available?: number };
        total_granted?: number;
        total_used?: number;
        total_available?: number;
      };
      const d = json.data ?? json;
      if (
        typeof d.total_granted === "number" &&
        typeof d.total_used === "number" &&
        typeof d.total_available === "number"
      ) {
        return `newapi:${d.total_granted}:${d.total_used}:${d.total_available}`;
      }
    }
  } catch {
    // Fall back to billing endpoints below.
  }

  try {
    const subRes = await fetch(`${root}/v1/dashboard/billing/subscription`, {
      headers,
      signal: AbortSignal.timeout(5000),
    });
    if (subRes.ok) {
      const sub = (await subRes.json()) as { hard_limit_usd?: number };
      if (typeof sub.hard_limit_usd === "number") {
        return `billing:${sub.hard_limit_usd}`;
      }
    }
  } catch {
    // Endpoint unavailable.
  }
  return null;
}

export async function saveProviderKey(input: {
  providerId: string;
  userId: string | null;
  apiKey: string;
  label?: string | null;
  verified: boolean;
  error?: string | null;
  quotaFingerprint?: string | null;
}): Promise<string> {
  const keyId = id("pky_");
  const checkedAt = now();
  await run(
    `INSERT INTO provider_keys
      (id, provider_id, user_id, label, api_key, status, last_checked_at, error, quota_fingerprint, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    keyId,
    input.providerId,
    input.userId,
    input.label?.trim() || null,
    input.apiKey.trim(),
    input.verified ? "verified" : "failed",
    checkedAt,
    input.error ?? null,
    input.quotaFingerprint ?? null,
    checkedAt,
  );
  return keyId;
}

export async function verifiedKeyCount(providerId: string): Promise<number> {
  const row = await one<{ c: number }>(
    "SELECT COUNT(*) AS c FROM provider_keys WHERE provider_id = ? AND status = 'verified'",
    providerId,
  );
  return row?.c ?? 0;
}

export async function listProviderKeysForUser(userId: string) {
  return all<ProviderKeyRow & { provider_name: string; base_url: string }>(
    `SELECT k.id, k.provider_id, k.user_id, k.label, k.status, k.last_checked_at,
            k.error, k.created_at, p.name AS provider_name, p.base_url
     FROM provider_keys k JOIN providers p ON p.id = k.provider_id
     WHERE k.user_id = ? ORDER BY k.created_at DESC`,
    userId,
  );
}
