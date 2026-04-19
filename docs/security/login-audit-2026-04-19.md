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

**MFA on `/login`.** `assertMfaIfRequired` exists but is only called from
invite creation (`routes/v1/invitations.ts`). The Tenants table has a
`mfa_required_for_admins` flag (`schema.sql:1593-1594`) that today does
nothing at login. Should gate successful password verification on MFA enrol
status for admins in mfa-required tenants. Effort: 1 day including TOTP
enrolment UI.

### P2 — backlog

**Device fingerprint.** `auth.ts:321-322` does exact `(ip, user_agent)` match
for known-device detection. Mobile clients rotate UA on each OS update and
change IP on every Wi-Fi handoff, producing constant "new device" emails.
Replace with a persistent `device_id` cookie + loose fingerprint.

**Password breach check.** NIST SP 800-63B recommends comparing new passwords
against HaveIBeenPwned's k-anonymous breach API. Currently any policy-passing
password is accepted even if it's in the top-10k breached list.

**Email trim pre-validation.** `emailSchema` runs `.email()` before
`.transform()` so leading/trailing whitespace in pasted addresses fails
validation. Reorder with a pre-transform pass (`.string().transform(trim).pipe(z.string().email())`).

**Refresh token reuse detection.** If an already-revoked refresh token is
presented, we return 401 but don't revoke the whole session family. An
attacker who steals a refresh token and races the legitimate owner can keep
one branch alive. Industry standard: revoke all sibling tokens when a
revoked one is reused.

**Session rotation on login.** Existing active sessions aren't invalidated
when the user logs in again. Low impact since refresh rotation covers this
on every /refresh cycle, but best practice is to kill the prior family.

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
