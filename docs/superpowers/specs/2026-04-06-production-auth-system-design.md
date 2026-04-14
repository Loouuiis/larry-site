# Production Auth System Design

**Date:** 2026-04-06
**Status:** Draft
**Approach:** Vertical slices on existing custom JWT auth system

---

## Summary

Upgrade Larry's authentication system from its current MVP state to production-ready. Six vertical slices, each end-to-end (DB -> API -> frontend), shipped in order. No external auth provider migration — we build on the existing custom JWT + bcrypt + RLS foundation.

### Decisions Made

- **Keep custom auth** — no migration to Clerk/Auth0/Supabase Auth
- **Google OAuth only** at launch (architecture supports adding more providers later)
- **No MFA at launch** — Phase 2, but architecture is designed to slot it in
- **Soft email verification** — 7-day grace period, persistent banner, restricted actions
- **Forgot password via email link** — 1-hour TTL, one-time use, SHA-256 hashed tokens
- **Compile-time removal** for dev-login route; **full deletion** of Turso legacy code
- **Vertical slice ordering:** Security cleanup -> Forgot password -> Email verification -> Google OAuth -> Account settings -> Hardening

---

## Slice 1: Security Cleanup

### Turso Removal

- Delete `apps/web/src/lib/db.ts` (Turso HTTP client)
- Remove `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` from all `.env.example` files
- Remove `@libsql/client` dependency from `apps/web/package.json`
- Strip "legacy mode" branches from auth routes (`login`, `signup`, `me`) — all auth goes through the API gateway exclusively
- Verify no other code imports from `db.ts` before deletion

### Dev-Login Compile-Time Guard

- Wrap `apps/web/src/app/api/auth/dev-login/route.ts` exports in `process.env.NODE_ENV !== 'production'` check so Next.js tree-shakes it from production builds
- Remove `NEXT_PUBLIC_SHOW_DEV_LOGIN` from production environment config
- The route physically exists in source but is dead code in production bundles

### Server-Side Password Strength Enforcement

- Shared Zod schema in `apps/api/src/lib/validation.ts` (imported by all auth routes):
  - Minimum 8 characters
  - At least 1 uppercase letter
  - At least 1 number
  - At least 1 special character (`!@#$%^&*` etc.)
- Enforced on: signup, reset-password, change-password API routes
- Frontend strength meter remains as visual guidance; server is the authority
- Returns specific validation errors (e.g., "Password must contain at least one uppercase letter")

### Security Headers

Add to `next.config.js` headers configuration:

```
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://accounts.google.com https://*.larry.app; frame-ancestors 'none'
```

---

## Slice 2: Forgot Password

### Database

New migration: `014_password_reset_tokens.sql`

```sql
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_password_reset_tokens_hash ON password_reset_tokens(token_hash);
CREATE INDEX idx_password_reset_tokens_user ON password_reset_tokens(user_id);
```

No RLS — table is accessed by the API service role only, not tenant-scoped.

### API Endpoints

**`POST /v1/auth/forgot-password`**
- Input: `{ email: string }`
- Always returns `200 { message: "If that email exists, we've sent a reset link." }` (prevents enumeration)
- If user exists:
  - Invalidate any existing unused reset tokens for this user
  - Generate 48-byte random token (base64url)
  - Store SHA-256 hash in `password_reset_tokens` with `expires_at = NOW() + 1 hour`
  - Send reset email via Resend
- Rate limit: 3 requests per email per hour
- Audit log: `password_reset_requested` event

**`POST /v1/auth/reset-password`**
- Input: `{ token: string, newPassword: string }`
- Validates:
  - Token hash exists in DB
  - Not expired (`expires_at > NOW()`)
  - Not already used (`used_at IS NULL`)
  - New password passes strength schema
- On success:
  - Update `users.password_hash` with bcrypt hash of new password
  - Set `used_at = NOW()` on the token
  - Revoke ALL refresh tokens for this user (forces re-login on all devices)
  - Return `200 { message: "Password reset successfully." }`
- Audit log: `password_reset_completed` event

### Email Template

- From: `Larry <noreply@larry-pm.com>` (updated 2026-04-14 — see `2026-04-14-resend-email-integration-design.md`)
- Subject: "Reset your Larry password"
- Body: Branded Larry email with single CTA button linking to `{FRONTEND_URL}/reset-password?token={rawToken}`
- Plain text fallback included
- Footer: "If you didn't request this, you can safely ignore this email."

### Frontend

**`/forgot-password` page:**
- Email input field
- "Send reset link" button with loading state
- On success: message "If that email exists, we've sent a reset link. Check your inbox."
- Link from login page: "Forgot your password?" below the login button

**`/reset-password` page:**
- Reads `?token=` from URL params
- New password + confirm password fields with strength meter
- "Reset password" button
- On success: redirect to `/login` with flash message "Password reset successfully. Please sign in."
- On invalid/expired token: error message with "Request a new reset link" link to `/forgot-password`

---

## Slice 3: Email Verification

### Database

New migration: `015_email_verification.sql`

```sql
ALTER TABLE users
  ADD COLUMN email_verified_at TIMESTAMPTZ,
  ADD COLUMN verification_grace_deadline TIMESTAMPTZ;

-- Backfill: mark all existing users as verified (they pre-date this feature)
UPDATE users SET email_verified_at = created_at WHERE email_verified_at IS NULL;

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_email_verification_tokens_hash ON email_verification_tokens(token_hash);
CREATE INDEX idx_email_verification_tokens_user ON email_verification_tokens(user_id);
```

### Signup Flow Change

When `POST /v1/auth/signup` creates a new user:
- Set `email_verified_at = NULL`
- Set `verification_grace_deadline = NOW() + 7 days`
- Automatically generate and send a verification email (no extra user action)

### API Endpoints

**`POST /v1/auth/send-verification`**
- Requires authentication
- Invalidates any existing unused verification token for this user
- Generates new token (48-byte, base64url), stores SHA-256 hash, `expires_at = NOW() + 24 hours`
- Sends verification email via Resend
- Rate limit: 3 per hour per user
- Returns `200 { message: "Verification email sent." }`

**`POST /v1/auth/verify-email`**
- Input: `{ token: string }`
- Does NOT require authentication (user may click link on a different device)
- Validates token hash, not expired, not used
- Sets `users.email_verified_at = NOW()`, marks token used
- Returns `200 { message: "Email verified." }`
- Audit log: `email_verified` event

### Grace Period Enforcement

Checked in the web middleware (`middleware.ts`) and/or workspace layout:

| State | Behavior |
|-------|----------|
| `email_verified_at` is set | Full access, no banner |
| `email_verified_at` is null, within grace period | Persistent banner: "Please verify your email. [Resend]". Non-blocking. |
| `email_verified_at` is null, past grace deadline | Redirect to `/verify-email-required` locked screen with Resend button |

**Restricted actions while unverified (even within grace period):**
- Cannot invite team members
- Cannot change email address
- Everything else works normally

### Email Template

- From: `Larry <noreply@larry-pm.com>` (updated 2026-04-14 — see `2026-04-14-resend-email-integration-design.md`)
- Subject: "Verify your email for Larry"
- Body: Branded Larry email with CTA button to `{FRONTEND_URL}/verify-email?token={rawToken}`
- Footer: "If you didn't create a Larry account, ignore this email."

### Frontend

**`/verify-email` page:**
- Reads `?token=` from URL, calls API automatically on mount
- Success: "Email verified! Redirecting to your workspace..."
- Error: "This link is invalid or expired." with "Resend verification email" button

**`VerificationBanner` component:**
- Persistent banner in workspace layout shell
- Dismissible per session (reappears next session if still unverified)
- "Verify your email to unlock all features. [Resend verification email]"

**`/verify-email-required` page:**
- Shown after grace period expires
- "Your email hasn't been verified. Please check your inbox or resend the verification email."
- "Resend" button + "Log out" link

---

## Slice 4: Google OAuth Sign-In

### Strategy

Reuse existing `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` from the calendar/Gmail connector configuration. Add `openid`, `email`, `profile` scopes for authentication.

### Database

New migration: `016_user_oauth_accounts.sql`

```sql
CREATE TABLE IF NOT EXISTS user_oauth_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_user_id)
);

CREATE INDEX idx_user_oauth_provider ON user_oauth_accounts(provider, provider_user_id);
CREATE INDEX idx_user_oauth_user ON user_oauth_accounts(user_id);

-- Allow password-less accounts (OAuth-only users)
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
```

### API Endpoints

**`GET /v1/auth/google`**
- Generates OAuth state JWT (nonce + redirect info, signed, 10-min TTL) — same pattern as calendar connector
- Redirects to Google consent screen with scopes: `openid email profile`
- Redirect URI: `{API_URL}/v1/auth/google/callback`

**`GET /v1/auth/google/callback`**
- Validates state JWT, exchanges authorization code for tokens
- Extracts `email`, `sub` (Google user ID), `name`, `picture` from ID token
- Two paths:
  - **Existing user (email match or `provider_user_id` match):** Links Google account if not already linked, issues access + refresh tokens
  - **New user:** Creates `users` row with `password_hash = NULL`, `email_verified_at = NOW()` (Google verified it), creates `user_oauth_accounts` row, creates default membership
- **Redirect flow:** API callback redirects to `{FRONTEND_URL}/api/auth/google/complete?code={one-time-code}`. The web app's BFF route (`/api/auth/google/complete`) exchanges the one-time code with the API for the access + refresh tokens, creates the `larry_session` cookie, and redirects to the workspace (existing users) or condensed onboarding wizard at step 4 (new users). This keeps session cookie creation on the same domain as the frontend.
- Error handling: redirect to `/login?error=oauth_failed` with user-friendly message

**`POST /v1/auth/google/link`** (authenticated)
- Links Google account to the currently authenticated user
- Validates the Google ID token, creates `user_oauth_accounts` row
- Prevents linking if the Google account is already linked to a different user

**`POST /v1/auth/google/unlink`** (authenticated)
- Removes the Google link for the current user
- Blocked if user has no password set (would lock them out)

### Frontend

- **Login page:** Add "Sign in with Google" button above the email/password form, with a divider "or"
- **Signup wizard:** Replace disabled "coming soon" button with working Google sign-in. Clicking it starts the OAuth flow; on return, user lands in the condensed onboarding wizard (steps 4-8: role, work type, referral, tools, completion)
- **Account settings:** "Connected accounts" section showing linked Google account with email, avatar, and "Unlink" button (disabled if no password is set, with tooltip: "Set a password first")

### Security

- State parameter uses signed JWT with nonce for CSRF protection
- ID token signature verified against Google's public keys
- `provider_user_id` is the authoritative link, not email (emails can change)

---

## Slice 5: Account Settings

### Change Password

**`POST /v1/auth/change-password`** (authenticated)
- Input: `{ currentPassword?: string, newPassword: string }`
- If user has a password: requires `currentPassword`, verifies it
- If user is OAuth-only (no password): `currentPassword` not required — this is "Set a password"
- Enforces password strength schema
- Updates `users.password_hash`
- Revokes all refresh tokens except the current one
- Audit log: `password_changed` event

### Change Email

**`POST /v1/auth/change-email`** (authenticated, requires verified email)
- Input: `{ newEmail: string, password?: string }`
- If user has a password: requires `password` for confirmation
- If user is OAuth-only: requires re-authentication via Google OAuth instead (redirect flow, returns to change-email with a confirmation token)
- Validates new email format, checks not already in use
- Creates `email_change_requests` row:
  - `id` UUID PK
  - `user_id` UUID FK
  - `new_email` TEXT
  - `token_hash` TEXT
  - `expires_at` TIMESTAMPTZ (1 hour)
  - `confirmed_at` TIMESTAMPTZ
  - `created_at` TIMESTAMPTZ
- Sends confirmation email to the NEW address
- Sends notification email to the OLD address: "Your email is being changed. If this wasn't you, contact support."

**`POST /v1/auth/confirm-email-change`**
- Input: `{ token: string }`
- Validates token, updates `users.email`, sets `email_verified_at = NOW()`, marks request confirmed
- Audit log: `email_changed` event

### Active Sessions

**Database change:** Add columns to `refresh_tokens`:
```sql
ALTER TABLE refresh_tokens
  ADD COLUMN ip_address TEXT,
  ADD COLUMN user_agent TEXT;
```
Populated at token creation time.

**`GET /v1/auth/sessions`** (authenticated)
- Returns list of active (non-revoked, non-expired) refresh tokens for the current user
- Each entry: `id`, `created_at`, `ip_address`, `user_agent`, `is_current` (boolean)
- User agent parsed into human-readable format (browser + OS) on the frontend

**`DELETE /v1/auth/sessions/:id`** (authenticated)
- Revokes a specific refresh token (sets `revoked_at = NOW()`)
- Cannot revoke the current session's token

**`DELETE /v1/auth/sessions`** (authenticated)
- Revokes all refresh tokens for the user EXCEPT the current one
- "Log out everywhere else"

### Frontend

New `/settings/account` page with three sections:

1. **Password:** Current password + new password form, or "Set a password" for OAuth-only users
2. **Email:** Shows current email, "Change email" button opens inline form (new email + password confirmation)
3. **Sessions:** Table of active sessions with device info, IP, date, "Revoke" button per row, "Log out all other sessions" button at bottom. Current session highlighted.

---

## Slice 6: Hardening

### CSRF Protection (Double-Submit Cookie Pattern)

- On session creation, generate a random CSRF token and store it in the session JWT
- Also set a separate non-httpOnly cookie `larry_csrf` with the same value (readable by JavaScript)
- Frontend reads the CSRF token from the `larry_csrf` cookie and sends it as `X-CSRF-Token` header on all POST/PUT/DELETE requests
- API middleware validates: `X-CSRF-Token` header must match the CSRF value in the session JWT
- Not required for bearer-token API calls (already CSRF-safe by nature)
- No extra endpoint needed — the cookie is set alongside the session cookie

### Per-Account Lockout

New table or use existing infrastructure:

```sql
CREATE TABLE IF NOT EXISTS login_attempts (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ
);
```

- After 10 failed password attempts (across all IPs), lock the account for 30 minutes
- Successful login resets `attempt_count` to 0
- Works alongside the existing IP-based rate limit (defense in depth)
- Locked accounts receive a specific error: "Account temporarily locked. Try again in {minutes} minutes, or reset your password."
- Audit log: `account_locked` event

### Suspicious Login Notifications

On successful login:
- Compare IP address and user agent against the user's recent sessions (last 30 days)
- If it's a new IP + user agent combination, send email:
  - Subject: "New sign-in to your Larry account"
  - Body: "We noticed a sign-in from {browser} on {OS}. If this was you, no action needed. If not, change your password immediately."
- Device info extracted from user agent string (no external IP geolocation service to keep it simple — just browser + OS)

---

## Migration Summary

| Migration | Tables/Changes |
|-----------|---------------|
| `014_password_reset_tokens.sql` | New `password_reset_tokens` table |
| `015_email_verification.sql` | `users` + 2 columns, backfill existing, new `email_verification_tokens` table |
| `016_user_oauth_accounts.sql` | New `user_oauth_accounts` table, `users.password_hash` nullable |
| `017_account_settings.sql` | New `email_change_requests` table, `refresh_tokens` + 2 columns |
| `018_login_attempts.sql` | New `login_attempts` table |

---

## New API Endpoints Summary

| Method | Path | Auth | Slice |
|--------|------|------|-------|
| POST | `/v1/auth/forgot-password` | No | 2 |
| POST | `/v1/auth/reset-password` | No | 2 |
| POST | `/v1/auth/send-verification` | Yes | 3 |
| POST | `/v1/auth/verify-email` | No | 3 |
| GET | `/v1/auth/google` | No | 4 |
| GET | `/v1/auth/google/callback` | No | 4 |
| POST | `/v1/auth/google/link` | Yes | 4 |
| POST | `/v1/auth/google/unlink` | Yes | 4 |
| POST | `/v1/auth/change-password` | Yes | 5 |
| POST | `/v1/auth/change-email` | Yes | 5 |
| POST | `/v1/auth/confirm-email-change` | No | 5 |
| GET | `/v1/auth/sessions` | Yes | 5 |
| DELETE | `/v1/auth/sessions/:id` | Yes | 5 |
| DELETE | `/v1/auth/sessions` | Yes | 5 |
| GET | `/api/auth/google/complete` | No (web BFF) | 4 |

---

## New Frontend Pages Summary

| Route | Slice |
|-------|-------|
| `/forgot-password` | 2 |
| `/reset-password` | 2 |
| `/verify-email` | 3 |
| `/verify-email-required` | 3 |
| `/settings/account` | 5 |

---

## New Components Summary

| Component | Location | Slice |
|-----------|----------|-------|
| `VerificationBanner` | Workspace layout shell | 3 |
| Google sign-in button | Login page, Signup wizard | 4 |
| Password change form | Settings page | 5 |
| Email change form | Settings page | 5 |
| Sessions table | Settings page | 5 |

---

## Email Templates Summary

| Email | Trigger | Slice |
|-------|---------|-------|
| Password reset link | Forgot password request | 2 |
| Email verification link | Signup, manual resend | 3 |
| Email change confirmation | Change email request (sent to NEW address) | 5 |
| Email change notification | Change email request (sent to OLD address) | 5 |
| New device sign-in alert | Login from unrecognized device | 6 |

---

## Out of Scope (Phase 2)

- MFA/2FA (TOTP, SMS, email OTP)
- Microsoft/GitHub OAuth providers
- Passwordless magic link login
- Account deletion (GDPR)
- Login activity log visible to users
- CAPTCHA after failed attempts
