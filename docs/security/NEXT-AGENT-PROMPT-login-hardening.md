# Next agent — Larry login hardening: MFA + P2 backlog

**How to use this doc:** hand it to a fresh Claude Code session. It is
self-contained. Read it top to bottom, confirm your understanding
against the repo, then start work without asking clarifying questions
beyond the stop conditions at the end.

Paste prompt for the next session:

> Read `C:/Dev/larry/site-deploys/larry-site/docs/security/NEXT-AGENT-PROMPT-login-hardening.md` and work through it.

---

## Current status as of 2026-04-19 afternoon

Larry is a B2B PM tool (Next.js App Router on Vercel + Fastify API on
Railway, Postgres). Launched 2026-04-19 on `larry-pm.com`.

The 2026-04-19 launch-eve audit lives at
[`docs/security/login-audit-2026-04-19.md`](./login-audit-2026-04-19.md)
— read it first; it's the full inventory of what meets the bar and
what doesn't.

**Shipped in this sprint (all merged + prod-verified):**

| PR    | Scope                                                                 |
|-------|-----------------------------------------------------------------------|
| #126  | Launch-eve polish: accept-UX confirm, case-insensitive email lookup, password policy bumped 8→12 |
| #128  | P1-1 CSRF enforcement: middleware on `/api/:path*` validates `X-CSRF-Token` against `session.csrfToken` on mutating methods; `window.fetch` patch in root layout injects the header on same-origin `/api/**` mutations so 130 client call sites migrated without edits |
| #129  | Post-launch CSRF bootstrap fix (co-mint `larry_csrf` cookie at every session-mint site so signup-wizard step transitions don't 403) + P2-1/P2-4/P2-5 (refresh-token reuse detection with family-nuke, session rotation on re-login, email-trim ordering) |
| #130  | P2-2 HIBP password breach check on all 5 password-setting routes, `PasswordBreachedError` → 400 via global error handler, 1h prefix cache, fails-open on HIBP downtime |

**Remaining from the audit:**

1. **P1-2 MFA enforcement on `/login`** — this is the main job.
2. **P2-3 Device fingerprint cookie** — nice second task.
3. That's it for P1/P2. P3 items in the audit doc are backlog.

---

## Memory context worth pulling in

Already indexed in the user's memory system (check
`C:/Users/oreil/.claude/projects/C--Users-oreil/memory/MEMORY.md`
if running in that harness):

- `larry-login-audit-2026-04-19.md` — PR #126 launch-eve polish details.
- `larry-login-csrf-shipped.md` — PR #128 design + prod verification.
- `larry-csrf-signup-fix.md` — PR #129 CSRF-cookie-at-every-mint-site fix.
- `larry-login-p2-shipped.md` — PR #129 P2 polish + prod verification.
- `larry-launch-test-user.md` — test user creds (copied below).
- `larry-testing-tools.md` — Playwright MCP, Vercel MCP, CLIs.
- `larry-botid-blocks-headless-playwright.md` — Vercel BotID serves "Code 21" to headless Chromium on larry-pm.com/login. **Use Playwright MCP for prod UI tests**, not raw headless Playwright.
- `testing-on-production.md` — Fergus tests on deployed prod, not locally. Always push → verify deploy → then ask him to test.
- `feedback-autonomy-default.md` — drive through a queue of work without asking permission between steps; only pause for destructive/ambiguous actions or the explicit stop conditions below.
- `feedback-pg-enum-add-value.md` — don't USE a new enum value in the same `schema.sql` batch that ADDs it. Split into two deploys if needed.

---

## Repo + branch + build facts (don't re-discover these)

- **Repo root:** `C:/Dev/larry/site-deploys/larry-site`
- **Branch strategy:** branch from `master`, one PR per scoped unit, squash-merge. **Never force-push master.** Force-push feature branches only when necessary (`--force-with-lease`).
- **Monorepo layout:** `apps/api` (Fastify), `apps/web` (Next.js), `apps/worker`, `packages/{shared,db,config,ai}`.
- **Tests:** `cd apps/api && npx vitest run` (Node, ~15s). `cd apps/web && npx vitest run`. Web has pre-existing `tsc` errors in the gantt tree (`PortfolioGanttClient.tsx` / `gantt-utils.ts` — `parentCategoryId` / `projectId` drift) — they're not yours; don't try to fix them. Vercel `next build` ships fine past them.
- **Typecheck:** `cd apps/api && npx tsc -p tsconfig.build.json --noEmit` must be clean. Web `npx tsc --noEmit` has the pre-existing gantt noise — grep your own paths only.
- **CI:** `.github/workflows/*` runs api-tests + worker-build on every PR. Vercel deploys previews automatically. Railway auto-deploys master on push.
- **Migrations:** monolithic `packages/db/src/schema.sql` runs at startup (uses `ADD COLUMN IF NOT EXISTS` + `CREATE TABLE IF NOT EXISTS` for idempotency). Historical migrations live as reference files in `packages/db/src/migrations/NNN_name.sql`. Last one shipped is `026_invites_project_scope_and_links.sql`. Your next number is `027`.
- **`schema.sql` already has:**
  - `tenants.mfa_required_for_admins BOOLEAN NOT NULL DEFAULT FALSE` (line ~1594)
  - `users.mfa_enrolled_at TIMESTAMPTZ` (line ~1597)
  - Helper: `apps/api/src/lib/mfa-gate.ts::assertMfaIfRequired(db, tenantId, userId, role)` — currently only called from invitation creation. **You need to call it from login, and actually gate the response.**

---

## Prod test creds (don't ask the user, just use these)

- **API base:** `https://larry-site-production.up.railway.app`
- **Web base:** `https://larry-pm.com` (apex 307s to www). Use `https://www.larry-pm.com` in scripts.
- **Health:** `GET https://larry-site-production.up.railway.app/health` returns `{ok:true, service:"larry-api", ts:...}`. The API path prefix is `/v1/`.
- **Test user:** `launch-test-2026@larry-pm.com` / `TestLarry123%` — admin/owner of tenant `5d7cd81b-03ed-4309-beba-b8e41ae21ac8` ("Launch Test Org"). Don't rotate unless you restore at the end (I did this for P2-2 verification — check PR #130 for the restore pattern).
- **Railway CLI is installed + linked.** You can probe the DB via `railway variables --service Postgres --json` to get `DATABASE_PUBLIC_URL`, but **never commit the URL** and clean up any temp scripts that contain it before `git add`.
- **gh CLI is installed + authed.** Use it freely (`gh pr create/checks/merge/view`).

---

## Smoke-test recipes that already work on prod

```bash
# CSRF enforcement (from PR #128 verification)
API=https://larry-site-production.up.railway.app
WEB=https://www.larry-pm.com
# 1. login, capture session cookie
curl -c /tmp/cookies -X POST $WEB/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"launch-test-2026@larry-pm.com","password":"TestLarry123%"}'
# 2. fetch csrf
CSRF=$(curl -s -b /tmp/cookies $WEB/api/auth/csrf | grep -o '"csrfToken":"[^"]*"' | cut -d'"' -f4)
# 3. mutating POST without header → 403
curl -s -o /dev/null -w "%{http_code}\n" -b /tmp/cookies -X POST $WEB/api/workspace/tasks -H 'content-type: application/json' -d '{}'
# 4. with header → 400 (reaches route, fails validation as expected)
curl -s -b /tmp/cookies -X POST $WEB/api/workspace/tasks \
  -H 'content-type: application/json' -H "x-csrf-token: $CSRF" -d '{}'
```

```bash
# Refresh-reuse + family-nuke (from PR #129 verification)
LOGIN=$(curl -s -X POST $API/v1/auth/login -H 'content-type: application/json' \
  -d '{"email":"launch-test-2026@larry-pm.com","password":"TestLarry123%"}')
REF1=$(echo $LOGIN | grep -o '"refreshToken":"[^"]*"' | cut -d'"' -f4)
# rotate once
REF2=$(curl -s -X POST $API/v1/auth/refresh -H 'content-type: application/json' \
  -d "{\"refreshToken\":\"$REF1\",\"tenantId\":\"5d7cd81b-03ed-4309-beba-b8e41ae21ac8\"}" \
  | grep -o '"refreshToken":"[^"]*"' | cut -d'"' -f4)
# replay REF1 → 401 AND REF2 also dies
curl -s -o /dev/null -w "replay=%{http_code}\n" -X POST $API/v1/auth/refresh -H 'content-type: application/json' \
  -d "{\"refreshToken\":\"$REF1\",\"tenantId\":\"5d7cd81b-03ed-4309-beba-b8e41ae21ac8\"}"
curl -s -o /dev/null -w "after-nuke=%{http_code}\n" -X POST $API/v1/auth/refresh -H 'content-type: application/json' \
  -d "{\"refreshToken\":\"$REF2\",\"tenantId\":\"5d7cd81b-03ed-4309-beba-b8e41ae21ac8\"}"
```

```bash
# HIBP enforcement (from PR #130 verification — uses /change-password to avoid burning signup's 5/h rate limit)
LOGIN=$(curl -s -X POST $API/v1/auth/login -H 'content-type: application/json' \
  -d '{"email":"launch-test-2026@larry-pm.com","password":"TestLarry123%"}')
ACCESS=$(echo $LOGIN | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
# breached password → 400 "Password Compromised"
curl -s -X POST $API/v1/auth/change-password -H 'content-type: application/json' -H "Authorization: Bearer $ACCESS" \
  -d '{"currentPassword":"TestLarry123%","newPassword":"Password123!"}'
# If you rotate for testing, RESTORE to TestLarry123% before you finish.
```

---

## P1-2 MFA enforcement on `/login` — the main job

### Why it matters
Schema already has the flag + the column. `assertMfaIfRequired` exists but
is only called from invite creation (`routes/v1/invitations.ts`). Login
itself doesn't check MFA status. An admin in an `mfa_required_for_admins =
true` tenant can authenticate today with just a password.

### Realistic scope estimate: ~7-8 hours

This is a day of work. **Split into two PRs** so each is reviewable and
you can ship with a review checkpoint in between:

- **PR A (API + gate):** migration 027, TOTP lib, 3 endpoints, login
  gating, audit logs, rate limit, tests. No UI.
- **PR B (UI):** `/workspace/settings/mfa` page with QR + confirm, login
  page MFA step, admin toggle (optional — can ship via direct DB update
  if scope bites).

API-only is safe to ship solo because no tenant has
`mfa_required_for_admins = true` yet, so behaviour is unchanged until
someone flips the flag. UI follow-up unblocks enrolment.

### PR A — API + gate

#### 1. Migration 027 `user_mfa_secrets`

Add to `packages/db/src/schema.sql` (append after the existing MFA lines
around 1597). Also drop a reference file at
`packages/db/src/migrations/027_mfa_secrets.sql` matching the style of
`026_invites_project_scope_and_links.sql`.

```sql
CREATE TABLE IF NOT EXISTS user_mfa_secrets (
  user_id      UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  secret_enc   TEXT NOT NULL,                  -- encrypted TOTP secret (see #2)
  scratch_codes_hashed TEXT[] NOT NULL DEFAULT '{}', -- future-proof, empty for now
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ                     -- set by /mfa/enrol/confirm
);
```

Secrets belong to users, not tenants — users are tenant-agnostic. Don't
add a `tenant_id` column; scratch codes can come later (P1-2 follow-up,
not in this PR).

#### 2. TOTP library

`grep -r "otplib\|otpauth" apps/ packages/` first — none installed as of
2026-04-19. Add `otpauth` to `apps/api/package.json` (pure JS, works in
Node 24, maintained). `npm install -w @larry/api otpauth`.

#### 3. Encrypting the TOTP secret at rest

TOTP secrets can't be hashed (you need them to verify). Encrypt with a
symmetric key derived from `SESSION_SECRET` or a dedicated `MFA_SECRET`
env var. Use `node:crypto` AES-256-GCM; store `iv:ciphertext:tag` in
`secret_enc`. Keep the crypto helpers in `apps/api/src/lib/mfa.ts`.

Signature:
```ts
export function encryptTotpSecret(plain: string): string;
export function decryptTotpSecret(encoded: string): string;
export function generateTotpSecret(): { secret: string; otpauthUrl: (email: string) => string };
export function verifyTotpCode(secret: string, code: string): boolean;  // 30s window, ±1 step tolerance
```

#### 4. Endpoints (in a new `apps/api/src/routes/v1/auth-mfa.ts` registered from `auth.ts`)

- `POST /v1/auth/mfa/enrol` (authenticated).
  - Generates a new base32 secret + otpauth URL for the current user.
  - Upserts into `user_mfa_secrets` (replacing any unconfirmed row).
  - Returns `{ secret, otpauthUrl }`. Secret is base32; UI renders a QR from the URL.
- `POST /v1/auth/mfa/enrol/confirm` (authenticated).
  - Body: `{ code }`.
  - Verifies TOTP against the stored (unconfirmed) secret.
  - On success: `UPDATE user_mfa_secrets SET confirmed_at = NOW()` AND `UPDATE users SET mfa_enrolled_at = NOW()`.
  - Writes `auth.mfa_enrolled` audit log.
  - Returns `{ enrolled: true }`.
- `POST /v1/auth/mfa/verify` (unauthenticated — uses mfaPendingToken).
  - Body: `{ mfaPendingToken, code }`.
  - Verifies the `mfaPendingToken` (see #5 login gating).
  - Verifies TOTP against the user's stored secret.
  - On success: issues real `accessToken` + `refreshToken` (same shape as `/login`), writes `auth.mfa_verify_success`.
  - On failure: writes `auth.mfa_verify_failure` with the user_id; increments a per-user-id rate-limit counter.

#### 5. Login gating (`routes/v1/auth.ts` /login handler)

After successful `verifyPassword`, BEFORE the "successful login: reset
lockout counter" step and BEFORE issuing tokens:

```ts
// Read tenants.mfa_required_for_admins + users.mfa_enrolled_at
const mfaRows = await fastify.db.query<{ mfa_required_for_admins: boolean; mfa_enrolled_at: string | null }>(
  `SELECT t.mfa_required_for_admins, u.mfa_enrolled_at
     FROM tenants t
     JOIN users   u ON u.id = $1
    WHERE t.id = $2`,
  [user.id, user.tenant_id],
);
const mfa = mfaRows[0];
const protectedRole = user.role === "owner" || user.role === "admin";

if (mfa?.mfa_required_for_admins && protectedRole) {
  if (!mfa.mfa_enrolled_at) {
    // Reset lockout (successful password verification) BEFORE returning
    await fastify.db.query("DELETE FROM login_attempts WHERE user_id = $1", [user.id]);
    return reply.status(412).send({
      code: "mfa_enrolment_required",
      enrolmentUrl: "/workspace/settings/mfa",
      message: "This organisation requires admins to enrol MFA. Sign in again after completing enrolment.",
    });
  }
  // Enrolled — issue a short-lived mfa_pending token instead of real tokens
  await fastify.db.query("DELETE FROM login_attempts WHERE user_id = $1", [user.id]);
  const mfaPendingToken = await fastify.jwt.sign(
    { sub: user.id, tenantId: user.tenant_id, role: user.role, purpose: "mfa_pending" },
    { expiresIn: "5m" },
  );
  return reply.status(200).send({
    code: "mfa_required",
    mfaPendingToken,
  });
}

// ... existing reset-lockout + issue-tokens flow
```

The existing new-device-alert block runs AFTER token issue — keep it
that way for non-MFA users. For MFA-completing users, move the
new-device alert into `/v1/auth/mfa/verify` success path so an attacker
with just a password doesn't trigger the alert.

#### 6. Rate limit on `/v1/auth/mfa/verify`

Use the existing `@fastify/rate-limit` config. Key by user_id (decoded
from `mfaPendingToken`), not IP — otherwise an attacker rotates IPs and
the lockout fails. 10 attempts per 15 min per user_id. Example:

```ts
fastify.post("/mfa/verify", {
  config: {
    rateLimit: {
      max: 10,
      timeWindow: "15 minutes",
      keyGenerator: async (req) => {
        try {
          const body = (req.body as { mfaPendingToken?: string } | undefined);
          if (!body?.mfaPendingToken) return req.ip;
          const decoded = fastify.jwt.decode<{ sub?: string }>(body.mfaPendingToken);
          return decoded?.sub ?? req.ip;
        } catch {
          return req.ip;
        }
      },
    },
  },
}, async (request, reply) => { /* ... */ });
```

#### 7. Tests

- `apps/api/src/lib/mfa.test.ts` — TOTP generation + verification (use
  `otpauth` to derive the expected code at a fixed timestamp), encrypt
  round-trip, verify-with-skew tolerance.
- `apps/api/tests/auth-mfa.test.ts` — integration tests using the same
  Fastify-inject pattern as `auth-refresh-reuse.test.ts`:
  - Admin in MFA-required tenant, not enrolled → 412 with
    `code: "mfa_enrolment_required"`.
  - Admin in MFA-required tenant, enrolled, wrong code →
    `auth.mfa_verify_failure` audit, 401.
  - Admin in MFA-required tenant, enrolled, correct code → 200 +
    accessToken + refreshToken.
  - Member (not owner/admin) in MFA-required tenant → bypasses MFA gate
    (flag is explicitly `mfa_required_for_admins`).
  - Tenant flag = false → login unchanged for admins.
  - Reused `mfaPendingToken` → 401 (single-use via the rate limiter;
    optional: track consumed tokens in Redis).

#### 8. Acceptance criteria for PR A

- Admin in an MFA-required tenant without enrolment cannot log in.
- After enrolment + verification, login works with code.
- Rate limit on `/mfa/verify`: 10/15 min per user_id.
- Audit logs: `auth.mfa_enrolled`, `auth.mfa_verify_success`,
  `auth.mfa_verify_failure`.
- Typecheck + full suite green.
- `schema.sql` migration additive only (no DROP / RENAME on live tables).

#### 9. Enabling on prod for your own verification

After PR A is merged + deployed, manually flip the flag on the
launch-test tenant (`5d7cd81b-03ed-4309-beba-b8e41ae21ac8`) to test
end-to-end. Use Railway's SQL editor or `railway connect Postgres`.
Remember to flip it OFF again before finishing — otherwise PR B
development is harder because you can't log in without MFA.

### PR B — UI

Start after PR A merges cleanly. Goal: two surfaces.

1. **`/workspace/settings/mfa` page** at
   `apps/web/src/app/workspace/settings/mfa/page.tsx`. Client component.
   - "Enrol" button → calls `POST /api/auth/mfa/enrol` (proxied through the BFF).
     Wait — the BFF proxy routes live at `apps/web/src/app/api/auth/...`; you'll
     need to add three proxy routes (`mfa/enrol`, `mfa/enrol/confirm`,
     `mfa/verify`) that use `proxyApiRequest`. Or stand up a single
     `mfa/[...slug]` catch-all. Pick the catch-all — simpler and future-proof.
   - Receives `{ secret, otpauthUrl }`. Render QR from `otpauthUrl` (use `qrcode` or
     `qrcode.react` — check existing deps; if none, add `qrcode` and generate
     as data URL on server-render).
   - 6-digit code input → `POST /api/auth/mfa/enrol/confirm`.
   - On success, flip local state to "enrolled" and show a "disable" button
     (API endpoint for disable can be a follow-up — stop condition; don't
     overscope).
2. **Login page step** at `apps/web/src/app/(auth)/login/page.tsx`.
   - When `POST /api/auth/login` returns `{ code: "mfa_enrolment_required" }`,
     show a banner: "This workspace requires MFA. Sign in, enrol, and try
     again." Link to `/workspace/settings/mfa` (but the user won't have a
     session — so this link is dead weight; better copy: "Contact your
     workspace admin".)
   - When it returns `{ code: "mfa_required", mfaPendingToken }`, show a
     second input for the 6-digit code. Submit → `POST
     /api/auth/mfa/verify` with `{ mfaPendingToken, code }`. On success,
     persist session + redirect to `/workspace`.

Tests: Playwright MCP for UI verification (BotID blocks raw headless —
see `larry-botid-blocks-headless-playwright.md`).

### Stop conditions for P1-2

- **If scope in PR A blows past 6h of work**, stop and confirm with
  Fergus whether to drop the "enrolled user gets mfa_pending token" step
  entirely and instead issue real tokens the moment password verifies —
  losing the blind-admin MFA requirement but landing SOMETHING. **Don't
  do this silently.**
- **If migration 027 would need to drop or rename any column on a live
  table**, stop — write it additive only.
- **If you hit the postgres-enum landmine** (see
  `feedback-pg-enum-add-value.md`), split into two deploys.

---

## P2-3 Device fingerprint cookie (pick up after MFA)

Current known-device check at `auth.ts:321-322` does exact
`(ip, user_agent)` match. Mobile iOS rotates UA on OS updates, and home→
office Wi-Fi handoffs change IP, so every login triggers the
new-device email.

**Fix (also one PR):**
- Set a long-lived (`maxAge: 365 days`), `httpOnly`, `secure`,
  `sameSite: "lax"` cookie called `larry_device_id` (random UUID) on
  first successful login.
- Add `device_id UUID` column to `refresh_tokens` (migration 028, additive).
- In `issueRefreshToken`, persist `device_id` alongside the token.
- Known-device = `device_id` cookie matches any non-revoked
  `refresh_tokens.device_id` for this user in the last 30 days. If
  unknown AND there are prior sessions for this user, send the
  new-device alert.

Web change: the web layer needs to pass the `larry_device_id` value up
to the Fastify API on login. Options:
1. Proxy route reads cookie, passes as `x-device-id` header.
2. Store the cookie via Next.js, and the Fastify API reads the same
   cookie (only works if the cookie is set on the root domain — check
   whether `larry-pm.com` and `larry-site-production.up.railway.app`
   share a cookie scope; likely they don't, so go with option 1).

Tests: unit-level on the device-id resolution, integration via Fastify
inject with and without the header.

---

## How to work through this

1. Read `docs/security/login-audit-2026-04-19.md` in full, then come
   back here.
2. `git checkout master && git pull --ff-only`.
3. `git checkout -b fix/mfa-api-enforcement` for PR A.
4. Branch → implement → tests → typecheck
   (`cd apps/api && npx tsc -p tsconfig.build.json --noEmit`) →
   full suite (`cd apps/api && npx vitest run`) → commit → push →
   open PR → watch CI (`gh pr checks NNN --watch --interval 20`) →
   merge (`gh pr merge NNN --squash --delete-branch --body ""`) →
   poll Railway health (`curl https://larry-site-production.up.railway.app/health`
   in an `until` loop) → prod smoke test → report back.
5. Update `docs/security/login-audit-2026-04-19.md` as items graduate
   from "follow-up" to "✅ Shipped".
6. Append each shipped PR to memory: create
   `larry-login-<topic>-shipped.md` under
   `C:/Users/oreil/.claude/projects/C--Users-oreil/memory/` and link
   from `MEMORY.md`.

---

## Tone + autonomy defaults (inherited from the user)

- Terse, concrete replies. No em-dashes unless Fergus uses them. Don't
  summarize what was just done unless asked.
- Drive through the queue without asking between steps. Self-reflect at
  each decision.
- Only pause for destructive/ambiguous actions or the explicit stop
  conditions above.
- Test on deployed prod, not locally (see
  `testing-on-production.md`).
- When squash-merging, use `--body ""` to keep the squash commit
  message clean (the PR title becomes the commit subject).
- When force-pushing a feature branch, use `--force-with-lease`, never
  raw `--force`.

---

## One gotcha that bit me twice this sprint

The `gh` CLI occasionally fails the merge with a transient
`dial tcp ... connection attempt failed` network error. The PR doesn't
actually merge. Always verify after every merge with:

```bash
gh pr view NNN --json state,mergedAt,mergeCommit --jq '.'
```

If `state != "MERGED"`, retry the `gh pr merge` once.

Also: concurrent branch reflow can happen if the user is working on
other branches in parallel. If you see weird `reset: moving to HEAD~1`
entries in `git reflog` that you didn't issue, rebase your commit
cleanly onto master (`git rebase --onto master <base-commit>
<your-branch>`) and force-push with lease. Don't panic.
