# Next agent — Larry login hardening sprint

Hand this file to the next Claude session. It is self-contained: read it
top to bottom, then start work without asking clarifying questions beyond
the stop conditions at the end.

---

## What you're walking into

Larry is a B2B PM tool (Next.js App Router on Vercel + Fastify API on
Railway, Postgres). It launched on **2026-04-19** on `larry-pm.com`.

A launch-eve audit of the login stack was completed and the three
highest-impact fixes shipped in PR #126. The full audit lives at:

- **`docs/security/login-audit-2026-04-19.md`** — read this first. It
  has the inventory of what meets industry standard, the three fixes
  that shipped, and the ranked list of P1/P2 follow-ups.

Memory context worth pulling in (already indexed in the user's memory
system — check `memory/MEMORY.md` if running in this harness):

- `larry-login-audit-2026-04-19.md` — what shipped in #126.
- `larry-invites-project-scope-shipped.md` — PR #121, project-scoped
  invites + invite_links.
- `larry-login-tenant-fix.md` — PR #124 tenant switcher design.
- `larry-rate-limiting.md` — Redis-backed limits, email caps, LLM token
  budgets.
- `testing-on-production.md` — Fergus (the user) tests on deployed prod,
  not locally. Always push → verify deploy → then ask him to test.
- `feedback-autonomy-default.md` — drive through a queue of work without
  asking permission between steps; only pause for destructive/ambiguous
  actions.

Repo root: `C:/Dev/larry/site-deploys/larry-site`. Branch strategy:
branch from `master`, open a PR per scoped work unit, squash-merge.
Never force-push master.

## Your mission

Work through the P1 items in order, then P2 as time allows. Each item is
its own PR with tests + audit-doc update. Verify on prod after merge
using the pattern established in PR #124/#126 (curl + direct DB peek via
Railway CLI if needed).

---

## P1 — MUST ship

### P1-1. CSRF enforcement middleware (web layer)

**Why it matters.** A `csrfToken` is already minted into the session JWT
at login (`apps/web/src/lib/auth.ts:55`, via `randomUUID()`) but **no
middleware ever reads it or compares**. `sameSite=lax` mitigates most
classical CSRF for browser-initiated top-level navigations, but B2B
bar is defence-in-depth double-submit.

**Scope.**

1. Add a Next.js middleware or per-route guard that, for every
   **state-changing** request to `/api/**` (POST/PUT/PATCH/DELETE),
   requires an `X-CSRF-Token` request header that matches
   `session.csrfToken`.
2. Exempt the bootstrap endpoints that CANNOT have a CSRF token yet:
   `POST /api/auth/login`, `POST /api/auth/signup`,
   `POST /api/invitations/[token]/accept`,
   `POST /api/invite-links/[token]/redeem`,
   `POST /api/auth/password-reset` start/confirm,
   `POST /api/auth/verify-email`. Their auth flow IS the CSRF boundary
   (they take an unauth'd body and mint a session). Every other mutating
   `/api/**` route MUST require the header.
3. Expose the token to client components via a server component reading
   `getSession()` and rendering a `<meta name="csrf-token">` or via
   `GET /api/auth/csrf` that returns the current session's token.
4. Update the main `fetch` wrappers used by the app to include the header
   automatically on mutating methods. Search for mutating fetches:
   `rg "method: \"(POST|PUT|PATCH|DELETE)\""` in `apps/web/src`.
   Centralize in a `fetchWithCsrf` helper rather than touching every
   call site (30+). Update only those helpers used for mutations; leave
   GETs alone.
5. Rotate the `csrfToken` on every `persistSession` call
   (`apps/web/src/lib/workspace-proxy.ts:50`) so refresh/switch-tenant
   get fresh values — the existing `createSessionToken` already
   re-defaults to `randomUUID()` when `csrfToken` is undefined, so the
   fix is "don't pass the old token when persisting after a mutation".

**Tests.** Add `apps/web/src/__tests__/csrf-middleware.test.ts` with
vitest covering: (a) mutating request without header → 403, (b) with
wrong header → 403, (c) with correct header → passes through, (d) GET
with no header → passes through (read requests never require CSRF), (e)
exempt routes (login/signup/accept/redeem) accept no header. Integration
test against the actual Fastify proxy using `app.inject` if feasible;
unit-level is acceptable.

**Acceptance criteria.**
- `rg "csrfToken" apps/web/src` shows the token compared in middleware.
- Full suite green, including any new tests.
- Manual prod curl: POST without header → 403; POST with header from
  `/api/auth/csrf` → succeeds.
- `docs/security/login-audit-2026-04-19.md` updated (move CSRF from
  "Recommended follow-ups > P1" to "What already meets the bar").

---

### P1-2. MFA enforcement on `/login`

**Why it matters.** The DB already has `tenants.mfa_required_for_admins`
(schema.sql around line 1594) and a helper `assertMfaIfRequired` in
`apps/api/src/lib/mfa-gate.ts`. The helper is only called from invite
creation in `routes/v1/invitations.ts:47-52`. Login itself doesn't check
MFA status. An admin in a `mfa_required_for_admins = true` tenant can
therefore authenticate with just a password.

**Scope.**

1. After successful password verification in
   `apps/api/src/routes/v1/auth.ts:275-307` (the /login handler), and
   BEFORE issuing the access/refresh tokens at line 336-351:
   - Read `tenants.mfa_required_for_admins` for `user.tenant_id`.
   - If required AND `user.role` is `owner`/`admin` AND
     `users.mfa_enrolled_at IS NULL`:
     - Return a response shape like
       `{ code: "mfa_enrolment_required", enrolmentUrl: "/settings/mfa" }`
       with a 412 or 409 status. NOT the access token.
   - If required AND user IS enrolled: issue a **short-lived
     "mfa_pending" token** (e.g. 5 min) instead of the normal access
     token, and require a `POST /v1/auth/mfa/verify` step that exchanges
     `{ mfaPendingToken, code }` for real access/refresh tokens.
2. Implement TOTP enrolment: new endpoints
   - `POST /v1/auth/mfa/enrol` — requires session; generates a new
     secret, returns `{ secret, otpauthUrl }` (RFC 6238, SHA1, 30s, 6
     digits). Persist hashed secret to a new table `user_mfa_secrets`
     keyed by user_id (nullable scratch codes column for backup).
   - `POST /v1/auth/mfa/enrol/confirm` — `{ code }`. Verifies TOTP,
     flips `users.mfa_enrolled_at = NOW()`, returns 10 scratch codes
     (hashed at rest).
   - `POST /v1/auth/mfa/verify` — `{ mfaPendingToken, code }`. Accepts
     a live TOTP OR an unused scratch code; issues real access+refresh.
3. Minimal UI: a `/workspace/settings/mfa` page with a QR code
   (encode the otpauthUrl) and a 6-digit confirm input, plus a scratch
   codes reveal-once panel. Extend the login page with a second-step
   "Enter your 6-digit code" flow when the API returns `code:
   "mfa_required"`.
4. MIGRATION (number 027): `user_mfa_secrets` table with RLS-free
   design (secrets belong to users not tenants — users table is
   tenant-less). Scratch codes table if you split.
5. Add an admin toggle for `mfa_required_for_admins` on the org
   settings page (if not already there — search
   `apps/web/src/app/workspace/settings` first).

**Library.** Use `otpauth` or `@otplib/core` — whichever is already in
the repo. Do a `grep -r "otplib\|otpauth" apps/ packages/` first.

**Tests.**
- `apps/api/src/lib/mfa.test.ts` (new) — TOTP generation + verification,
  scratch-code single-use.
- `apps/api/tests/auth-mfa.test.ts` — the login-with-MFA flow: required
  but not enrolled → 412; required + enrolled + correct code → 200; bad
  code → 401 with attempt counted.
- Scratch-code reuse → 401.

**Acceptance criteria.**
- Admin in an MFA-required tenant without enrolment cannot log in.
- After enrolment + verification, login works with code.
- Scratch code works exactly once.
- Rate limit on `/v1/auth/mfa/verify` (reuse the existing rate-limit
  plugin — 10 attempts per 15 min per user_id, not IP).
- Audit log entries: `auth.mfa_enrolled`, `auth.mfa_verify_success`,
  `auth.mfa_verify_failure`.

---

## P2 — should ship, no blocker

### P2-1. Refresh-token reuse detection

If an already-revoked refresh token is presented to `POST /v1/auth/refresh`
(`routes/v1/auth.ts:377-441`), we return 401 but **do not revoke the
whole family**. Attacker with a stolen token + slow legit user can keep
one branch alive.

Fix: when revoked token is reused, revoke **all active refresh tokens
for that user + tenant** and write an `auth.refresh_reuse_detected`
audit log. Email the user.

The DB already has `revoked_at` — add a `parent_token_id` column
(migration 028) so you can trace the family, OR just nuke all active
tokens for the `(user_id, tenant_id)` pair when reuse is detected.
Second option is simpler and fine for launch.

### P2-2. Password breach check (HaveIBeenPwned k-anonymous API)

On signup + password reset + password change, SHA-1 the new password,
send the first 5 hex chars to `https://api.pwnedpasswords.com/range/XXXXX`,
check the returned list for the rest. If present → reject with
"This password has appeared in a data breach. Please choose another."

Cache responses in memory for 1 hour to avoid hammering HIBP.

### P2-3. Device fingerprint

Current known-device check is exact `(ip, user_agent)` at
`auth.ts:321-322`. Mobile OS updates churn the UA and home/office Wi-Fi
handoffs change IP, so every login triggers the email. Replace with:

- Set a long-lived, httpOnly, secure, sameSite=lax `larry_device_id`
  cookie on first successful login (random UUID).
- Persist `device_id` alongside each refresh token.
- Known-device = `device_id` cookie matches any non-revoked
  `refresh_tokens.device_id` for this user within the last 30 days.

### P2-4. Email trim + bracket normalisation

`emailSchema` runs `.email()` before `.transform()` so
`"  user@example.com  "` fails validation. Reorder:
`z.string().transform((v) => v.trim().toLowerCase()).pipe(z.string().email())`.
Audit test added in `src/lib/validation.test.ts` but skipped — unskip it.

### P2-5. Session rotation on re-login

When a user logs in while already having an active session, the old
refresh tokens linger. Add: at the end of the successful /login handler,
revoke all OTHER active refresh tokens for `(user_id, tenant_id)` that
were not just issued (exclude the token_hash we minted). Low impact
because /refresh already rotates, but it's best practice.

### P2-6. Harden headers on auth pages

Add `X-Frame-Options: DENY` and `Referrer-Policy: no-referrer` to the
`/login`, `/signup`, `/invite/accept`, `/invite/link/[token]`,
`/verify-email`, `/reset-password` routes. Use a Next.js `middleware.ts`
matcher, not per-route.

---

## How to work

1. Read `docs/security/login-audit-2026-04-19.md` in full.
2. Start with P1-1 (CSRF). Create `fix/csrf-enforcement` off master.
3. For each PR: branch → implement → tests → typecheck
   (`cd apps/api && npx tsc -p tsconfig.build.json --noEmit`) → full
   suite (`npx vitest run`) → commit → push → open PR → watch CI → merge
   → poll Railway until live → prod smoke test → report back to the user.
4. Update `docs/security/login-audit-2026-04-19.md` as items graduate
   from "follow-up" to "meets the bar".
5. Append each shipped PR to memory: create a new
   `larry-login-<topic>-shipped.md` entry.

## When to stop and ask

- If CSRF middleware would require touching >30 call sites in the web
  app, stop and confirm the central-helper approach is acceptable.
- If MFA scope blows up beyond 2 days of work, stop and agree on
  minimal viable surface (TOTP only, no scratch codes, no admin toggle
  UI — toggle via direct DB update).
- If a migration would need to drop or rename a column on a live table,
  stop — write the migration as additive only, deprecate the old column,
  and schedule removal for a separate cleanup PR.
- If you hit the postgres-enum landmine (see
  `feedback-pg-enum-add-value.md`): don't try to USE a new enum value in
  the same schema.sql batch that ADDs it. Split into two deploys.

## How to verify on prod

The user's test account: `launch-test-2026@larry-pm.com` /
`TestLarry123%` (admin, owns tenant `5d7cd81b-03ed-4309-beba-b8e41ae21ac8`
"Launch Test Org"). API is
`https://larry-site-production.up.railway.app`. Web is
`https://larry-pm.com` / `https://www.larry-pm.com`.

Railway CLI is installed and linked; you can probe the DB via
`railway variables --service Postgres --json` to get DATABASE_PUBLIC_URL,
but **never commit the URL** and clean up any temp scripts containing it
before committing.

## Tone + autonomy defaults (from the user)

- Fergus is the user. Terse, concrete replies. No em-dashes unless he
  uses them. Don't summarize what was just done unless asked.
- Drive through the queue without asking between steps. Self-reflect at
  each decision.
- Only pause for destructive/ambiguous actions or the stop conditions
  above.
- Test on deployed prod, not locally.
