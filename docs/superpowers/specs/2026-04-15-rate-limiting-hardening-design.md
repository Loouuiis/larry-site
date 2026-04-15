# Rate Limiting & Abuse Protection Hardening

**Date:** 2026-04-15
**Author:** Fergus + Claude (Opus 4.6)
**Status:** Approved, in implementation

## Problem

The public audit of the Larry API exposed several rate-limiting gaps that, while the repo was briefly public, could have been enumerated by an attacker:

1. `@fastify/rate-limit` uses an in-memory store — limits are per-instance, not global. Railway multi-instance bypasses them.
2. `trustProxy` is not set. Behind Railway's load balancer, `request.ip` is the proxy IP, so IP-based limits effectively collapse to a single bucket for all clients.
3. Resend email sends have no per-user/per-tenant caps. A compromised account (or bug) can drain the Resend quota and poison domain reputation.
4. LLM calls (Gemini/Groq) have per-minute route limits but no daily token budget. Groq free tier is 100k TPD; one tenant can exhaust the entire cap.
5. Google OAuth `link`/`unlink` endpoints are unprotected.
6. OAuth state JWTs are stateless — signature + TTL only, no single-use guard.
7. Web-layer (`apps/web/src/lib/rate-limit.ts`) falls back to in-memory on Vercel serverless, which is effectively no limit.

JWT access secret has already been rotated, so credential forgery from the leak is dead. This spec covers the structural fixes to ensure future exposure (or just scale) doesn't recreate the risk.

## Goals

- Distributed rate limiting that holds under multi-instance deploy.
- Correct client identity behind Railway proxy.
- Hard caps on outbound email per user/tenant to prevent email bombing.
- Daily LLM token budgets (per-tenant + global provider) to prevent cost/quota exhaustion.
- Close small OAuth gaps (link/unlink, state replay).
- Remove deceptive in-memory fallback on the web layer.

## Non-goals (YAGNI)

- Tiered plans with per-plan quotas (no plans table yet).
- Dollar cost tracking (tokens only).
- Alerting dashboard UI (Railway logs suffice for now).
- Cloudflare/WAF layer.
- Auto-refilling token bucket (fixed daily window is fine).

## Architecture

### Shared infrastructure — `apps/api/src/lib/redis.ts`

Single ioredis client, lazy-initialized, reused by:
- `@fastify/rate-limit` store
- Email quota guard
- Email suppression set
- LLM token budget accounting
- OAuth state single-use dedupe

ioredis v5 is already installed in `apps/api`. BullMQ uses the same `REDIS_URL`; one shared TCP connection is fine.

```ts
// apps/api/src/lib/redis.ts
import Redis from "ioredis";
import { getApiEnv } from "@larry/config";

let client: Redis | null = null;

export function getRedis(): Redis {
  if (client) return client;
  const env = getApiEnv();
  client = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
  });
  client.on("error", (err) => {
    // Logged here; don't silently swallow. Fastify logger picks this up.
    console.error("[redis] connection error:", err.message);
  });
  return client;
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}
```

Closed in the existing `onClose` hook alongside the queue and DB.

### Phase 1 — Fastify rate-limit + trustProxy

Edits to `apps/api/src/app.ts`:

```ts
const app = Fastify({
  logger: { level: env.LOG_LEVEL },
  bodyLimit: 10 * 1024 * 1024,
  trustProxy: true, // Railway sits behind a proxy; X-Forwarded-For must be honored
});

await app.register(rateLimit, {
  global: false,          // preserve opt-in per-route contract
  redis: getRedis(),      // distributed store
  skipOnError: false,     // fail-closed; Redis is already a hard dep (BullMQ)
  nameSpace: "rl:",       // namespace keys to avoid collisions
});
```

Per-route limit configs in existing handlers stay as-is.

### Phase 2 — Email send caps + suppression

New module: `apps/api/src/lib/email-quota.ts`.

```ts
export type EmailKind =
  | "password_reset"
  | "verification"
  | "email_change_confirm"
  | "email_change_notify"
  | "new_device_alert"
  | "member_invite"
  | "generic";

export interface EmailQuotaContext {
  kind: EmailKind;
  recipient: string;     // raw; hashed before logging/keying
  userId?: string;       // optional for anonymous flows like forgot-password
  tenantId?: string;
}

export class EmailQuotaError extends Error {
  constructor(public readonly detail: { scope: string; limit: number; window: string }) {
    super(`email quota exceeded: ${detail.scope}`);
    this.name = "EmailQuotaError";
  }
}

export class EmailSuppressedError extends Error {
  constructor(public readonly recipientHash: string) {
    super("recipient suppressed");
    this.name = "EmailSuppressedError";
  }
}

export async function checkEmailQuota(ctx: EmailQuotaContext): Promise<void>;
export async function addSuppression(recipient: string, reason: "bounce" | "complaint"): Promise<void>;
export async function isSuppressed(recipient: string): Promise<boolean>;
```

**Keys:**
- `email:suppressed:<sha256(recipient.toLowerCase())>` — Redis SET (actually a simple string "1" with no TTL; entries are forever until manual removal).
- `email:q:<kind>:user:<userId>:h` (1h window)
- `email:q:<kind>:user:<userId>:d` (1d window)
- `email:q:tenant:<tid>:d` (1d window, all kinds)
- `email:q:global:d` (1d circuit breaker)

**Limits (initial; env-tunable):**

| Kind                   | Per-user/hour | Per-user/day |
| ---------------------- | ------------- | ------------ |
| password_reset         | 3             | 10           |
| verification           | 5             | 15           |
| email_change_confirm   | 3             | 10           |
| email_change_notify    | 5             | 15           |
| new_device_alert       | 10            | 30           |
| member_invite          | n/a (tenant)  | n/a (tenant) |
| generic                | 10            | 30           |

Plus:
- `member_invite`: 20/hour/tenant
- Any kind: 200/day/tenant (global cap)
- Any kind: 500/day across all tenants (Resend circuit breaker)

**Flow** (inside `email.ts` at the top of each send function):

```ts
if (await isSuppressed(to)) return; // silent no-op; don't count
await checkEmailQuota({ kind: "password_reset", recipient: to, userId });
const { error } = await resend.emails.send({ ... });
```

**Failure handling:**
- `EmailQuotaError` → caller decides: auth flows return same generic success (enumeration-safe); internal flows log + swallow.
- `EmailSuppressedError` is implicit — the send is a no-op.

**Suppression wiring:**
Extend `apps/api/src/routes/v1/webhooks-resend.ts`:
- On `email.bounced` with type=hard → `addSuppression(email, "bounce")`.
- On `email.complained` → `addSuppression(email, "complaint")`.
- Soft bounces are logged only, no suppression.

### Phase 3 — LLM token budget

New module: `packages/ai/src/budget.ts`.

```ts
export interface TokenBudgetContext {
  tenantId: string;
  provider: "groq" | "google" | "anthropic" | "openai";
  estimatedTokens: number;  // pre-call estimate
}

export class LLMQuotaError extends Error {
  constructor(public readonly scope: "tenant" | "global", public readonly limit: number) {
    super(`llm quota exceeded: ${scope}`);
    this.name = "LLMQuotaError";
  }
}

export async function reserveTokens(ctx: TokenBudgetContext): Promise<TokenReservation>;
export async function reconcileTokens(reservation: TokenReservation, actualTokens: number): Promise<void>;
```

**Keys (48h TTL):**
- `llm:tok:tenant:<tid>:<YYYY-MM-DD>` — tenant's daily cumulative tokens
- `llm:tok:global:<provider>:<YYYY-MM-DD>` — provider global cumulative tokens

**Budgets (env-tunable):**
- `LLM_TENANT_DAILY_TOKENS` default 30000
- `LLM_GLOBAL_DAILY_TOKENS` (Groq) default 80000 (20% safety margin under 100k free-tier TPD)

**Flow:**
1. Estimate tokens (scan = 9000, chat turn = 3000, transcript = 5000 — all overridable).
2. `INCRBY` tenant key by estimate; if result > budget → `DECRBY` rollback → throw `LLMQuotaError("tenant", limit)`.
3. `INCRBY` global key; if over → rollback both keys → throw `LLMQuotaError("global", limit)`.
4. Do the call. Track actual token usage from provider response.
5. `INCRBY` by `(actual - estimated)`. Can be negative; Redis handles signed deltas.

**Integration points:**
- Wrap the single provider invocation point in `packages/ai/src/provider.ts` (need to confirm exact shape — likely a `generate()` or `chat()` helper). If provider invocations happen in multiple places, introduce a `runWithBudget()` helper and migrate call sites.
- `apps/worker/src/larry-scan.ts`: the scan already has `SCAN_CONCURRENCY=1` for Groq safety; `reserveTokens` adds the budget layer on top. On `LLMQuotaError` the scan should log and skip (next cron tick retries).
- `apps/api/src/routes/v1/larry.ts` chat/stream/transcript: on `LLMQuotaError` return 429 with a friendly message about daily quota.

### Phase 4 — OAuth and Google gaps

- `POST /v1/auth/google/link` + `POST /v1/auth/google/unlink`: add `config.rateLimit: { max: 10, timeWindow: '1 hour', keyGenerator: req => req.user.id }`.
- OAuth state single-use:
  - Before signing the state JWT, include a `jti` claim (UUID).
  - In callback handlers (Google + Slack), after verifying the state JWT, do `SET NX oauth:state:<jti> 1 EX <ttl>`. If the SET fails (already present) → reject as replay with 400.
- `GET /v1/auth/google/callback` + `GET /v1/connectors/slack/callback`: add `config.rateLimit: { max: 10, timeWindow: '1 minute', keyGenerator: req => req.ip }`.

### Phase 5 — Web-layer cleanup

`apps/web/src/lib/rate-limit.ts`:
- Remove the in-memory fallback branch.
- If `REDIS_URL` is unset → fail-closed (throw on check) OR export a no-op that the caller explicitly opts into. The API is the source of truth; the web layer is a UX nicety.
- Decision: treat as UX nicety. If Redis is not configured, `checkRateLimit` returns `{ ok: true }` silently (the API will still 429). Document this in a comment.

## Cross-cutting concerns

### Fail-closed on Redis outage
Redis is already a hard dep (BullMQ). If Redis is down, the API is already unable to queue scans. Fail-closed on rate limits is consistent with the existing posture.

### Test bypass
Reserved header `X-RateLimit-Bypass: <RATE_LIMIT_BYPASS_SECRET>` honored only when `NODE_ENV !== 'production'`. `@fastify/rate-limit` supports `skip` function — we pass one that checks this header. Secret comes from env; if unset, bypass is disabled entirely.

### Feature flags
Each phase guarded by an env boolean so we can flip off in Railway without redeploy:
- `RATE_LIMIT_REDIS_ENABLED` (default true)
- `EMAIL_QUOTA_ENABLED` (default true)
- `LLM_BUDGET_ENABLED` (default true)
- `OAUTH_STATE_SINGLE_USE_ENABLED` (default true)

### Logging
Every 429 or quota rejection logged at `warn` with `{kind, keyHash, limit, window}`. No raw PII (recipient emails are sha256'd before keying, same for log fields).

### Rollback plan
- Phase 1: flip `RATE_LIMIT_REDIS_ENABLED=false` → reverts to in-memory. Limits degraded but API still runs.
- Phase 2: flip `EMAIL_QUOTA_ENABLED=false` → sends go through unchecked. Emergency-only.
- Phase 3: flip `LLM_BUDGET_ENABLED=false` → LLM calls unchecked. Emergency-only.
- Phase 4: flip `OAUTH_STATE_SINGLE_USE_ENABLED=false` → stateless validation only. Risk returns to baseline.

### Testing
- Each phase: unit tests with mocked Redis (ioredis-mock or manual mock), integration test against docker-compose Redis.
- Vitest is the test runner (confirmed in `apps/api/package.json`).
- Post-deploy: a smoke test script against the Railway URL verifying 429 fires on a dedicated throwaway route.

### Deployment order
1. Phase 1 first — foundation. Small, low-risk.
2. Phase 2 next — defensive on emails.
3. Phase 3 — cost protection (the expensive one, but the biggest risk reduction).
4. Phase 4 — close gaps.
5. Phase 5 — cleanup.

Each phase is its own commit on `feat/rate-limiting-hardening`, pushed after tests pass, deploy verified on Railway before starting the next phase.

## Edge cases addressed

| Edge case                                   | Handling                                                            |
| ------------------------------------------- | ------------------------------------------------------------------- |
| Multi-instance deploy                       | Redis store (Phase 1)                                               |
| Client IP behind Railway proxy              | `trustProxy: true` (Phase 1)                                        |
| NAT / shared IP unfair punishment           | Auth routes use userId keyGen; unauth routes use IP + log            |
| Fixed-window burst at boundary              | `@fastify/rate-limit` uses sliding window internally                |
| Race in INCR/check                          | INCR is atomic; rollback on overshoot                               |
| Redis down                                  | Fail-closed; API already needs Redis for queue                      |
| Test runs hitting limits                    | `X-RateLimit-Bypass` header with env secret, non-prod only          |
| LLM actual tokens differ from estimate      | Post-call reconciliation with signed INCRBY delta                   |
| Bounced email re-send amplification         | Suppression set checked first, never burns quota or Resend reputation |
| Replayed OAuth state                        | SET NX on JTI (Phase 4)                                             |
| Legitimate user retrying password reset     | 3/hour is generous enough; limits logged so we can tune             |
| Internal alert floods (new device, etc.)    | Per-kind + per-user + per-tenant + global caps stack                 |
| Email enumeration via forgot-password       | Already mitigated (generic 200 response); quota key is email-based  |
| PII in logs                                 | Emails sha256'd before keying and logging                           |
| Worker sending email                        | Confirmed: worker does not call Resend directly (no landmine)       |

## Open questions

None. All defaults chosen and documented above. Env vars allow runtime tuning without code changes.
