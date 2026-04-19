# Login / auth audit — 2026-04-19

Scope: the login stack as it stands on the day before public launch. Paired
with PR `fix/login-audit-polish` which ships the three highest-impact fixes
(accept UX, case-insensitive email, password policy).

## Executive summary
Login design is materially aligned with industry standard (OWASP ASVS Level 2,
NIST SP 800-63B). The biggest missing piece is CSRF enforcement; the other
gaps are hardening rather than critical holes. No exploitable auth bypass
found during this pass.

## What already meets the bar

| Control | Where it lives | Notes |
|---|---|---|
| Password hashing | `apps/api/src/lib/auth.ts:7` | Bcrypt, 12 rounds. |
| Password policy | `apps/api/src/lib/validation.ts` | Min 12 chars + upper + digit + symbol (post-#PR). |
| Rate limiting | `routes/v1/auth.ts` `config.rateLimit` per-endpoint | signup 5/h, login 10/15m, refresh 30/h, per-IP. |
| Account lockout | `routes/v1/auth.ts:286-290` | 10 fails → 30 min lock, INSERT…ON CONFLICT atomically. |
| Generic error messages | `routes/v1/auth.ts:254-260, 306` | No email-enumeration signal. |
| Refresh token rotation | `routes/v1/auth.ts:426-438` | Old revoked, new issued, inside a tx. |
| Refresh token at rest | `apps/api/src/lib/auth.ts:17-24` | SHA-256 hashed; raw never persisted. |
| Refresh revocation on logout | `routes/v1/auth.ts:856` | UPDATE SET revoked_at = NOW() for all active tokens per (user, tenant). |
| Session cookie flags | `apps/web/src/lib/auth.ts:102-112` | httpOnly, secure (prod), sameSite=lax, path=/. |
| Session cookie JWT | `apps/web/src/lib/auth.ts:45-62` | HS256, 24h TTL, `csrfToken` bound inside payload. |
| CSRF enforcement | `apps/web/src/middleware.ts` + `apps/web/src/lib/csrf.ts` | Double-submit: session JWT carries `csrfToken`, middleware mirrors it into `larry_csrf` cookie, all mutating `/api/**` requests require `X-CSRF-Token` header matching session. Shipped in `fix/csrf-enforcement`. |
| MFA enforcement on /login | `apps/api/src/routes/v1/auth.ts` + `auth-mfa.ts` | Admins in `tenants.mfa_required_for_admins=true` tenants must complete TOTP second-step (or enrol first) before access tokens are issued. TOTP via `otpauth` (SHA1/30s/6). 10 scratch codes hashed at rest, single-use via `UPDATE … WHERE used_at IS NULL`. Shipped in `feat/mfa-login-enforcement`. |
| New-device email alerts | `routes/v1/auth.ts:315-334` | Best-effort, does not block login. |
| Email verification | `routes/v1/auth.ts:152-170`, `auth-verification.ts` | Single-use hashed token, 24h expiry, 7-day grace period. |
| Password reset | `auth-password-reset.ts` | Signed token, single-use (marked consumed on reset). |
| Audit logging | `auth.ts:175-183, 353-360, 860-866` | signup, login, logout, lockout, tenant switch. |
| Last-admin guard | `apps/api/src/lib/last-admin-guard.ts` | Prevents locking yourself out of a tenant. |
| Seat cap enforcement | `apps/api/src/lib/seat-cap.ts` | Memberships + pending invites. |
| Tenant switcher | `auth.ts` `/tenants`, `/switch-tenant`; `apps/web/src/components/workspace/WorkspaceSwitcher.tsx` | Shipped PR #124. |

## Fixes shipping in this PR

1. **Accept flow UX** (`apps/web/src/app/invite/accept/*`). When a signed-in
   user with the same email accepts an invite for a **different** tenant, the
   page now shows a warning block explaining their current-workspace
   membership is preserved, and a confirm step is required before switching.
   The button label changes to "Switch to <X> as <email>".
2. **Case-insensitive email lookup** (`routes/v1/auth.ts` signup + login).
   Old mixed-case `users.email` rows would silently fail login even though
   `emailSchema` normalises new inputs. Now `WHERE lower(u.email) = lower($1)`.
3. **Password policy bump** (`lib/validation.ts`). `passwordSchema` was min 8;
   the UI (accept/redeem forms) already required 12. Raised server to 12 so
   the policy matches across surfaces.

## Recommended follow-ups, ranked

### P1 — ship this sprint

**CSRF enforcement on mutating endpoints.** ✅ Shipped in `fix/csrf-enforcement`.
Middleware on `/api/:path*` requires `X-CSRF-Token` matching `session.csrfToken`
for all mutating methods; bootstrap flows (login/signup/invite accept/redeem/
password reset/verify-email/OAuth/logout) exempt. `larry_csrf` cookie mirrors
the token for client JS. A `window.fetch` patch installed at root-layout
module load injects the header on same-origin `/api/**` mutations, so existing
call sites migrate without change. Token rotates on every `persistSession`.

**✅ MFA on `/login`** shipped in `feat/mfa-login-enforcement`. After password
verification, `/v1/auth/login` checks `tenants.mfa_required_for_admins` for
owners/admins: not enrolled returns `412 { code: "mfa_enrollment_required",
mfaEnrolmentToken, enrolmentUrl: "/workspace/settings/mfa" }`; enrolled
returns `200 { code: "mfa_required", mfaPendingToken }` WITHOUT access/
refresh tokens. Second-step at `POST /v1/auth/mfa/verify` swaps
`{ mfaPendingToken, code }` for real tokens. TOTP via `otpauth`
(SHA1/30s/6), scratch codes hashed SHA-256 with single-use guaranteed
by `UPDATE … WHERE used_at IS NULL`. New migration 027 adds
`user_mfa_secrets` + `user_mfa_scratch_codes`. Rate-limit on verify is
10/15m per user_id (not IP), so shared-office networks don't lock each
other out. `DELETE /v1/auth/mfa` is a self-service "lost my phone" path.
Admin toggle for `mfa_required_for_admins` reuses the existing
`PATCH /v1/orgs/:id` endpoint.

### P2 — backlog

**✅ Shipped in `fix/auth-p2-polish` (PR #129):**
- Email trim+normalise ordering: `emailSchema` now `.transform(trim+lower).pipe(.email())` so pasted addresses with stray whitespace validate correctly instead of silently failing.
- Refresh-token reuse detection: `/v1/auth/refresh` now, when a revoked token is replayed, revokes every active refresh token for `(user_id, tenant_id)`, writes an `auth.refresh_reuse_detected` audit log, and emails the user. Stolen-token replay can no longer keep a quiet parallel branch alive.
- Session rotation on re-login: `/v1/auth/login` now revokes every prior active refresh token for `(user_id, tenant_id)` before issuing the new one. Stale sessions on forgotten devices no longer linger.

**✅ Shipped in `fix/password-breach-check`:**
- Password breach check (HIBP k-anonymous): new `apps/api/src/lib/password-breach.ts` with `assertPasswordNotBreached` wired into signup, password reset, change-password, invitation accept, and invite-link redeem. SHA-1 the password locally, send the first 5 hex chars to HIBP's Range API, reject anything in the returned list. Fails open on HIBP downtime (signup shouldn't break because an external service is flaky). 1h in-memory prefix cache. New `PasswordBreachedError` mapped to a 400 "Password Compromised" response by the global error handler.

**Device fingerprint.** `auth.ts:321-322` does exact `(ip, user_agent)` match
for known-device detection. Mobile clients rotate UA on each OS update and
change IP on every Wi-Fi handoff, producing constant "new device" emails.
Replace with a persistent `device_id` cookie + loose fingerprint.

### P3 — nice to have

- `HSTS` / `Strict-Transport-Security` header from the web layer (Vercel
  already sets it, confirm for completeness).
- `X-Frame-Options: DENY` on the auth pages to block clickjacking.
- Move `SESSION_COOKIE` name to `__Host-larry_session` once `path=/` +
  `secure` are guaranteed — unlocks extra browser-level isolation.
- Add `/v1/auth/sessions` endpoint for users to view + revoke active devices.
- Rotate JWT signing secret on a schedule, not just on compromise.

## Out of scope for this pass
- OAuth / Google SSO flow (`auth-google.ts`) — reviewed surface-level, no red
  flags but deserves its own audit.
- Workspace-level SSO (SAML/OIDC) — not yet implemented.
- Session storage backend (currently stateless JWT cookie) — consider
  moving refresh-token-id into the cookie for instant revocation.

## Testing posture

553/553 API tests green after the shipped fixes. `src/lib/validation.test.ts`
added to lock in the tightened password policy so a future relaxation requires
an explicit decision. Recommend extending `tests/auth-tenants-switch.test.ts`
with a login-path test for case-insensitive email lookup when #PR merges.
