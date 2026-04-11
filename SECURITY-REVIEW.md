# Larry PM Tool - Security Review

**Date:** 2026-04-06
**Scope:** Full monorepo (`apps/api`, `apps/web`, `apps/worker`, `packages/*`)
**Type:** Rapid triage - "vibecoder" security review

---

## Executive Summary

Larry is a multi-tenant SaaS PM tool with a Fastify API, Next.js frontend, and BullMQ worker. The codebase shows solid fundamentals (parameterized SQL, Zod validation, bcrypt hashing, JWT auth) but has **several high-severity issues** typical of fast-moving startups: an unauthenticated admin page, a dev auth bypass active by default, a workspace-proxy that silently escalates to a service account, plaintext OAuth tokens in the database, a hardcoded session secret fallback, and missing authorization on settings routes.

**Critical:** 5 | **High:** 11 | **Medium:** 11 | **Low:** 5

---

## CRITICAL

### C0. JWT Secrets Committed to GitHub in .env.example

**File:** `apps/api/.env.example:9-13` (git-tracked, pushed to `github.com/Loouuiis/larry-site`)

```
JWT_ACCESS_SECRET=6I7Pfuh21MxiEtGgMeY3SRJ1dbncQonD
JWT_REFRESH_SECRET=liFGHhrgMGmLBQit2TnTkoumWAMwIJ56
```

**Impact:** These are the **real JWT signing secrets** used in `apps/api/.env` and `apps/worker/.env`. They are committed in the `.env.example` file which IS tracked by git and pushed to GitHub. **Anyone who can read the repository can forge access tokens for any user, any tenant, any role.** This completely bypasses all authentication.

**Attack scenario:** An attacker reads the `.env.example` on GitHub, crafts a JWT with `{ userId: "<any>", tenantId: "<any>", role: "admin" }`, signs it with the known secret, and sends it as `Authorization: Bearer <token>`. Full admin access to all data in every tenant.

**Remediation (IMMEDIATE):**
1. **Rotate both JWT secrets NOW** - generate new ones: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Replace real values in `.env.example` with placeholders: `JWT_ACCESS_SECRET=<generate-a-64-char-hex-secret>`
3. Purge from git history using `git filter-repo` or BFG Repo Cleaner, then force-push
4. Invalidate all existing sessions by redeploying with new secrets
5. Rotate the commented-out Neon DB password (`npg_O8TnGbJz7XoP`) visible in the `.env` files

---

### C1. Admin Page Has Zero Authentication

**File:** `apps/web/src/app/admin/page.tsx`

```typescript
export default async function AdminPage() {
  const db = getDb();
  // No session check. No auth. No redirect.
  // Directly queries and renders all waitlist + founder contact data.
```

**Impact:** The `/admin` route renders the full waitlist (names, companies, emails, phone numbers) and all founder contact messages with **no authentication whatsoever**. Anyone who navigates to `/admin` gets unrestricted read access to all user PII.

The Next.js middleware (`apps/web/src/middleware.ts:60-62`) only protects `/dashboard/:path*` and `/workspace/:path*`. The `/admin` path is not in the matcher, so session validation never runs.

```typescript
export const config = {
  matcher: ["/dashboard/:path*", "/workspace/:path*"],
  // /admin is NOT listed — completely unprotected
};
```

**Remediation:**
1. Add `getSession()` check at the top of `AdminPage` with redirect to `/login` if unauthenticated.
2. Add role check: `if (session.role !== "admin") redirect("/workspace")`.
3. Add `/admin/:path*` to the middleware matcher.

---

### C2. Dev-Login Bypass Active Unless Explicitly Disabled

**File:** `apps/web/src/app/api/auth/dev-login/route.ts:4-6`

```typescript
const allowed =
  process.env.ALLOW_DEV_AUTH_BYPASS === "true" ||
  process.env.NODE_ENV !== "production";
```

**Impact:** Anyone who can reach the Next.js server can `POST /api/auth/dev-login` and get a fully authenticated session cookie - no password needed. This is active by default because `NODE_ENV` defaults to `"development"`.

**Attack scenario:** If the web app is deployed without explicitly setting `NODE_ENV=production` (common in staging, preview deployments, or misconfigured Docker), any attacker can authenticate as any user by hitting this endpoint.

**Remediation:**
- Invert the logic: require an explicit opt-in (`ALLOW_DEV_AUTH_BYPASS=true`) rather than opt-out.
- Remove the `NODE_ENV` fallback entirely.
- Add a startup guard that refuses to boot if dev-login is enabled alongside a production-like config.

```typescript
// FIX: explicit opt-in only
const allowed = process.env.ALLOW_DEV_AUTH_BYPASS === "true";
```

---

### C3. Hardcoded Session Secret Fallback in Non-Production

**File:** `apps/web/src/lib/session-secret.ts:5`

```typescript
const DEV_SESSION_SECRET = "larry-dev-session-secret-change-me-before-production-32+";
```

**Impact:** If `SESSION_SECRET` is not set and `NODE_ENV !== "production"`, the web app uses this hardcoded, publicly-visible secret to sign all session JWTs. Anyone who reads this source code can forge arbitrary session cookies, impersonate any user, and escalate to admin.

**Attack scenario:** Combined with C1 - even if dev-login is disabled, an attacker who knows this secret can craft a valid session JWT with `{ sub: "<admin-user-id>", role: "admin", tenantId: "<target>" }` and access any tenant's data.

**Remediation:**
- Remove the hardcoded fallback entirely. Require `SESSION_SECRET` in all environments.
- At minimum, generate a random secret at startup in dev mode (so it changes per restart and isn't predictable).

```typescript
// FIX: no hardcoded fallback
export function getSessionSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET env var must be set (min 32 chars).");
  }
  return new TextEncoder().encode(secret);
}
```

---

### C4. Workspace-Proxy Silently Escalates to Service Account on 401

**File:** `apps/web/src/lib/workspace-proxy.ts:272-289`

```typescript
// If still 401 (refresh failed or refreshed token rejected), fall back to
// service credentials so the user isn't locked out by a stale session.
if (response.status === 401) {
  const serviceLogin = await loginWithServiceCredentials(baseUrl);
  if (serviceLogin.session?.apiAccessToken) {
    activeSession = serviceLogin.session;
    response = await perform(serviceLogin.session.apiAccessToken);
  }
}
```

**Impact:** When a user's token expires and refresh fails, the proxy silently re-authenticates using `LARRY_API_EMAIL`/`LARRY_API_PASSWORD` from server env vars, then **continues the request as the service account** and re-issues that identity to the user's session. This means:

1. A user whose session expired doesn't get redirected to login - they silently become the service account.
2. If token refresh is broken for any reason, ALL users silently elevate to the service account identity.
3. The service account's tenant membership and role are inherited by the requesting user.

**Remediation:** When token refresh fails, return 401 to the client and force re-login. Never fall back to a shared service identity:

```typescript
if (response.status === 401) {
  return { status: 401, body: { error: "Session expired. Please log in again." }, session: null };
}
```

---

## HIGH

### H1. Session JWT Embeds Raw API Access + Refresh Tokens

**File:** `apps/web/src/lib/auth.ts:50-65`

```typescript
const payload: SessionJwtPayload = {
  sub: session.userId,
  apiAccessToken: session.apiAccessToken,    // <-- embedded in cookie
  apiRefreshToken: session.apiRefreshToken,  // <-- embedded in cookie
  ...
};
```

**Impact:** The Next.js session cookie contains the raw Fastify API access token AND refresh token. If an attacker extracts the cookie (via XSS, log exposure, or browser extension), they get direct API access that survives session invalidation. The refresh token allows indefinite access until explicitly revoked.

**Remediation:**
- Store API tokens server-side (e.g., in Redis or an encrypted server-side session store) keyed by session ID.
- The cookie should only contain a session reference, not the actual API credentials.

---

### H2. OAuth Tokens Stored as Plaintext in Database

**Files:**
- `packages/db/src/schema.sql:395` - `bot_access_token TEXT NOT NULL` (Slack)
- `packages/db/src/schema.sql:426-427` - `google_access_token TEXT`, `google_refresh_token TEXT`
- `packages/db/src/schema.sql:453-454` - `outlook_access_token TEXT`, `outlook_refresh_token TEXT`
- `packages/db/src/schema.sql:475-476` - `oauth_access_token TEXT`, `oauth_refresh_token TEXT` (Gmail)

**Impact:** A database breach (SQL injection elsewhere, backup leak, compromised admin credentials) exposes all connected third-party tokens. An attacker could read Slack messages, calendar events, and emails for every connected tenant.

**Remediation:**
- Encrypt tokens at rest using an application-level encryption key (AES-256-GCM).
- Store the encryption key in a secrets manager (AWS KMS, GCP Secret Manager), not in env vars.
- Implement key rotation support.

---

### H3. Admin Secret Comparison Vulnerable to Timing Attack

**File:** `apps/api/src/routes/v1/orgs.ts:50`

```typescript
if (!providedSecret || providedSecret !== expectedSecret) {
```

**Impact:** String comparison with `!==` leaks information about the secret length and character-by-character match timing. An attacker can brute-force the `ADMIN_SECRET` character by character by measuring response times.

**Note:** The Slack signature verification correctly uses `timingSafeEqual` (`apps/api/src/services/connectors/slack.ts:122`), showing the team knows about this - it was just missed here.

**Remediation:**

```typescript
import { timingSafeEqual } from "node:crypto";

function ensureAdminSecret(fastify, request) {
  const expected = fastify.config.ADMIN_SECRET;
  if (!expected) throw fastify.httpErrors.serviceUnavailable("ADMIN_SECRET not configured.");

  const provided = readAdminSecret(request);
  if (!provided) throw fastify.httpErrors.unauthorized("Admin secret required.");

  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw fastify.httpErrors.unauthorized("Invalid admin secret.");
  }
}
```

---

### H4. Tenant Context Can Be Spoofed via x-tenant-id Header

**File:** `apps/api/src/plugins/request-context.ts:10-12`

```typescript
const tenantHeader = request.headers["x-tenant-id"];
if (typeof tenantHeader === "string" && tenantHeader.length > 0) {
  return tenantHeader;
}
```

**Impact:** The `resolveTenantId` function first checks the JWT, then falls back to the `x-tenant-id` header. If a user has a valid JWT for tenant A, the tenant ID from the JWT is used. However, for endpoints where authentication runs but the JWT doesn't contain a tenantId (edge cases), an attacker could inject a different tenant via the header.

More critically, when `REQUIRE_TENANT_HEADER` is `false` (the default), the system creates an anonymous context with `role: "member"` for requests that hit the preHandler but somehow bypass `fastify.authenticate`:

```typescript
request.context = {
  tenantId: "__dev_no_tenant__",
  user: user ?? { userId: "anonymous", tenantId: "__dev_no_tenant__", role: "member" },
};
```

**Remediation:**
- After authentication, ALWAYS use the tenant ID from the JWT. Never fall back to headers for authenticated routes.
- Set `REQUIRE_TENANT_HEADER=true` in all non-local environments.
- Remove the anonymous fallback user entirely - if there's no authenticated user, reject the request.

---

### H5. No Rate Limiting on Login Endpoint

**File:** `apps/api/src/routes/v1/auth.ts:18`

The `/v1/auth/login` and `/v1/auth/refresh` endpoints have no rate limiting configured. Rate limiting is opt-in (`global: false` in `app.ts:27`), and these auth routes don't opt in.

**Impact:** Credential stuffing and brute-force attacks against user accounts with no throttling.

**Comparison:** The org request endpoint correctly applies rate limiting (`5/hour/IP`), and transcript ingestion has `10/min/tenant` - but the login endpoint, the most attacked surface, has nothing.

**Remediation:**

```typescript
fastify.post("/login", {
  config: {
    rateLimit: {
      max: 10,
      timeWindow: "15 minutes",
      keyGenerator: (req) => req.ip,
    }
  }
}, async (request, reply) => { ... });
```

Also add rate limiting to `/refresh` (e.g., 30/hour/IP).

---

### H6. Settings/Rules Routes Have No Role Guards

**File:** `apps/api/src/routes/v1/settings.ts:211-214`

```typescript
fastify.post(
  "/rules",
  { preHandler: [fastify.authenticate] },  // No requireRole!
  async (request, reply) => { ... }
);
```

The `POST /v1/settings/rules`, `PATCH /v1/settings/rules/:id`, and `DELETE /v1/settings/rules/:id` routes only require `fastify.authenticate` with no role check. Any tenant member (including `executive` or `member` roles) can create, edit, or soft-delete Larry rules that govern AI behavior across the entire workspace.

Additionally, `PATCH /v1/settings/policy` uses a manual `if (request.user.role !== "admin")` check instead of the standard `requireRole` middleware, which is inconsistent with the rest of the codebase.

**Remediation:** Apply `fastify.requireRole(["admin", "pm"])` to all settings write routes.

---

### H7. Org Approval Returns Cleartext Password in HTTP Response

**File:** `apps/api/src/routes/v1/orgs.ts:283-288`

```typescript
return reply.code(201).send({
  requestId: params.id,
  ...result,
  tempPassword,   // <-- cleartext password in API response body
  status: "approved",
});
```

**Impact:** The generated temporary password appears in API logs (Fastify at trace level), any API gateway logs, browser network inspector history, and any monitoring that captures response bodies. If `ADMIN_SECRET` is compromised (see H3), an attacker can provision tenants and harvest cleartext credentials.

**Remediation:** Send the `tempPassword` via email to `requesterEmail` instead of in the response body. If manual delivery is intentional, suppress response body logging for this route.

---

### H8. Next.js Middleware Only Covers Two Path Prefixes

**File:** `apps/web/src/middleware.ts:60-62`

```typescript
export const config = {
  matcher: ["/dashboard/:path*", "/workspace/:path*"],
};
```

The session validation middleware only runs on `/dashboard` and `/workspace` paths. All `/api/workspace/*` routes, `/admin/*` pages, and any future routes are NOT covered. Security depends entirely on each individual route handler calling `getSession()` - by convention, not enforcement. A single forgotten session check in a new route = unauthenticated access.

**Remediation:** Expand the matcher to cover all protected paths:

```typescript
export const config = {
  matcher: ["/dashboard/:path*", "/workspace/:path*", "/admin/:path*", "/api/workspace/:path*"],
};
```

---

### H9. fast-jwt Critical CVE — JWT Algorithm Confusion

**Package:** `fast-jwt@6.1.0` (dependency of `@fastify/jwt@10.0.0`)
**CVE:** GHSA-mvf2-f6gm-w987 (CVSS 9.1) — Incomplete fix for CVE-2023-48223

**Impact:** JWT algorithm confusion via whitespace-prefixed RSA public key. While Larry uses HMAC secrets (reducing RSA-specific risk), the advisory also covers acceptance of unknown `crit` header extensions. `npm audit` reports this as **critical with no fix currently available**.

**Remediation:** Monitor `@fastify/jwt` releases. As a short-term mitigation, explicitly validate the `alg` header in JWT verification and reject anything other than `HS256`.

---

### H10. Document Download Serves MIME Type from Database (Stored XSS Vector)

**File:** `apps/api/src/routes/v1/documents.ts:576-580`

```typescript
const mimeType =
  typeof metadataRecord.mimeType === "string" && metadataRecord.mimeType.length > 0
    ? metadataRecord.mimeType
    : MIME_TYPE_BY_FORMAT[document.docType] ?? "application/octet-stream";
reply.header("Content-Type", mimeType);
```

**Impact:** The `Content-Type` header is read directly from the `metadata` JSONB column. If a compromised account writes `mimeType: "text/html"` in metadata, the download endpoint serves arbitrary HTML — enabling stored XSS.

**Remediation:** Use an allowlist of safe MIME types. Add `X-Content-Type-Options: nosniff` header.

---

### H11. No HTTP Security Headers

Neither the Fastify API nor Next.js sets security headers:
- No `X-Content-Type-Options: nosniff`
- No `X-Frame-Options: DENY`
- No `Strict-Transport-Security`
- No `Content-Security-Policy`
- No `Referrer-Policy`

`next.config.ts` only sets `poweredByHeader: false`. Fastify has no `@fastify/helmet`.

**Remediation:** Add `@fastify/helmet` to the API. Add a `headers()` export in `next.config.ts` for the web app.

---

## MEDIUM

### M1. Slack Bot Access Token Exposed via API Response Pattern

**File:** `apps/api/src/routes/v1/connectors-slack.ts:341-349`

```typescript
const rows = await fastify.db.queryTenant<{ bot_access_token: string }>(
  tenantId,
  `SELECT bot_access_token FROM slack_installations WHERE tenant_id = $1 ...`,
  [tenantId]
);
const channels = await listSlackChannels(rows[0].bot_access_token);
```

The bot token is fetched and used server-side (correct), but any member-role user can trigger this endpoint. While the token isn't directly returned, the broad access means any tenant member can exercise the Slack bot's permissions.

**Remediation:** Restrict the `/channels` endpoint to `admin` or `pm` roles.

---

### M2. Session Cookie Not Marked `secure` in Development

**File:** `apps/web/src/lib/auth.ts:104`

```typescript
secure: process.env.NODE_ENV === "production",
```

In non-production environments, the session cookie is sent over plain HTTP, making it interceptable on shared networks (coffee shops, hotel wifi).

**Remediation:** Default `secure: true` and only disable it when explicitly running on `localhost`.

---

### M3. No Account Lockout After Failed Login Attempts

**File:** `apps/api/src/routes/v1/auth.ts:44-51`

Failed logins return `401 Unauthorized` but don't track attempts or lock accounts. Combined with H5 (no rate limiting), this allows unlimited password guessing.

**Remediation:**
- Track failed attempts per email+tenant in Redis.
- After 5 failures, require a CAPTCHA or enforce a 15-minute cooldown.
- Log failed attempts to `audit_logs` (currently only successful logins are logged).

---

### M4. CORS Origin from Environment Without Validation

**File:** `apps/api/src/app.ts:30-33`

```typescript
await app.register(cors, {
  origin: env.CORS_ORIGINS.split(",").map((origin) => origin.trim()),
  credentials: true,
});
```

The CORS origin is split from a comma-separated string. If `CORS_ORIGINS` is set to `*` or a broad pattern, credentials will be sent cross-origin. The default (`http://localhost:3000`) is safe, but there's no validation that the origins are actually valid URLs.

**Remediation:** Validate each origin is a well-formed URL. Reject wildcards when `credentials: true`.

---

### M5. Logout Does Not Revoke Refresh Tokens

**File:** `apps/api/src/routes/v1/auth.ts:201-218`

```typescript
fastify.post("/logout", { preHandler: [fastify.authenticate] }, async (request) => {
  // Only writes audit log, doesn't revoke refresh tokens
  await writeAuditLog(...);
  return { success: true };
});
```

**Impact:** After logout, the user's refresh tokens remain valid in the database. A stolen refresh token continues to work even after the user "logs out."

**Remediation:** Revoke all active refresh tokens for the user+tenant on logout:

```typescript
await fastify.db.query(
  "UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND tenant_id = $2 AND revoked_at IS NULL",
  [request.user.userId, request.user.tenantId]
);
```

---

### M6. Reporting Routes Missing Project Membership Checks (Intra-Tenant IDOR)

**Files:** Multiple routes in `apps/api/src/routes/v1/`

The following project-scoped GET routes only check `tenantId` but NOT project membership:
- `GET /v1/projects/:id/timeline`
- `GET /v1/projects/:id/health`
- `GET /v1/projects/:id/outcomes`
- `GET /v1/projects/:id/weekly-summary`
- `GET /v1/projects/:id/task-breakdown`
- `GET /v1/projects/:id/status-history`

Any authenticated tenant member can read the health, timeline, and reporting data of **any project** in their tenant, regardless of whether they are a project collaborator. Cross-tenant access is prevented by `queryTenant`, but within a tenant the project-level access model is bypassed.

By contrast, `GET /v1/documents/` and `GET /v1/larry/action-centre` correctly call `assertProjectReadAccessOrThrow`.

**Remediation:** Add `getProjectMembershipAccess` checks to all project-scoped reporting endpoints.

---

### M7. Notification Mark-as-Read Has No Ownership Check

**File:** `apps/api/src/routes/v1/notifications.ts`

```sql
UPDATE notifications SET read_at = NOW() WHERE tenant_id = $1 AND id = $2
```

No `AND user_id = $3` constraint. Any authenticated tenant member can mark any other member's notification as read by knowing the notification UUID.

**Remediation:** Add `AND user_id = $3` to the UPDATE query.

---

### M8. Dynamic Table Name Interpolated in SQL

**File:** `apps/api/src/routes/v1/projects.ts:410-421`

```typescript
async function deleteAndCount(tableName: string): Promise<number> {
  const rows = await client.query<{ row_count: number }>(
    `WITH deleted AS (
       DELETE FROM ${tableName}    // <-- string interpolation in SQL
       WHERE tenant_id = $1 AND project_id = $2
       RETURNING id
     ) SELECT COUNT(*)::int AS row_count FROM deleted`,
    [tenantId, params.id]
  );
```

Currently only called with hardcoded table names (`"meeting_notes"`, `"documents"`, etc.), so not exploitable today. But the function signature accepts any `string` — if a future refactor passes user input through this function, it's instant SQL injection.

Similarly, `projectStatusSql()` in `apps/api/src/lib/project-status.ts` interpolates column names into SQL CASE expressions.

**Remediation:** Use a strict allowlist type:

```typescript
const PURGEABLE_TABLES = ["meeting_notes", "documents", "email_outbound_drafts", "larry_conversations"] as const;
type PurgeableTable = typeof PURGEABLE_TABLES[number];
```

---

### M9. Email Webhook Secret Uses Non-Constant-Time Comparison

**File:** `apps/api/src/routes/v1/connectors-email.ts:426`

```typescript
if (!inboundSecret || inboundSecret !== installation.webhookSecret) {
```

Same timing attack vulnerability as H3 (admin secret), but for email inbound webhooks.

**Remediation:** Use `timingSafeEqual` as with the Slack connector.

---

### M10. Docker Containers Run as Root

**Files:** `apps/api/Dockerfile`, `apps/worker/Dockerfile`

Both use `FROM node:20-alpine` with no `USER` directive. All processes run as root (UID 0). A container escape gives immediate host root.

**Remediation:** Add before `CMD`:
```dockerfile
RUN addgroup -S larry && adduser -S larry -G larry
USER larry
```

---

### M11. Docker Compose Exposes Postgres/Redis on 0.0.0.0

**File:** `docker-compose.yml`

```yaml
ports:
  - "5432:5432"   # Postgres accessible from any network interface
  - "6379:6379"   # Redis accessible from any network interface
```

**Remediation:** Bind to localhost: `"127.0.0.1:5432:5432"` and `"127.0.0.1:6379:6379"`.

---

## LOW

### L1. Seed Credentials Use Weak Passwords

**Memory reference:** Seed users use `DevPass123!` - if the seed runs in a staging/preview environment, these credentials are trivially guessable.

**Remediation:** Use random passwords in seed scripts for non-local environments, or gate seed execution behind a `NODE_ENV=development` check.

---

### L2. Error Detail Leaks in Development Mode

**File:** `apps/api/src/routes/v1/connectors-slack.ts:152-154`

```typescript
if (fastify.config.NODE_ENV === "development") {
  throw fastify.httpErrors.badRequest(`Invalid or expired Slack OAuth state (${reason}).`);
}
```

Conditional error detail based on `NODE_ENV` is a good pattern but inconsistently applied. Some errors elsewhere include internal details regardless of environment.

**Remediation:** Standardize error handling: never include internal reasons in HTTP responses. Log them server-side instead.

---

### L3. In-Memory Rate Limiting Won't Scale

**File:** `apps/api/src/app.ts:27-29`

```typescript
await app.register(rateLimit, {
  global: false,
  redis: undefined, // in-memory store is fine for MVP demo
});
```

In-memory rate limiting is per-process. If the API scales to multiple instances, rate limits won't be shared.

**Remediation:** Switch to Redis-backed rate limiting before scaling horizontally.

---

### L4. Unvalidated Request Body on Larry Event Dismiss

**File:** `apps/api/src/routes/v1/larry.ts`

```typescript
const body = (request.body ?? {}) as { reason?: string };
```

The dismiss endpoint casts the body without Zod validation. If `reason` is an object or array instead of a string, it could cause unexpected behavior when stored in the database.

**Remediation:** Parse through Zod: `z.object({ reason: z.string().max(1000).optional() }).parse(request.body ?? {})`

---

### L5. console.error Bypasses Structured Logger

**File:** `apps/api/src/services/larry-briefing.ts:181`

```typescript
console.error("[larry-briefing] Project intelligence failed:", outcome.reason);
```

The rest of the API uses Pino structured logging. This `console.error` bypasses the log aggregation pipeline and could accidentally serialize sensitive `Error` objects with stack traces.

**Remediation:** Replace with `fastify.log.error(...)`.

---

## Positive Findings (What's Done Right)

| Area | Assessment |
|------|------------|
| **SQL injection** | All queries use parameterized `$1, $2...` placeholders via `pg`. No string concatenation in SQL. |
| **Input validation** | Zod schemas on every route with `.parse()`. UUIDs, emails, enums all validated. |
| **Password hashing** | bcryptjs with 12 salt rounds - industry standard. |
| **JWT implementation** | Access tokens expire in 15m, refresh tokens hashed with SHA-256, rotation on refresh. |
| **XSS prevention** | No `dangerouslySetInnerHTML` anywhere in the React codebase. |
| **Slack signature verification** | Uses `timingSafeEqual` correctly. |
| **Audit logging** | Comprehensive logging of auth events, data mutations, and connector actions. |
| **Tenant isolation** | `queryTenant()` sets PostgreSQL `app.tenant_id` config in transactions. |
| **CSRF protection** | Session cookies use `sameSite: "lax"` and `httpOnly: true`. |
| **Secrets in git** | `.env` files properly gitignored. Only `.env.example` files tracked. |
| **Zod env validation** | Server refuses to boot with missing/invalid config. JWT secrets require min 32 chars. |
| **OAuth state tokens** | Slack/Google OAuth use signed, time-limited state tokens with nonce. |
| **Command injection** | No `exec()`, `spawn()`, or shell command construction from user input. |

---

## Priority Remediation Roadmap

### STOP EVERYTHING (do this right now) - 30 min

| # | Finding | Fix |
|---|---------|-----|
| 0 | **C0** JWT secrets on GitHub | Rotate secrets, replace with placeholders in `.env.example`, purge git history, force-push |

### Immediate (before any deployment) - ~2 hours

| # | Finding | Fix |
|---|---------|-----|
| 1 | **C1** Admin page unauthenticated | Add `getSession()` check + `/admin` to middleware matcher |
| 2 | **C2** Dev-login bypass default-on | Change to explicit opt-in: `ALLOW_DEV_AUTH_BYPASS === "true"` only |
| 3 | **C3** Hardcoded session secret | Remove fallback; require `SESSION_SECRET` in all environments |
| 4 | **C4** Workspace-proxy service escalation | Return 401 on refresh failure instead of falling back to service account |
| 5 | **H5** No rate limit on login | Add `rateLimit` config to `POST /login` and `POST /refresh` |
| 6 | **H8** Middleware only covers 2 paths | Expand matcher to include `/admin`, `/api/workspace` |
| 7 | **H11** No security headers | Add `@fastify/helmet` and Next.js `headers()` config |

### Before public launch - ~1 day

| # | Finding | Fix |
|---|---------|-----|
| 8 | **H3** Admin secret timing attack | Use `timingSafeEqual` from `node:crypto` |
| 9 | **H6** Settings routes no role guard | Add `requireRole(["admin", "pm"])` to rules write routes |
| 10 | **H7** Cleartext password in response | Send `tempPassword` via email, not response body |
| 11 | **H9** fast-jwt CVE | Monitor for patch; explicitly validate `alg: HS256` |
| 12 | **H10** Download MIME from DB | Allowlist safe MIME types + `X-Content-Type-Options: nosniff` |
| 13 | **H1** API tokens in session cookie | Move to server-side session store (Redis) |
| 14 | **H4** Tenant ID header spoofing | Always use JWT tenantId for authenticated routes |
| 15 | **M5** Logout doesn't revoke tokens | Revoke refresh tokens on logout |
| 16 | **M3** No account lockout | Track failed attempts in Redis, lock after 5 |
| 17 | **M6** Reporting routes IDOR | Add project membership checks |
| 18 | **M7** Notification ownership | Add `user_id` filter to mark-as-read |
| 19 | **M8** Dynamic table name in SQL | Use strict TypeScript union type allowlist |
| 20 | **M9** Email webhook timing attack | Use `timingSafeEqual` |

### Before enterprise/compliance - ~1 week

| # | Finding | Fix |
|---|---------|-----|
| 21 | **H2** Plaintext OAuth tokens | Encrypt at rest with AES-256-GCM + secrets manager |
| 22 | **M4** CORS origin validation | Validate as URLs in Zod schema; reject wildcards with credentials |
| 23 | **M2** Cookie `secure` flag | Default `secure: true`; only disable for localhost |
| 24 | **M10** Docker runs as root | Add non-root `USER` directive to Dockerfiles |
| 25 | **M11** Docker exposes DB/Redis | Bind ports to `127.0.0.1` only |
| 26 | **L3** In-memory rate limiting | Switch to Redis-backed store |
| 27 | Run `npm audit fix` | Address `fast-jwt`, `brace-expansion`, transitive CVEs |

---

## Route Authorization Matrix

For reference, every Fastify API route and its auth status:

| Route | Auth | Role Guard | Ownership | Status |
|-------|------|-----------|-----------|--------|
| `POST /v1/auth/login` | None | None | N/A | **No rate limit** |
| `POST /v1/auth/refresh` | None | None | N/A | **No rate limit** |
| `GET /v1/auth/me` | JWT | None | Self | OK |
| `GET /v1/auth/members` | JWT | None | Tenant | OK |
| `POST /v1/auth/logout` | JWT | None | Self | **No token revocation** |
| `GET /v1/projects/` | JWT | None | Tenant | OK |
| `POST /v1/projects/` | JWT | admin,pm | Tenant | OK |
| `GET /v1/projects/:id/timeline` | JWT | None | Tenant only | **IDOR within tenant** |
| `GET /v1/projects/:id/health` | JWT | None | Tenant only | **IDOR within tenant** |
| `GET /v1/projects/:id/members` | JWT | admin,pm,member | Project membership | OK |
| `POST /v1/projects/:id/delete` | JWT | admin,pm | Owner check | OK |
| `GET /v1/tasks/` | JWT | None | Tenant | OK |
| `POST /v1/tasks/` | JWT | admin,pm,member | Tenant | OK |
| `GET /v1/documents/` | JWT | admin,pm,member | Project membership | OK |
| `GET /v1/documents/:id/download` | JWT | admin,pm,member | Project read | OK |
| `POST /v1/ingest/*` | JWT | admin,pm,member | Tenant | OK |
| `POST /v1/connectors/slack/events` | Slack sig | N/A | Slack verification | OK |
| `GET /v1/settings/policy` | JWT | None | Tenant | OK |
| `PATCH /v1/settings/policy` | JWT | Manual admin | Tenant | **Inconsistent** |
| `POST /v1/settings/rules` | JWT | **None** | Tenant | **Missing role guard** |
| `PATCH /v1/settings/rules/:id` | JWT | **None** | Tenant | **Missing role guard** |
| `DELETE /v1/settings/rules/:id` | JWT | **None** | Tenant | **Missing role guard** |
| `POST /v1/notifications/:id/read` | JWT | None | Tenant only | **No ownership check** |
| `GET /v1/admin/orgs/requests` | Admin secret | N/A | Secret | **Timing-unsafe** |
| `POST /v1/admin/orgs/:id/approve` | Admin secret | N/A | Secret | **Timing-unsafe + cleartext pw** |

---

*Review performed by Claude Opus 4.6. This is a rapid triage, not a formal penetration test. A full security audit should include dynamic testing, dependency CVE scanning (`npm audit`), and infrastructure review.*
