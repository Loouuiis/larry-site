# Production Auth System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade Larry's auth from MVP to production-ready with forgot-password, email verification, Google OAuth, account settings, and security hardening.

**Architecture:** Six vertical slices, each end-to-end (DB migration -> Fastify API -> Next.js BFF -> React frontend). Each slice is independently testable and deployable. We build on the existing custom JWT + bcrypt + RLS foundation — no external auth provider.

**Tech Stack:** Fastify + `@fastify/jwt` (API), Next.js 14 App Router (web), PostgreSQL + RLS (DB), Resend (email), `jose` + `bcryptjs` (web crypto), Zod (validation)

**Spec:** `docs/superpowers/specs/2026-04-06-production-auth-system-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `packages/db/src/migrations/014_password_reset_tokens.sql` | Reset tokens table |
| `packages/db/src/migrations/015_email_verification.sql` | Verification columns + tokens table |
| `packages/db/src/migrations/016_user_oauth_accounts.sql` | OAuth accounts table, nullable password_hash |
| `packages/db/src/migrations/017_account_settings.sql` | Email change requests, refresh_tokens IP/UA columns |
| `packages/db/src/migrations/018_login_attempts.sql` | Per-account lockout table |
| `apps/api/src/lib/validation.ts` | Shared password strength Zod schema |
| `apps/api/src/lib/email.ts` | Resend email sending utility |
| `apps/api/src/routes/v1/auth-password-reset.ts` | Forgot/reset password API routes |
| `apps/api/src/routes/v1/auth-verification.ts` | Email verification API routes |
| `apps/api/src/routes/v1/auth-google.ts` | Google OAuth API routes |
| `apps/api/src/routes/v1/auth-account.ts` | Change password, change email, sessions API routes |
| `apps/web/src/app/(auth)/forgot-password/page.tsx` | Forgot password page |
| `apps/web/src/app/(auth)/reset-password/page.tsx` | Reset password page |
| `apps/web/src/app/(auth)/verify-email/page.tsx` | Email verification page |
| `apps/web/src/app/(auth)/verify-email-required/page.tsx` | Locked screen post-grace-period |
| `apps/web/src/app/api/auth/google/complete/route.ts` | Google OAuth BFF callback |
| `apps/web/src/app/api/auth/google/route.ts` | Redirect proxy to API OAuth initiation |
| `apps/web/src/app/api/auth/forgot-password/route.ts` | BFF proxy for forgot-password |
| `apps/web/src/app/api/auth/reset-password/route.ts` | BFF proxy for reset-password |
| `apps/web/src/app/api/auth/verify-email/route.ts` | BFF proxy for verify-email |
| `apps/web/src/app/api/auth/send-verification/route.ts` | BFF proxy for send-verification |
| `apps/web/src/app/api/auth/change-password/route.ts` | BFF proxy for change-password |
| `apps/web/src/app/api/auth/change-email/route.ts` | BFF proxy for change-email |
| `apps/web/src/app/api/auth/confirm-email-change/route.ts` | BFF proxy for confirm-email-change |
| `apps/web/src/app/api/auth/sessions/route.ts` | BFF proxy for sessions CRUD |
| `apps/web/src/app/(auth)/confirm-email-change/page.tsx` | Confirm email change page (from email link) |
| `apps/web/src/components/auth/VerificationBanner.tsx` | Persistent verification banner |
| `apps/web/src/components/auth/GoogleSignInButton.tsx` | Reusable Google sign-in button |
| `apps/web/src/components/auth/PasswordInput.tsx` | Password input with strength meter |
| `apps/web/src/app/workspace/settings/account/page.tsx` | Account settings page |

### Modified Files

| File | Changes |
|------|---------|
| `apps/web/src/app/api/auth/login/route.ts` | Remove Turso legacy branch |
| `apps/web/src/app/api/auth/signup/route.ts` | Remove Turso, route to API |
| `apps/web/src/app/api/auth/me/route.ts` | Remove Turso legacy branch |
| `apps/web/src/app/api/auth/dev-login/route.ts` | Add compile-time production guard |
| `apps/web/src/lib/auth.ts` | Remove `hashPassword`/`verifyPassword` (no longer needed on web), add `emailVerifiedAt` to session |
| `apps/web/next.config.ts` | Add HSTS, CSP, Permissions-Policy headers |
| `apps/web/src/middleware.ts` | Add email verification grace period check |
| `apps/web/src/app/(auth)/login/page.tsx` | Add forgot-password link, Google sign-in button |
| `apps/web/src/app/(auth)/signup/SignupWizard.tsx` | Enable Google sign-in button |
| `apps/web/src/app/workspace/layout.tsx` | Pass verification state to shell |
| `apps/web/src/app/workspace/WorkspaceShell.tsx` | Render VerificationBanner |
| `apps/api/src/routes/v1/auth.ts` | Register new auth sub-route plugins, update login to track IP/UA |
| `apps/api/src/lib/auth.ts` | Add `generateSecureToken()` utility |
| `apps/api/src/plugins/security.ts` | No changes needed (existing JWT verification works) |
| `apps/web/.env.example` | Add `GOOGLE_AUTH_REDIRECT_URI` |
| `apps/api/.env.example` | Add `RESEND_API_KEY`, `FRONTEND_URL`, `GOOGLE_AUTH_REDIRECT_URI` |

---

## Slice 1: Security Cleanup

### Task 1: Strip Turso from auth routes

**Files:**
- Modify: `apps/web/src/app/api/auth/login/route.ts`
- Modify: `apps/web/src/app/api/auth/signup/route.ts`
- Modify: `apps/web/src/app/api/auth/me/route.ts`
- Modify: `apps/web/src/lib/auth.ts`

> **Note:** `apps/web/src/lib/db.ts` is NOT deleted — it's still used by 6 non-auth routes (waitlist, admin, health, referral, founder-contact, admin/migrate). Turso removal is auth-only.

- [ ] **Step 1: Rewrite login route — remove Turso branch**

Replace `apps/web/src/app/api/auth/login/route.ts` entirely. Remove `getDb` import, `hasTursoConfig()`, and the entire legacy Turso branch. Only the API gateway path remains:

```typescript
import { NextRequest, NextResponse } from "next/server";
import {
  createSessionToken,
  normalizeEmail,
  sessionCookieOptions,
} from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

const GENERIC_ERROR = "Invalid email or password.";

interface ApiLoginResponse {
  accessToken: string;
  refreshToken?: string;
  user: {
    id: string;
    email: string;
    tenantId: string;
    role: string;
  };
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  try {
    const { limited } = await checkRateLimit(ip);
    if (limited) {
      return NextResponse.json(
        { error: "Too many attempts. Please wait 15 minutes and try again." },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { email: rawEmail, password } = body ?? {};
    const tenantId =
      typeof body?.tenantId === "string" && body.tenantId.length > 0
        ? body.tenantId
        : process.env.LARRY_API_TENANT_ID;

    if (!rawEmail || !password) {
      return NextResponse.json({ error: "All fields are required." }, { status: 400 });
    }

    const email = normalizeEmail(String(rawEmail));
    const apiBaseUrl = process.env.LARRY_API_BASE_URL;

    if (!apiBaseUrl) {
      return NextResponse.json(
        { error: "Login is not configured. Set LARRY_API_BASE_URL." },
        { status: 503 }
      );
    }

    if (!tenantId) {
      return NextResponse.json(
        { error: "Missing tenant ID. Set LARRY_API_TENANT_ID in web env." },
        { status: 400 }
      );
    }

    let apiResponse: Response;
    try {
      apiResponse = await fetch(`${apiBaseUrl.replace(/\/+$/, "")}/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, email, password: String(password) }),
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
      });
    } catch {
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
    }

    if (!apiResponse.ok) {
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
    }

    const payload = (await apiResponse.json()) as ApiLoginResponse;
    if (!payload?.user?.id || !payload?.accessToken) {
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
    }

    const token = await createSessionToken({
      userId: payload.user.id,
      email: payload.user.email,
      tenantId: payload.user.tenantId,
      role: payload.user.role,
      apiAccessToken: payload.accessToken,
      apiRefreshToken: payload.refreshToken,
      authMode: "api",
    });
    const res = NextResponse.json({ success: true });
    res.cookies.set(sessionCookieOptions(token));
    return res;
  } catch (err) {
    console.error("[login]", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Rewrite signup route — remove Turso, route to API**

Replace `apps/web/src/app/api/auth/signup/route.ts`. The web signup now proxies to the API backend. Since the API doesn't have a public signup route yet (it uses admin org approval), we add a `POST /v1/auth/signup` route to the API in a later task. For now, this route returns 503 if no API is configured:

```typescript
import { NextRequest, NextResponse } from "next/server";
import {
  createSessionToken,
  normalizeEmail,
  sessionCookieOptions,
} from "@/lib/auth";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email: rawEmail, password, confirmPassword, fullName } = body ?? {};

    if (!rawEmail || !password || !confirmPassword) {
      return NextResponse.json({ error: "All fields are required." }, { status: 400 });
    }

    if (typeof password !== "string" || password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    if (password !== confirmPassword) {
      return NextResponse.json({ error: "Passwords do not match." }, { status: 400 });
    }

    const email = normalizeEmail(String(rawEmail));
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
    }

    const apiBaseUrl = process.env.LARRY_API_BASE_URL;
    const tenantId = process.env.LARRY_API_TENANT_ID;

    if (!apiBaseUrl || !tenantId) {
      return NextResponse.json(
        { error: "Signup is not configured." },
        { status: 503 }
      );
    }

    const apiRes = await fetch(`${apiBaseUrl.replace(/\/+$/, "")}/v1/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, fullName, tenantId }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });

    if (!apiRes.ok) {
      const err = await apiRes.json().catch(() => ({}));
      const message = (err as { error?: string }).error ?? "Signup failed. Please try again.";
      return NextResponse.json({ error: message }, { status: apiRes.status });
    }

    const payload = await apiRes.json() as {
      accessToken: string;
      refreshToken?: string;
      user: { id: string; email: string; tenantId: string; role: string };
    };

    const token = await createSessionToken({
      userId: payload.user.id,
      email: payload.user.email,
      tenantId: payload.user.tenantId,
      role: payload.user.role,
      apiAccessToken: payload.accessToken,
      apiRefreshToken: payload.refreshToken,
      authMode: "api",
    });

    const res = NextResponse.json({ success: true }, { status: 201 });
    res.cookies.set(sessionCookieOptions(token));
    return res;
  } catch (err) {
    console.error("[signup]", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 3: Rewrite me route — remove Turso branch**

Replace `apps/web/src/app/api/auth/me/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      id: session.userId,
      email: session.email ?? null,
      tenantId: session.tenantId ?? null,
      role: session.role ?? null,
      authMode: session.authMode ?? "unknown",
    },
  });
}
```

- [ ] **Step 4: Remove bcrypt from web auth.ts**

In `apps/web/src/lib/auth.ts`, remove the `bcrypt` import and `hashPassword`/`verifyPassword` functions — these are no longer used since the web app no longer does password verification directly. Keep everything else.

Remove these lines:
```typescript
import bcrypt from "bcryptjs";
const SALT_ROUNDS = 12;
// ... and the hashPassword + verifyPassword functions
```

- [ ] **Step 5: Remove recordLoginAttempt import from login route**

In the new login route (Step 1), we already removed the `recordLoginAttempt` import. Verify `apps/web/src/lib/rate-limit.ts` — the `recordLoginAttempt` export can stay as a no-op since it may be imported elsewhere, or remove if unused.

- [ ] **Step 6: Build and verify**

Run: `cd apps/web && npm run build`
Expected: Build succeeds with no import errors for `getDb` in auth routes.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/api/auth/login/route.ts apps/web/src/app/api/auth/signup/route.ts apps/web/src/app/api/auth/me/route.ts apps/web/src/lib/auth.ts
git commit -m "refactor(auth): strip Turso legacy branches from auth routes

All auth now routes exclusively through the API gateway.
Non-auth routes (waitlist, admin, referral) retain Turso access."
```

---

### Task 2: Compile-time guard for dev-login

**Files:**
- Modify: `apps/web/src/app/api/auth/dev-login/route.ts`

- [ ] **Step 1: Add production guard**

Replace the entire file:

```typescript
import { NextResponse } from "next/server";
import { createSessionToken, sessionCookieOptions, AppSession } from "@/lib/auth";

// Compile-time guard: Next.js tree-shakes this entire route in production builds.
// The route physically exists in source but is dead code in production bundles.
if (process.env.NODE_ENV === "production") {
  // Export a no-op handler that always returns 404 in production.
  // This branch is eliminated by dead-code elimination in prod builds.
  module.exports = {
    POST: () => NextResponse.json({ error: "Not found" }, { status: 404 }),
  };
}

const allowed = process.env.ALLOW_DEV_AUTH_BYPASS === "true";

async function tryApiLogin(): Promise<AppSession | null> {
  const baseUrl = process.env.LARRY_API_BASE_URL?.replace(/\/+$/, "");
  const tenantId = process.env.LARRY_API_TENANT_ID;
  const email = process.env.LARRY_API_EMAIL;
  const password = process.env.LARRY_API_PASSWORD;

  if (!baseUrl || !tenantId || !email || !password) return null;

  try {
    const res = await fetch(`${baseUrl}/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId, email, password }),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;

    const payload = await res.json() as {
      accessToken: string;
      refreshToken?: string;
      user: { id: string; email: string; tenantId: string; role: string };
    };
    if (!payload?.accessToken || !payload?.user?.id) return null;

    return {
      userId: payload.user.id,
      email: payload.user.email,
      tenantId: payload.user.tenantId,
      role: payload.user.role,
      apiAccessToken: payload.accessToken,
      apiRefreshToken: payload.refreshToken,
      authMode: "api",
    };
  } catch {
    return null;
  }
}

export async function POST() {
  if (process.env.NODE_ENV === "production" || !allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const apiSession = await tryApiLogin();

  const session: AppSession = apiSession ?? {
    userId: process.env.DEV_BYPASS_USER_ID || "00000000-0000-4000-8000-000000000001",
    tenantId: process.env.LARRY_API_TENANT_ID,
    authMode: "dev",
  };

  const token = await createSessionToken(session);
  const response = NextResponse.json({ success: true, userId: session.userId });
  response.cookies.set(sessionCookieOptions(token));
  return response;
}
```

- [ ] **Step 2: Build and verify**

Run: `cd apps/web && npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/auth/dev-login/route.ts
git commit -m "security: add compile-time production guard to dev-login route"
```

---

### Task 3: Server-side password strength enforcement

**Files:**
- Create: `apps/api/src/lib/validation.ts`
- Modify: `apps/api/src/routes/v1/auth.ts` (login schema uses it)

- [ ] **Step 1: Create shared password validation schema**

Create `apps/api/src/lib/validation.ts`:

```typescript
import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(/[^a-zA-Z0-9]/, "Password must contain at least one special character");

export const emailSchema = z
  .string()
  .email("Invalid email address")
  .transform((v) => v.trim().toLowerCase());
```

- [ ] **Step 2: Update the login schema in auth.ts to use the shared email schema**

In `apps/api/src/routes/v1/auth.ts`, add the import and update the LoginSchema:

```typescript
import { emailSchema } from "../../lib/validation.js";

const LoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(8),
  tenantId: z.string().uuid().optional(),
});
```

Note: Login still uses `min(8)` not `passwordSchema` — we don't want to block existing users with weak passwords from logging in. The strength schema is enforced on signup, reset, and change-password.

- [ ] **Step 3: Build and verify**

Run: `cd apps/api && npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/lib/validation.ts apps/api/src/routes/v1/auth.ts
git commit -m "feat(auth): add shared password strength Zod schema"
```

---

### Task 4: Security headers

**Files:**
- Modify: `apps/web/next.config.ts`

- [ ] **Step 1: Add security headers**

Replace `apps/web/next.config.ts`:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // 'unsafe-inline' needed for style-src due to inline styles used throughout the app.
              // script-src: 'unsafe-eval' only in dev (Next.js hot reload). Production uses 'self' only.
              process.env.NODE_ENV === "production"
                ? "script-src 'self'"
                : "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https:",
              "connect-src 'self' https://accounts.google.com https://*.larry.app",
              "font-src 'self' data:",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
```

Note: `'unsafe-eval'` is needed for Next.js development mode. In production, consider removing it. `'unsafe-inline'` is needed for style-src due to inline styles used throughout the app.

- [ ] **Step 2: Build and verify**

Run: `cd apps/web && npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/web/next.config.ts
git commit -m "security: add HSTS, CSP, and Permissions-Policy headers"
```

---

## Slice 2: Forgot Password

### Task 5: Database migration — password reset tokens

**Files:**
- Create: `packages/db/src/migrations/014_password_reset_tokens.sql`

- [ ] **Step 1: Write the migration**

Create `packages/db/src/migrations/014_password_reset_tokens.sql`:

```sql
-- Password reset tokens for forgot-password flow.
-- Tokens are stored as SHA-256 hashes; raw tokens are never persisted.
-- Not tenant-scoped (accessed by API service role only).

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

- [ ] **Step 2: Commit**

```bash
git add packages/db/src/migrations/014_password_reset_tokens.sql
git commit -m "feat(db): add password_reset_tokens migration"
```

---

### Task 6: Email sending utility

**Files:**
- Create: `apps/api/src/lib/email.ts`

- [ ] **Step 1: Create Resend email utility**

Create `apps/api/src/lib/email.ts`:

```typescript
import { Resend } from "resend";

let resendClient: Resend | null = null;

function getResend(): Resend {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY is not configured");
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

const FROM = "Larry <noreply@larry.app>";

export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string
): Promise<void> {
  const resend = getResend();
  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: "Reset your Larry password",
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px; color: #111;">
        <div style="margin-bottom: 32px;">
          <div style="display:inline-flex; align-items:center; justify-content:center; width:32px; height:32px; background:#6c44f6; border-radius:6px; color:#fff; font-weight:700; font-size:14px;">L</div>
        </div>
        <h1 style="font-size: 22px; font-weight: 700; letter-spacing: -0.03em; margin: 0 0 12px;">Reset your password</h1>
        <p style="font-size: 15px; color: #555; line-height: 1.6; margin: 0 0 28px;">
          We received a request to reset your Larry password. Click the button below to choose a new one. This link expires in 1 hour.
        </p>
        <a href="${resetUrl}" style="display:inline-block; background:#6c44f6; color:#fff; font-size:15px; font-weight:500; padding:12px 28px; border-radius:9999px; text-decoration:none;">
          Reset password
        </a>
        <p style="margin-top: 32px; font-size: 12px; color: #aaa;">
          If you didn't request this, you can safely ignore this email. Your password won't change.
        </p>
      </div>
    `,
  });
  if (error) {
    console.error("[email] Failed to send password reset:", error);
    throw new Error("Failed to send email");
  }
}

export async function sendVerificationEmail(
  to: string,
  verifyUrl: string
): Promise<void> {
  const resend = getResend();
  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: "Verify your email for Larry",
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px; color: #111;">
        <div style="margin-bottom: 32px;">
          <div style="display:inline-flex; align-items:center; justify-content:center; width:32px; height:32px; background:#6c44f6; border-radius:6px; color:#fff; font-weight:700; font-size:14px;">L</div>
        </div>
        <h1 style="font-size: 22px; font-weight: 700; letter-spacing: -0.03em; margin: 0 0 12px;">Verify your email</h1>
        <p style="font-size: 15px; color: #555; line-height: 1.6; margin: 0 0 28px;">
          Thanks for signing up for Larry! Click below to verify your email address. This link expires in 24 hours.
        </p>
        <a href="${verifyUrl}" style="display:inline-block; background:#6c44f6; color:#fff; font-size:15px; font-weight:500; padding:12px 28px; border-radius:9999px; text-decoration:none;">
          Verify email
        </a>
        <p style="margin-top: 32px; font-size: 12px; color: #aaa;">
          If you didn't create a Larry account, ignore this email.
        </p>
      </div>
    `,
  });
  if (error) {
    console.error("[email] Failed to send verification:", error);
    throw new Error("Failed to send email");
  }
}

export async function sendEmailChangeConfirmation(
  to: string,
  confirmUrl: string
): Promise<void> {
  const resend = getResend();
  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: "Confirm your new email for Larry",
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px; color: #111;">
        <div style="margin-bottom: 32px;">
          <div style="display:inline-flex; align-items:center; justify-content:center; width:32px; height:32px; background:#6c44f6; border-radius:6px; color:#fff; font-weight:700; font-size:14px;">L</div>
        </div>
        <h1 style="font-size: 22px; font-weight: 700; letter-spacing: -0.03em; margin: 0 0 12px;">Confirm your new email</h1>
        <p style="font-size: 15px; color: #555; line-height: 1.6; margin: 0 0 28px;">
          Click below to confirm changing your Larry account email to this address. This link expires in 1 hour.
        </p>
        <a href="${confirmUrl}" style="display:inline-block; background:#6c44f6; color:#fff; font-size:15px; font-weight:500; padding:12px 28px; border-radius:9999px; text-decoration:none;">
          Confirm email change
        </a>
        <p style="margin-top: 32px; font-size: 12px; color: #aaa;">
          If you didn't request this change, contact support immediately.
        </p>
      </div>
    `,
  });
  if (error) {
    console.error("[email] Failed to send email change confirmation:", error);
    throw new Error("Failed to send email");
  }
}

export async function sendEmailChangeNotification(
  to: string
): Promise<void> {
  const resend = getResend();
  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: "Your Larry email is being changed",
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px; color: #111;">
        <div style="margin-bottom: 32px;">
          <div style="display:inline-flex; align-items:center; justify-content:center; width:32px; height:32px; background:#6c44f6; border-radius:6px; color:#fff; font-weight:700; font-size:14px;">L</div>
        </div>
        <h1 style="font-size: 22px; font-weight: 700; letter-spacing: -0.03em; margin: 0 0 12px;">Email change requested</h1>
        <p style="font-size: 15px; color: #555; line-height: 1.6; margin: 0 0 28px;">
          Someone has requested to change the email address associated with your Larry account. If this was you, no action is needed.
        </p>
        <p style="font-size: 15px; color: #555; line-height: 1.6; margin: 0 0 28px;">
          <strong>If this wasn't you</strong>, please change your password immediately or contact support.
        </p>
      </div>
    `,
  });
  if (error) {
    console.error("[email] Failed to send email change notification:", error);
    // Non-fatal — notification is best-effort
  }
}

export async function sendNewDeviceAlert(
  to: string,
  deviceInfo: string
): Promise<void> {
  const resend = getResend();
  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: "New sign-in to your Larry account",
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px; color: #111;">
        <div style="margin-bottom: 32px;">
          <div style="display:inline-flex; align-items:center; justify-content:center; width:32px; height:32px; background:#6c44f6; border-radius:6px; color:#fff; font-weight:700; font-size:14px;">L</div>
        </div>
        <h1 style="font-size: 22px; font-weight: 700; letter-spacing: -0.03em; margin: 0 0 12px;">New sign-in detected</h1>
        <p style="font-size: 15px; color: #555; line-height: 1.6; margin: 0 0 28px;">
          We noticed a new sign-in to your Larry account from: <strong>${deviceInfo}</strong>
        </p>
        <p style="font-size: 15px; color: #555; line-height: 1.6; margin: 0 0 28px;">
          If this was you, no action needed. If not, change your password immediately.
        </p>
      </div>
    `,
  });
  if (error) {
    console.error("[email] Failed to send new device alert:", error);
    // Non-fatal — alert is best-effort
  }
}
```

- [ ] **Step 2: Add resend dependency to API if not present**

Run: `cd apps/api && npm ls resend 2>/dev/null || npm install resend`

- [ ] **Step 3: Add env vars to .env.example**

Add to `apps/api/.env.example`:
```
RESEND_API_KEY=
FRONTEND_URL=http://localhost:3000
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/lib/email.ts apps/api/.env.example apps/api/package.json apps/api/package-lock.json
git commit -m "feat(api): add Resend email utility with all auth templates"
```

---

### Task 7: Forgot password + reset password API routes

**Files:**
- Create: `apps/api/src/routes/v1/auth-password-reset.ts`
- Modify: `apps/api/src/lib/auth.ts` (add `generateSecureToken`)
- Modify: `apps/api/src/routes/v1/auth.ts` (register plugin)

- [ ] **Step 1: Add generateSecureToken to auth lib**

In `apps/api/src/lib/auth.ts`, add at the end:

```typescript
/**
 * Generates a cryptographically secure token for password reset, email verification, etc.
 * Returns both the raw token (sent to user) and its SHA-256 hash (stored in DB).
 */
export function generateSecureToken(): { raw: string; hash: string } {
  const raw = randomBytes(48).toString("base64url");
  return { raw, hash: hashToken(raw) };
}
```

- [ ] **Step 2: Create the password reset routes plugin**

Create `apps/api/src/routes/v1/auth-password-reset.ts`:

```typescript
import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { generateSecureToken, hashToken, hashPassword, verifyPassword } from "../../lib/auth.js";
import { passwordSchema, emailSchema } from "../../lib/validation.js";
import { sendPasswordResetEmail } from "../../lib/email.js";
import { writeAuditLog } from "../../lib/audit.js";

const ForgotPasswordSchema = z.object({
  email: emailSchema,
});

const ResetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: passwordSchema,
});

export const authPasswordResetRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /forgot-password
  fastify.post("/forgot-password", {
    config: {
      rateLimit: {
        max: 3,
        timeWindow: "1 hour",
        keyGenerator: (req: import("fastify").FastifyRequest) => {
          try {
            const body = req.body as { email?: string };
            return `forgot:${(body?.email ?? req.ip).toLowerCase()}`;
          } catch {
            return `forgot:${req.ip}`;
          }
        },
      },
    },
  }, async (request, reply) => {
    const SAFE_RESPONSE = { message: "If that email exists, we've sent a reset link." };

    let body: z.infer<typeof ForgotPasswordSchema>;
    try {
      body = ForgotPasswordSchema.parse(request.body);
    } catch {
      // Always return the same response to prevent enumeration
      return reply.send(SAFE_RESPONSE);
    }

    // Look up user by email (without tenant scope — password reset is global)
    const users = await fastify.db.query<{ id: string; email: string; tenant_id: string }>(
      `SELECT u.id, u.email, m.tenant_id
       FROM users u
       JOIN memberships m ON m.user_id = u.id
       WHERE u.email = $1
       LIMIT 1`,
      [body.email]
    );

    if (users.length === 0) {
      // User doesn't exist — return the same response (no enumeration)
      return reply.send(SAFE_RESPONSE);
    }

    const user = users[0];

    // Invalidate any existing unused tokens for this user
    await fastify.db.query(
      "UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL",
      [user.id]
    );

    // Generate new token
    const { raw, hash } = generateSecureToken();
    await fastify.db.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
      [user.id, hash]
    );

    // Send email
    const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";
    const resetUrl = `${frontendUrl}/reset-password?token=${raw}`;

    try {
      await sendPasswordResetEmail(user.email, resetUrl);
    } catch (err) {
      request.log.error({ err }, "Failed to send password reset email");
    }

    // Audit log
    try {
      await writeAuditLog(fastify.db, {
        tenantId: user.tenant_id,
        actorUserId: user.id,
        actionType: "auth.password_reset_requested",
        objectType: "user",
        objectId: user.id,
      });
    } catch (err) {
      request.log.error({ err }, "Failed to write audit log");
    }

    return reply.send(SAFE_RESPONSE);
  });

  // POST /reset-password
  fastify.post("/reset-password", {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: "15 minutes",
        keyGenerator: (req: import("fastify").FastifyRequest) => req.ip,
      },
    },
  }, async (request, reply) => {
    const body = ResetPasswordSchema.parse(request.body);
    const tokenHash = hashToken(body.token);

    // Look up valid token
    const tokens = await fastify.db.query<{
      id: string;
      user_id: string;
      expires_at: string;
      used_at: string | null;
    }>(
      `SELECT id, user_id, expires_at, used_at
       FROM password_reset_tokens
       WHERE token_hash = $1
       LIMIT 1`,
      [tokenHash]
    );

    const tokenRow = tokens[0];
    if (!tokenRow || tokenRow.used_at || new Date(tokenRow.expires_at) < new Date()) {
      return reply.status(400).send({ error: "This reset link is invalid or has expired." });
    }

    // Hash new password and update user
    const newHash = await hashPassword(body.newPassword);

    await fastify.db.tx(async (client) => {
      // Update password
      await client.query("UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2", [
        newHash,
        tokenRow.user_id,
      ]);

      // Mark token as used
      await client.query("UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1", [
        tokenRow.id,
      ]);

      // Revoke all refresh tokens (force re-login everywhere)
      await client.query(
        "UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL",
        [tokenRow.user_id]
      );
    });

    // Audit log
    const memberships = await fastify.db.query<{ tenant_id: string }>(
      "SELECT tenant_id FROM memberships WHERE user_id = $1 LIMIT 1",
      [tokenRow.user_id]
    );
    if (memberships[0]) {
      try {
        await writeAuditLog(fastify.db, {
          tenantId: memberships[0].tenant_id,
          actorUserId: tokenRow.user_id,
          actionType: "auth.password_reset_completed",
          objectType: "user",
          objectId: tokenRow.user_id,
        });
      } catch (err) {
        request.log.error({ err }, "Failed to write audit log");
      }
    }

    return reply.send({ message: "Password reset successfully." });
  });
};
```

- [ ] **Step 3: Register the plugin in auth.ts**

At the end of `apps/api/src/routes/v1/auth.ts`, inside the `authRoutes` plugin (after the `/logout` route), add:

```typescript
  // Register sub-route plugins
  fastify.register(import("./auth-password-reset.js").then((m) => m.authPasswordResetRoutes));
```

Actually, Fastify plugin registration works differently — we need to register at the parent level or use `fastify.register` with a prefix. Since all auth routes share the `/auth` prefix registered by the parent, we can register sub-plugins directly. But the cleaner pattern is to register in the route registration file (e.g. `apps/api/src/routes/v1/index.ts` or wherever auth routes are mounted). Let me check.

Check where `authRoutes` is registered. It's likely in an index file that mounts `/v1/auth`. The new plugin should be registered alongside it under the same prefix, or imported and registered within `authRoutes`.

The simplest approach: import and register inside `authRoutes`:

Add to the top of `apps/api/src/routes/v1/auth.ts`:
```typescript
import { authPasswordResetRoutes } from "./auth-password-reset.js";
```

Add at the start of the `authRoutes` async function body:
```typescript
  await fastify.register(authPasswordResetRoutes);
```

- [ ] **Step 4: Build and verify**

Run: `cd apps/api && npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/auth.ts apps/api/src/routes/v1/auth-password-reset.ts apps/api/src/routes/v1/auth.ts
git commit -m "feat(auth): add forgot-password and reset-password API routes"
```

---

### Task 8: Forgot password + reset password frontend pages

**Files:**
- Create: `apps/web/src/app/(auth)/forgot-password/page.tsx`
- Create: `apps/web/src/app/(auth)/reset-password/page.tsx`
- Modify: `apps/web/src/app/(auth)/login/page.tsx` (add forgot-password link)

- [ ] **Step 1: Create forgot-password page**

Create `apps/web/src/app/(auth)/forgot-password/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Something went wrong.");
        return;
      }

      setSubmitted(true);
    } catch {
      setError("Network error. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div
        className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8"
        style={{ boxShadow: "var(--shadow-2)" }}
      >
        <div className="mb-7">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-disabled)]">
            Password recovery
          </p>
          <h1 className="text-xl font-bold tracking-tight text-[var(--text-1)]">
            {submitted ? "Check your inbox" : "Forgot your password?"}
          </h1>
        </div>

        {submitted ? (
          <div>
            <p className="text-sm text-[var(--text-2)] leading-relaxed">
              If that email is associated with a Larry account, we&apos;ve sent a reset link. Check your inbox and spam folder.
            </p>
            <Link
              href="/login"
              className="mt-6 inline-flex h-[2.75rem] w-full items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-7 text-[0.9375rem] font-medium text-[var(--text-1)] transition-colors hover:bg-[var(--surface)]"
            >
              Back to login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3" noValidate>
            <div>
              <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="min-h-[44px] w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-[var(--text-1)] placeholder:text-[var(--text-disabled)] outline-none transition-colors duration-150 focus:border-[var(--border-2)] focus:bg-[var(--surface)]"
                style={{ fontSize: "1rem" }}
              />
            </div>

            {error && (
              <p className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--text-2)]">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              aria-busy={loading}
              className="mt-1 inline-flex h-[2.75rem] w-full items-center justify-center rounded-lg border-none bg-[var(--cta)] px-7 text-[0.9375rem] font-medium tracking-[-0.01em] text-white transition-colors duration-200 hover:bg-[var(--cta-hover)] disabled:pointer-events-none disabled:opacity-50"
            >
              {loading ? "Sending..." : "Send reset link"}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
          Remember your password?{" "}
          <Link
            href="/login"
            className="font-medium text-[var(--brand)] underline underline-offset-2 transition-colors hover:text-[var(--brand-hover)]"
          >
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the BFF proxy route for forgot-password**

Create `apps/web/src/app/api/auth/forgot-password/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const apiBaseUrl = process.env.LARRY_API_BASE_URL;
  if (!apiBaseUrl) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  try {
    const body = await req.json();
    const apiRes = await fetch(`${apiBaseUrl.replace(/\/+$/, "")}/v1/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });

    const data = await apiRes.json();
    return NextResponse.json(data, { status: apiRes.status });
  } catch {
    return NextResponse.json(
      { message: "If that email exists, we've sent a reset link." },
      { status: 200 }
    );
  }
}
```

- [ ] **Step 3: Create reset-password page**

Create `apps/web/src/app/(auth)/reset-password/page.tsx`:

```tsx
"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";

function getPasswordStrength(pw: string): { label: string; color: string; width: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;

  if (score <= 2) return { label: "Weak", color: "#9a7fa7", width: "33%" };
  if (score <= 3) return { label: "Moderate", color: "#b29cf8", width: "66%" };
  return { label: "Strong", color: "#6c44f6", width: "100%" };
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const strength = getPasswordStrength(password);
  const passwordsMatch = password.length > 0 && password === confirmPassword;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }

      setSuccess(true);
      setTimeout(() => router.push("/login"), 3000);
    } catch {
      setError("Network error. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="w-full max-w-sm">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8" style={{ boxShadow: "var(--shadow-2)" }}>
          <h1 className="text-xl font-bold tracking-tight text-[var(--text-1)] mb-4">Invalid reset link</h1>
          <p className="text-sm text-[var(--text-2)] mb-6">This password reset link is invalid or has expired.</p>
          <Link
            href="/forgot-password"
            className="inline-flex h-[2.75rem] w-full items-center justify-center rounded-lg border-none bg-[var(--cta)] px-7 text-[0.9375rem] font-medium text-white transition-colors hover:bg-[var(--cta-hover)]"
          >
            Request a new reset link
          </Link>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="w-full max-w-sm">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8" style={{ boxShadow: "var(--shadow-2)" }}>
          <h1 className="text-xl font-bold tracking-tight text-[var(--text-1)] mb-4">Password reset!</h1>
          <p className="text-sm text-[var(--text-2)]">Your password has been reset successfully. Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8" style={{ boxShadow: "var(--shadow-2)" }}>
        <div className="mb-7">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-disabled)]">
            Password recovery
          </p>
          <h1 className="text-xl font-bold tracking-tight text-[var(--text-1)]">Set a new password</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3" noValidate>
          <div>
            <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">
              New password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="min-h-[44px] w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 pr-11 text-[var(--text-1)] placeholder:text-[var(--text-disabled)] outline-none transition-colors duration-150 focus:border-[var(--border-2)] focus:bg-[var(--surface)]"
                style={{ fontSize: "1rem" }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 transition-colors"
                style={{ color: "var(--text-disabled)" }}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {password.length > 0 && (
              <div className="mt-2">
                <div className="h-1 rounded-full bg-[var(--surface-2)] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ width: strength.width, backgroundColor: strength.color }}
                  />
                </div>
                <p className="mt-1 text-xs" style={{ color: strength.color }}>{strength.label}</p>
              </div>
            )}
          </div>

          <div>
            <label htmlFor="confirmPassword" className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">
              Confirm new password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              className="min-h-[44px] w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-[var(--text-1)] placeholder:text-[var(--text-disabled)] outline-none transition-colors duration-150 focus:border-[var(--border-2)] focus:bg-[var(--surface)]"
              style={{ fontSize: "1rem" }}
            />
            {confirmPassword.length > 0 && (
              <p className="mt-1 text-xs" style={{ color: passwordsMatch ? "#22c55e" : "#9a7fa7" }}>
                {passwordsMatch ? "Passwords match" : "Passwords do not match"}
              </p>
            )}
          </div>

          {error && (
            <p className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--text-2)]">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !passwordsMatch || password.length < 8}
            className="mt-1 inline-flex h-[2.75rem] w-full items-center justify-center rounded-lg border-none bg-[var(--cta)] px-7 text-[0.9375rem] font-medium tracking-[-0.01em] text-white transition-colors duration-200 hover:bg-[var(--cta-hover)] disabled:pointer-events-none disabled:opacity-50"
          >
            {loading ? "Resetting..." : "Reset password"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
```

- [ ] **Step 4: Create the BFF proxy route for reset-password**

Create `apps/web/src/app/api/auth/reset-password/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const apiBaseUrl = process.env.LARRY_API_BASE_URL;
  if (!apiBaseUrl) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  try {
    const body = await req.json();
    const apiRes = await fetch(`${apiBaseUrl.replace(/\/+$/, "")}/v1/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });

    const data = await apiRes.json();
    return NextResponse.json(data, { status: apiRes.status });
  } catch {
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
```

- [ ] **Step 5: Add forgot-password link to login page**

In `apps/web/src/app/(auth)/login/page.tsx`, add after the closing `</form>` tag (before the "Don't have an account?" paragraph):

```tsx
        <p className="mt-3 text-center text-sm text-[var(--text-muted)]">
          <Link
            href="/forgot-password"
            className="font-medium text-[var(--brand)] underline underline-offset-2 transition-colors hover:text-[var(--brand-hover)]"
          >
            Forgot your password?
          </Link>
        </p>
```

- [ ] **Step 6: Build and verify**

Run: `cd apps/web && npm run build`
Expected: Build succeeds.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/(auth)/forgot-password/ apps/web/src/app/(auth)/reset-password/ apps/web/src/app/api/auth/forgot-password/ apps/web/src/app/api/auth/reset-password/ apps/web/src/app/(auth)/login/page.tsx
git commit -m "feat(auth): add forgot-password and reset-password pages"
```

---

## Slice 3: Email Verification

### Task 9: Database migration — email verification

**Files:**
- Create: `packages/db/src/migrations/015_email_verification.sql`

- [ ] **Step 1: Write the migration**

Create `packages/db/src/migrations/015_email_verification.sql`:

```sql
-- Email verification columns on users + verification tokens table.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_grace_deadline TIMESTAMPTZ;

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

- [ ] **Step 2: Commit**

```bash
git add packages/db/src/migrations/015_email_verification.sql
git commit -m "feat(db): add email verification columns and tokens table"
```

---

### Task 10: Email verification API routes

**Files:**
- Create: `apps/api/src/routes/v1/auth-verification.ts`
- Modify: `apps/api/src/routes/v1/auth.ts` (register plugin)

- [ ] **Step 1: Create verification routes plugin**

Create `apps/api/src/routes/v1/auth-verification.ts`:

```typescript
import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { generateSecureToken, hashToken } from "../../lib/auth.js";
import { sendVerificationEmail } from "../../lib/email.js";
import { writeAuditLog } from "../../lib/audit.js";

const VerifyEmailSchema = z.object({
  token: z.string().min(1),
});

export const authVerificationRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /send-verification (requires auth)
  fastify.post("/send-verification", {
    preHandler: [fastify.authenticate],
    config: {
      rateLimit: {
        max: 3,
        timeWindow: "1 hour",
        keyGenerator: (req: import("fastify").FastifyRequest) =>
          `verify:${(req.user as { userId: string }).userId}`,
      },
    },
  }, async (request, reply) => {
    const user = request.user;

    // Check if already verified
    const rows = await fastify.db.query<{ email_verified_at: string | null; email: string }>(
      "SELECT email_verified_at, email FROM users WHERE id = $1",
      [user.userId]
    );
    if (rows[0]?.email_verified_at) {
      return reply.send({ message: "Email already verified." });
    }

    // Invalidate existing unused tokens
    await fastify.db.query(
      "UPDATE email_verification_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL",
      [user.userId]
    );

    // Generate new token
    const { raw, hash } = generateSecureToken();
    await fastify.db.query(
      `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '24 hours')`,
      [user.userId, hash]
    );

    // Send email
    const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";
    const verifyUrl = `${frontendUrl}/verify-email?token=${raw}`;
    const email = rows[0]?.email ?? user.email;

    try {
      await sendVerificationEmail(email!, verifyUrl);
    } catch (err) {
      request.log.error({ err }, "Failed to send verification email");
      return reply.status(500).send({ error: "Failed to send verification email." });
    }

    return reply.send({ message: "Verification email sent." });
  });

  // POST /verify-email (no auth required — user clicks link from email)
  fastify.post("/verify-email", {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: "15 minutes",
        keyGenerator: (req: import("fastify").FastifyRequest) => req.ip,
      },
    },
  }, async (request, reply) => {
    const body = VerifyEmailSchema.parse(request.body);
    const tokenHash = hashToken(body.token);

    const tokens = await fastify.db.query<{
      id: string;
      user_id: string;
      expires_at: string;
      used_at: string | null;
    }>(
      `SELECT id, user_id, expires_at, used_at
       FROM email_verification_tokens
       WHERE token_hash = $1
       LIMIT 1`,
      [tokenHash]
    );

    const tokenRow = tokens[0];
    if (!tokenRow || tokenRow.used_at || new Date(tokenRow.expires_at) < new Date()) {
      return reply.status(400).send({ error: "This verification link is invalid or has expired." });
    }

    await fastify.db.tx(async (client) => {
      // Mark user as verified
      await client.query(
        "UPDATE users SET email_verified_at = NOW(), updated_at = NOW() WHERE id = $1",
        [tokenRow.user_id]
      );

      // Mark token as used
      await client.query(
        "UPDATE email_verification_tokens SET used_at = NOW() WHERE id = $1",
        [tokenRow.id]
      );
    });

    // Audit log
    const memberships = await fastify.db.query<{ tenant_id: string }>(
      "SELECT tenant_id FROM memberships WHERE user_id = $1 LIMIT 1",
      [tokenRow.user_id]
    );
    if (memberships[0]) {
      try {
        await writeAuditLog(fastify.db, {
          tenantId: memberships[0].tenant_id,
          actorUserId: tokenRow.user_id,
          actionType: "auth.email_verified",
          objectType: "user",
          objectId: tokenRow.user_id,
        });
      } catch (err) {
        request.log.error({ err }, "Failed to write audit log");
      }
    }

    return reply.send({ message: "Email verified." });
  });
};
```

- [ ] **Step 2: Register in auth.ts**

In `apps/api/src/routes/v1/auth.ts`, add import:
```typescript
import { authVerificationRoutes } from "./auth-verification.js";
```

Add registration inside `authRoutes` (alongside the password reset registration):
```typescript
  await fastify.register(authVerificationRoutes);
```

- [ ] **Step 3: Build and verify**

Run: `cd apps/api && npm run build`

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/v1/auth-verification.ts apps/api/src/routes/v1/auth.ts
git commit -m "feat(auth): add email verification API routes"
```

---

### Task 11: Add signup API route to backend + send verification on signup

**Files:**
- Modify: `apps/api/src/routes/v1/auth.ts` (add POST /signup route)

- [ ] **Step 1: Add signup route to auth.ts**

Add after the `/login` route in `apps/api/src/routes/v1/auth.ts`:

```typescript
  const SignupSchema = z.object({
    email: emailSchema,
    password: passwordSchema,
    fullName: z.string().max(200).optional(),
    tenantId: z.string().uuid(),
  });

  fastify.post("/signup", {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: "1 hour",
        keyGenerator: (req: import("fastify").FastifyRequest) => req.ip,
      },
    },
  }, async (request, reply) => {
    const body = SignupSchema.parse(request.body);

    // Check for existing user
    const existing = await fastify.db.query<{ id: string }>(
      "SELECT id FROM users WHERE email = $1",
      [body.email]
    );
    if (existing.length > 0) {
      return reply.status(409).send({ error: "An account with this email already exists." });
    }

    // Check tenant exists
    const tenants = await fastify.db.query<{ id: string }>(
      "SELECT id FROM tenants WHERE id = $1",
      [body.tenantId]
    );
    if (tenants.length === 0) {
      return reply.badRequest("Invalid tenant.");
    }

    const hashedPw = await hashPassword(body.password);
    const userId = crypto.randomUUID();

    await fastify.db.tx(async (client) => {
      // Create user
      await client.query(
        `INSERT INTO users (id, email, password_hash, display_name, verification_grace_deadline)
         VALUES ($1, $2, $3, $4, NOW() + INTERVAL '7 days')`,
        [userId, body.email, hashedPw, body.fullName ?? null]
      );

      // Create membership
      await client.query(
        "INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, 'member')",
        [body.tenantId, userId]
      );
    });

    // Issue tokens
    const accessToken = await issueAccessToken(fastify, {
      userId,
      tenantId: body.tenantId,
      role: "member",
      email: body.email,
    });

    const refreshToken = await issueRefreshToken(fastify, {
      userId,
      tenantId: body.tenantId,
      role: "member",
      email: body.email,
    });

    // Send verification email (best-effort, don't block signup)
    try {
      const { generateSecureToken } = await import("../../lib/auth.js");
      const { sendVerificationEmail } = await import("../../lib/email.js");
      const { raw, hash } = generateSecureToken();
      await fastify.db.query(
        `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '24 hours')`,
        [userId, hash]
      );
      const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";
      await sendVerificationEmail(body.email, `${frontendUrl}/verify-email?token=${raw}`);
    } catch (err) {
      request.log.error({ err }, "Failed to send verification email on signup");
    }

    // Audit log
    await writeAuditLog(fastify.db, {
      tenantId: body.tenantId,
      actorUserId: userId,
      actionType: "auth.signup",
      objectType: "user",
      objectId: userId,
      details: { method: "email" },
    });

    return reply.status(201).send({
      accessToken,
      refreshToken,
      user: { id: userId, email: body.email, role: "member", tenantId: body.tenantId },
    });
  });
```

Also add `import { hashPassword } from "../../lib/auth.js";` to the existing import line and `import { passwordSchema, emailSchema } from "../../lib/validation.js";` if not already there, and `import { generateSecureToken } from "../../lib/auth.js";`.

- [ ] **Step 2: Build and verify**

Run: `cd apps/api && npm run build`

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/v1/auth.ts
git commit -m "feat(auth): add signup API route with email verification on create"
```

---

### Task 12: Email verification frontend pages + banner

**Files:**
- Create: `apps/web/src/app/(auth)/verify-email/page.tsx`
- Create: `apps/web/src/app/(auth)/verify-email-required/page.tsx`
- Create: `apps/web/src/components/auth/VerificationBanner.tsx`
- Create: `apps/web/src/app/api/auth/send-verification/route.ts`
- Create: `apps/web/src/app/api/auth/verify-email/route.ts`
- Modify: `apps/web/src/app/workspace/WorkspaceShell.tsx`

- [ ] **Step 1: Create verify-email BFF proxy routes**

Create `apps/web/src/app/api/auth/verify-email/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const apiBaseUrl = process.env.LARRY_API_BASE_URL;
  if (!apiBaseUrl) return NextResponse.json({ error: "Not configured." }, { status: 503 });

  try {
    const body = await req.json();
    const apiRes = await fetch(`${apiBaseUrl.replace(/\/+$/, "")}/v1/auth/verify-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    const data = await apiRes.json();
    return NextResponse.json(data, { status: apiRes.status });
  } catch {
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
```

Create `apps/web/src/app/api/auth/send-verification/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiBaseUrl = process.env.LARRY_API_BASE_URL;
  if (!apiBaseUrl) return NextResponse.json({ error: "Not configured." }, { status: 503 });

  try {
    const apiRes = await fetch(`${apiBaseUrl.replace(/\/+$/, "")}/v1/auth/send-verification`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.apiAccessToken}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    const data = await apiRes.json();
    return NextResponse.json(data, { status: apiRes.status });
  } catch {
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create verify-email page**

Create `apps/web/src/app/(auth)/verify-email/page.tsx`:

```tsx
"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMsg("No verification token found.");
      return;
    }

    fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        if (res.ok) {
          setStatus("success");
          setTimeout(() => router.push("/workspace"), 3000);
        } else {
          const data = await res.json();
          setStatus("error");
          setErrorMsg(data.error ?? "Verification failed.");
        }
      })
      .catch(() => {
        setStatus("error");
        setErrorMsg("Network error.");
      });
  }, [token, router]);

  async function handleResend() {
    setResending(true);
    try {
      await fetch("/api/auth/send-verification", { method: "POST" });
    } catch { /* ignore */ }
    setResending(false);
  }

  return (
    <div className="w-full max-w-sm">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8" style={{ boxShadow: "var(--shadow-2)" }}>
        {status === "loading" && (
          <p className="text-sm text-[var(--text-2)]">Verifying your email...</p>
        )}
        {status === "success" && (
          <>
            <h1 className="text-xl font-bold tracking-tight text-[var(--text-1)] mb-4">Email verified!</h1>
            <p className="text-sm text-[var(--text-2)]">Redirecting to your workspace...</p>
          </>
        )}
        {status === "error" && (
          <>
            <h1 className="text-xl font-bold tracking-tight text-[var(--text-1)] mb-4">Verification failed</h1>
            <p className="text-sm text-[var(--text-2)] mb-6">{errorMsg}</p>
            <button
              onClick={handleResend}
              disabled={resending}
              className="inline-flex h-[2.75rem] w-full items-center justify-center rounded-lg border-none bg-[var(--cta)] px-7 text-[0.9375rem] font-medium text-white transition-colors hover:bg-[var(--cta-hover)] disabled:opacity-50"
            >
              {resending ? "Sending..." : "Resend verification email"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return <Suspense><VerifyEmailContent /></Suspense>;
}
```

- [ ] **Step 3: Create verify-email-required locked page**

Create `apps/web/src/app/(auth)/verify-email-required/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";

export default function VerifyEmailRequiredPage() {
  const [resending, setResending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleResend() {
    setResending(true);
    try {
      await fetch("/api/auth/send-verification", { method: "POST" });
      setSent(true);
    } catch { /* ignore */ }
    setResending(false);
  }

  return (
    <div className="w-full max-w-sm">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8" style={{ boxShadow: "var(--shadow-2)" }}>
        <div className="mb-7">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-disabled)]">
            Action required
          </p>
          <h1 className="text-xl font-bold tracking-tight text-[var(--text-1)]">Verify your email</h1>
        </div>

        <p className="text-sm text-[var(--text-2)] mb-6 leading-relaxed">
          Your email hasn&apos;t been verified yet. Please check your inbox or request a new verification email.
        </p>

        <button
          onClick={handleResend}
          disabled={resending || sent}
          className="inline-flex h-[2.75rem] w-full items-center justify-center rounded-lg border-none bg-[var(--cta)] px-7 text-[0.9375rem] font-medium text-white transition-colors hover:bg-[var(--cta-hover)] disabled:opacity-50"
        >
          {sent ? "Email sent! Check your inbox." : resending ? "Sending..." : "Resend verification email"}
        </button>

        <p className="mt-4 text-center text-sm text-[var(--text-muted)]">
          <Link href="/api/auth/logout" className="font-medium text-[var(--brand)] underline underline-offset-2">
            Log out
          </Link>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create VerificationBanner component**

Create `apps/web/src/components/auth/VerificationBanner.tsx`:

```tsx
"use client";

import { useState } from "react";

export function VerificationBanner() {
  const [dismissed, setDismissed] = useState(false);
  const [resending, setResending] = useState(false);
  const [sent, setSent] = useState(false);

  if (dismissed) return null;

  async function handleResend() {
    setResending(true);
    try {
      await fetch("/api/auth/send-verification", { method: "POST" });
      setSent(true);
    } catch { /* ignore */ }
    setResending(false);
  }

  return (
    <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] bg-[#6c44f6]/10 px-4 py-2 text-sm text-[var(--text-1)]">
      <p>
        Verify your email to unlock all features.{" "}
        <button
          onClick={handleResend}
          disabled={resending || sent}
          className="font-medium text-[var(--brand)] underline underline-offset-2 hover:text-[var(--brand-hover)] disabled:opacity-50"
        >
          {sent ? "Sent!" : resending ? "Sending..." : "Resend verification email"}
        </button>
      </p>
      <button
        onClick={() => setDismissed(true)}
        className="text-[var(--text-muted)] hover:text-[var(--text-1)] transition-colors"
        aria-label="Dismiss"
      >
        x
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Add VerificationBanner to WorkspaceShell**

In `apps/web/src/app/workspace/WorkspaceShell.tsx`, add the import:
```typescript
import { VerificationBanner } from "@/components/auth/VerificationBanner";
```

Add `emailVerified` prop to `WorkspaceShellProps`:
```typescript
type WorkspaceShellProps = {
  children: React.ReactNode;
  userEmail?: string | null;
  emailVerified?: boolean;
};
```

Add the banner at the top of the main content area, right after `<WorkspaceTopBar>`:
```tsx
          <WorkspaceTopBar userEmail={userEmail} onMobileMenuOpen={() => setMobileOpen(true)} />
          {!emailVerified && <VerificationBanner />}
```

- [ ] **Step 6: Add emailVerifiedAt to /me API response**

In `apps/api/src/routes/v1/auth.ts`, update the `/me` route to include `email_verified_at` in the query and response:

```typescript
      const rows = await fastify.db.query<{
        display_name: string | null;
        is_active: boolean;
        email_verified_at: string | null;
        verification_grace_deadline: string | null;
      }>(
        `SELECT display_name, is_active, email_verified_at, verification_grace_deadline
         FROM users
         WHERE id = $1
         LIMIT 1`,
        [user.userId]
      );

      return {
        user: {
          id: user.userId,
          tenantId: user.tenantId,
          role: user.role,
          email: user.email,
          displayName: rows[0]?.display_name ?? null,
          isActive: rows[0]?.is_active ?? true,
          emailVerifiedAt: rows[0]?.email_verified_at ?? null,
          verificationGraceDeadline: rows[0]?.verification_grace_deadline ?? null,
        },
      };
```

- [ ] **Step 7: Fetch emailVerified in workspace layout**

In `apps/web/src/app/workspace/layout.tsx`, fetch verification state from the API's `/me` endpoint:

```typescript
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { WorkspaceShell } from "./WorkspaceShell";

export const dynamic = "force-dynamic";

async function fetchVerificationState(session: { apiAccessToken?: string }): Promise<{
  emailVerified: boolean;
  pastGrace: boolean;
}> {
  const apiBaseUrl = process.env.LARRY_API_BASE_URL;
  if (!apiBaseUrl || !session.apiAccessToken) return { emailVerified: true, pastGrace: false };

  try {
    const res = await fetch(`${apiBaseUrl.replace(/\/+$/, "")}/v1/auth/me`, {
      headers: { Authorization: `Bearer ${session.apiAccessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return { emailVerified: true, pastGrace: false };
    const data = await res.json() as {
      user: { emailVerifiedAt: string | null; verificationGraceDeadline: string | null };
    };
    const emailVerified = data.user.emailVerifiedAt != null;
    const pastGrace = !emailVerified && data.user.verificationGraceDeadline != null
      && new Date(data.user.verificationGraceDeadline) < new Date();
    return { emailVerified, pastGrace };
  } catch {
    return { emailVerified: true, pastGrace: false };
  }
}

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { emailVerified, pastGrace } = await fetchVerificationState(session);

  if (pastGrace) redirect("/verify-email-required");

  return <WorkspaceShell userEmail={session.email} emailVerified={emailVerified}>{children}</WorkspaceShell>;
}
```

- [ ] **Step 7: Build and verify**

Run: `cd apps/web && npm run build`

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/(auth)/verify-email/ apps/web/src/app/(auth)/verify-email-required/ apps/web/src/components/auth/VerificationBanner.tsx apps/web/src/app/api/auth/verify-email/ apps/web/src/app/api/auth/send-verification/ apps/web/src/app/workspace/WorkspaceShell.tsx apps/web/src/app/workspace/layout.tsx
git commit -m "feat(auth): add email verification pages, banner, and BFF routes"
```

---

## Slice 4: Google OAuth Sign-In

### Task 13: Database migration — OAuth accounts

**Files:**
- Create: `packages/db/src/migrations/016_user_oauth_accounts.sql`

- [ ] **Step 1: Write the migration**

Create `packages/db/src/migrations/016_user_oauth_accounts.sql`:

```sql
-- OAuth accounts linked to users (Google, etc.)

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

-- Allow password-less accounts (OAuth-only users have no password)
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
```

- [ ] **Step 2: Commit**

```bash
git add packages/db/src/migrations/016_user_oauth_accounts.sql
git commit -m "feat(db): add user_oauth_accounts table, make password_hash nullable"
```

---

### Task 14: Google OAuth API routes

**Files:**
- Create: `apps/api/src/routes/v1/auth-google.ts`
- Modify: `apps/api/src/routes/v1/auth.ts` (register plugin)

- [ ] **Step 1: Create Google OAuth routes**

Create `apps/api/src/routes/v1/auth-google.ts`:

```typescript
import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { SignJWT, jwtVerify } from "jose";
import { issueAccessToken, issueRefreshToken, hashPassword } from "../../lib/auth.js";
import { writeAuditLog } from "../../lib/audit.js";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

const CallbackSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

interface GoogleUserInfo {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  email_verified?: boolean;
}

function getOAuthStateSecret(): Uint8Array {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret || secret.length < 32) throw new Error("JWT_ACCESS_SECRET must be >= 32 chars");
  return new TextEncoder().encode(secret);
}

async function createOAuthState(payload: Record<string, unknown>): Promise<string> {
  return new SignJWT({ ...payload, kind: "google_auth_state", nonce: crypto.randomUUID() })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(getOAuthStateSecret());
}

async function verifyOAuthState(state: string): Promise<Record<string, unknown>> {
  const { payload } = await jwtVerify(state, getOAuthStateSecret());
  if (payload.kind !== "google_auth_state") throw new Error("Invalid state kind");
  return payload as Record<string, unknown>;
}

export const authGoogleRoutes: FastifyPluginAsync = async (fastify) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_AUTH_REDIRECT_URI;
  const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";

  // GET /google — initiate OAuth flow
  fastify.get("/google", async (request, reply) => {
    if (!clientId || !clientSecret || !redirectUri) {
      return reply.status(503).send({ error: "Google OAuth not configured." });
    }

    const tenantId = process.env.LARRY_API_TENANT_ID;
    const state = await createOAuthState({ tenantId });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      access_type: "offline",
      prompt: "consent",
    });

    return reply.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  });

  // GET /google/callback — handle Google redirect
  fastify.get("/google/callback", async (request, reply) => {
    const query = request.query as Record<string, string>;

    if (query.error) {
      return reply.redirect(`${frontendUrl}/login?error=oauth_cancelled`);
    }

    let code: string;
    let statePayload: Record<string, unknown>;

    try {
      const parsed = CallbackSchema.parse(query);
      code = parsed.code;
      statePayload = await verifyOAuthState(parsed.state);
    } catch {
      return reply.redirect(`${frontendUrl}/login?error=oauth_failed`);
    }

    // Exchange code for tokens
    let googleUser: GoogleUserInfo;
    try {
      const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId!,
          client_secret: clientSecret!,
          redirect_uri: redirectUri!,
          grant_type: "authorization_code",
        }),
      });

      if (!tokenRes.ok) throw new Error("Token exchange failed");
      const tokenData = await tokenRes.json() as { access_token: string };

      const userRes = await fetch(GOOGLE_USERINFO_URL, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (!userRes.ok) throw new Error("Userinfo fetch failed");
      googleUser = await userRes.json() as GoogleUserInfo;
    } catch {
      return reply.redirect(`${frontendUrl}/login?error=oauth_failed`);
    }

    const tenantId = (statePayload.tenantId as string) ?? process.env.LARRY_API_TENANT_ID;
    if (!tenantId) {
      return reply.redirect(`${frontendUrl}/login?error=oauth_failed`);
    }

    // Check if this Google account is already linked
    const existingOAuth = await fastify.db.query<{ user_id: string }>(
      "SELECT user_id FROM user_oauth_accounts WHERE provider = 'google' AND provider_user_id = $1",
      [googleUser.sub]
    );

    let userId: string;
    let isNewUser = false;

    if (existingOAuth.length > 0) {
      // Existing linked account — just log in
      userId = existingOAuth[0].user_id;
    } else {
      // Check if a user with this email already exists
      const existingUser = await fastify.db.query<{ id: string }>(
        "SELECT id FROM users WHERE email = $1",
        [googleUser.email.toLowerCase()]
      );

      if (existingUser.length > 0) {
        // Link Google to existing account
        userId = existingUser[0].id;
        await fastify.db.query(
          `INSERT INTO user_oauth_accounts (user_id, provider, provider_user_id, email, display_name, avatar_url)
           VALUES ($1, 'google', $2, $3, $4, $5)`,
          [userId, googleUser.sub, googleUser.email, googleUser.name ?? null, googleUser.picture ?? null]
        );
      } else {
        // New user — create account
        userId = crypto.randomUUID();
        isNewUser = true;

        await fastify.db.tx(async (client) => {
          await client.query(
            `INSERT INTO users (id, email, display_name, email_verified_at)
             VALUES ($1, $2, $3, NOW())`,
            [userId, googleUser.email.toLowerCase(), googleUser.name ?? null]
          );

          await client.query(
            "INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, 'member')",
            [tenantId, userId]
          );

          await client.query(
            `INSERT INTO user_oauth_accounts (user_id, provider, provider_user_id, email, display_name, avatar_url)
             VALUES ($1, 'google', $2, $3, $4, $5)`,
            [userId, googleUser.sub, googleUser.email, googleUser.name ?? null, googleUser.picture ?? null]
          );
        });
      }
    }

    // Check membership exists for this tenant
    const membership = await fastify.db.query<{ role: string }>(
      "SELECT role FROM memberships WHERE tenant_id = $1 AND user_id = $2",
      [tenantId, userId]
    );

    const role = (membership[0]?.role ?? "member") as "admin" | "pm" | "member" | "executive";

    // Issue tokens
    const accessToken = await issueAccessToken(fastify, { userId, tenantId, role, email: googleUser.email });
    const refreshToken = await issueRefreshToken(fastify, { userId, tenantId, role, email: googleUser.email });

    // Generate one-time code for frontend session creation
    const oneTimeCode = await new SignJWT({
      kind: "google_auth_complete",
      userId,
      tenantId,
      role,
      email: googleUser.email,
      accessToken,
      refreshToken,
      isNewUser,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(getOAuthStateSecret());

    // Audit log
    try {
      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId: userId,
        actionType: isNewUser ? "auth.signup" : "auth.login",
        objectType: "session",
        objectId: userId,
        details: { method: "google" },
      });
    } catch { /* non-fatal */ }

    return reply.redirect(`${frontendUrl}/api/auth/google/complete?code=${encodeURIComponent(oneTimeCode)}`);
  });
};
```

- [ ] **Step 2: Add link/unlink endpoints to auth-google.ts**

Add these routes at the end of the `authGoogleRoutes` plugin, before the closing `};`:

```typescript
  // POST /google/link — link Google account to authenticated user
  fastify.post("/google/link", {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.user;
    const body = z.object({ idToken: z.string().min(1) }).parse(request.body);

    // Verify Google ID token by fetching userinfo
    let googleUser: GoogleUserInfo;
    try {
      const userRes = await fetch(GOOGLE_USERINFO_URL, {
        headers: { Authorization: `Bearer ${body.idToken}` },
      });
      if (!userRes.ok) throw new Error("Invalid token");
      googleUser = await userRes.json() as GoogleUserInfo;
    } catch {
      return reply.badRequest("Invalid Google token.");
    }

    // Check not already linked to another user
    const existing = await fastify.db.query<{ user_id: string }>(
      "SELECT user_id FROM user_oauth_accounts WHERE provider = 'google' AND provider_user_id = $1",
      [googleUser.sub]
    );
    if (existing.length > 0 && existing[0].user_id !== user.userId) {
      return reply.status(409).send({ error: "This Google account is already linked to another user." });
    }
    if (existing.length > 0) {
      return reply.send({ message: "Google account already linked." });
    }

    await fastify.db.query(
      `INSERT INTO user_oauth_accounts (user_id, provider, provider_user_id, email, display_name, avatar_url)
       VALUES ($1, 'google', $2, $3, $4, $5)`,
      [user.userId, googleUser.sub, googleUser.email, googleUser.name ?? null, googleUser.picture ?? null]
    );

    return reply.send({ message: "Google account linked." });
  });

  // POST /google/unlink — remove Google link
  fastify.post("/google/unlink", {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.user;

    // Block if user has no password (would lock them out)
    const rows = await fastify.db.query<{ password_hash: string | null }>(
      "SELECT password_hash FROM users WHERE id = $1",
      [user.userId]
    );
    if (!rows[0]?.password_hash) {
      return reply.badRequest("Set a password before unlinking Google. Otherwise you'll be locked out.");
    }

    await fastify.db.query(
      "DELETE FROM user_oauth_accounts WHERE user_id = $1 AND provider = 'google'",
      [user.userId]
    );

    return reply.send({ message: "Google account unlinked." });
  });
```

- [ ] **Step 3: Register in auth.ts**

In `apps/api/src/routes/v1/auth.ts`, add import:
```typescript
import { authGoogleRoutes } from "./auth-google.js";
```

Add registration:
```typescript
  await fastify.register(authGoogleRoutes);
```

- [ ] **Step 4: Add env vars**

Add to `apps/api/.env.example`:
```
GOOGLE_AUTH_REDIRECT_URI=http://localhost:8080/v1/auth/google/callback
```

- [ ] **Step 5: Build and verify**

Run: `cd apps/api && npm run build`

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/v1/auth-google.ts apps/api/src/routes/v1/auth.ts apps/api/.env.example
git commit -m "feat(auth): add Google OAuth sign-in, link, and unlink API routes"
```

---

### Task 15: Google OAuth BFF route + frontend buttons

**Files:**
- Create: `apps/web/src/app/api/auth/google/complete/route.ts`
- Create: `apps/web/src/components/auth/GoogleSignInButton.tsx`
- Modify: `apps/web/src/app/(auth)/login/page.tsx`
- Modify: `apps/web/src/app/(auth)/signup/SignupWizard.tsx`

- [ ] **Step 1: Create the BFF completion route**

Create `apps/web/src/app/api/auth/google/complete/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { createSessionToken, sessionCookieOptions } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=oauth_failed", baseUrl));
  }

  try {
    // The code is a signed JWT from the API containing session data.
    // It was signed with JWT_ACCESS_SECRET by the API's Google callback.
    // The web app needs this same secret to verify (shared infra secret).
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret) throw new Error("JWT_ACCESS_SECRET not configured");

    const { payload } = await jwtVerify(code, new TextEncoder().encode(secret));
    if (payload.kind !== "google_auth_complete") throw new Error("Invalid code kind");

    const token = await createSessionToken({
      userId: payload.userId as string,
      email: payload.email as string,
      tenantId: payload.tenantId as string,
      role: payload.role as string,
      apiAccessToken: payload.accessToken as string,
      apiRefreshToken: payload.refreshToken as string,
      authMode: "api",
    });

    const isNewUser = payload.isNewUser === true;
    const redirectTo = isNewUser ? "/signup?step=role" : "/workspace";

    const res = NextResponse.redirect(new URL(redirectTo, baseUrl));
    res.cookies.set(sessionCookieOptions(token));
    return res;
  } catch (err) {
    console.error("[google/complete]", err);
    return NextResponse.redirect(new URL("/login?error=oauth_failed", baseUrl));
  }
}
```

Add `JWT_ACCESS_SECRET` to `apps/web/.env.example` (shared with API for one-time code verification).

- [ ] **Step 2: Create GoogleSignInButton component**

Create `apps/web/src/components/auth/GoogleSignInButton.tsx`:

```tsx
"use client";

export function GoogleSignInButton({ label = "Sign in with Google" }: { label?: string }) {
  function handleClick() {
    window.location.href = "/api/auth/google";
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex h-[2.75rem] w-full items-center justify-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-7 text-[0.9375rem] font-medium text-[var(--text-1)] transition-colors hover:bg-[var(--surface)]"
    >
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
        <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
        <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
        <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 6.29C4.672 4.163 6.656 2.58 9 3.58z" fill="#EA4335"/>
      </svg>
      {label}
    </button>
  );
}
```

- [ ] **Step 3: Create BFF redirect to API Google OAuth**

Create `apps/web/src/app/api/auth/google/route.ts`:

```typescript
import { NextResponse } from "next/server";

export async function GET() {
  const apiBaseUrl = process.env.LARRY_API_BASE_URL;
  if (!apiBaseUrl) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  return NextResponse.redirect(`${apiBaseUrl.replace(/\/+$/, "")}/v1/auth/google`);
}
```

- [ ] **Step 4: Add Google button to login page**

In `apps/web/src/app/(auth)/login/page.tsx`, add the import:
```typescript
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
```

Add after the `<h1>` tag and before the `<form>`:
```tsx
        <GoogleSignInButton />

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-[var(--border)]" />
          <span className="text-xs text-[var(--text-disabled)]">or</span>
          <div className="h-px flex-1 bg-[var(--border)]" />
        </div>
```

- [ ] **Step 5: Enable Google button in SignupWizard**

In `apps/web/src/app/(auth)/signup/SignupWizard.tsx`, find the disabled Google button and replace it with the working component. Add import:
```typescript
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
```

Replace the disabled button block with:
```tsx
<GoogleSignInButton label="Sign up with Google" />
```

- [ ] **Step 6: Build and verify**

Run: `cd apps/web && npm run build`

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/api/auth/google/ apps/web/src/components/auth/GoogleSignInButton.tsx apps/web/src/app/(auth)/login/page.tsx apps/web/src/app/(auth)/signup/SignupWizard.tsx
git commit -m "feat(auth): add Google OAuth sign-in to login and signup pages"
```

---

## Slice 5: Account Settings

### Task 16: Database migration — account settings

**Files:**
- Create: `packages/db/src/migrations/017_account_settings.sql`

- [ ] **Step 1: Write the migration**

Create `packages/db/src/migrations/017_account_settings.sql`:

```sql
-- Email change requests table
CREATE TABLE IF NOT EXISTS email_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  new_email TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_email_change_token ON email_change_requests(token_hash);
CREATE INDEX idx_email_change_user ON email_change_requests(user_id);

-- Add IP and user agent tracking to refresh tokens for session management
ALTER TABLE refresh_tokens
  ADD COLUMN IF NOT EXISTS ip_address TEXT,
  ADD COLUMN IF NOT EXISTS user_agent TEXT;
```

- [ ] **Step 2: Commit**

```bash
git add packages/db/src/migrations/017_account_settings.sql
git commit -m "feat(db): add email_change_requests and refresh_tokens IP/UA columns"
```

---

### Task 17: Account settings API routes

**Files:**
- Create: `apps/api/src/routes/v1/auth-account.ts`
- Modify: `apps/api/src/routes/v1/auth.ts` (register plugin)
- Modify: `apps/api/src/lib/auth.ts` (update issueRefreshToken to accept IP/UA)

- [ ] **Step 1: Update issueRefreshToken to store IP and user agent**

In `apps/api/src/lib/auth.ts`, update the `issueRefreshToken` function signature and query:

```typescript
export async function issueRefreshToken(
  app: FastifyInstance,
  payload: { userId: string; tenantId: string; role: "admin" | "pm" | "member" | "executive"; email?: string },
  dbClient?: PoolClient,
  meta?: { ipAddress?: string; userAgent?: string }
): Promise<string> {
  const token = randomBytes(48).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = futureIsoDate(app.config.REFRESH_TOKEN_TTL);
  const query = `INSERT INTO refresh_tokens (tenant_id, user_id, token_hash, expires_at, ip_address, user_agent)
                 VALUES ($1, $2, $3, $4, $5, $6)`;
  const values = [payload.tenantId, payload.userId, tokenHash, expiresAt, meta?.ipAddress ?? null, meta?.userAgent ?? null];
  if (dbClient) {
    await dbClient.query(query, values);
  } else {
    await app.db.query(query, values);
  }
  return token;
}
```

- [ ] **Step 2: Create account settings routes**

Create `apps/api/src/routes/v1/auth-account.ts`:

```typescript
import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { hashPassword, verifyPassword, generateSecureToken, hashToken } from "../../lib/auth.js";
import { passwordSchema } from "../../lib/validation.js";
import { sendEmailChangeConfirmation, sendEmailChangeNotification } from "../../lib/email.js";
import { writeAuditLog } from "../../lib/audit.js";

const ChangePasswordSchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: passwordSchema,
});

const ChangeEmailSchema = z.object({
  newEmail: z.string().email().transform((v) => v.trim().toLowerCase()),
  password: z.string().optional(),
});

const ConfirmEmailChangeSchema = z.object({
  token: z.string().min(1),
});

export const authAccountRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /change-password
  fastify.post("/change-password", {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const body = ChangePasswordSchema.parse(request.body);
    const user = request.user;

    // Check if user has a password
    const rows = await fastify.db.query<{ password_hash: string | null }>(
      "SELECT password_hash FROM users WHERE id = $1",
      [user.userId]
    );
    const hasPassword = rows[0]?.password_hash != null;

    if (hasPassword) {
      if (!body.currentPassword) {
        return reply.badRequest("Current password is required.");
      }
      const valid = await verifyPassword(body.currentPassword, rows[0]!.password_hash!);
      if (!valid) {
        return reply.unauthorized("Current password is incorrect.");
      }
    }

    const newHash = await hashPassword(body.newPassword);
    await fastify.db.query(
      "UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2",
      [newHash, user.userId]
    );

    // Revoke all refresh tokens except the one backing the current session.
    // The current session's refresh token hash is passed via x-current-token-hash header
    // (set by the web BFF when proxying this request).
    const currentTokenHash = request.headers["x-current-token-hash"] as string | undefined;
    if (currentTokenHash) {
      await fastify.db.query(
        `UPDATE refresh_tokens SET revoked_at = NOW()
         WHERE user_id = $1 AND tenant_id = $2 AND revoked_at IS NULL AND token_hash != $3`,
        [user.userId, user.tenantId, currentTokenHash]
      );
    } else {
      await fastify.db.query(
        "UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND tenant_id = $2 AND revoked_at IS NULL",
        [user.userId, user.tenantId]
      );
    }

    await writeAuditLog(fastify.db, {
      tenantId: user.tenantId,
      actorUserId: user.userId,
      actionType: "auth.password_changed",
      objectType: "user",
      objectId: user.userId,
    });

    return reply.send({ message: "Password updated successfully." });
  });

  // POST /change-email
  fastify.post("/change-email", {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const body = ChangeEmailSchema.parse(request.body);
    const user = request.user;

    // Check verified
    const rows = await fastify.db.query<{ email_verified_at: string | null; password_hash: string | null; email: string }>(
      "SELECT email_verified_at, password_hash, email FROM users WHERE id = $1",
      [user.userId]
    );
    if (!rows[0]?.email_verified_at) {
      return reply.badRequest("You must verify your current email first.");
    }

    // Verify password if user has one
    if (rows[0].password_hash) {
      if (!body.password) return reply.badRequest("Password is required.");
      const valid = await verifyPassword(body.password, rows[0].password_hash);
      if (!valid) return reply.unauthorized("Incorrect password.");
    }

    // Check new email not in use
    const existing = await fastify.db.query<{ id: string }>(
      "SELECT id FROM users WHERE email = $1",
      [body.newEmail]
    );
    if (existing.length > 0) {
      return reply.status(409).send({ error: "This email is already in use." });
    }

    // Invalidate existing change requests
    await fastify.db.query(
      "UPDATE email_change_requests SET confirmed_at = NOW() WHERE user_id = $1 AND confirmed_at IS NULL",
      [user.userId]
    );

    // Create change request
    const { raw, hash } = generateSecureToken();
    await fastify.db.query(
      `INSERT INTO email_change_requests (user_id, new_email, token_hash, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '1 hour')`,
      [user.userId, body.newEmail, hash]
    );

    // Send confirmation to new email
    const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";
    try {
      await sendEmailChangeConfirmation(body.newEmail, `${frontendUrl}/confirm-email-change?token=${raw}`);
    } catch {
      return reply.status(500).send({ error: "Failed to send confirmation email." });
    }

    // Send notification to old email (best-effort)
    try {
      await sendEmailChangeNotification(rows[0].email);
    } catch { /* non-fatal */ }

    return reply.send({ message: "Confirmation email sent to your new address." });
  });

  // POST /confirm-email-change
  fastify.post("/confirm-email-change", {
    config: {
      rateLimit: { max: 10, timeWindow: "15 minutes", keyGenerator: (req: import("fastify").FastifyRequest) => req.ip },
    },
  }, async (request, reply) => {
    const body = ConfirmEmailChangeSchema.parse(request.body);
    const tokenHash = hashToken(body.token);

    const rows = await fastify.db.query<{
      id: string; user_id: string; new_email: string; expires_at: string; confirmed_at: string | null;
    }>(
      "SELECT id, user_id, new_email, expires_at, confirmed_at FROM email_change_requests WHERE token_hash = $1 LIMIT 1",
      [tokenHash]
    );

    const row = rows[0];
    if (!row || row.confirmed_at || new Date(row.expires_at) < new Date()) {
      return reply.status(400).send({ error: "This link is invalid or has expired." });
    }

    await fastify.db.tx(async (client) => {
      await client.query("UPDATE users SET email = $1, email_verified_at = NOW(), updated_at = NOW() WHERE id = $2", [
        row.new_email, row.user_id,
      ]);
      await client.query("UPDATE email_change_requests SET confirmed_at = NOW() WHERE id = $1", [row.id]);
    });

    const memberships = await fastify.db.query<{ tenant_id: string }>(
      "SELECT tenant_id FROM memberships WHERE user_id = $1 LIMIT 1",
      [row.user_id]
    );
    if (memberships[0]) {
      try {
        await writeAuditLog(fastify.db, {
          tenantId: memberships[0].tenant_id,
          actorUserId: row.user_id,
          actionType: "auth.email_changed",
          objectType: "user",
          objectId: row.user_id,
          details: { newEmail: row.new_email },
        });
      } catch { /* non-fatal */ }
    }

    return reply.send({ message: "Email changed successfully." });
  });

  // GET /sessions
  fastify.get("/sessions", {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const user = request.user;

    const rows = await fastify.db.query<{
      id: string; created_at: string; ip_address: string | null; user_agent: string | null; token_hash: string;
    }>(
      `SELECT id, created_at, ip_address, user_agent, token_hash
       FROM refresh_tokens
       WHERE user_id = $1 AND tenant_id = $2 AND revoked_at IS NULL AND expires_at > NOW()
       ORDER BY created_at DESC`,
      [user.userId, user.tenantId]
    );

    return {
      sessions: rows.map((r) => ({
        id: r.id,
        createdAt: r.created_at,
        ipAddress: r.ip_address,
        userAgent: r.user_agent,
        isCurrent: false, // Client can compare with its own session
      })),
    };
  });

  // DELETE /sessions/:id
  fastify.delete("/sessions/:id", {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user;

    await fastify.db.query(
      "UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1 AND user_id = $2 AND tenant_id = $3",
      [id, user.userId, user.tenantId]
    );

    return reply.send({ message: "Session revoked." });
  });

  // DELETE /sessions (revoke all except current)
  fastify.delete("/sessions", {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.user;
    const currentTokenHash = request.headers["x-current-token-hash"] as string | undefined;

    if (currentTokenHash) {
      await fastify.db.query(
        `UPDATE refresh_tokens SET revoked_at = NOW()
         WHERE user_id = $1 AND tenant_id = $2 AND revoked_at IS NULL AND token_hash != $3`,
        [user.userId, user.tenantId, currentTokenHash]
      );
    } else {
      await fastify.db.query(
        "UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND tenant_id = $2 AND revoked_at IS NULL",
        [user.userId, user.tenantId]
      );
    }

    return reply.send({ message: "All other sessions revoked." });
  });
};
```

- [ ] **Step 3: Register in auth.ts**

In `apps/api/src/routes/v1/auth.ts`:
```typescript
import { authAccountRoutes } from "./auth-account.js";
// ... inside authRoutes:
  await fastify.register(authAccountRoutes);
```

- [ ] **Step 4: Build and verify**

Run: `cd apps/api && npm run build`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/v1/auth-account.ts apps/api/src/routes/v1/auth.ts apps/api/src/lib/auth.ts
git commit -m "feat(auth): add account settings API — change password, change email, sessions"
```

---

### Task 18: Account settings frontend page

**Files:**
- Create: `apps/web/src/app/workspace/settings/account/page.tsx`
- Create BFF proxy routes for: change-password, change-email, sessions

This is a large frontend task. The implementation worker should:

- [ ] **Step 1: Create BFF proxy routes**

Create `apps/web/src/app/api/auth/change-password/route.ts`, `apps/web/src/app/api/auth/change-email/route.ts`, `apps/web/src/app/api/auth/confirm-email-change/route.ts`, and `apps/web/src/app/api/auth/sessions/route.ts` — each follows the same BFF proxy pattern: forward the request to the API with the session's access token.

Each route follows this pattern:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiBaseUrl = process.env.LARRY_API_BASE_URL;
  if (!apiBaseUrl) return NextResponse.json({ error: "Not configured." }, { status: 503 });

  const body = await req.json();
  const apiRes = await fetch(`${apiBaseUrl.replace(/\/+$/, "")}/v1/auth/<endpoint>`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session.apiAccessToken}`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });

  const data = await apiRes.json();
  return NextResponse.json(data, { status: apiRes.status });
}
```

For `sessions/route.ts`, also add `GET` and `DELETE` handlers.

- [ ] **Step 2: Create account settings page**

Create `apps/web/src/app/workspace/settings/account/page.tsx` with three sections: Password, Email, Sessions. Use the same styling patterns as the rest of the workspace (CSS variables, rounded inputs, Larry brand colors). This is a standard form page — no unusual patterns needed.

- [ ] **Step 3: Build and verify**

Run: `cd apps/web && npm run build`

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/workspace/settings/account/ apps/web/src/app/api/auth/change-password/ apps/web/src/app/api/auth/change-email/ apps/web/src/app/api/auth/confirm-email-change/ apps/web/src/app/api/auth/sessions/
git commit -m "feat(auth): add account settings page — password, email, sessions"
```

---

### Task 18b: Confirm email change page

**Files:**
- Create: `apps/web/src/app/(auth)/confirm-email-change/page.tsx`
- Create: `apps/web/src/app/api/auth/confirm-email-change/route.ts`

- [ ] **Step 1: Create BFF proxy route**

Create `apps/web/src/app/api/auth/confirm-email-change/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const apiBaseUrl = process.env.LARRY_API_BASE_URL;
  if (!apiBaseUrl) return NextResponse.json({ error: "Not configured." }, { status: 503 });

  try {
    const body = await req.json();
    const apiRes = await fetch(`${apiBaseUrl.replace(/\/+$/, "")}/v1/auth/confirm-email-change`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    const data = await apiRes.json();
    return NextResponse.json(data, { status: apiRes.status });
  } catch {
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create confirm-email-change page**

Create `apps/web/src/app/(auth)/confirm-email-change/page.tsx`:

```tsx
"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

function ConfirmEmailChangeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMsg("No confirmation token found.");
      return;
    }

    fetch("/api/auth/confirm-email-change", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        if (res.ok) {
          setStatus("success");
          setTimeout(() => router.push("/workspace/settings/account"), 3000);
        } else {
          const data = await res.json();
          setStatus("error");
          setErrorMsg(data.error ?? "Confirmation failed.");
        }
      })
      .catch(() => {
        setStatus("error");
        setErrorMsg("Network error.");
      });
  }, [token, router]);

  return (
    <div className="w-full max-w-sm">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8" style={{ boxShadow: "var(--shadow-2)" }}>
        {status === "loading" && (
          <p className="text-sm text-[var(--text-2)]">Confirming your new email...</p>
        )}
        {status === "success" && (
          <>
            <h1 className="text-xl font-bold tracking-tight text-[var(--text-1)] mb-4">Email changed!</h1>
            <p className="text-sm text-[var(--text-2)]">Your email has been updated. Redirecting...</p>
          </>
        )}
        {status === "error" && (
          <>
            <h1 className="text-xl font-bold tracking-tight text-[var(--text-1)] mb-4">Confirmation failed</h1>
            <p className="text-sm text-[var(--text-2)] mb-6">{errorMsg}</p>
            <Link
              href="/workspace/settings/account"
              className="inline-flex h-[2.75rem] w-full items-center justify-center rounded-lg border-none bg-[var(--cta)] px-7 text-[0.9375rem] font-medium text-white transition-colors hover:bg-[var(--cta-hover)]"
            >
              Back to settings
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default function ConfirmEmailChangePage() {
  return <Suspense><ConfirmEmailChangeContent /></Suspense>;
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/(auth)/confirm-email-change/ apps/web/src/app/api/auth/confirm-email-change/
git commit -m "feat(auth): add confirm-email-change page for email update flow"
```

---

## Slice 6: Hardening

### Task 19: Database migration — login attempts

**Files:**
- Create: `packages/db/src/migrations/018_login_attempts.sql`

- [ ] **Step 1: Write the migration**

Create `packages/db/src/migrations/018_login_attempts.sql`:

```sql
-- Per-account lockout after too many failed login attempts.

CREATE TABLE IF NOT EXISTS login_attempts (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ
);
```

- [ ] **Step 2: Commit**

```bash
git add packages/db/src/migrations/018_login_attempts.sql
git commit -m "feat(db): add login_attempts table for per-account lockout"
```

---

### Task 20: Per-account lockout in login route

**Files:**
- Modify: `apps/api/src/routes/v1/auth.ts` (update login to check/update lockout)

- [ ] **Step 1: Add lockout check to login**

In the `/login` route handler in `apps/api/src/routes/v1/auth.ts`, after finding the user but before checking the password, add lockout check:

```typescript
    // Check account lockout
    const lockout = await fastify.db.query<{ attempt_count: number; locked_until: string | null }>(
      "SELECT attempt_count, locked_until FROM login_attempts WHERE user_id = $1",
      [user.id]
    );

    if (lockout[0]?.locked_until && new Date(lockout[0].locked_until) > new Date()) {
      const minutesLeft = Math.ceil((new Date(lockout[0].locked_until).getTime() - Date.now()) / 60000);
      return reply.status(423).send({
        error: `Account temporarily locked. Try again in ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}, or reset your password.`,
      });
    }
```

After the upsert that locks the account (inside the `if (!valid)` block), add an audit log entry when lockout triggers:

```typescript
      // If account just got locked (attempt_count reached 10), log it
      const updatedLockout = await fastify.db.query<{ locked_until: string | null }>(
        "SELECT locked_until FROM login_attempts WHERE user_id = $1",
        [user.id]
      );
      if (updatedLockout[0]?.locked_until && new Date(updatedLockout[0].locked_until) > new Date()) {
        await writeAuditLog(fastify.db, {
          tenantId: user.tenant_id,
          actorUserId: user.id,
          actionType: "auth.account_locked",
          objectType: "user",
          objectId: user.id,
          details: { reason: "too_many_failed_attempts", lockedUntil: updatedLockout[0].locked_until },
        });
      }
```

After password verification fails, record the attempt:

```typescript
    if (!valid) {
      // Record failed attempt
      await fastify.db.query(
        `INSERT INTO login_attempts (user_id, attempt_count, last_attempt_at)
         VALUES ($1, 1, NOW())
         ON CONFLICT (user_id)
         DO UPDATE SET
           attempt_count = login_attempts.attempt_count + 1,
           last_attempt_at = NOW(),
           locked_until = CASE
             WHEN login_attempts.attempt_count + 1 >= 10
             THEN NOW() + INTERVAL '30 minutes'
             ELSE login_attempts.locked_until
           END`,
        [user.id]
      );
      return reply.unauthorized("Invalid credentials.");
    }

    // Successful login — reset attempt counter
    await fastify.db.query(
      "DELETE FROM login_attempts WHERE user_id = $1",
      [user.id]
    );
```

- [ ] **Step 2: Build and verify**

Run: `cd apps/api && npm run build`

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/v1/auth.ts
git commit -m "feat(auth): add per-account lockout after 10 failed attempts"
```

---

### Task 21: CSRF double-submit cookie

**Files:**
- Modify: `apps/web/src/lib/auth.ts` (add CSRF token to session)
- Modify: `apps/web/src/middleware.ts` (set CSRF cookie, validate on mutations)

- [ ] **Step 1: Add CSRF token generation to session creation**

In `apps/web/src/lib/auth.ts`, update `createSessionToken` to include a CSRF token:

Add import: `import { randomBytes } from "node:crypto";` (or use `crypto.randomUUID()`)

Update `createSessionToken`:
```typescript
export async function createSessionToken(session: AppSession): Promise<string> {
  const csrfToken = crypto.randomUUID();
  const payload: SessionJwtPayload = {
    sub: session.userId,
    email: session.email,
    tenantId: session.tenantId,
    role: session.role,
    apiAccessToken: session.apiAccessToken,
    apiRefreshToken: session.apiRefreshToken,
    authMode: session.authMode,
    csrfToken,
  };

  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECS}s`)
    .sign(getSecret());
}
```

Also add `csrfToken` to `SessionJwtPayload` and `AppSession` interfaces.

- [ ] **Step 2: Set CSRF cookie in middleware**

In `apps/web/src/middleware.ts`, after successful JWT verification, set the `larry_csrf` cookie (non-httpOnly so JS can read it):

```typescript
    // Set CSRF cookie (readable by frontend JS)
    const csrfToken = payload.csrfToken as string | undefined;
    if (csrfToken) {
      res.cookies.set({
        name: "larry_csrf",
        value: csrfToken,
        httpOnly: false, // Must be readable by frontend JS
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
      });
    }
```

- [ ] **Step 3: Build and verify**

Run: `cd apps/web && npm run build`

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/auth.ts apps/web/src/middleware.ts
git commit -m "feat(auth): add CSRF double-submit cookie"
```

---

### Task 22: Suspicious login notifications

**Files:**
- Modify: `apps/api/src/routes/v1/auth.ts` (add device check after login)

- [ ] **Step 1: Add new-device detection to login**

In the `/login` route handler, after successful login and token issuance (before `return reply.send`), add:

```typescript
    // Check for new device — send alert if IP+UA combo is new
    const ip = request.ip;
    const ua = request.headers["user-agent"] ?? "unknown";

    try {
      const recentSessions = await fastify.db.query<{ ip_address: string | null; user_agent: string | null }>(
        `SELECT ip_address, user_agent FROM refresh_tokens
         WHERE user_id = $1 AND tenant_id = $2 AND created_at > NOW() - INTERVAL '30 days'
         ORDER BY created_at DESC LIMIT 50`,
        [user.id, user.tenant_id]
      );

      const isKnownDevice = recentSessions.some(
        (s) => s.ip_address === ip && s.user_agent === ua
      );

      if (!isKnownDevice && recentSessions.length > 0) {
        // Parse user agent for human-readable device info
        const uaShort = ua.length > 100 ? ua.substring(0, 100) + "..." : ua;
        const { sendNewDeviceAlert } = await import("../../lib/email.js");
        await sendNewDeviceAlert(user.email, uaShort).catch(() => {});
      }
    } catch {
      // Non-fatal — don't block login
    }
```

- [ ] **Step 2: Update issueRefreshToken calls in login to pass IP/UA**

Update the `issueRefreshToken` call in the login route:
```typescript
    const refreshToken = await issueRefreshToken(fastify, {
      userId: user.id,
      tenantId: user.tenant_id,
      role: user.role,
      email: user.email,
    }, undefined, {
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"] ?? undefined,
    });
```

- [ ] **Step 3: Build and verify**

Run: `cd apps/api && npm run build`

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/v1/auth.ts
git commit -m "feat(auth): add suspicious login notifications and IP/UA tracking"
```

---

## Final Task 23: Integration verification

- [ ] **Step 1: Full build — API**

Run: `cd apps/api && npm run build`
Expected: Clean build, no errors.

- [ ] **Step 2: Full build — Web**

Run: `cd apps/web && npm run build`
Expected: Clean build, no errors.

- [ ] **Step 3: Verify all migrations are sequential**

Run: `ls packages/db/src/migrations/`
Expected: Files `010` through `018` present in order.

- [ ] **Step 4: Run the app locally and test**

Start both API and web servers. Manually test:
1. Login with email/password still works
2. Forgot password link appears on login page
3. Security headers appear in browser dev tools (Network tab)
4. Dev-login route returns 403 when `ALLOW_DEV_AUTH_BYPASS` is not `"true"`

- [ ] **Step 5: Final commit — tag the milestone**

```bash
git tag v0.2.0-auth-production
```
