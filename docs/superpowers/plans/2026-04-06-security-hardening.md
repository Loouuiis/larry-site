# Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Patch all critical and high-severity security vulnerabilities identified in `SECURITY-REVIEW.md`, plus medium-severity auth/data fixes.

**Architecture:** Targeted single-file patches across the monorepo. No new packages, no schema migrations, no architectural redesigns. Every change is a surgical edit to an existing file.

**Tech Stack:** Fastify 5, Next.js 16, TypeScript, node:crypto, @fastify/helmet, Zod

**Spec:** `SECURITY-REVIEW.md` (root of repo)

---

## File Map

| File | Changes |
|------|---------|
| `apps/web/src/app/admin/page.tsx` | Add session + role guard (C1) |
| `apps/web/src/middleware.ts` | Expand matcher to cover `/admin` (C1, H8) |
| `apps/web/src/app/api/auth/dev-login/route.ts` | Remove `NODE_ENV` fallback (C2) |
| `apps/web/src/lib/session-secret.ts` | Remove hardcoded dev secret fallback (C3) |
| `apps/web/src/lib/workspace-proxy.ts` | Remove service account fallback on 401 (C4) |
| `apps/api/src/routes/v1/auth.ts` | Add rate limiting to login + refresh; revoke tokens on logout (H5, M5) |
| `apps/api/src/routes/v1/orgs.ts` | Use `timingSafeEqual` for admin secret (H3) |
| `apps/api/src/routes/v1/settings.ts` | Add `requireRole` to rules write routes + policy patch (H6) |
| `apps/api/src/routes/v1/documents.ts` | MIME type allowlist + nosniff header (H10) |
| `apps/api/src/routes/v1/reporting.ts` | Add project membership checks (M6) |
| `apps/api/src/routes/v1/notifications.ts` | Add user_id ownership filter (M7) |
| `apps/api/src/routes/v1/projects.ts` | Type-safe table name allowlist (M8) |
| `apps/api/src/lib/project-status.ts` | Type-safe column name allowlist (M8) |
| `apps/api/src/routes/v1/connectors-email.ts` | Use `timingSafeEqual` (M9) |
| `apps/api/src/app.ts` | Register `@fastify/helmet` (H11) |
| `apps/web/next.config.ts` | Add security headers (H11) |
| `apps/api/src/routes/v1/larry.ts` | Add Zod validation to dismiss body (L4) |

---

## Phase 1: Critical Auth Holes

### Task 1: Add Authentication to Admin Page (C1)

**Files:**
- Modify: `apps/web/src/app/admin/page.tsx:1-30`

- [ ] **Step 1: Add session import and auth guard**

At the top of `apps/web/src/app/admin/page.tsx`, add the import and guard before any data fetching:

```typescript
import { getDb } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// ... keep existing interfaces and fmt() unchanged ...

export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/workspace");

  const db = getDb();
```

This replaces the existing first two lines of `AdminPage` (which were just `const db = getDb();`).

- [ ] **Step 2: Verify the app compiles**

Run: `cd /c/Users/oreil/Documents/larry-site && npm run web:build 2>&1 | tail -5`

Expected: Build succeeds with no type errors.

- [ ] **Step 3: Commit**

```bash
cd /c/Users/oreil/Documents/larry-site
git add apps/web/src/app/admin/page.tsx
git commit -m "security(C1): add session + role guard to admin page

Unauthenticated users are redirected to /login.
Non-admin users are redirected to /workspace."
```

---

### Task 2: Expand Middleware Matcher (C1, H8)

**Files:**
- Modify: `apps/web/src/middleware.ts:60-62`

- [ ] **Step 1: Expand the matcher array**

In `apps/web/src/middleware.ts`, replace the config export:

```typescript
export const config = {
  matcher: ["/dashboard/:path*", "/workspace/:path*", "/admin/:path*"],
};
```

- [ ] **Step 2: Verify the app compiles**

Run: `cd /c/Users/oreil/Documents/larry-site && npm run web:build 2>&1 | tail -5`

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
cd /c/Users/oreil/Documents/larry-site
git add apps/web/src/middleware.ts
git commit -m "security(C1,H8): expand middleware matcher to cover /admin paths

Session validation now runs on /admin in addition to /dashboard and /workspace."
```

---

### Task 3: Fix Dev-Login Bypass (C2)

**Files:**
- Modify: `apps/web/src/app/api/auth/dev-login/route.ts:4-6`

- [ ] **Step 1: Change the allowed guard to explicit opt-in only**

In `apps/web/src/app/api/auth/dev-login/route.ts`, replace lines 4-6:

```typescript
const allowed = process.env.ALLOW_DEV_AUTH_BYPASS === "true";
```

This removes the `|| process.env.NODE_ENV !== "production"` fallback that made the bypass active by default.

- [ ] **Step 2: Verify the app compiles**

Run: `cd /c/Users/oreil/Documents/larry-site && npm run web:build 2>&1 | tail -5`

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
cd /c/Users/oreil/Documents/larry-site
git add apps/web/src/app/api/auth/dev-login/route.ts
git commit -m "security(C2): require explicit ALLOW_DEV_AUTH_BYPASS=true for dev login

Previously active in any non-production environment by default."
```

---

### Task 4: Remove Hardcoded Session Secret (C3)

**Files:**
- Modify: `apps/web/src/lib/session-secret.ts`

- [ ] **Step 1: Replace the entire file with a strict implementation**

Replace the full content of `apps/web/src/lib/session-secret.ts`:

```typescript
// Shared JWT secret resolution — imported by both middleware.ts (Edge Runtime)
// and auth.ts (Node.js). Keep this file free of bcryptjs / next/headers imports
// so it remains edge-compatible.

export function getSessionSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET env var must be set and at least 32 characters. " +
      "Generate one with: node -e \"console.log(require('crypto').randomBytes(16).toString('hex'))\""
    );
  }
  return new TextEncoder().encode(secret);
}
```

- [ ] **Step 2: Ensure local `.env` has SESSION_SECRET set**

Check `apps/web/.env` has a real `SESSION_SECRET` value (at least 32 chars). If blank, generate and set one:

Run: `node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"`

Add the output to `apps/web/.env` as `SESSION_SECRET=<generated-value>`.

- [ ] **Step 3: Verify the app compiles**

Run: `cd /c/Users/oreil/Documents/larry-site && npm run web:build 2>&1 | tail -5`

Expected: Build succeeds. (The error only throws at runtime if the env var is missing.)

- [ ] **Step 4: Commit**

```bash
cd /c/Users/oreil/Documents/larry-site
git add apps/web/src/lib/session-secret.ts
git commit -m "security(C3): remove hardcoded dev session secret fallback

SESSION_SECRET is now required in all environments. The previously hardcoded
'larry-dev-session-secret-change-me-before-production-32+' allowed session
forgery by anyone who could read the source."
```

---

### Task 5: Remove Service Account Fallback in Workspace Proxy (C4)

**Files:**
- Modify: `apps/web/src/lib/workspace-proxy.ts:272-289`

- [ ] **Step 1: Replace the service-account fallback block**

In `apps/web/src/lib/workspace-proxy.ts`, find this block (around line 272-289):

```typescript
    // If still 401 (refresh failed or refreshed token rejected), fall back to
    // service credentials so the user isn't locked out by a stale session.
    if (response.status === 401) {
      const serviceLogin = await loginWithServiceCredentials(baseUrl);
      if (serviceLogin.session?.apiAccessToken) {
        activeSession = serviceLogin.session;
        try {
          response = await perform(serviceLogin.session.apiAccessToken);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Upstream API request failed.";
          return {
            status: 504,
            body: { error: message },
            session: activeSession,
          };
        }
      }
    }
```

Replace it with:

```typescript
    // If still 401 after refresh attempt, the session is dead — force re-login.
    // Do NOT fall back to service credentials; that silently escalates identity.
```

- [ ] **Step 2: Verify the app compiles**

Run: `cd /c/Users/oreil/Documents/larry-site && npm run web:build 2>&1 | tail -5`

Expected: Build succeeds. (`loginWithServiceCredentials` may now be unused — if the build warns about it, that's fine. If it errors on unused imports, also remove the import.)

- [ ] **Step 3: Commit**

```bash
cd /c/Users/oreil/Documents/larry-site
git add apps/web/src/lib/workspace-proxy.ts
git commit -m "security(C4): remove service account fallback on 401 in workspace proxy

Previously, when a user's token refresh failed, the proxy silently re-authenticated
as a shared service account. Now it returns 401 and forces re-login."
```

---

## Phase 2: High-Severity Hardening

### Task 6: Add Rate Limiting to Login and Refresh (H5)

**Files:**
- Modify: `apps/api/src/routes/v1/auth.ts:18` and `:88`

- [ ] **Step 1: Add rate limit config to the login route**

In `apps/api/src/routes/v1/auth.ts`, change the login route declaration (line 18) from:

```typescript
  fastify.post("/login", async (request, reply) => {
```

to:

```typescript
  fastify.post("/login", {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: "15 minutes",
        keyGenerator: (req: import("fastify").FastifyRequest) => req.ip,
      },
    },
  }, async (request, reply) => {
```

- [ ] **Step 2: Add rate limit config to the refresh route**

In the same file, change the refresh route declaration (line 88) from:

```typescript
  fastify.post("/refresh", async (request, reply) => {
```

to:

```typescript
  fastify.post("/refresh", {
    config: {
      rateLimit: {
        max: 30,
        timeWindow: "1 hour",
        keyGenerator: (req: import("fastify").FastifyRequest) => req.ip,
      },
    },
  }, async (request, reply) => {
```

- [ ] **Step 3: Verify the API compiles**

Run: `cd /c/Users/oreil/Documents/larry-site && npm run api:build 2>&1 | tail -5`

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
cd /c/Users/oreil/Documents/larry-site
git add apps/api/src/routes/v1/auth.ts
git commit -m "security(H5): add rate limiting to login (10/15min) and refresh (30/hr)"
```

---

### Task 7: Timing-Safe Admin Secret Comparison (H3)

**Files:**
- Modify: `apps/api/src/routes/v1/orgs.ts:1-53`

- [ ] **Step 1: Add crypto import and fix the comparison**

At the top of `apps/api/src/routes/v1/orgs.ts`, add the import (after the existing imports):

```typescript
import { timingSafeEqual } from "node:crypto";
```

Then replace the `ensureAdminSecret` function (lines 43-53):

```typescript
function ensureAdminSecret(fastify: FastifyInstance, request: FastifyRequest): void {
  const expectedSecret = fastify.config.ADMIN_SECRET;
  if (!expectedSecret) {
    throw fastify.httpErrors.serviceUnavailable("ADMIN_SECRET is not configured.");
  }

  const providedSecret = readAdminSecret(request);
  if (!providedSecret) {
    throw fastify.httpErrors.unauthorized("Admin approval requires a valid admin secret.");
  }

  const a = Buffer.from(providedSecret, "utf8");
  const b = Buffer.from(expectedSecret, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw fastify.httpErrors.unauthorized("Admin approval requires a valid admin secret.");
  }
}
```

- [ ] **Step 2: Verify the API compiles**

Run: `cd /c/Users/oreil/Documents/larry-site && npm run api:build 2>&1 | tail -5`

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
cd /c/Users/oreil/Documents/larry-site
git add apps/api/src/routes/v1/orgs.ts
git commit -m "security(H3): use timingSafeEqual for admin secret comparison

Prevents timing side-channel attack on the ADMIN_SECRET."
```

---

### Task 8: Add Role Guards to Settings Routes (H6)

**Files:**
- Modify: `apps/api/src/routes/v1/settings.ts:90-93,211-213,250-252,320-322`

- [ ] **Step 1: Fix PATCH /policy to use requireRole**

In `apps/api/src/routes/v1/settings.ts`, replace the policy patch route declaration (line 90-93):

```typescript
  fastify.patch(
    "/policy",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      if (request.user.role !== "admin") {
        return reply.status(403).send({ error: "Admin role required" });
      }
```

with:

```typescript
  fastify.patch(
    "/policy",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin"])] },
    async (request, reply) => {
```

(Remove the manual `if (request.user.role !== "admin")` block — `requireRole` handles it.)

- [ ] **Step 2: Add requireRole to POST /rules**

Replace line 213:

```typescript
    { preHandler: [fastify.authenticate] },
```

with:

```typescript
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm"])] },
```

- [ ] **Step 3: Add requireRole to PATCH /rules/:id**

Replace line 252:

```typescript
    { preHandler: [fastify.authenticate] },
```

with:

```typescript
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm"])] },
```

- [ ] **Step 4: Add requireRole to DELETE /rules/:id**

Replace line 322:

```typescript
    { preHandler: [fastify.authenticate] },
```

with:

```typescript
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm"])] },
```

- [ ] **Step 5: Verify the API compiles**

Run: `cd /c/Users/oreil/Documents/larry-site && npm run api:build 2>&1 | tail -5`

Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
cd /c/Users/oreil/Documents/larry-site
git add apps/api/src/routes/v1/settings.ts
git commit -m "security(H6): add requireRole guards to settings/rules write routes

PATCH /policy now uses requireRole(['admin']) instead of manual check.
POST/PATCH/DELETE /rules now require admin or pm role."
```

---

### Task 9: MIME Type Allowlist on Document Download (H10)

**Files:**
- Modify: `apps/api/src/routes/v1/documents.ts:577-589`

- [ ] **Step 1: Add MIME allowlist and nosniff header**

In `apps/api/src/routes/v1/documents.ts`, replace lines 577-589:

```typescript
      const mimeType =
        typeof metadataRecord.mimeType === "string" && metadataRecord.mimeType.length > 0
          ? metadataRecord.mimeType
          : MIME_TYPE_BY_FORMAT[document.docType] ?? "application/octet-stream";
      const fileNameRaw =
        typeof metadataRecord.fileName === "string" && metadataRecord.fileName.length > 0
          ? metadataRecord.fileName
          : `${safeFilePart(document.title || "document")}.${document.docType || "bin"}`;
      const fileName = fileNameRaw.replace(/[^a-zA-Z0-9._-]/g, "_");

      reply.header("Content-Type", mimeType);
      reply.header("Content-Disposition", `attachment; filename="${fileName}"`);
      return reply.send(binary);
```

with:

```typescript
      const SAFE_MIME_TYPES = new Set(Object.values(MIME_TYPE_BY_FORMAT));
      SAFE_MIME_TYPES.add("application/octet-stream");

      const rawMime =
        typeof metadataRecord.mimeType === "string" ? metadataRecord.mimeType : "";
      const mimeType = SAFE_MIME_TYPES.has(rawMime)
        ? rawMime
        : MIME_TYPE_BY_FORMAT[document.docType] ?? "application/octet-stream";
      const fileNameRaw =
        typeof metadataRecord.fileName === "string" && metadataRecord.fileName.length > 0
          ? metadataRecord.fileName
          : `${safeFilePart(document.title || "document")}.${document.docType || "bin"}`;
      const fileName = fileNameRaw.replace(/[^a-zA-Z0-9._-]/g, "_");

      reply.header("Content-Type", mimeType);
      reply.header("Content-Disposition", `attachment; filename="${fileName}"`);
      reply.header("X-Content-Type-Options", "nosniff");
      return reply.send(binary);
```

- [ ] **Step 2: Verify the API compiles**

Run: `cd /c/Users/oreil/Documents/larry-site && npm run api:build 2>&1 | tail -5`

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
cd /c/Users/oreil/Documents/larry-site
git add apps/api/src/routes/v1/documents.ts
git commit -m "security(H10): allowlist MIME types on document download

Prevents stored XSS via crafted mimeType in metadata JSONB.
Adds X-Content-Type-Options: nosniff header."
```

---

### Task 10: Add HTTP Security Headers (H11)

**Files:**
- Modify: `apps/api/src/app.ts`
- Modify: `apps/web/next.config.ts`

- [ ] **Step 1: Install @fastify/helmet in the API**

Run: `cd /c/Users/oreil/Documents/larry-site && npm install @fastify/helmet -w @larry/api`

- [ ] **Step 2: Register helmet in the Fastify app**

In `apps/api/src/app.ts`, add the import at the top (after the existing imports):

```typescript
import helmet from "@fastify/helmet";
```

Then register it after `sensible` but before `cors` (after line 25):

```typescript
  await app.register(helmet, {
    contentSecurityPolicy: false, // CSP needs careful tuning per-app; enable later
  });
```

- [ ] **Step 3: Add security headers to Next.js**

Replace the full content of `apps/web/next.config.ts`:

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
        ],
      },
    ];
  },
};

export default nextConfig;
```

- [ ] **Step 4: Verify both apps compile**

Run: `cd /c/Users/oreil/Documents/larry-site && npm run api:build 2>&1 | tail -5`
Run: `cd /c/Users/oreil/Documents/larry-site && npm run web:build 2>&1 | tail -5`

Expected: Both succeed.

- [ ] **Step 5: Commit**

```bash
cd /c/Users/oreil/Documents/larry-site
git add apps/api/src/app.ts apps/api/package.json apps/web/next.config.ts package-lock.json
git commit -m "security(H11): add HTTP security headers to API and web app

API: register @fastify/helmet (X-Content-Type-Options, X-Frame-Options, etc.)
Web: add X-Content-Type-Options, X-Frame-Options, Referrer-Policy via next.config."
```

---

## Phase 3: Medium Auth & Data Fixes

### Task 11: Revoke Refresh Tokens on Logout (M5)

**Files:**
- Modify: `apps/api/src/routes/v1/auth.ts:201-218`

- [ ] **Step 1: Add token revocation before audit log**

In `apps/api/src/routes/v1/auth.ts`, in the logout handler (around line 204), add the revocation query before the `writeAuditLog` call:

Find:

```typescript
    async (request) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) return { success: true };

      await writeAuditLog(fastify.db, {
```

Replace with:

```typescript
    async (request) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) return { success: true };

      await fastify.db.query(
        "UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND tenant_id = $2 AND revoked_at IS NULL",
        [request.user.userId, request.user.tenantId]
      );

      await writeAuditLog(fastify.db, {
```

- [ ] **Step 2: Verify the API compiles**

Run: `cd /c/Users/oreil/Documents/larry-site && npm run api:build 2>&1 | tail -5`

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
cd /c/Users/oreil/Documents/larry-site
git add apps/api/src/routes/v1/auth.ts
git commit -m "security(M5): revoke all refresh tokens on logout

Previously logout only wrote an audit log. Stolen refresh tokens
remained valid until natural expiry (7 days)."
```

---

### Task 12: Add Project Membership Checks to Reporting Routes (M6)

**Files:**
- Modify: `apps/api/src/routes/v1/reporting.ts`

- [ ] **Step 1: Add the project membership import**

At the top of `apps/api/src/routes/v1/reporting.ts`, add after the existing imports:

```typescript
import { getProjectMembershipAccess } from "../../lib/project-memberships.js";
```

- [ ] **Step 2: Add a helper function inside the plugin**

Inside the `reportingRoutes` function body, before the first route, add:

```typescript
  async function assertProjectReadOrThrow(tenantId: string, userId: string, tenantRole: string, projectId: string) {
    const access = await getProjectMembershipAccess({
      db: fastify.db,
      tenantId,
      projectId,
      userId,
      tenantRole,
    });
    if (!access.projectExists) {
      throw fastify.httpErrors.notFound("Project not found.");
    }
    if (!access.canRead) {
      throw fastify.httpErrors.forbidden("Project access denied.");
    }
  }
```

- [ ] **Step 3: Add the check to each reporting route**

In each of the 5 reporting route handlers (health, outcomes, weekly-summary, task-breakdown, status-history), add this line right after `const tenantId = request.user.tenantId;`:

```typescript
    await assertProjectReadOrThrow(tenantId, request.user.userId, request.user.role, params.id);
```

- [ ] **Step 4: Verify the API compiles**

Run: `cd /c/Users/oreil/Documents/larry-site && npm run api:build 2>&1 | tail -5`

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
cd /c/Users/oreil/Documents/larry-site
git add apps/api/src/routes/v1/reporting.ts
git commit -m "security(M6): add project membership checks to reporting routes

Previously any tenant member could read health/timeline/outcomes for any
project in their tenant. Now requires project collaborator access."
```

---

### Task 13: Add Ownership Check to Notification Mark-as-Read (M7)

**Files:**
- Modify: `apps/api/src/routes/v1/notifications.ts:64-67`

- [ ] **Step 1: Add user_id filter to the UPDATE query**

In `apps/api/src/routes/v1/notifications.ts`, replace lines 64-68:

```typescript
      await fastify.db.queryTenant(
        tenantId,
        `UPDATE notifications SET read_at = NOW() WHERE tenant_id = $1 AND id = $2`,
        [tenantId, params.id]
      );
```

with:

```typescript
      await fastify.db.queryTenant(
        tenantId,
        `UPDATE notifications SET read_at = NOW() WHERE tenant_id = $1 AND id = $2 AND (user_id = $3 OR user_id IS NULL)`,
        [tenantId, params.id, request.user.userId]
      );
```

- [ ] **Step 2: Verify the API compiles**

Run: `cd /c/Users/oreil/Documents/larry-site && npm run api:build 2>&1 | tail -5`

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
cd /c/Users/oreil/Documents/larry-site
git add apps/api/src/routes/v1/notifications.ts
git commit -m "security(M7): add user_id ownership check to notification mark-as-read

Previously any tenant member could mark another member's notifications as read."
```

---

### Task 14: Type-Safe SQL Table and Column Names (M8)

**Files:**
- Modify: `apps/api/src/routes/v1/projects.ts:408-421`
- Modify: `apps/api/src/lib/project-status.ts:17-18`

- [ ] **Step 1: Add a type-safe allowlist to deleteAndCount**

In `apps/api/src/routes/v1/projects.ts`, find the `deleteAndCount` function (inside the delete handler's transaction, around line 410):

```typescript
        async function deleteAndCount(tableName: string): Promise<number> {
```

Replace with:

```typescript
        const PURGEABLE_TABLES = ["meeting_notes", "documents", "email_outbound_drafts", "larry_conversations"] as const;
        type PurgeableTable = typeof PURGEABLE_TABLES[number];

        async function deleteAndCount(tableName: PurgeableTable): Promise<number> {
```

- [ ] **Step 2: Add a type-safe allowlist to projectStatusSql**

In `apps/api/src/lib/project-status.ts`, replace line 17-18:

```typescript
export function projectStatusSql(statusColumn: string): string {
  return `CASE WHEN ${statusColumn} = '${ARCHIVED_PROJECT_STATUS}' THEN '${ARCHIVED_PROJECT_STATUS}' ELSE '${ACTIVE_PROJECT_STATUS}' END`;
}
```

with:

```typescript
const ALLOWED_STATUS_COLUMNS = ["projects.status", "status"] as const;
type StatusColumn = typeof ALLOWED_STATUS_COLUMNS[number];

export function projectStatusSql(statusColumn: StatusColumn): string {
  return `CASE WHEN ${statusColumn} = '${ARCHIVED_PROJECT_STATUS}' THEN '${ARCHIVED_PROJECT_STATUS}' ELSE '${ACTIVE_PROJECT_STATUS}' END`;
}
```

- [ ] **Step 3: Verify the API compiles**

Run: `cd /c/Users/oreil/Documents/larry-site && npm run api:build 2>&1 | tail -5`

Expected: Build succeeds. If any existing call sites pass a string not in the union type, the compiler will flag it — fix those by adding the value to the `ALLOWED_STATUS_COLUMNS` array.

- [ ] **Step 4: Commit**

```bash
cd /c/Users/oreil/Documents/larry-site
git add apps/api/src/routes/v1/projects.ts apps/api/src/lib/project-status.ts
git commit -m "security(M8): type-safe allowlists for SQL table/column interpolation

deleteAndCount now only accepts PurgeableTable union type.
projectStatusSql now only accepts known StatusColumn values.
Prevents future SQL injection if a refactor passes user input."
```

---

### Task 15: Timing-Safe Email Webhook Secret (M9)

**Files:**
- Modify: `apps/api/src/routes/v1/connectors-email.ts:424-428`

- [ ] **Step 1: Add crypto import and fix the comparison**

At the top of `apps/api/src/routes/v1/connectors-email.ts`, add the import (if not already present):

```typescript
import { timingSafeEqual } from "node:crypto";
```

Then replace lines 424-428:

```typescript
    const secretHeader = request.headers["x-larry-email-secret"];
    const inboundSecret = typeof secretHeader === "string" ? secretHeader : undefined;
    if (!inboundSecret || inboundSecret !== installation.webhookSecret) {
      throw fastify.httpErrors.unauthorized("Invalid email inbound secret.");
    }
```

with:

```typescript
    const secretHeader = request.headers["x-larry-email-secret"];
    const inboundSecret = typeof secretHeader === "string" ? secretHeader : undefined;
    if (!inboundSecret) {
      throw fastify.httpErrors.unauthorized("Invalid email inbound secret.");
    }
    const a = Buffer.from(inboundSecret, "utf8");
    const b = Buffer.from(installation.webhookSecret, "utf8");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw fastify.httpErrors.unauthorized("Invalid email inbound secret.");
    }
```

- [ ] **Step 2: Verify the API compiles**

Run: `cd /c/Users/oreil/Documents/larry-site && npm run api:build 2>&1 | tail -5`

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
cd /c/Users/oreil/Documents/larry-site
git add apps/api/src/routes/v1/connectors-email.ts
git commit -m "security(M9): use timingSafeEqual for email webhook secret comparison"
```

---

### Task 16: Validate Dismiss Body with Zod (L4)

**Files:**
- Modify: `apps/api/src/routes/v1/larry.ts:1434`

- [ ] **Step 1: Replace the unsafe cast with Zod validation**

In `apps/api/src/routes/v1/larry.ts`, find line 1434:

```typescript
      const body = (request.body ?? {}) as { reason?: string };
```

Replace with:

```typescript
      const body = z.object({ reason: z.string().max(1000).optional() }).parse(request.body ?? {});
```

(The `z` import from `zod` is already present at the top of this file.)

- [ ] **Step 2: Verify the API compiles**

Run: `cd /c/Users/oreil/Documents/larry-site && npm run api:build 2>&1 | tail -5`

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
cd /c/Users/oreil/Documents/larry-site
git add apps/api/src/routes/v1/larry.ts
git commit -m "security(L4): validate dismiss body with Zod instead of unsafe cast"
```

---

## Phase 4: Final Commit

### Task 17: Update .env.example Placeholders

**Files:**
- Modify: `apps/api/.env.example:9-13`

- [ ] **Step 1: Replace real JWT secrets with placeholders**

In `apps/api/.env.example`, replace lines 9-13:

```
JWT_ACCESS_SECRET=6I7Pfuh21MxiEtGgMeY3SRJ1dbncQonD
# JWT_REFRESH_SECRET is defined here for documentation purposes but is NOT used at runtime.
# Refresh tokens are stored as SHA256 hashes in the refresh_tokens table — they are not signed JWTs.
# See apps/api/src/lib/auth.ts -> issueRefreshToken / hashToken for the implementation.
JWT_REFRESH_SECRET=liFGHhrgMGmLBQit2TnTkoumWAMwIJ56
```

with:

```
JWT_ACCESS_SECRET=<generate-with-node -e "require('crypto').randomBytes(16).toString('hex')">
# JWT_REFRESH_SECRET is defined here for documentation purposes but is NOT used at runtime.
# Refresh tokens are stored as SHA256 hashes in the refresh_tokens table — they are not signed JWTs.
# See apps/api/src/lib/auth.ts -> issueRefreshToken / hashToken for the implementation.
JWT_REFRESH_SECRET=<generate-with-node -e "require('crypto').randomBytes(16).toString('hex')">
```

- [ ] **Step 2: Commit**

```bash
cd /c/Users/oreil/Documents/larry-site
git add apps/api/.env.example
git commit -m "security(C0): replace real JWT secrets in .env.example with placeholders

The previous values were the actual signing secrets used in development,
committed to GitHub and fully compromised."
```

---

## Deferred Items (Not in This Plan)

These require larger architectural work and should each get their own spec:

| Finding | Why Deferred |
|---------|-------------|
| **H1** Session JWT embeds API tokens | Requires Redis session store + proxy rewrite |
| **H2** Plaintext OAuth tokens | Requires encryption layer + key management |
| **H4** Tenant header spoofing | Needs careful analysis of which routes use header fallback |
| **H7** Cleartext tempPassword in response | Requires email delivery integration (Resend) |
| **H9** fast-jwt CVE | No fix available upstream; monitor releases |
| **M1-M4, M10-M11, L1-L3, L5** | Lower severity; schedule for next sprint |
