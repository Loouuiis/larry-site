# Implementation Plan — Rate Limiting Hardening

**Spec:** `docs/superpowers/specs/2026-04-15-rate-limiting-hardening-design.md`
**Branch:** `feat/rate-limiting-hardening`

Each phase lands as its own commit. After each: `npm --workspace apps/api test`, push, wait for Railway deploy, smoke test.

---

## Phase 1 — Redis-backed rate limiter + trustProxy

### Files
- **New**: `apps/api/src/lib/redis.ts` — singleton client
- **New**: `apps/api/src/lib/redis.test.ts` — singleton behavior
- **Edit**: `apps/api/src/app.ts` — wire Redis to `@fastify/rate-limit`, `trustProxy: true`, `skipOnError: false`, `onClose` closes client
- **New**: `apps/api/src/app.test.ts` (or add to existing) — trustProxy wired, rate-limit has Redis store

### Tests (TDD, write first)
1. `getRedis()` returns same instance on repeat calls
2. `closeRedis()` allows re-init
3. With `trustProxy: true`, a request with `X-Forwarded-For: 1.2.3.4` reports `request.ip === "1.2.3.4"`
4. Rate-limit exceeded across "two instances" (simulated by clearing in-process state but sharing Redis) still returns 429

### Commands
```
cd apps/api
npm test -- src/lib/redis.test.ts
npm test -- src/app.test.ts
```

### Risk & rollback
- Risk: Redis misconfig causes 500s on every rate-limited route.
- Rollback: env `RATE_LIMIT_REDIS_ENABLED=false` → app.ts branch falls back to `redis: undefined`.

### Smoke test after deploy
```
# Hammer /v1/auth/login from same IP 11 times; expect the 11th to be 429
for i in {1..11}; do curl -sS -o /dev/null -w '%{http_code}\n' \
  https://larry-site-production.up.railway.app/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"nobody@example.com","password":"x"}'; done
# Expect 10x (401|400) then 429
```

---

## Phase 2 — Email quota + suppression

### Files
- **New**: `apps/api/src/lib/email-quota.ts` — checkEmailQuota, isSuppressed, addSuppression, errors
- **New**: `apps/api/src/lib/email-quota.test.ts`
- **Edit**: `apps/api/src/lib/email.ts` — wrap each send with suppression check + quota check
- **Edit**: `apps/api/src/lib/email.test.ts` — add cases for quota exhaustion & suppression no-op
- **Edit**: `apps/api/src/routes/v1/webhooks-resend.ts` — on bounce/complaint call `addSuppression`
- **Edit**: `apps/api/src/routes/v1/webhooks-resend.test.ts` — assert suppression side-effect

### Tests (TDD)
1. `checkEmailQuota` allows under limit (returns void)
2. `checkEmailQuota` throws `EmailQuotaError` at hour limit
3. `checkEmailQuota` throws `EmailQuotaError` at day limit even if hour resets
4. Tenant daily cap applies across kinds
5. Global daily circuit breaker fires at 500
6. `isSuppressed` returns true after `addSuppression`
7. `sendPasswordResetEmail` is a no-op (does not call resend) when recipient is suppressed
8. `sendPasswordResetEmail` throws `EmailQuotaError` past limit; forgot-password route catches and still returns generic 200
9. Resend webhook `email.bounced` (hard) adds suppression
10. Resend webhook `email.complained` adds suppression
11. Soft bounces do NOT suppress

### Commands
```
npm test -- src/lib/email-quota.test.ts
npm test -- src/lib/email.test.ts
npm test -- src/routes/v1/webhooks-resend.test.ts
```

### Risk & rollback
- Risk: legit users hit quota (bad defaults). Logs every 429 at warn — Railway logs will show it.
- Rollback: env `EMAIL_QUOTA_ENABLED=false` → guards become no-ops.

### Smoke test after deploy
Manual: request password reset 4 times via UI within 1h. 4th should silently no-op (server 429, UI shows generic "check your email").

---

## Phase 3 — LLM token budget

### Files
- **New**: `packages/ai/src/budget.ts` — reserveTokens, reconcileTokens, LLMQuotaError
- **New**: `packages/ai/src/budget.test.ts`
- **Edit**: `packages/ai/src/provider.ts` OR introduce `packages/ai/src/run.ts` wrapper — depends on current provider shape; will inspect at implementation time
- **Edit**: `apps/worker/src/larry-scan.ts` — wrap provider call, handle `LLMQuotaError` → log + skip
- **Edit**: `apps/api/src/routes/v1/larry.ts` — wrap chat/stream/transcript provider calls, `LLMQuotaError` → 429 with friendly message
- **Edit**: `packages/config/src/index.ts` — add `LLM_TENANT_DAILY_TOKENS`, `LLM_GLOBAL_DAILY_TOKENS`, `LLM_BUDGET_ENABLED`

### Tests (TDD)
1. `reserveTokens` under budget → ok, INCRs both keys
2. `reserveTokens` over tenant budget → rollback, throws `LLMQuotaError("tenant", ...)`
3. `reserveTokens` over global budget → rollback both keys, throws `LLMQuotaError("global", ...)`
4. `reconcileTokens` with positive delta → INCRs further
5. `reconcileTokens` with negative delta → DECRs
6. Keys expire 48h (check TTL)
7. Scan handler catches `LLMQuotaError` and does not re-queue infinitely
8. Chat endpoint returns 429 on `LLMQuotaError`

### Risk & rollback
- Risk: bad estimate causes false rejections. Logged for tuning.
- Risk: reconcile missed (e.g., process crash) → slight over-accounting, favors safety. Acceptable.
- Rollback: `LLM_BUDGET_ENABLED=false`.

### Smoke test
Verify budget counters exist in Redis after a chat call:
```
redis-cli KEYS 'llm:tok:*'
redis-cli GET 'llm:tok:tenant:<test-tid>:2026-04-15'
```

---

## Phase 4 — OAuth gaps

### Files
- **Edit**: `apps/api/src/routes/v1/auth-google.ts` — rate-limit on `/link`, `/unlink`, `/callback`; state jti + single-use SET NX
- **Edit**: `apps/api/src/routes/v1/connectors-slack.ts` — state jti + single-use; IP limit on `/callback`
- **Edit**: both test files — replay attempt rejected

### Tests (TDD)
1. Google state signed with jti; reuse of same state → 400 "state already used"
2. Slack state signed with jti; reuse → 400
3. `/google/link` rate limited by userId at 10/hour
4. `/google/unlink` same
5. `/google/callback` rate limited by IP at 10/min

---

## Phase 5 — Web layer cleanup

### Files
- **Edit**: `apps/web/src/lib/rate-limit.ts` — remove in-memory fallback, turn into Redis-or-noop with clear comment
- **Edit**: any consumers to confirm they still behave

### Tests (TDD)
1. Without `REDIS_URL`: `checkRateLimit` returns `{ ok: true }` and logs a warning once
2. With Redis: enforces limit

---

## Verification checklist per phase

- [ ] TDD: failing test written first, confirmed failing, then implementation
- [ ] `npm test` green in affected workspaces
- [ ] `npm run build` green across monorepo (no TS errors)
- [ ] Commit with spec-referenced message
- [ ] Push to `feat/rate-limiting-hardening`
- [ ] Wait for Railway deploy (apps/api auto-deploys from branch? confirm; else merge to master at end)
- [ ] Smoke test against deployed URL
- [ ] Self-reflect: did anything surprise me? any skipped edge case? update spec if so
- [ ] Mark task completed, move to next

## Final merge
After all 5 phases verified: open PR `feat/rate-limiting-hardening` → `master` for the full body of work, not per phase. This keeps review coherent.
