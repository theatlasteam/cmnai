const DEFAULT_RATE_LIMIT = 60;
const DEFAULT_DAILY_TOKENS = 200_000;
const DEFAULT_CONTRIBUTOR_DAILY_TOKENS = 2_000_000;

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : fallback;
}

/** Requests allowed per minute for one API key. */
export function rateLimitPerMinute(): number {
  return positiveNumber(process.env.CMNAI_RATE_LIMIT_PER_MINUTE, DEFAULT_RATE_LIMIT);
}

/** Fair-use token budget per account, shared by all its API keys, per UTC day. */
export function dailyTokenLimit(isContributor = false): number {
  const memberLimit = positiveNumber(
    process.env.CMNAI_DAILY_TOKEN_LIMIT,
    DEFAULT_DAILY_TOKENS,
  );
  if (!isContributor) return memberLimit;

  return Math.max(
    memberLimit,
    positiveNumber(
      process.env.CMNAI_CONTRIBUTOR_DAILY_TOKEN_LIMIT,
      DEFAULT_CONTRIBUTOR_DAILY_TOKENS,
    ),
  );
}

/** When the current UTC daily window resets. */
export function nextDailyReset(at = new Date()): string {
  const reset = new Date(at);
  reset.setUTCHours(24, 0, 0, 0);
  return reset.toISOString();
}
