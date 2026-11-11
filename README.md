# cmnAI

A community-owned, OpenAI-compatible inference pool. Members contribute endpoints and keys, admins review them, and everyone gets one API with fair-use limits.

## Features

- **One OpenAI-compatible API** — `POST /v1/chat/completions` with streaming, plus `GET /v1/models`.
- **Upstream API modes** — providers can speak OpenAI Chat Completions, the OpenAI Responses API, or Anthropic Messages; cmnAI translates them behind one Chat Completions surface.
- **Admin mask headers** — admins can add per-provider outbound headers (for example Claude Code client headers) without exposing them in the public directory.
- **Community pool** — public provider directory, reviewed endpoints, verified upstream keys.
- **Accounts and keys** — scrypt passwords, hashed API keys (`cmn_sk_…`), server-generated image captcha.
- **Usage and limits** — per-minute request limits, a daily token budget, usage history, per-model and per-key breakdowns, and standard `X-RateLimit-*` / `X-Daily-Tokens-*` headers.
- **Admin review** — approve or reject providers and models, suspend accounts, audit log.
- **Bilingual** — English and Russian, dark-only minimalist interface.

## Stack

Next.js 16 (App Router), React 19, Bun, Astryx 0.7, Geist icons, Vercel AI SDK, Cloudflare Workers + D1 via `@opennextjs/cloudflare`.

## Getting started

```bash
bun install
cp .env.example .env
bun run dev
```

Open `http://localhost:3000`. Local development uses a local Cloudflare D1 database through the OpenNext dev adapter; the schema and seed data are created on first request. No Cloudflare login is needed for local development.

Seeded accounts:

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@cmnai.dev` | `cmnai-admin-2026` |
| Member | `worker@cmnai.dev` | `cmnai-worker-2026` |

Change these with `CMNAI_ADMIN_EMAIL` / `CMNAI_ADMIN_PASSWORD` before the first run, and set `CMNAI_SECRET` in production. The seeded admin is only created when the database is empty.

## API

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer cmn_sk_…" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/gpt-4o-mini",
    "messages": [{ "role": "user", "content": "Hello" }]
  }'
```

Every response includes the remaining budget:

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 57
X-RateLimit-Reset: 1790000060
X-Daily-Token-Limit: 200000
X-Daily-Tokens-Used: 12680
X-Daily-Tokens-Remaining: 187320
```

`429` responses include `Retry-After` and an error `code` of `rate_limit` or `daily_limit`.

Members receive **200,000 tokens per UTC day**. Contributing at least one verified
upstream key to an approved provider raises the account's daily budget to
**2,000,000 tokens**, shared across all of its API keys. Pending, failed or disabled
keys and paused or rejected providers do not qualify. Existing verified
contributions qualify automatically; no new API key is needed.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `CMNAI_SECRET` | dev fallback | Session/API-key hashing secret — set in production |
| `CMNAI_ADMIN_EMAIL` | `admin@cmnai.dev` | Seeded admin email |
| `CMNAI_ADMIN_PASSWORD` | `cmnai-admin-2026` | Seeded admin password |
| `CMNAI_RATE_LIMIT_PER_MINUTE` | `60` | Requests per minute per API key |
| `CMNAI_DAILY_TOKEN_LIMIT` | `200000` | Tokens per UTC day per member |
| `CMNAI_CONTRIBUTOR_DAILY_TOKEN_LIMIT` | `2000000` | Tokens per UTC day per verified key contributor (never lower than the member budget) |

## Deploy to Cloudflare

The app builds to a Worker with `@opennextjs/cloudflare` and stores data in D1. The deployed instance is at <https://cmnai.holy-voice-dd33.workers.dev>.

One-time setup:

```bash
bun install
bunx wrangler d1 create cmnai-db
# Put the returned database_id into wrangler.jsonc.
bunx wrangler d1 execute cmnai-db --remote --file schema.sql --yes
bunx wrangler secret put CMNAI_SECRET
bunx wrangler secret put CMNAI_ADMIN_PASSWORD
bunx wrangler secret put CMNAI_ADMIN_EMAIL
```

Deploy:

```bash
bun run deploy
```

`bun run preview` builds and serves the production Worker locally with Wrangler. Apply schema changes with `bunx wrangler d1 execute cmnai-db --remote --file schema.sql`.

The initial seed includes demo providers with placeholder upstream keys. They make the directory and model list usable immediately, but chat requests return `503 upstream_unavailable` until a real provider key is added from a dashboard endpoint page.

## Notes

The per-key request limiter is in-memory. On Workers it is scoped to each isolate, so the effective per-minute ceiling can be higher than the configured value while traffic is spread across isolates; move the bucket to a Durable Object or D1 for strict global limits. Daily token usage and all persistent data live in D1 and are global.
