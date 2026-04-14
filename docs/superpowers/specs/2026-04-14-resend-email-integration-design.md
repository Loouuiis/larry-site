# Resend Email Integration — Design Spec

**Date:** 2026-04-14
**Status:** Approved (Louis/Fergus, 2026-04-14) — implementation pending
**Author:** Claude (brainstormed with Fergus)

---

## Background

Larry already has substantial Resend scaffolding (six transactional email functions in `apps/api/src/lib/email.ts`, escalation alerts in `apps/worker/src/escalation.ts`, referral mail in `apps/web/src/app/api/referral/route.ts`, plus Zod env schema in `packages/config/src/index.ts`). Until now, `RESEND_API_KEY` has been unset everywhere — the code falls back to `console.log` of the URL/payload via `isResendConfigured()` guards.

This spec covers the production rollout: domain, sender strategy, env provisioning, code unification, and the test/rollout plan. It is intentionally scoped to "make the existing functions actually deliver mail safely." It does NOT cover new email types (briefings, digests), bounce/complaint webhooks, or unifying the worker's raw `fetch` call to the Resend SDK.

## Goals

1. Production-grade transactional email delivery for all existing email functions.
2. Two distinct sender personas on a single verified domain.
3. Single `RESEND_API_KEY` shared across web (Vercel), api (Railway), worker (Railway).
4. Zero-downtime kill switch (set `RESEND_API_KEY=""` to fall back to console logging).
5. Verified deliverability across Gmail, Outlook, and at least one corporate Exchange domain.

## Non-goals

- Bounce/complaint webhook handling (deferred — useful later for deliverability hygiene).
- Unifying worker's raw-fetch Resend call to the SDK (works, YAGNI).
- New email types beyond what already exists in code.
- Rate-limiting or retry logic beyond what the Resend SDK provides.
- Marketplace integration (rejected — covers Vercel only; api+worker on Railway need manual key anyway, so single source of truth wins).

## Architecture

### Domain & senders

Single verified domain: **`larry-pm.com`** (Louis confirmed ownership; verification still required at registrar).

Two senders on that domain:

| Sender | Purpose | Voice |
|---|---|---|
| `Larry <noreply@larry-pm.com>` | Security/transactional. Replies ignored. | Impersonal, automated. |
| `Larry <larry@larry-pm.com>` | Product communications. Personifies the product. | Friendly, in-character. |

Both are verified by verifying the **domain** in Resend; no per-address verification needed.

### Environment variables

Replaces the existing single `RESEND_FROM` env var with a pair:

| Variable | Value | Notes |
|---|---|---|
| `RESEND_API_KEY` | (from Resend dashboard) | Same key on Vercel + Railway api + Railway worker. |
| `RESEND_FROM_NOREPLY` | `Larry <noreply@larry-pm.com>` | Default in code matches this. |
| `RESEND_FROM_LARRY` | `Larry <larry@larry-pm.com>` | Default in code matches this. |

The schema in `packages/config/src/index.ts` makes `RESEND_API_KEY` optional (preserving the kill-switch / dev fallback) and provides hardcoded defaults for the two FROM vars so a missing env doesn't break boot.

### Email → sender mapping

| Function / route | Trigger | Sender |
|---|---|---|
| `sendPasswordResetEmail` | User clicks "forgot password" | `noreply@` |
| `sendVerificationEmail` | Signup | `noreply@` |
| `sendEmailChangeConfirmation` | User changes email | `noreply@` |
| `sendEmailChangeNotification` | Security heads-up to old address | `noreply@` |
| `sendNewDeviceAlert` | New sign-in detected | `noreply@` |
| `sendMemberInviteEmail` | Workspace invite | `larry@` |
| `apps/worker/src/escalation.ts` | Worker flags overdue/risk | `larry@` |
| `apps/web/src/app/api/referral` | User refers a friend | `larry@` |

**Rationale.** Security-sensitive flows use `noreply@` because users associate that pattern with "I shouldn't reply, this is automated, the link is the action." Product comms use `larry@` because Larry as a product is personified — it's the AI PM speaking, not a faceless system.

### Reply handling

- `noreply@larry-pm.com` — drop silently for v1. Optional follow-up: configure auto-responder pointing users to the in-app contact channel.
- `larry@larry-pm.com` — forward to Louis's inbox via registrar/email host; out of scope for this spec but should be set up before any volume hits.

## Code changes

Scoped tightly. No unrelated refactors.

### 1. `packages/config/src/index.ts`

Both the api schema and worker schema:

```ts
RESEND_API_KEY: z.string().optional(),
RESEND_FROM_NOREPLY: z.string().default("Larry <noreply@larry-pm.com>"),
RESEND_FROM_LARRY: z.string().default("Larry <larry@larry-pm.com>"),
```

Remove the existing `RESEND_FROM` line in the worker schema.

### 2. `apps/api/src/lib/email.ts`

Replace the hardcoded `const FROM = "Larry <noreply@larry.app>"` with:

```ts
const FROM_NOREPLY = process.env.RESEND_FROM_NOREPLY ?? "Larry <noreply@larry-pm.com>";
const FROM_LARRY   = process.env.RESEND_FROM_LARRY   ?? "Larry <larry@larry-pm.com>";
```

Per-function changes (swap `from: FROM` → the right constant):

- `sendPasswordResetEmail` → `FROM_NOREPLY`
- `sendVerificationEmail` → `FROM_NOREPLY`
- `sendEmailChangeConfirmation` → `FROM_NOREPLY`
- `sendEmailChangeNotification` → `FROM_NOREPLY`
- `sendNewDeviceAlert` → `FROM_NOREPLY`
- `sendMemberInviteEmail` → `FROM_LARRY`

### 3. `apps/worker/src/escalation.ts`

Replace `from: env.RESEND_FROM` with `from: env.RESEND_FROM_LARRY`. Leave the raw `fetch` call alone — switching to SDK is out of scope.

### 4. `apps/web/src/app/api/referral/route.ts`

Switch its `from` to use `RESEND_FROM_LARRY` (read from `process.env`, with the same default fallback).

### 5. `.env.example` files

`apps/api/.env.example`, `apps/web/.env.example`, `apps/worker/.env.example` — replace any existing `RESEND_*` lines with:

```
RESEND_API_KEY=
RESEND_FROM_NOREPLY=Larry <noreply@larry-pm.com>
RESEND_FROM_LARRY=Larry <larry@larry-pm.com>
```

### 6. Tests

- New: `apps/api/src/lib/email.test.ts` — mocks `Resend`, asserts each of the 6 functions calls `resend.emails.send` with the correct `from` value per the mapping table (the new mapping with `FROM_NOREPLY` / `FROM_LARRY`). TDD order: write tests against the **target** behaviour first; they fail because the code still uses the single `FROM`; then implement the code change and they pass.
- Grep for any existing assertions on `"larry.app"` or the old `RESEND_FROM` and update.

### 7. Docs

- `docs/CONNECTORS.md` — confirm Resend section reflects new env vars and sender mapping.
- `SECURITY-REVIEW.md` — only update references to `larry.app` that describe the **email FROM address** specifically. Do not blanket-replace `larry.app` (it may appear in unrelated URL/marketing context).

## Provisioning (rollout phases)

### Phase A — Resend account & domain (Louis, ~10 min)

1. Sign up at resend.com using "Sign in with GitHub" (account `led1299`).
2. Dashboard → **Domains** → add `larry-pm.com`.
3. Add the 3 DNS records (SPF/TXT, DKIM/CNAME ×2 or TXT, DMARC/TXT) at the registrar for `larry-pm.com`.
4. Click **Verify** in Resend until all 3 records show green.
5. **API Keys** → New → name `larry-prod`, permission `Sending access`, scoped to `larry-pm.com`. Copy the key.
6. Hand the key to Claude. Acceptable channels: paste in chat (key is never persisted to disk by Claude), or write to `apps/api/.env.local` and tell Claude. Do NOT commit the key. Do NOT email it.

### Phase B — env injection (Claude, ~2 min)

- Vercel (`apps/web` project): `vercel env add` for `RESEND_API_KEY`, `RESEND_FROM_NOREPLY`, `RESEND_FROM_LARRY` (production + preview).
- Railway api service: `railway variables --set` the same three.
- Railway worker service: same three.
- Verify with `vercel env ls` and `railway variables`.

### Phase C — code changes (Claude, ~15 min)

Per the Code changes section. Branch `feat/resend-integration`. Single PR.

### Phase D — testing (Claude, then verified together)

1. Unit tests — `npm test` passes the new `email.test.ts`.
2. Local integration — one-off `scripts/test-resend.ts` sends one of each of the 6 email types to Louis's inbox using the real key. Confirm all arrive in inbox (not spam), correct FROM, links work. Delete script after.
3. Resend dashboard verification — Logs show `delivered`; SPF/DKIM/DMARC indicators green on every message.
4. Production smoke test — after deploy, real signup → verify email → click link. Forgot-password → reset email → reset works.
5. Inbox provider matrix — Gmail, Outlook, corporate Exchange. Catches new-domain quarantine quirks.

### Phase E — rollout order (matters)

1. Code changes merged into branch (NOT master).
2. DNS records verified in Resend (Phase A complete).
3. Env vars set on Vercel + Railway (Phase B).
4. Local integration test passes (Phase D.1, D.2).
5. Merge to master → auto-deploys.
6. Production smoke test (Phase D.4).
7. Inbox matrix (Phase D.5).
8. All green → done.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| DNS not propagated | Wait 15 min, retry. If still failing after 1h, check registrar formatting. |
| First emails to spam (cold domain) | Send to own inbox first, mark "Not spam"; warm up gradually. |
| DMARC quarantine on Outlook | Keep Resend's default `p=none` for at least 4 weeks before tightening. |
| API key leaked in logs | `email.ts` only logs `error.message`. Do not log the key. Verify before merge. |
| Wrong sender used | Caught by Phase D.1 unit tests. |
| Railway env not applied | Sometimes needs service redeploy after var change. Trigger explicitly. |

## Rollback

Setting `RESEND_API_KEY=""` on Railway + Vercel restores the existing console-logging fallback via `isResendConfigured()`. Auth flows continue to work; emails just don't send. Zero-downtime kill switch — no code revert needed.

## Open questions

None at spec-write time. All decisions have been made and approved.
