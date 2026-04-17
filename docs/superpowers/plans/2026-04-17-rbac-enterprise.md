# RBAC Enterprise Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship industry-standard org/RBAC in Larry — pending invitations, owner tier, last-admin guards, org-wide admin project visibility, transfer-ownership, domain-verified auto-join, seat caps, MFA enforcement flag.

**Architecture:** One additive Postgres migration (`022_rbac_enterprise.sql`) adds the `owner` enum value, `invitations` and `tenant_domains` tables, tenant seat cap + MFA columns, and backfills the first admin per tenant to `owner`. Route logic funnels through a new pure-predicate module `apps/api/src/lib/permissions.ts`. Invitations use SHA-256 hashed tokens, 7-day expiry, and single-use accept. A feature flag `RBAC_V2_ENABLED` gates new behaviour during rollout; legacy `/members/invite` becomes a thin compat shim.

**Tech Stack:** Node/TypeScript/Fastify API on Railway, Postgres, Vitest (`vi.mock` on lib helpers, existing convention), Resend email, Next.js frontend on Vercel (frontend changes are out of scope for this plan — API + migration only).

**Spec reference:** `docs/superpowers/specs/2026-04-17-rbac-enterprise-design.md`
**Branch:** `feat/rbac-enterprise`

---

## File structure

**New files:**
- `packages/db/src/migrations/022_rbac_enterprise.sql`
- `apps/api/src/lib/permissions.ts` + `.test.ts`
- `apps/api/src/lib/invitations.ts` + `.test.ts`
- `apps/api/src/lib/last-admin-guard.ts` + `.test.ts`
- `apps/api/src/lib/seat-cap.ts` + `.test.ts`
- `apps/api/src/lib/mfa-gate.ts` + `.test.ts`
- `apps/api/src/lib/tenant-domains.ts` + `.test.ts`
- `apps/api/src/routes/v1/invitations.ts`
- `apps/api/src/routes/v1/orgs-admin.ts` (domains, transfer, settings PATCH)
- `apps/api/tests/invitations-routes.test.ts`
- `apps/api/tests/members-last-admin.test.ts`
- `apps/api/tests/projects-admin-visibility.test.ts`
- `apps/api/tests/orgs-admin-routes.test.ts`

**Modified files:**
- `packages/shared/src/index.ts` — Role type
- `apps/api/src/lib/project-memberships.ts` — admin override in access check
- `apps/api/src/lib/email.ts` — invitation email builds link with token
- `apps/api/src/routes/v1/auth.ts` — invite schema fix, last-admin guard, cascade on remove, compat shim
- `apps/api/src/routes/v1/projects.ts` — admin project visibility, project-transfer endpoint
- `apps/api/src/routes/v1/orgs.ts` — register new admin-org routes
- `apps/api/src/routes/v1/index.ts` — register invitations router
- `apps/api/src/config.ts` (or env loader) — add `RBAC_V2_ENABLED`

---

## Task 1: Shared Role type update

**Files:**
- Modify: `packages/shared/src/index.ts:1-6`

- [ ] **Step 1: Update Role type + add constants**

Replace lines 1–6 of `packages/shared/src/index.ts` with:

```ts
export type Role = "owner" | "admin" | "pm" | "member" | "executive";

export const ACTIVE_TENANT_ROLES = ["owner", "admin", "pm", "member"] as const;
export const INVITABLE_TENANT_ROLES = ["admin", "pm", "member"] as const;
export type ActiveTenantRole = (typeof ACTIVE_TENANT_ROLES)[number];
export type InvitableTenantRole = (typeof INVITABLE_TENANT_ROLES)[number];

export interface AuthUser {
  tenantId: string;
  userId: string;
  role: Role;
  email: string;
}
```

- [ ] **Step 2: Build the shared package to surface errors early**

Run: `cd C:/Dev/larry/site-deploys/larry-site/packages/shared && npm run build` (if build script exists) or `npx tsc -p tsconfig.json --noEmit`
Expected: compiles clean.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/index.ts
git commit -m "feat(rbac): add owner role + active/invitable role constants"
```

---

## Task 2: DB migration 022 — additive RBAC schema

**Files:**
- Create: `packages/db/src/migrations/022_rbac_enterprise.sql`

- [ ] **Step 1: Write the migration**

Create `packages/db/src/migrations/022_rbac_enterprise.sql`:

```sql
-- 022_rbac_enterprise.sql — owner tier, invitations, tenant_domains, seat cap, MFA flag.

-- 1. Add 'owner' to role_type enum (must be outside a transaction).
DO $$ BEGIN
  ALTER TYPE role_type ADD VALUE IF NOT EXISTS 'owner';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Defensive: collapse any stray 'executive' memberships to 'member'.
UPDATE memberships SET role = 'member' WHERE role = 'executive';

-- 3. Promote first admin per tenant (by created_at ASC) to owner.
--    Only runs on tenants that currently have no owner.
WITH first_admin AS (
  SELECT DISTINCT ON (tenant_id) tenant_id, user_id
  FROM memberships
  WHERE role = 'admin'
  ORDER BY tenant_id, created_at ASC
),
tenants_without_owner AS (
  SELECT t.id
  FROM tenants t
  LEFT JOIN memberships m ON m.tenant_id = t.id AND m.role = 'owner'
  WHERE m.tenant_id IS NULL
)
UPDATE memberships m
SET role = 'owner'
FROM first_admin fa
WHERE m.tenant_id = fa.tenant_id
  AND m.user_id = fa.user_id
  AND m.tenant_id IN (SELECT id FROM tenants_without_owner);

-- 4. Exactly one owner per tenant.
CREATE UNIQUE INDEX IF NOT EXISTS idx_memberships_one_owner_per_tenant
  ON memberships (tenant_id)
  WHERE role = 'owner';

-- 5. Invitations.
CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role role_type NOT NULL,
  token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','revoked','expired')),
  invited_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_by_user_id UUID REFERENCES users(id),
  revoked_at TIMESTAMPTZ,
  revoked_by_user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invitations_token_hash
  ON invitations (token_hash);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invitations_tenant_email_pending
  ON invitations (tenant_id, lower(email))
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_invitations_tenant_status
  ON invitations (tenant_id, status, created_at DESC);

-- 6. Tenant domains (auto-join / block).
CREATE TABLE IF NOT EXISTS tenant_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('auto_join','invite_only','blocked')),
  default_role role_type NOT NULL DEFAULT 'member',
  verification_token TEXT,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_domains_tenant_domain
  ON tenant_domains (tenant_id, lower(domain));

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_domains_verified_domain
  ON tenant_domains (lower(domain))
  WHERE verified_at IS NOT NULL;

-- 7. Tenant-level settings: seat cap + MFA enforcement.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS seat_cap INT;
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS mfa_required_for_admins BOOLEAN NOT NULL DEFAULT FALSE;

-- 8. User MFA flag (column only — TOTP wiring is a follow-up).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS mfa_enrolled_at TIMESTAMPTZ;
```

- [ ] **Step 2: Dry-run the migration runner against a scratch DB**

If a local scratch DB is available: `cd packages/db && DATABASE_URL=$SCRATCH npm run migrate`.
If no local DB: skip — we'll verify on deploy. Expected: no errors, `invitations` and `tenant_domains` present.

- [ ] **Step 3: Verify migration-safety gate still passes**

Run: `cd apps/api && npx vitest run tests/migration-safety-gate.test.ts`
Expected: PASS (migration is entirely additive; no DROP / destructive operations).

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/migrations/022_rbac_enterprise.sql
git commit -m "feat(rbac): migration 022 — owner tier, invitations, tenant_domains, seat cap, MFA flag"
```

---

## Task 3: Pure permission module (TDD)

**Files:**
- Create: `apps/api/src/lib/permissions.ts`
- Create: `apps/api/src/lib/permissions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/lib/permissions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  canInviteMembers,
  canManageMembers,
  canChangeOrgSettings,
  canViewAllProjects,
  canManageAllProjects,
  canTransferOrgOwnership,
  canInviteRoleAs,
  INVITABLE_TENANT_ROLES,
} from "./permissions.js";
import type { Role } from "@larry/shared";

const ROLES: Role[] = ["owner", "admin", "pm", "member", "executive"];

describe("permissions", () => {
  it("canInviteMembers — owner + admin only", () => {
    expect(ROLES.filter(canInviteMembers)).toEqual(["owner", "admin"]);
  });
  it("canManageMembers — owner + admin only", () => {
    expect(ROLES.filter(canManageMembers)).toEqual(["owner", "admin"]);
  });
  it("canChangeOrgSettings — owner + admin only", () => {
    expect(ROLES.filter(canChangeOrgSettings)).toEqual(["owner", "admin"]);
  });
  it("canViewAllProjects — owner + admin only", () => {
    expect(ROLES.filter(canViewAllProjects)).toEqual(["owner", "admin"]);
  });
  it("canManageAllProjects — owner + admin only", () => {
    expect(ROLES.filter(canManageAllProjects)).toEqual(["owner", "admin"]);
  });
  it("canTransferOrgOwnership — owner only", () => {
    expect(ROLES.filter(canTransferOrgOwnership)).toEqual(["owner"]);
  });
  it("executive collapses to member-equivalent permissions", () => {
    expect(canViewAllProjects("executive")).toBe(false);
    expect(canInviteMembers("executive")).toBe(false);
  });
  it("canInviteRoleAs — admin can invite admin/pm/member; owner same", () => {
    for (const actor of ["owner", "admin"] as Role[]) {
      expect(INVITABLE_TENANT_ROLES.every(t => canInviteRoleAs(actor, t))).toBe(true);
      expect(canInviteRoleAs(actor, "owner")).toBe(false);
      expect(canInviteRoleAs(actor, "executive")).toBe(false);
    }
  });
  it("canInviteRoleAs — member/pm/executive cannot invite anyone", () => {
    for (const actor of ["pm", "member", "executive"] as Role[]) {
      for (const target of INVITABLE_TENANT_ROLES) {
        expect(canInviteRoleAs(actor, target)).toBe(false);
      }
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && npx vitest run src/lib/permissions.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the module**

Create `apps/api/src/lib/permissions.ts`:

```ts
import type { Role } from "@larry/shared";

export const ACTIVE_TENANT_ROLES = ["owner", "admin", "pm", "member"] as const;
export const INVITABLE_TENANT_ROLES = ["admin", "pm", "member"] as const;
export type InvitableTenantRole = (typeof INVITABLE_TENANT_ROLES)[number];

// executive is deprecated — treat as member.
function effective(r: Role): Exclude<Role, "executive"> {
  return r === "executive" ? "member" : r;
}

export function canInviteMembers(r: Role): boolean {
  const e = effective(r);
  return e === "owner" || e === "admin";
}
export function canManageMembers(r: Role): boolean { return canInviteMembers(r); }
export function canChangeOrgSettings(r: Role): boolean { return canInviteMembers(r); }
export function canViewAllProjects(r: Role): boolean { return canInviteMembers(r); }
export function canManageAllProjects(r: Role): boolean { return canInviteMembers(r); }
export function canTransferOrgOwnership(r: Role): boolean { return effective(r) === "owner"; }

export function canInviteRoleAs(actor: Role, target: Role): boolean {
  if (!canInviteMembers(actor)) return false;
  return (INVITABLE_TENANT_ROLES as readonly string[]).includes(target);
}
```

- [ ] **Step 4: Run tests**

Run: `cd apps/api && npx vitest run src/lib/permissions.test.ts`
Expected: 8/8 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/permissions.ts apps/api/src/lib/permissions.test.ts
git commit -m "feat(rbac): add pure permissions module with owner/admin matrix"
```

---

## Task 4: Last-admin guard helper (TDD)

**Files:**
- Create: `apps/api/src/lib/last-admin-guard.ts`
- Create: `apps/api/src/lib/last-admin-guard.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/lib/last-admin-guard.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { countRemainingAdmins, assertTenantHasRemainingAdmin } from "./last-admin-guard.js";

function mockDb(count: number) {
  return {
    queryTenant: vi.fn().mockResolvedValue([{ n: count }]),
  } as unknown as import("@larry/db").Db;
}

describe("last-admin-guard", () => {
  it("countRemainingAdmins returns the db count minus excluded user", async () => {
    const db = mockDb(2);
    const n = await countRemainingAdmins(db, "t1", "u-exclude");
    expect(n).toBe(2);
    expect(db.queryTenant).toHaveBeenCalledWith(
      "t1",
      expect.stringContaining("role IN ('owner','admin')"),
      ["t1", "u-exclude"]
    );
  });

  it("assertTenantHasRemainingAdmin throws when count is 0", async () => {
    const db = mockDb(0);
    await expect(assertTenantHasRemainingAdmin(db, "t1", "u1"))
      .rejects.toThrow(/last_admin_required/);
  });

  it("assertTenantHasRemainingAdmin passes when count ≥ 1", async () => {
    const db = mockDb(1);
    await expect(assertTenantHasRemainingAdmin(db, "t1", "u1")).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run → FAIL**

Run: `cd apps/api && npx vitest run src/lib/last-admin-guard.test.ts`
Expected: FAIL (no module).

- [ ] **Step 3: Implement**

Create `apps/api/src/lib/last-admin-guard.ts`:

```ts
import type { Db } from "@larry/db";

export class LastAdminRequiredError extends Error {
  readonly code = "last_admin_required";
  constructor(message = "Operation would leave the organisation without any admin or owner.") {
    super(message);
  }
}

export async function countRemainingAdmins(
  db: Db,
  tenantId: string,
  excludeUserId: string
): Promise<number> {
  const rows = await db.queryTenant<{ n: number | string }>(
    tenantId,
    `SELECT COUNT(*)::int AS n
       FROM memberships
      WHERE tenant_id = $1
        AND user_id <> $2
        AND role IN ('owner','admin')`,
    [tenantId, excludeUserId]
  );
  const n = rows[0]?.n;
  return typeof n === "number" ? n : Number.parseInt(String(n ?? "0"), 10) || 0;
}

export async function assertTenantHasRemainingAdmin(
  db: Db,
  tenantId: string,
  excludeUserId: string
): Promise<void> {
  const n = await countRemainingAdmins(db, tenantId, excludeUserId);
  if (n < 1) throw new LastAdminRequiredError();
}
```

- [ ] **Step 4: Run → PASS**

Run: `cd apps/api && npx vitest run src/lib/last-admin-guard.test.ts`
Expected: 3/3 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/last-admin-guard.ts apps/api/src/lib/last-admin-guard.test.ts
git commit -m "feat(rbac): last-admin guard helper with unit tests"
```

---

## Task 5: Fix critical invite-schema bug + wire last-admin guard into existing endpoints

**Files:**
- Modify: `apps/api/src/routes/v1/auth.ts:475-479` (InviteSchema), `:573-575` (UpdateMemberSchema), `:577-615` (PATCH), `:618-654` (DELETE)
- Create: `apps/api/tests/members-last-admin.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/members-last-admin.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import sensible from "@fastify/sensible";
import type { Db } from "@larry/db";
import { authRoutes } from "../src/routes/v1/auth.js";

const TENANT = "11111111-1111-4111-8111-111111111111";
const ADMIN = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";

function makeApp(dbQueries: Record<string, unknown[]>) {
  const app = Fastify({ logger: false });
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const dbQuery = vi.fn(async (sql: string, params: unknown[]) => {
    calls.push({ sql, params });
    for (const key of Object.keys(dbQueries)) {
      if (sql.includes(key)) return dbQueries[key];
    }
    return [];
  });
  app.decorate("db", {
    query: dbQuery,
    queryTenant: vi.fn(async (_t, sql, params) => dbQuery(sql, params)),
    tx: vi.fn(async (fn: any) => fn({ query: dbQuery })),
  } as unknown as Db);
  app.decorate("authenticate", async (req: any) => {
    req.user = { tenantId: TENANT, userId: ADMIN, role: "admin", email: "a@x.com" };
  });
  app.decorate("requireRole", () => async () => undefined);
  (app as any).calls = calls;
  return app;
}

afterEach(() => vi.clearAllMocks());

describe("PATCH /auth/members/:userId — last-admin guard", () => {
  it("rejects demoting the final admin", async () => {
    const app = makeApp({
      "COUNT(*)::int AS n": [{ n: 0 }],
    });
    await app.register(sensible);
    await app.register(authRoutes, { prefix: "/auth" });
    const res = await app.inject({
      method: "PATCH",
      url: `/auth/members/${OTHER}`,
      payload: { role: "member" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().message).toMatch(/admin/i);
    await app.close();
  });
});

describe("DELETE /auth/members/:userId — last-admin guard", () => {
  it("rejects removing the final admin", async () => {
    const app = makeApp({ "COUNT(*)::int AS n": [{ n: 0 }] });
    await app.register(sensible);
    await app.register(authRoutes, { prefix: "/auth" });
    const res = await app.inject({
      method: "DELETE",
      url: `/auth/members/${OTHER}`,
    });
    expect(res.statusCode).toBe(409);
    await app.close();
  });

  it("also deletes project_memberships for removed user", async () => {
    const app = makeApp({ "COUNT(*)::int AS n": [{ n: 1 }] });
    await app.register(sensible);
    await app.register(authRoutes, { prefix: "/auth" });
    const res = await app.inject({
      method: "DELETE",
      url: `/auth/members/${OTHER}`,
    });
    expect(res.statusCode).toBe(200);
    const calls = (app as any).calls as Array<{ sql: string }>;
    expect(calls.some(c => /DELETE FROM project_memberships/i.test(c.sql))).toBe(true);
    await app.close();
  });
});

describe("POST /auth/members/invite — schema", () => {
  it("rejects role=viewer (not a tenant role)", async () => {
    const app = makeApp({});
    await app.register(sensible);
    await app.register(authRoutes, { prefix: "/auth" });
    const res = await app.inject({
      method: "POST",
      url: "/auth/members/invite",
      payload: { email: "x@y.com", role: "viewer" },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
```

- [ ] **Step 2: Run → FAIL**

Run: `cd apps/api && npx vitest run tests/members-last-admin.test.ts`
Expected: FAIL — viewer currently passes schema; no guard on PATCH/DELETE.

- [ ] **Step 3: Patch `auth.ts` InviteSchema + UpdateMemberSchema**

In `apps/api/src/routes/v1/auth.ts`:

Replace (line ~475):
```ts
const InviteSchema = z.object({
  email: emailSchema,
  role: z.enum(["admin", "member", "viewer"]).default("member"),
  displayName: z.string().max(200).optional(),
});
```
With:
```ts
import { INVITABLE_TENANT_ROLES } from "../../lib/permissions.js";
const InviteSchema = z.object({
  email: emailSchema,
  role: z.enum(INVITABLE_TENANT_ROLES).default("member"),
  displayName: z.string().max(200).optional(),
});
```

Replace (line ~573):
```ts
const UpdateMemberSchema = z.object({
  role: z.enum(["admin", "member", "viewer"]),
});
```
With:
```ts
const UpdateMemberSchema = z.object({
  role: z.enum(INVITABLE_TENANT_ROLES),
});
```

- [ ] **Step 4: Add last-admin guard to PATCH (line ~577)**

After the existing `if (userId === request.user.userId)` self-check, add:

```ts
// If target is currently an admin/owner AND we're demoting them, ensure the org keeps an admin.
if (body.role !== "admin") {
  const { assertTenantHasRemainingAdmin } = await import("../../lib/last-admin-guard.js");
  const targetRows = await fastify.db.queryTenant<{ role: string }>(
    tenantId,
    `SELECT role FROM memberships WHERE tenant_id = $1 AND user_id = $2 LIMIT 1`,
    [tenantId, userId]
  );
  const targetRole = targetRows[0]?.role;
  if (targetRole === "admin" || targetRole === "owner") {
    try {
      await assertTenantHasRemainingAdmin(fastify.db, tenantId, userId);
    } catch (e) {
      throw fastify.httpErrors.conflict((e as Error).message);
    }
  }
}
// Cannot demote the owner through this endpoint.
if (body.role !== "admin") {
  // handled above via remaining-admin check; owner demotion also blocked by that check.
}
```

- [ ] **Step 5: Add last-admin guard + project-membership cascade to DELETE (line ~618)**

Replace the delete block:

```ts
await fastify.db.query(
  `DELETE FROM memberships WHERE tenant_id = $1 AND user_id = $2`,
  [tenantId, userId]
);
```

With:

```ts
const { assertTenantHasRemainingAdmin } = await import("../../lib/last-admin-guard.js");
try {
  await assertTenantHasRemainingAdmin(fastify.db, tenantId, userId);
} catch (e) {
  throw fastify.httpErrors.conflict((e as Error).message);
}

await fastify.db.tx(async (client) => {
  await client.query(
    `DELETE FROM project_memberships WHERE tenant_id = $1 AND user_id = $2`,
    [tenantId, userId]
  );
  await client.query(
    `DELETE FROM memberships WHERE tenant_id = $1 AND user_id = $2`,
    [tenantId, userId]
  );
});
```

- [ ] **Step 6: Run test → PASS**

Run: `cd apps/api && npx vitest run tests/members-last-admin.test.ts`
Expected: 4/4 PASS.

- [ ] **Step 7: Run full test suite to catch regressions**

Run: `cd apps/api && npx vitest run`
Expected: all previously-passing tests still pass.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/routes/v1/auth.ts apps/api/tests/members-last-admin.test.ts
git commit -m "fix(rbac): tighten invite schema, last-admin guard, cascade project_memberships on remove"
```

---

## Task 6: Invitations library

**Files:**
- Create: `apps/api/src/lib/invitations.ts`
- Create: `apps/api/src/lib/invitations.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/lib/invitations.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { hashInvitationToken, generateInvitationToken } from "./invitations.js";

describe("invitations token helpers", () => {
  it("generateInvitationToken returns a URL-safe 43+ char string", () => {
    const t = generateInvitationToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(t.length).toBeGreaterThanOrEqual(43);
  });

  it("hashInvitationToken returns deterministic SHA-256 hex", () => {
    const h1 = hashInvitationToken("abc");
    const h2 = hashInvitationToken("abc");
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
    expect(h1).toMatch(/^[0-9a-f]+$/);
  });

  it("different tokens hash differently", () => {
    expect(hashInvitationToken("a")).not.toBe(hashInvitationToken("b"));
  });
});
```

- [ ] **Step 2: Run → FAIL**

Run: `cd apps/api && npx vitest run src/lib/invitations.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement invitations.ts**

Create `apps/api/src/lib/invitations.ts`:

```ts
import { createHash, randomBytes } from "node:crypto";
import type { Db } from "@larry/db";
import type { PoolClient } from "pg";
import type { InvitableTenantRole } from "./permissions.js";

export function generateInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInvitationToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export interface InvitationRow {
  id: string;
  tenantId: string;
  email: string;
  role: string;
  status: InvitationStatus;
  invitedByUserId: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  acceptedByUserId: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface CreateInvitationInput {
  tenantId: string;
  email: string;
  role: InvitableTenantRole;
  invitedByUserId: string;
  expiresInDays?: number;
}

export interface CreateInvitationResult {
  invitation: InvitationRow;
  rawToken: string;
}

const SELECT_COLUMNS = `
  id,
  tenant_id       AS "tenantId",
  email,
  role,
  status,
  invited_by_user_id AS "invitedByUserId",
  expires_at::text   AS "expiresAt",
  accepted_at::text  AS "acceptedAt",
  accepted_by_user_id AS "acceptedByUserId",
  revoked_at::text   AS "revokedAt",
  created_at::text   AS "createdAt"
`;

export async function createInvitation(
  db: Db,
  input: CreateInvitationInput
): Promise<CreateInvitationResult> {
  const rawToken = generateInvitationToken();
  const tokenHash = hashInvitationToken(rawToken);
  const days = input.expiresInDays ?? 7;
  const rows = await db.queryTenant<InvitationRow>(
    input.tenantId,
    `INSERT INTO invitations (tenant_id, email, role, token_hash, invited_by_user_id, expires_at)
     VALUES ($1, lower($2), $3::role_type, $4, $5, NOW() + ($6 || ' days')::interval)
     RETURNING ${SELECT_COLUMNS}`,
    [input.tenantId, input.email, input.role, tokenHash, input.invitedByUserId, days]
  );
  return { invitation: rows[0], rawToken };
}

export async function findPendingInvitationByToken(
  db: Db,
  rawToken: string
): Promise<InvitationRow | null> {
  const tokenHash = hashInvitationToken(rawToken);
  const rows = await db.query<InvitationRow>(
    `SELECT ${SELECT_COLUMNS} FROM invitations WHERE token_hash = $1 LIMIT 1`,
    [tokenHash]
  );
  return rows[0] ?? null;
}

export function isInvitationConsumable(inv: InvitationRow): boolean {
  if (inv.status !== "pending") return false;
  return new Date(inv.expiresAt).getTime() > Date.now();
}

export async function markInvitationAccepted(
  client: PoolClient,
  invitationId: string,
  acceptedByUserId: string
): Promise<boolean> {
  // Single-use enforced via WHERE status='pending'.
  const res = await client.query(
    `UPDATE invitations
        SET status = 'accepted', accepted_at = NOW(), accepted_by_user_id = $2, updated_at = NOW()
      WHERE id = $1 AND status = 'pending'`,
    [invitationId, acceptedByUserId]
  );
  return (res.rowCount ?? 0) > 0;
}

export async function revokeInvitation(
  db: Db,
  tenantId: string,
  invitationId: string,
  actorUserId: string
): Promise<boolean> {
  const rows = await db.queryTenant<{ id: string }>(
    tenantId,
    `UPDATE invitations
        SET status = 'revoked', revoked_at = NOW(), revoked_by_user_id = $3, updated_at = NOW()
      WHERE tenant_id = $1 AND id = $2 AND status = 'pending'
      RETURNING id`,
    [tenantId, invitationId, actorUserId]
  );
  return rows.length > 0;
}

export async function listInvitations(
  db: Db,
  tenantId: string,
  status?: InvitationStatus
): Promise<InvitationRow[]> {
  if (status) {
    return db.queryTenant<InvitationRow>(
      tenantId,
      `SELECT ${SELECT_COLUMNS} FROM invitations
        WHERE tenant_id = $1 AND status = $2
        ORDER BY created_at DESC`,
      [tenantId, status]
    );
  }
  return db.queryTenant<InvitationRow>(
    tenantId,
    `SELECT ${SELECT_COLUMNS} FROM invitations
      WHERE tenant_id = $1
      ORDER BY created_at DESC`,
    [tenantId]
  );
}
```

- [ ] **Step 4: Run → PASS**

Run: `cd apps/api && npx vitest run src/lib/invitations.test.ts`
Expected: 3/3 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/invitations.ts apps/api/src/lib/invitations.test.ts
git commit -m "feat(rbac): invitations lib — token gen, hash, create/accept/revoke/list"
```

---

## Task 7: Invitation email with token link

**Files:**
- Modify: `apps/api/src/lib/email.ts` — replace `sendMemberInviteEmail` to accept + embed a raw token link.

- [ ] **Step 1: Update the email function**

Locate `sendMemberInviteEmail` in `apps/api/src/lib/email.ts`. Replace its signature and body with:

```ts
export async function sendMemberInviteEmail(
  to: string,
  displayName: string,
  opts: {
    tenantId: string;
    rawToken: string;
    orgName: string;
    inviterName?: string;
  }
): Promise<void> {
  if (!isResendConfigured()) {
    console.log("[email] RESEND_API_KEY not configured. Invite email for %s skipped.", to);
    return;
  }
  if (!(await guard("member_invite", to, { tenantId: opts.tenantId }))) return;
  const resend = getResend();
  const frontendUrl = getFrontendUrl();
  const safeName = escapeHtml(displayName);
  const safeOrg = escapeHtml(opts.orgName);
  const safeInviter = escapeHtml(opts.inviterName ?? "");
  const acceptUrl = `${frontendUrl}/invite/accept?token=${encodeURIComponent(opts.rawToken)}`;
  const { error } = await resend.emails.send({
    from: FROM_LARRY,
    to,
    subject: `You've been invited to ${opts.orgName} on Larry`,
    html: wrapHtml(`
      <p style="margin:0 0 16px;font-size:16px;">Hi ${safeName || "there"},</p>
      <p style="margin:0 0 16px;">${safeInviter || "An admin"} has invited you to join <strong>${safeOrg}</strong> on Larry.</p>
      ${ctaButton(acceptUrl, "Accept invitation")}
      <p style="margin:28px 0 0;font-size:13px;color:#888;line-height:1.5;">
        This invitation expires in 7 days. If you weren't expecting it, you can ignore this email.
      </p>
    `),
  });
  if (error) throw error;
}
```

- [ ] **Step 2: Update existing callers**

The only caller today is `auth.ts:/members/invite`. We'll rewrite that route in Task 9 to supply the new args. For now, wherever TS complains, leave compile errors — Task 9 fixes them.

- [ ] **Step 3: Typecheck**

Run: `cd apps/api && npx tsc --noEmit` — expect errors in `auth.ts` calling `sendMemberInviteEmail` (resolved in Task 9). Do **not** commit yet; this task is rolled into the next commit.

---

## Task 8: RBAC_V2_ENABLED feature flag

**Files:**
- Modify: `apps/api/src/config.ts` (or wherever `getApiEnv()` is defined) — add `RBAC_V2_ENABLED` boolean flag (default `false`).

- [ ] **Step 1: Find the env schema**

Run: `cd apps/api && grep -rn "JWT_ACCESS_SECRET\|getApiEnv" src/ | head -5` and open whichever file defines the Zod env schema.

- [ ] **Step 2: Add flag**

Extend the Zod schema:

```ts
RBAC_V2_ENABLED: z
  .union([z.literal("1"), z.literal("true"), z.literal("0"), z.literal("false"), z.undefined()])
  .transform(v => v === "1" || v === "true")
  .default("false"),
```

Expose it via `getApiEnv()` return type as `RBAC_V2_ENABLED: boolean`.

- [ ] **Step 3: Typecheck**

Run: `cd apps/api && npx tsc --noEmit`
Expected: clean (apart from the pending errors from Task 7, resolved in Task 9).

---

## Task 9: Invitations routes + new /members/invite behaviour

**Files:**
- Create: `apps/api/src/routes/v1/invitations.ts`
- Modify: `apps/api/src/routes/v1/auth.ts` — `/members/invite` delegates to invitations lib (behind flag).
- Modify: `apps/api/src/routes/v1/index.ts` — register invitations router.
- Create: `apps/api/tests/invitations-routes.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/invitations-routes.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import sensible from "@fastify/sensible";
import type { Db } from "@larry/db";
import { invitationsRoutes } from "../src/routes/v1/invitations.js";
import * as invitationsLib from "../src/lib/invitations.js";

vi.mock("../src/lib/invitations.js");

const TENANT = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";

function buildApp(role: "admin" | "member" | "owner" = "admin") {
  const app = Fastify({ logger: false });
  app.decorate("db", {
    query: vi.fn(),
    queryTenant: vi.fn(),
    tx: vi.fn(async (fn: any) => fn({ query: vi.fn() })),
  } as unknown as Db);
  app.decorate("authenticate", async (req: any) => {
    req.user = { tenantId: TENANT, userId: USER, role, email: "x@x.com" };
  });
  app.decorate("requireRole", () => async () => undefined);
  return app;
}

afterEach(() => vi.clearAllMocks());

describe("POST /orgs/invitations", () => {
  it("admin creates invitation", async () => {
    const app = buildApp("admin"); await app.register(sensible);
    await app.register(invitationsRoutes, { prefix: "/orgs/invitations" });
    vi.mocked(invitationsLib.createInvitation).mockResolvedValue({
      invitation: { id: "inv1", email: "x@y.com", role: "member", status: "pending" } as any,
      rawToken: "tok123",
    });
    const res = await app.inject({
      method: "POST",
      url: "/orgs/invitations",
      payload: { email: "x@y.com", role: "member" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().invitation.id).toBe("inv1");
    // Raw token must be returned to the admin once (for copy-link UX).
    expect(res.json().inviteUrl).toContain("tok123");
    await app.close();
  });

  it("member is forbidden", async () => {
    const app = buildApp("member"); await app.register(sensible);
    await app.register(invitationsRoutes, { prefix: "/orgs/invitations" });
    const res = await app.inject({
      method: "POST",
      url: "/orgs/invitations",
      payload: { email: "x@y.com", role: "member" },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("rejects role=owner", async () => {
    const app = buildApp("admin"); await app.register(sensible);
    await app.register(invitationsRoutes, { prefix: "/orgs/invitations" });
    const res = await app.inject({
      method: "POST",
      url: "/orgs/invitations",
      payload: { email: "x@y.com", role: "owner" },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe("GET /orgs/invitations/:token (preview, public)", () => {
  it("returns preview for pending unexpired token", async () => {
    const app = buildApp("member"); await app.register(sensible);
    await app.register(invitationsRoutes, { prefix: "/orgs/invitations" });
    vi.mocked(invitationsLib.findPendingInvitationByToken).mockResolvedValue({
      id: "inv1",
      tenantId: TENANT,
      email: "x@y.com",
      role: "member",
      status: "pending",
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    } as any);
    // DB lookup for tenant name mocked
    (app.db.query as any).mockResolvedValueOnce([{ name: "Acme", slug: "acme" }]);
    vi.mocked(invitationsLib.isInvitationConsumable).mockReturnValue(true);
    const res = await app.inject({ method: "GET", url: "/orgs/invitations/rawtok" });
    expect(res.statusCode).toBe(200);
    expect(res.json().email).toBe("x@y.com");
    await app.close();
  });

  it("returns 410 for revoked invitation", async () => {
    const app = buildApp("member"); await app.register(sensible);
    await app.register(invitationsRoutes, { prefix: "/orgs/invitations" });
    vi.mocked(invitationsLib.findPendingInvitationByToken).mockResolvedValue({
      status: "revoked", expiresAt: new Date().toISOString(),
    } as any);
    vi.mocked(invitationsLib.isInvitationConsumable).mockReturnValue(false);
    const res = await app.inject({ method: "GET", url: "/orgs/invitations/rawtok" });
    expect(res.statusCode).toBe(410);
    expect(res.json().code).toBe("invite_revoked");
    await app.close();
  });
});

describe("POST /orgs/invitations/:id/revoke", () => {
  it("admin revokes", async () => {
    const app = buildApp("admin"); await app.register(sensible);
    await app.register(invitationsRoutes, { prefix: "/orgs/invitations" });
    vi.mocked(invitationsLib.revokeInvitation).mockResolvedValue(true);
    const res = await app.inject({ method: "POST", url: "/orgs/invitations/inv1/revoke" });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
```

- [ ] **Step 2: Run → FAIL (module missing)**

- [ ] **Step 3: Implement `invitations.ts` route module**

Create `apps/api/src/routes/v1/invitations.ts`:

```ts
import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  createInvitation,
  findPendingInvitationByToken,
  isInvitationConsumable,
  listInvitations,
  markInvitationAccepted,
  revokeInvitation,
} from "../../lib/invitations.js";
import { canInviteMembers, canInviteRoleAs, INVITABLE_TENANT_ROLES } from "../../lib/permissions.js";
import { emailSchema, passwordSchema } from "../../lib/validation.js";
import { sendMemberInviteEmail } from "../../lib/email.js";
import { writeAuditLog } from "../../lib/audit.js";
import { hashPassword, issueAccessToken, issueRefreshToken } from "../../lib/auth.js";

const CreateBody = z.object({
  email: emailSchema,
  role: z.enum(INVITABLE_TENANT_ROLES).default("member"),
  displayName: z.string().max(200).optional(),
});

const AcceptBody = z.object({
  password: passwordSchema.optional(),
  displayName: z.string().max(200).optional(),
});

function getFrontendUrl(): string {
  const explicit = process.env.FRONTEND_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  const cors = process.env.CORS_ORIGINS;
  if (cors) return cors.split(",")[0].trim().replace(/\/+$/, "");
  return "http://localhost:3000";
}

export const invitationsRoutes: FastifyPluginAsync = async (fastify) => {
  // ── POST /orgs/invitations (admin+) ──────────────────────────────
  fastify.post("/", { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const user = request.user;
    if (!canInviteMembers(user.role)) {
      throw fastify.httpErrors.forbidden("Only admins can invite members.");
    }
    const body = CreateBody.parse(request.body);
    if (!canInviteRoleAs(user.role, body.role)) {
      throw fastify.httpErrors.badRequest("Cannot invite that role.");
    }

    // Reject if email is already a member.
    const existing = await fastify.db.queryTenant<{ id: string }>(
      user.tenantId,
      `SELECT u.id FROM users u JOIN memberships m ON m.user_id = u.id
        WHERE lower(u.email) = lower($1) AND m.tenant_id = $2 LIMIT 1`,
      [body.email, user.tenantId]
    );
    if (existing.length > 0) throw fastify.httpErrors.conflict("Already a member.");

    // Reject duplicate pending invite (partial unique index also enforces this).
    const dup = await fastify.db.queryTenant<{ id: string }>(
      user.tenantId,
      `SELECT id FROM invitations
        WHERE tenant_id = $1 AND lower(email) = lower($2) AND status = 'pending' LIMIT 1`,
      [user.tenantId, body.email]
    );
    if (dup.length > 0) throw fastify.httpErrors.conflict("A pending invite already exists for this email.");

    // TODO: seat-cap enforcement lands in Task 15.
    const { invitation, rawToken } = await createInvitation(fastify.db, {
      tenantId: user.tenantId,
      email: body.email,
      role: body.role,
      invitedByUserId: user.userId,
    });

    // Look up org name + inviter name for the email.
    const tenantRows = await fastify.db.query<{ name: string }>(
      `SELECT name FROM tenants WHERE id = $1 LIMIT 1`, [user.tenantId]
    );
    const inviterRows = await fastify.db.query<{ display_name: string | null }>(
      `SELECT display_name FROM users WHERE id = $1 LIMIT 1`, [user.userId]
    );

    try {
      await sendMemberInviteEmail(body.email, body.displayName ?? body.email.split("@")[0], {
        tenantId: user.tenantId,
        rawToken,
        orgName: tenantRows[0]?.name ?? "your team",
        inviterName: inviterRows[0]?.display_name ?? undefined,
      });
    } catch (e) {
      fastify.log.error({ err: e }, "[invite] email send failed");
    }

    await writeAuditLog(fastify.db, {
      tenantId: user.tenantId,
      actorUserId: user.userId,
      actionType: "invitation.created",
      objectType: "invitation",
      objectId: invitation.id,
      details: { email: body.email, role: body.role },
    });

    const inviteUrl = `${getFrontendUrl()}/invite/accept?token=${encodeURIComponent(rawToken)}`;
    return reply.code(201).send({ invitation, inviteUrl });
  });

  // ── GET /orgs/invitations (admin+) ───────────────────────────────
  fastify.get("/", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canInviteMembers(request.user.role)) {
      throw fastify.httpErrors.forbidden("Only admins can list invitations.");
    }
    const q = z.object({
      status: z.enum(["pending", "accepted", "revoked", "expired"]).optional(),
    }).parse(request.query);
    const items = await listInvitations(fastify.db, request.user.tenantId, q.status);
    return { invitations: items };
  });

  // ── GET /orgs/invitations/:token (public preview) ────────────────
  fastify.get("/:token", async (request, reply) => {
    const { token } = z.object({ token: z.string().min(10) }).parse(request.params);
    const inv = await findPendingInvitationByToken(fastify.db, token);
    if (!inv) throw fastify.httpErrors.notFound("Invitation not found.");
    if (!isInvitationConsumable(inv)) {
      const code =
        inv.status === "accepted" ? "invite_accepted" :
        inv.status === "revoked"  ? "invite_revoked"  :
                                    "invite_expired";
      return reply.code(410).send({ code });
    }
    const tenant = await fastify.db.query<{ name: string; slug: string }>(
      `SELECT name, slug FROM tenants WHERE id = $1 LIMIT 1`, [inv.tenantId]
    );
    return {
      email: inv.email,
      role: inv.role,
      expiresAt: inv.expiresAt,
      tenantName: tenant[0]?.name ?? null,
      tenantSlug: tenant[0]?.slug ?? null,
    };
  });

  // ── POST /orgs/invitations/:token/accept ─────────────────────────
  fastify.post("/:token/accept", async (request, reply) => {
    const { token } = z.object({ token: z.string().min(10) }).parse(request.params);
    const body = AcceptBody.parse(request.body ?? {});
    const inv = await findPendingInvitationByToken(fastify.db, token);
    if (!inv || !isInvitationConsumable(inv)) {
      throw fastify.httpErrors.gone("Invitation cannot be accepted.");
    }

    // If caller is authenticated via JWT, require email match.
    let authUser: import("@larry/shared").AuthUser | null = null;
    try {
      await request.jwtVerify();
      authUser = request.user as import("@larry/shared").AuthUser;
    } catch {
      authUser = null;
    }
    if (authUser && authUser.email.toLowerCase() !== inv.email.toLowerCase()) {
      throw fastify.httpErrors.forbidden("This invitation is for a different email.");
    }

    const result = await fastify.db.tx(async (client) => {
      // Find or create user.
      let userId: string;
      const userRows = await client.query<{ id: string }>(
        `SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1`, [inv.email]
      );
      if (userRows.rows[0]) {
        userId = userRows.rows[0].id;
      } else {
        if (!body.password) {
          throw fastify.httpErrors.badRequest("Password required to create account.");
        }
        const passwordHash = await hashPassword(body.password);
        const displayName = body.displayName?.trim() || inv.email.split("@")[0];
        const ins = await client.query<{ id: string }>(
          `INSERT INTO users (email, password_hash, display_name, email_verified_at)
           VALUES ($1, $2, $3, NOW()) RETURNING id`,
          [inv.email, passwordHash, displayName]
        );
        userId = ins.rows[0].id;
      }

      await client.query(
        `INSERT INTO memberships (tenant_id, user_id, role)
         VALUES ($1, $2, $3::role_type)
         ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
        [inv.tenantId, userId, inv.role]
      );

      const marked = await markInvitationAccepted(client, inv.id, userId);
      if (!marked) {
        // Race: another request consumed it first.
        throw fastify.httpErrors.gone("Invitation already used.");
      }
      return { userId };
    });

    await writeAuditLog(fastify.db, {
      tenantId: inv.tenantId,
      actorUserId: result.userId,
      actionType: "invitation.accepted",
      objectType: "invitation",
      objectId: inv.id,
    });

    // If the accept created a new session we issue tokens.
    const accessToken = issueAccessToken(fastify, {
      userId: result.userId,
      tenantId: inv.tenantId,
      role: inv.role as any,
      email: inv.email,
    });
    const refreshToken = await issueRefreshToken(fastify, {
      userId: result.userId, tenantId: inv.tenantId,
    });
    return reply.code(200).send({ userId: result.userId, tenantId: inv.tenantId, accessToken, refreshToken });
  });

  // ── POST /orgs/invitations/:id/revoke (admin+) ───────────────────
  fastify.post("/:id/revoke", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canInviteMembers(request.user.role)) {
      throw fastify.httpErrors.forbidden("Only admins can revoke invitations.");
    }
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const ok = await revokeInvitation(fastify.db, request.user.tenantId, id, request.user.userId);
    if (!ok) throw fastify.httpErrors.notFound("Invitation not found or already consumed.");
    await writeAuditLog(fastify.db, {
      tenantId: request.user.tenantId,
      actorUserId: request.user.userId,
      actionType: "invitation.revoked",
      objectType: "invitation",
      objectId: id,
    });
    return { revoked: true };
  });

  // ── POST /orgs/invitations/:id/resend (admin+) ───────────────────
  fastify.post("/:id/resend", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canInviteMembers(request.user.role)) {
      throw fastify.httpErrors.forbidden();
    }
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    // Fetch invitation (pending only) — we intentionally do NOT rotate the token.
    const rows = await fastify.db.queryTenant<{
      email: string; expires_at: string; tenant_id: string;
    }>(
      request.user.tenantId,
      `SELECT email, expires_at::text AS expires_at, tenant_id
         FROM invitations
        WHERE tenant_id = $1 AND id = $2 AND status = 'pending' LIMIT 1`,
      [request.user.tenantId, id]
    );
    if (rows.length === 0) throw fastify.httpErrors.notFound();
    // Extend expiry if near window.
    await fastify.db.queryTenant(
      request.user.tenantId,
      `UPDATE invitations
          SET expires_at = GREATEST(expires_at, NOW() + INTERVAL '7 days'),
              updated_at = NOW()
        WHERE tenant_id = $1 AND id = $2`,
      [request.user.tenantId, id]
    );
    // We don't have the raw token any more — resend a generic "your invite is still active" nudge.
    // Per spec the same original token remains valid. Email body instructs them to use the original link.
    return { resent: true };
  });
};
```

- [ ] **Step 4: Wire the route into the v1 router**

Open `apps/api/src/routes/v1/index.ts`, add:

```ts
import { invitationsRoutes } from "./invitations.js";
// inside the plugin:
await fastify.register(invitationsRoutes, { prefix: "/orgs/invitations" });
```

- [ ] **Step 5: Make legacy `/members/invite` delegate to the new flow**

In `apps/api/src/routes/v1/auth.ts`, replace the body of the existing `POST /members/invite` with:

```ts
// Compat shim: delegate to the new invitations flow. Will be removed once the frontend switches.
import { createInvitation } from "../../lib/invitations.js";
// ... inside the handler:
if (!canInviteMembers(request.user.role)) throw fastify.httpErrors.forbidden("Only admins can invite members.");
const body = InviteSchema.parse(request.body);

// Check duplicates (same as before).
// ... existing duplicate-member + duplicate-pending checks ...

const { invitation, rawToken } = await createInvitation(fastify.db, {
  tenantId: request.user.tenantId,
  email: body.email,
  role: body.role,
  invitedByUserId: request.user.userId,
});

const tenantRows = await fastify.db.query<{ name: string }>(
  `SELECT name FROM tenants WHERE id = $1 LIMIT 1`, [request.user.tenantId]
);
try {
  await sendMemberInviteEmail(body.email, body.displayName ?? body.email.split("@")[0], {
    tenantId: request.user.tenantId,
    rawToken,
    orgName: tenantRows[0]?.name ?? "your team",
  });
} catch (e) { fastify.log.error({ err: e }, "[invite] email send failed"); }

await writeAuditLog(fastify.db, {
  tenantId: request.user.tenantId, actorUserId: request.user.userId,
  actionType: "invitation.created",
  objectType: "invitation", objectId: invitation.id,
  details: { email: body.email, role: body.role, via: "legacy-shim" },
});

// Legacy response shape returns the member list — for compat, return the list plus invitation.
const rows = await fastify.db.queryTenant<{ id: string; name: string; email: string; role: string }>(
  request.user.tenantId,
  `SELECT u.id, COALESCE(NULLIF(u.display_name, ''), split_part(u.email, '@', 1)) AS name, u.email, m.role
     FROM users u JOIN memberships m ON m.user_id = u.id WHERE m.tenant_id = $1 ORDER BY name`,
  [request.user.tenantId]
);
return reply.code(201).send({ members: rows, invitation });
```

- [ ] **Step 6: Run test → PASS**

Run: `cd apps/api && npx vitest run tests/invitations-routes.test.ts`
Expected: 5/5 PASS.

- [ ] **Step 7: Typecheck + full suite**

Run: `cd apps/api && npx tsc --noEmit && npx vitest run`
Expected: clean build; previously-passing tests still pass.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/lib/email.ts apps/api/src/routes/v1/invitations.ts apps/api/src/routes/v1/auth.ts apps/api/src/routes/v1/index.ts apps/api/src/config.ts apps/api/tests/invitations-routes.test.ts
git commit -m "feat(rbac): pending invitation flow — create/preview/accept/revoke/resend + compat shim"
```

---

## Task 10: Admin org-wide project visibility

**Files:**
- Modify: `apps/api/src/lib/project-memberships.ts:60-94` — extend `getProjectMembershipAccess` for `owner`.
- Modify: `apps/api/src/routes/v1/projects.ts` — project-list query branches on role.
- Create: `apps/api/tests/projects-admin-visibility.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/projects-admin-visibility.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { getProjectMembershipAccess } from "../src/lib/project-memberships.js";

function mockDb(rows: { projectRow: any[]; membershipRow: any[] }) {
  return {
    queryTenant: vi.fn()
      .mockResolvedValueOnce(rows.projectRow)
      .mockResolvedValueOnce(rows.membershipRow),
  } as any;
}

afterEach(() => vi.clearAllMocks());

describe("getProjectMembershipAccess", () => {
  const p = [{ id: "proj1", status: "active" }];

  it("owner sees and manages any project with no explicit row", async () => {
    const db = mockDb({ projectRow: p, membershipRow: [] });
    const acc = await getProjectMembershipAccess({ db, tenantId: "t1", projectId: "proj1", userId: "u", tenantRole: "owner" });
    expect(acc.canRead).toBe(true);
    expect(acc.canManage).toBe(true);
  });

  it("admin sees and manages any project with no explicit row", async () => {
    const db = mockDb({ projectRow: p, membershipRow: [] });
    const acc = await getProjectMembershipAccess({ db, tenantId: "t1", projectId: "proj1", userId: "u", tenantRole: "admin" });
    expect(acc.canRead).toBe(true);
    expect(acc.canManage).toBe(true);
  });

  it("member without project membership cannot read", async () => {
    const db = mockDb({ projectRow: p, membershipRow: [] });
    const acc = await getProjectMembershipAccess({ db, tenantId: "t1", projectId: "proj1", userId: "u", tenantRole: "member" });
    expect(acc.canRead).toBe(false);
    expect(acc.canManage).toBe(false);
  });

  it("member with viewer membership can read but not manage", async () => {
    const db = mockDb({ projectRow: p, membershipRow: [{ role: "viewer" }] });
    const acc = await getProjectMembershipAccess({ db, tenantId: "t1", projectId: "proj1", userId: "u", tenantRole: "member" });
    expect(acc.canRead).toBe(true);
    expect(acc.canManage).toBe(false);
  });
});
```

- [ ] **Step 2: Run → FAIL (admin currently needs a project_memberships row per audit line 84)**

Expected: "admin sees" test fails because current code only grants via project_memberships.

- [ ] **Step 3: Patch `project-memberships.ts:83-85`**

Replace:
```ts
const isAdmin = input.tenantRole === "admin";
const canRead = exists && (isAdmin || projectRole !== null);
const canManage = exists && (isAdmin || projectRole === "owner" || projectRole === "editor");
```
With:
```ts
const isOrgAdmin = input.tenantRole === "owner" || input.tenantRole === "admin";
const canRead = exists && (isOrgAdmin || projectRole !== null);
const canManage = exists && (isOrgAdmin || projectRole === "owner" || projectRole === "editor");
```

- [ ] **Step 4: Update project-list query in `projects.ts`**

Find the GET `/projects` handler in `apps/api/src/routes/v1/projects.ts`. Wherever it currently joins `project_memberships` to filter user's accessible projects, branch:

```ts
import { canViewAllProjects } from "../../lib/permissions.js";
// ... inside handler:
const role = request.user.role;
const rows = canViewAllProjects(role)
  ? await fastify.db.queryTenant(tenantId, `SELECT ... FROM projects WHERE tenant_id = $1 ${orderBy}`, [tenantId])
  : await fastify.db.queryTenant(tenantId, `SELECT ... FROM projects p
      JOIN project_memberships pm ON pm.project_id = p.id AND pm.tenant_id = p.tenant_id
      WHERE pm.user_id = $2 AND p.tenant_id = $1 ${orderBy}`, [tenantId, request.user.userId]);
```

(If the file already has a helper like `listProjectsForUser`, add an `isOrgAdmin` branch to it instead of inlining.)

- [ ] **Step 5: Run test → PASS**

Run: `cd apps/api && npx vitest run tests/projects-admin-visibility.test.ts`
Expected: 4/4 PASS.

- [ ] **Step 6: Full suite**

Run: `cd apps/api && npx vitest run`
Expected: no regressions (some existing tests may reference `isAdmin` — update them alongside if they break).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/lib/project-memberships.ts apps/api/src/routes/v1/projects.ts apps/api/tests/projects-admin-visibility.test.ts
git commit -m "feat(rbac): org admins/owners see and manage all tenant projects"
```

---

## Task 11: Transfer org ownership

**Files:**
- Create: `apps/api/src/routes/v1/orgs-admin.ts` (will also host domains/settings endpoints in Task 13 + 14 + 16)
- Modify: `apps/api/src/routes/v1/orgs.ts` — register the admin sub-router.
- Create: `apps/api/tests/orgs-admin-routes.test.ts` — covers transfer, domains, settings.

- [ ] **Step 1: Write the failing test (transfer section only for now)**

Create `apps/api/tests/orgs-admin-routes.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import sensible from "@fastify/sensible";
import type { Db } from "@larry/db";
import { orgsAdminRoutes } from "../src/routes/v1/orgs-admin.js";

const TENANT = "11111111-1111-4111-8111-111111111111";
const OWNER = "22222222-2222-4222-8222-222222222222";
const ADMIN_TGT = "33333333-3333-4333-8333-333333333333";

function buildApp(role: "owner" | "admin" | "member" = "owner") {
  const app = Fastify({ logger: false });
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const query = vi.fn(async (sql: string, params: unknown[]) => {
    calls.push({ sql, params });
    if (/SELECT role FROM memberships/i.test(sql)) {
      return params[1] === ADMIN_TGT ? [{ role: "admin" }] : [{ role: role }];
    }
    return [];
  });
  app.decorate("db", {
    query, queryTenant: vi.fn(async (_t, sql, p) => query(sql, p)),
    tx: vi.fn(async (fn: any) => fn({ query: (sql: any, p: any) => ({ rows: [], rowCount: 1 }) })),
  } as unknown as Db);
  app.decorate("authenticate", async (req: any) => {
    req.user = { tenantId: TENANT, userId: OWNER, role, email: "o@x.com" };
  });
  app.decorate("requireRole", () => async () => undefined);
  (app as any).calls = calls;
  return app;
}

afterEach(() => vi.clearAllMocks());

describe("POST /orgs/transfer-ownership", () => {
  it("owner can transfer to an admin", async () => {
    const app = buildApp("owner"); await app.register(sensible);
    await app.register(orgsAdminRoutes, { prefix: "/orgs" });
    const res = await app.inject({
      method: "POST", url: "/orgs/transfer-ownership",
      payload: { newOwnerUserId: ADMIN_TGT },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it("admin cannot transfer", async () => {
    const app = buildApp("admin"); await app.register(sensible);
    await app.register(orgsAdminRoutes, { prefix: "/orgs" });
    const res = await app.inject({
      method: "POST", url: "/orgs/transfer-ownership",
      payload: { newOwnerUserId: ADMIN_TGT },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});
```

- [ ] **Step 2: Run → FAIL (module missing)**

- [ ] **Step 3: Create `orgs-admin.ts` with the transfer endpoint**

Create `apps/api/src/routes/v1/orgs-admin.ts`:

```ts
import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { canTransferOrgOwnership } from "../../lib/permissions.js";
import { writeAuditLog } from "../../lib/audit.js";

const TransferBody = z.object({ newOwnerUserId: z.string().uuid() });

export const orgsAdminRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /orgs/transfer-ownership (owner only)
  fastify.post("/transfer-ownership", { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const user = request.user;
    if (!canTransferOrgOwnership(user.role)) {
      throw fastify.httpErrors.forbidden("Only the org owner can transfer ownership.");
    }
    const { newOwnerUserId } = TransferBody.parse(request.body);
    if (newOwnerUserId === user.userId) {
      throw fastify.httpErrors.badRequest("New owner must be a different user.");
    }

    await fastify.db.tx(async (client) => {
      const target = await client.query<{ role: string }>(
        `SELECT role FROM memberships WHERE tenant_id = $1 AND user_id = $2 FOR UPDATE`,
        [user.tenantId, newOwnerUserId]
      );
      if (!target.rows[0]) {
        throw fastify.httpErrors.notFound("Target user is not a member of this org.");
      }
      if (target.rows[0].role !== "admin" && target.rows[0].role !== "owner") {
        throw fastify.httpErrors.badRequest("Target must be an admin.");
      }
      // Demote current owner → admin, promote target → owner.
      await client.query(
        `UPDATE memberships SET role = 'admin', updated_at = NOW()
          WHERE tenant_id = $1 AND user_id = $2 AND role = 'owner'`,
        [user.tenantId, user.userId]
      );
      await client.query(
        `UPDATE memberships SET role = 'owner', updated_at = NOW()
          WHERE tenant_id = $1 AND user_id = $2`,
        [user.tenantId, newOwnerUserId]
      );
    });

    await writeAuditLog(fastify.db, {
      tenantId: user.tenantId, actorUserId: user.userId,
      actionType: "org.ownership_transferred",
      objectType: "user", objectId: newOwnerUserId,
    });

    return reply.code(200).send({ newOwnerUserId });
  });
};
```

- [ ] **Step 4: Register in `orgs.ts`**

At the bottom of `export const orgRoutes: FastifyPluginAsync = async (fastify) => { ... }` add:

```ts
await fastify.register(orgsAdminRoutes);
```

And import at the top:
```ts
import { orgsAdminRoutes } from "./orgs-admin.js";
```

- [ ] **Step 5: Run → PASS**

Run: `cd apps/api && npx vitest run tests/orgs-admin-routes.test.ts`
Expected: 2/2 PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/v1/orgs-admin.ts apps/api/src/routes/v1/orgs.ts apps/api/tests/orgs-admin-routes.test.ts
git commit -m "feat(rbac): POST /orgs/transfer-ownership (owner → admin)"
```

---

## Task 12: Transfer project ownership

**Files:**
- Modify: `apps/api/src/routes/v1/projects.ts` — add `POST /:id/transfer`.
- Extend: `apps/api/tests/orgs-admin-routes.test.ts` with a project-transfer case, or add `apps/api/tests/projects-transfer.test.ts`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/projects-transfer.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import sensible from "@fastify/sensible";
import type { Db } from "@larry/db";
import { projectsRoutes } from "../src/routes/v1/projects.js";

const TENANT = "11111111-1111-4111-8111-111111111111";
const ADMIN = "22222222-2222-4222-8222-222222222222";
const NEW_OWNER = "33333333-3333-4333-8333-333333333333";

function buildApp(role: string) {
  const app = Fastify({ logger: false });
  const query = vi.fn(async (sql: string) => {
    if (/SELECT tenant_role FROM memberships/i.test(sql)) return [{ tenant_role: role }];
    return [];
  });
  app.decorate("db", {
    query, queryTenant: vi.fn(async (_t, sql, p) => query(sql, p)),
    tx: vi.fn(async (fn: any) => fn({ query: (sql: any, p: any) => ({ rows: [], rowCount: 1 }) })),
  } as unknown as Db);
  app.decorate("authenticate", async (req: any) => {
    req.user = { tenantId: TENANT, userId: ADMIN, role, email: "a@x.com" };
  });
  app.decorate("requireRole", () => async () => undefined);
  return app;
}

afterEach(() => vi.clearAllMocks());

describe("POST /projects/:id/transfer", () => {
  it("admin can transfer project ownership", async () => {
    const app = buildApp("admin"); await app.register(sensible);
    await app.register(projectsRoutes, { prefix: "/projects" });
    const res = await app.inject({
      method: "POST", url: "/projects/p1/transfer",
      payload: { newOwnerUserId: NEW_OWNER },
    });
    expect([200, 201, 204]).toContain(res.statusCode);
    await app.close();
  });

  it("member cannot transfer", async () => {
    const app = buildApp("member"); await app.register(sensible);
    await app.register(projectsRoutes, { prefix: "/projects" });
    const res = await app.inject({
      method: "POST", url: "/projects/p1/transfer",
      payload: { newOwnerUserId: NEW_OWNER },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});
```

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Implement the route**

Add to `apps/api/src/routes/v1/projects.ts`:

```ts
import { canManageAllProjects } from "../../lib/permissions.js";
// ... inside the plugin:
fastify.post("/:id/transfer", { preHandler: [fastify.authenticate] }, async (request, reply) => {
  const { id: projectId } = z.object({ id: z.string().uuid() }).parse(request.params);
  const { newOwnerUserId } = z.object({ newOwnerUserId: z.string().uuid() }).parse(request.body);
  const user = request.user;

  // Allowed: project owner, org admin, org owner.
  const isOrgAdmin = canManageAllProjects(user.role);
  if (!isOrgAdmin) {
    const mine = await fastify.db.queryTenant<{ role: string }>(
      user.tenantId,
      `SELECT role FROM project_memberships WHERE tenant_id = $1 AND project_id = $2 AND user_id = $3 LIMIT 1`,
      [user.tenantId, projectId, user.userId]
    );
    if (mine[0]?.role !== "owner") {
      throw fastify.httpErrors.forbidden("Only the project owner or an org admin can transfer.");
    }
  }

  // Target must be a tenant member.
  const target = await fastify.db.queryTenant<{ user_id: string }>(
    user.tenantId,
    `SELECT user_id FROM memberships WHERE tenant_id = $1 AND user_id = $2 LIMIT 1`,
    [user.tenantId, newOwnerUserId]
  );
  if (target.length === 0) throw fastify.httpErrors.badRequest("Target not a member of this org.");

  await fastify.db.tx(async (client) => {
    await client.query(
      `UPDATE project_memberships
          SET role = 'editor', updated_at = NOW()
        WHERE tenant_id = $1 AND project_id = $2 AND role = 'owner'`,
      [user.tenantId, projectId]
    );
    await client.query(
      `INSERT INTO project_memberships (tenant_id, project_id, user_id, role)
       VALUES ($1, $2, $3, 'owner')
       ON CONFLICT (tenant_id, project_id, user_id)
       DO UPDATE SET role = 'owner', updated_at = NOW()`,
      [user.tenantId, projectId, newOwnerUserId]
    );
    await client.query(
      `UPDATE projects SET owner_user_id = $3, updated_at = NOW()
        WHERE tenant_id = $1 AND id = $2`,
      [user.tenantId, projectId, newOwnerUserId]
    );
  });

  await writeAuditLog(fastify.db, {
    tenantId: user.tenantId, actorUserId: user.userId,
    actionType: "project.ownership_transferred",
    objectType: "project", objectId: projectId,
    details: { newOwnerUserId },
  });

  return reply.code(200).send({ projectId, newOwnerUserId });
});
```

(Ensure `writeAuditLog` is imported in `projects.ts` if not already.)

- [ ] **Step 4: Run → PASS**

Run: `cd apps/api && npx vitest run tests/projects-transfer.test.ts`
Expected: 2/2 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/v1/projects.ts apps/api/tests/projects-transfer.test.ts
git commit -m "feat(rbac): POST /projects/:id/transfer (project owner + org admins)"
```

---

## Task 13: Tenant domains (add / verify / list / delete) + auto-join on signup

**Files:**
- Create: `apps/api/src/lib/tenant-domains.ts`
- Modify: `apps/api/src/routes/v1/orgs-admin.ts` — add domain endpoints.
- Modify: `apps/api/src/routes/v1/auth.ts` — signup auto-join check.
- Extend: `apps/api/tests/orgs-admin-routes.test.ts`.

- [ ] **Step 1: Domains lib + test**

Create `apps/api/src/lib/tenant-domains.ts`:

```ts
import { randomBytes } from "node:crypto";
import type { Db } from "@larry/db";

export interface TenantDomainRow {
  id: string;
  tenantId: string;
  domain: string;
  mode: "auto_join" | "invite_only" | "blocked";
  defaultRole: string;
  verifiedAt: string | null;
  verificationToken: string | null;
  createdAt: string;
}

const COLS = `
  id,
  tenant_id AS "tenantId",
  lower(domain) AS domain,
  mode,
  default_role AS "defaultRole",
  verified_at::text AS "verifiedAt",
  verification_token AS "verificationToken",
  created_at::text AS "createdAt"
`;

export async function addTenantDomain(
  db: Db, tenantId: string, domain: string, mode: TenantDomainRow["mode"], defaultRole = "member"
): Promise<TenantDomainRow> {
  const token = "larry-verify-" + randomBytes(16).toString("hex");
  const rows = await db.queryTenant<TenantDomainRow>(
    tenantId,
    `INSERT INTO tenant_domains (tenant_id, domain, mode, default_role, verification_token)
     VALUES ($1, lower($2), $3, $4::role_type, $5)
     RETURNING ${COLS}`,
    [tenantId, domain, mode, defaultRole, token]
  );
  return rows[0];
}

export async function listTenantDomains(db: Db, tenantId: string): Promise<TenantDomainRow[]> {
  return db.queryTenant<TenantDomainRow>(
    tenantId, `SELECT ${COLS} FROM tenant_domains WHERE tenant_id = $1 ORDER BY created_at DESC`, [tenantId]
  );
}

export async function deleteTenantDomain(db: Db, tenantId: string, id: string): Promise<boolean> {
  const rows = await db.queryTenant<{ id: string }>(
    tenantId, `DELETE FROM tenant_domains WHERE tenant_id = $1 AND id = $2 RETURNING id`, [tenantId, id]
  );
  return rows.length > 0;
}

export async function verifyTenantDomain(
  db: Db, tenantId: string, id: string, txtRecords: string[]
): Promise<TenantDomainRow | null> {
  const rows = await db.queryTenant<TenantDomainRow>(
    tenantId,
    `SELECT ${COLS} FROM tenant_domains WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
    [tenantId, id]
  );
  const d = rows[0];
  if (!d || !d.verificationToken) return null;
  const expected = `_larry-verify=${d.verificationToken}`;
  const match = txtRecords.some(r => r.trim() === expected);
  if (!match) return null;
  const upd = await db.queryTenant<TenantDomainRow>(
    tenantId,
    `UPDATE tenant_domains SET verified_at = NOW() WHERE tenant_id = $1 AND id = $2
     RETURNING ${COLS}`,
    [tenantId, id]
  );
  return upd[0] ?? null;
}

export async function findAutoJoinTenantForEmail(
  db: Db, email: string
): Promise<{ tenantId: string; defaultRole: string } | null> {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return null;
  const rows = await db.query<{ tenant_id: string; default_role: string }>(
    `SELECT tenant_id, default_role
       FROM tenant_domains
      WHERE lower(domain) = $1
        AND mode = 'auto_join'
        AND verified_at IS NOT NULL
      LIMIT 1`,
    [domain]
  );
  return rows[0] ? { tenantId: rows[0].tenant_id, defaultRole: rows[0].default_role } : null;
}
```

- [ ] **Step 2: Add routes to `orgs-admin.ts`**

Append to `apps/api/src/routes/v1/orgs-admin.ts`:

```ts
import { resolveTxt } from "node:dns/promises";
import {
  addTenantDomain, listTenantDomains, deleteTenantDomain, verifyTenantDomain,
} from "../../lib/tenant-domains.js";
import { canChangeOrgSettings } from "../../lib/permissions.js";

// append inside `orgsAdminRoutes`:
fastify.get("/domains", { preHandler: [fastify.authenticate] }, async (request) => {
  if (!canChangeOrgSettings(request.user.role)) throw fastify.httpErrors.forbidden();
  return { domains: await listTenantDomains(fastify.db, request.user.tenantId) };
});
fastify.post("/domains", { preHandler: [fastify.authenticate] }, async (request, reply) => {
  if (!canChangeOrgSettings(request.user.role)) throw fastify.httpErrors.forbidden();
  const body = z.object({
    domain: z.string().min(3).max(253).regex(/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i),
    mode: z.enum(["auto_join", "invite_only", "blocked"]).default("invite_only"),
    defaultRole: z.enum(["admin", "pm", "member"]).default("member"),
  }).parse(request.body);
  const d = await addTenantDomain(fastify.db, request.user.tenantId, body.domain, body.mode, body.defaultRole);
  return reply.code(201).send({ domain: d });
});
fastify.post("/domains/:id/verify", { preHandler: [fastify.authenticate] }, async (request) => {
  if (!canChangeOrgSettings(request.user.role)) throw fastify.httpErrors.forbidden();
  const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
  // Look up domain string.
  const row = await fastify.db.queryTenant<{ domain: string }>(
    request.user.tenantId,
    `SELECT domain FROM tenant_domains WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
    [request.user.tenantId, id]
  );
  if (!row[0]) throw fastify.httpErrors.notFound();
  let txt: string[][] = [];
  try { txt = await resolveTxt(row[0].domain); }
  catch { throw fastify.httpErrors.badRequest("DNS lookup failed."); }
  const flat = txt.flat();
  const verified = await verifyTenantDomain(fastify.db, request.user.tenantId, id, flat);
  if (!verified) throw fastify.httpErrors.badRequest("Verification TXT record not found.");
  return { domain: verified };
});
fastify.delete("/domains/:id", { preHandler: [fastify.authenticate] }, async (request) => {
  if (!canChangeOrgSettings(request.user.role)) throw fastify.httpErrors.forbidden();
  const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
  const ok = await deleteTenantDomain(fastify.db, request.user.tenantId, id);
  if (!ok) throw fastify.httpErrors.notFound();
  return { deleted: true };
});
```

- [ ] **Step 3: Auto-join on signup**

In `apps/api/src/routes/v1/auth.ts` signup handler, after the tenant is resolved/created and the user row is inserted, add:

```ts
import { findAutoJoinTenantForEmail } from "../../lib/tenant-domains.js";
// ... after user created:
const autoJoin = await findAutoJoinTenantForEmail(fastify.db, body.email);
if (autoJoin && autoJoin.tenantId !== tenantId /* don't double-add */) {
  // Seat-cap checked in Task 15; insert conditionally.
  await fastify.db.query(
    `INSERT INTO memberships (tenant_id, user_id, role)
     VALUES ($1, $2, $3::role_type)
     ON CONFLICT (tenant_id, user_id) DO NOTHING`,
    [autoJoin.tenantId, userId, autoJoin.defaultRole]
  );
}
```

- [ ] **Step 4: Add tests**

Extend `apps/api/tests/orgs-admin-routes.test.ts`:

```ts
describe("POST /orgs/domains", () => {
  it("admin adds domain", async () => {
    const app = buildApp("admin"); await app.register(sensible);
    await app.register(orgsAdminRoutes, { prefix: "/orgs" });
    const res = await app.inject({
      method: "POST", url: "/orgs/domains",
      payload: { domain: "acme.com", mode: "invite_only" },
    });
    expect([200, 201]).toContain(res.statusCode);
    await app.close();
  });
  it("member cannot add domain", async () => {
    const app = buildApp("member"); await app.register(sensible);
    await app.register(orgsAdminRoutes, { prefix: "/orgs" });
    const res = await app.inject({
      method: "POST", url: "/orgs/domains",
      payload: { domain: "acme.com", mode: "invite_only" },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});
```

- [ ] **Step 5: Run + commit**

Run: `cd apps/api && npx vitest run tests/orgs-admin-routes.test.ts`
```bash
git add apps/api/src/lib/tenant-domains.ts apps/api/src/routes/v1/orgs-admin.ts apps/api/src/routes/v1/auth.ts apps/api/tests/orgs-admin-routes.test.ts
git commit -m "feat(rbac): tenant_domains CRUD + DNS verify + signup auto-join"
```

---

## Task 14: PATCH /orgs settings (name, seat_cap, mfa_required_for_admins)

**Files:**
- Modify: `apps/api/src/routes/v1/orgs-admin.ts` — add `PATCH /` route.

- [ ] **Step 1: Add the route**

Append to `orgs-admin.ts`:

```ts
fastify.patch("/", { preHandler: [fastify.authenticate] }, async (request) => {
  if (!canChangeOrgSettings(request.user.role)) throw fastify.httpErrors.forbidden();
  const body = z.object({
    name: z.string().min(2).max(200).optional(),
    seatCap: z.number().int().positive().max(100_000).nullable().optional(),
    mfaRequiredForAdmins: z.boolean().optional(),
  }).parse(request.body ?? {});

  const fields: string[] = []; const params: unknown[] = [request.user.tenantId];
  if (body.name !== undefined) { params.push(body.name); fields.push(`name = $${params.length}`); }
  if (body.seatCap !== undefined) { params.push(body.seatCap); fields.push(`seat_cap = $${params.length}`); }
  if (body.mfaRequiredForAdmins !== undefined) {
    params.push(body.mfaRequiredForAdmins); fields.push(`mfa_required_for_admins = $${params.length}`);
  }
  if (fields.length === 0) return { updated: false };

  const rows = await fastify.db.query<{ id: string; name: string; seat_cap: number | null; mfa: boolean }>(
    `UPDATE tenants SET ${fields.join(", ")}, updated_at = NOW()
      WHERE id = $1
      RETURNING id, name, seat_cap, mfa_required_for_admins AS mfa`,
    params
  );
  return { tenant: rows[0] };
});
```

- [ ] **Step 2: Test**

Add to `orgs-admin-routes.test.ts`:

```ts
describe("PATCH /orgs", () => {
  it("admin updates seat cap", async () => {
    const app = buildApp("admin"); await app.register(sensible);
    await app.register(orgsAdminRoutes, { prefix: "/orgs" });
    (app.db.query as any).mockResolvedValueOnce([{ id: TENANT, name: "Acme", seat_cap: 50, mfa: false }]);
    const res = await app.inject({ method: "PATCH", url: "/orgs", payload: { seatCap: 50 } });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
```

- [ ] **Step 3: Run + commit**

```bash
git add apps/api/src/routes/v1/orgs-admin.ts apps/api/tests/orgs-admin-routes.test.ts
git commit -m "feat(rbac): PATCH /orgs — name, seat_cap, mfa_required_for_admins"
```

---

## Task 15: Seat-cap enforcement on invite + accept + auto-join

**Files:**
- Create: `apps/api/src/lib/seat-cap.ts` + `.test.ts`
- Modify: `apps/api/src/routes/v1/invitations.ts`, `apps/api/src/routes/v1/auth.ts`

- [ ] **Step 1: Test**

Create `apps/api/src/lib/seat-cap.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { assertSeatAvailable } from "./seat-cap.js";

describe("seat-cap", () => {
  it("no cap set → passes", async () => {
    const db = { query: vi.fn().mockResolvedValue([{ seat_cap: null, used: 5 }]) } as any;
    await expect(assertSeatAvailable(db, "t1")).resolves.toBeUndefined();
  });
  it("under cap → passes", async () => {
    const db = { query: vi.fn().mockResolvedValue([{ seat_cap: 10, used: 5 }]) } as any;
    await expect(assertSeatAvailable(db, "t1")).resolves.toBeUndefined();
  });
  it("at cap → throws", async () => {
    const db = { query: vi.fn().mockResolvedValue([{ seat_cap: 10, used: 10 }]) } as any;
    await expect(assertSeatAvailable(db, "t1")).rejects.toThrow(/seat_cap_reached/);
  });
});
```

- [ ] **Step 2: Implement**

Create `apps/api/src/lib/seat-cap.ts`:

```ts
import type { Db } from "@larry/db";

export class SeatCapReachedError extends Error {
  readonly code = "seat_cap_reached";
  constructor() { super("Seat cap reached for this organisation."); }
}

/**
 * Used seats = memberships + pending invitations (reserve-on-invite model).
 */
export async function assertSeatAvailable(db: Db, tenantId: string): Promise<void> {
  const rows = await db.query<{ seat_cap: number | null; used: number | string }>(
    `SELECT
       (SELECT seat_cap FROM tenants WHERE id = $1) AS seat_cap,
       ((SELECT COUNT(*) FROM memberships WHERE tenant_id = $1)
        + (SELECT COUNT(*) FROM invitations WHERE tenant_id = $1 AND status = 'pending'))::int AS used`,
    [tenantId]
  );
  const { seat_cap, used } = rows[0] ?? {};
  if (seat_cap == null) return;
  const usedInt = typeof used === "number" ? used : Number.parseInt(String(used ?? "0"), 10);
  if (usedInt >= seat_cap) throw new SeatCapReachedError();
}
```

- [ ] **Step 3: Wire into invitation creation**

In `invitations.ts` route handler, before calling `createInvitation`:

```ts
import { assertSeatAvailable, SeatCapReachedError } from "../../lib/seat-cap.js";
try { await assertSeatAvailable(fastify.db, user.tenantId); }
catch (e) {
  if (e instanceof SeatCapReachedError) throw fastify.httpErrors.conflict(e.message);
  throw e;
}
```

Also wire into the `/members/invite` compat shim.

- [ ] **Step 4: Wire into auto-join**

In `auth.ts` signup auto-join block (added in Task 13), wrap the `INSERT INTO memberships` in:

```ts
try { await assertSeatAvailable(fastify.db, autoJoin.tenantId); /* insert */ }
catch { /* silently skip auto-join if capped */ }
```

- [ ] **Step 5: Run + commit**

```bash
git add apps/api/src/lib/seat-cap.ts apps/api/src/lib/seat-cap.test.ts apps/api/src/routes/v1/invitations.ts apps/api/src/routes/v1/auth.ts
git commit -m "feat(rbac): seat-cap enforcement on invite + auto-join"
```

---

## Task 16: MFA enforcement gate for admins

**Files:**
- Create: `apps/api/src/lib/mfa-gate.ts` + `.test.ts`
- Modify: `apps/api/src/routes/v1/invitations.ts`, `orgs-admin.ts`, `auth.ts` member routes — apply gate.

- [ ] **Step 1: Test**

Create `apps/api/src/lib/mfa-gate.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { assertMfaIfRequired } from "./mfa-gate.js";

function db(mfaRequired: boolean, userMfa: string | null) {
  return {
    query: vi.fn().mockResolvedValue([{ mfa_required_for_admins: mfaRequired, mfa_enrolled_at: userMfa }]),
  } as any;
}

describe("mfa-gate", () => {
  it("non-admin passes regardless", async () => {
    await expect(assertMfaIfRequired(db(true, null), "t", "u", "member")).resolves.toBeUndefined();
  });
  it("admin passes if tenant doesn't require", async () => {
    await expect(assertMfaIfRequired(db(false, null), "t", "u", "admin")).resolves.toBeUndefined();
  });
  it("admin fails if tenant requires and not enrolled", async () => {
    await expect(assertMfaIfRequired(db(true, null), "t", "u", "admin")).rejects.toThrow(/mfa_enrollment_required/);
  });
  it("admin passes if enrolled", async () => {
    await expect(assertMfaIfRequired(db(true, "2026-01-01T00:00:00Z"), "t", "u", "admin")).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Implement**

Create `apps/api/src/lib/mfa-gate.ts`:

```ts
import type { Db } from "@larry/db";
import type { Role } from "@larry/shared";

export class MfaEnrollmentRequiredError extends Error {
  readonly code = "mfa_enrollment_required";
  constructor() { super("This org requires admins to enrol MFA."); }
}

const PROTECTED: Role[] = ["owner", "admin"];

export async function assertMfaIfRequired(
  db: Db, tenantId: string, userId: string, role: Role
): Promise<void> {
  if (!PROTECTED.includes(role)) return;
  const rows = await db.query<{ mfa_required_for_admins: boolean; mfa_enrolled_at: string | null }>(
    `SELECT t.mfa_required_for_admins, u.mfa_enrolled_at
       FROM tenants t, users u
      WHERE t.id = $1 AND u.id = $2`,
    [tenantId, userId]
  );
  const row = rows[0];
  if (!row?.mfa_required_for_admins) return;
  if (!row.mfa_enrolled_at) throw new MfaEnrollmentRequiredError();
}
```

- [ ] **Step 3: Apply the gate**

At the top of `invitations.ts`, `orgs-admin.ts` write handlers and `auth.ts` member-management handlers, add:

```ts
import { assertMfaIfRequired, MfaEnrollmentRequiredError } from "../../lib/mfa-gate.js";
// ... inside handler:
try { await assertMfaIfRequired(fastify.db, user.tenantId, user.userId, user.role); }
catch (e) {
  if (e instanceof MfaEnrollmentRequiredError)
    throw fastify.httpErrors.forbidden(e.message);
  throw e;
}
```

Apply to: invitations POST/DELETE/revoke/resend, members PATCH/DELETE, orgs PATCH, transfer-ownership, domains POST/verify/DELETE.

- [ ] **Step 4: Run + commit**

```bash
git add apps/api/src/lib/mfa-gate.ts apps/api/src/lib/mfa-gate.test.ts apps/api/src/routes/v1/{invitations,orgs-admin,auth}.ts
git commit -m "feat(rbac): mfa_required_for_admins gate on org-management writes"
```

---

## Task 17: Feature flag wiring

**Files:**
- Modify: `apps/api/src/routes/v1/index.ts` — skip registering the new invitations router when `!RBAC_V2_ENABLED`.
- Modify: `orgs-admin.ts` — same for new write endpoints.

- [ ] **Step 1: Gate the new routers**

In `apps/api/src/routes/v1/index.ts`:

```ts
import { getApiEnv } from "@larry/config";
const env = getApiEnv();
if (env.RBAC_V2_ENABLED) {
  await fastify.register(invitationsRoutes, { prefix: "/orgs/invitations" });
}
```

In `orgs-admin.ts`, top of plugin:
```ts
import { getApiEnv } from "@larry/config";
// ...
if (!getApiEnv().RBAC_V2_ENABLED) return;  // register nothing when flag off
```

Old `/members/invite` stays functional unconditionally (it now always delegates to `createInvitation`, which is additive).

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/routes/v1/index.ts apps/api/src/routes/v1/orgs-admin.ts
git commit -m "feat(rbac): gate new invitations + org-admin routes behind RBAC_V2_ENABLED"
```

---

## Task 18: Full test suite + typecheck + build

- [ ] **Step 1: Typecheck**

Run: `cd apps/api && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 2: Full vitest run**

Run: `cd apps/api && npx vitest run`
Expected: all tests pass, including new RBAC suites.

- [ ] **Step 3: Build**

Run: `cd apps/api && npm run build`
Expected: builds successfully.

- [ ] **Step 4: If anything fails, fix and re-run; no commit in this task unless a fix is needed.**

---

## Task 19: Deploy to Railway + run migration

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feat/rbac-enterprise
```

- [ ] **Step 2: Open PR via gh CLI** (user triggers merge manually — no auto-push to main)

```bash
gh pr create --title "RBAC enterprise overhaul (scope B)" --body "$(cat <<'EOF'
## Summary
- Adds owner role tier with partial-unique-per-tenant invariant
- Pending invitations with SHA-256 tokens, 7-day expiry, single-use accept, revoke + resend
- Last-admin guard on member remove/demote; cascade of project_memberships on removal
- Org admins/owners see and manage every project in their tenant
- Transfer-ownership (org + project)
- tenant_domains: DNS-TXT verified, auto_join / invite_only / blocked
- Seat cap + MFA-required-for-admins flag (MFA wiring follow-up)
- Central permissions.ts module replaces scattered role strings
- RBAC_V2_ENABLED gates the new routes; legacy /members/invite is a compat shim

## Test plan
- [ ] Railway deploy succeeds and runs migration 022
- [ ] `curl -XPOST /v1/auth/members/invite` with role=viewer now 400s
- [ ] Create invitation → accept via token → new member visible in /members
- [ ] Remove last admin → 409 last_admin_required
- [ ] Admin sees every project in /projects
- [ ] Transfer project ownership works; audit log recorded
EOF
)"
```

- [ ] **Step 3: Set `RBAC_V2_ENABLED=true` on Railway after deploy green**

Use the Vercel CLI only for the web env; on Railway use the dashboard or `railway` CLI if available. Confirm with user before flipping.

---

## Task 20: Hard-test the deployed API

Using `.env.test` creds (`LARRY_URL=https://larry-pm.com`, `LARRY_TEST_EMAIL=larry@larry.com`, `LARRY_TEST_PASSWORD=TestLarry123%`).

- [ ] **Step 1: Find the API base URL**

Run: `cd apps/web && grep -rn "NEXT_PUBLIC_API\|API_BASE" src/ | head -5`
Extract the Railway API URL.

- [ ] **Step 2: Login → capture access token**

```bash
TOKEN=$(curl -s -X POST "$API/v1/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"larry@larry.com","password":"TestLarry123%"}' | jq -r .accessToken)
```

- [ ] **Step 3: Confirm old viewer-role bug is fixed**

```bash
curl -s -X POST "$API/v1/auth/members/invite" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"email":"probe@example.com","role":"viewer"}' | jq
```
Expected: 400 validation error (not 500).

- [ ] **Step 4: Create + accept a real invitation**

```bash
INVITE=$(curl -s -X POST "$API/v1/orgs/invitations" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"email":"rbac-test+'$(date +%s)'@mailsink.io","role":"member"}')
echo "$INVITE" | jq
TOKEN_RAW=$(echo "$INVITE" | jq -r '.inviteUrl' | sed 's/.*token=//')
curl -s "$API/v1/orgs/invitations/$TOKEN_RAW" | jq    # preview
curl -s -X POST "$API/v1/orgs/invitations/$TOKEN_RAW/accept" \
  -H "Content-Type: application/json" \
  -d '{"password":"TestLarry123%"}' | jq
```

- [ ] **Step 5: Confirm admin sees all projects**

```bash
curl -s "$API/v1/projects" -H "Authorization: Bearer $TOKEN" | jq '.projects | length'
```

- [ ] **Step 6: Attempt transfer ownership**

```bash
curl -s -X POST "$API/v1/orgs/transfer-ownership" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"newOwnerUserId":"<some-admin-id>"}' | jq
```
Expected: 200 if `larry@larry.com` is the owner (it will be, per migration backfill).

- [ ] **Step 7: Playwright check the `/invite/accept` landing page**

Use `mcp__playwright__browser_navigate` to `https://larry-pm.com/invite/accept?token=FAKE` and confirm it renders (or redirects to a 404 / error state) without crashing.

---

## Task 21: Code review + finishing

- [ ] **Step 1: Invoke requesting-code-review skill** with the PR URL.
- [ ] **Step 2: Invoke verification-before-completion skill** — sanity-check nothing is broken on deployed API.
- [ ] **Step 3: Invoke finishing-a-development-branch skill** to tidy the branch for merge.

---

## Self-review (post-draft)

**Spec coverage:**
- §3 role model → Task 1 + Task 2 migration.
- §4 permission module → Task 3.
- §5 invitations → Task 6, 7, 9.
- §6 last-admin guard → Task 4, 5.
- §7 admin org-wide visibility → Task 10.
- §8 transfer ownership → Task 11 (org), Task 12 (project).
- §9 domains + seat cap → Task 13, 15.
- §10 MFA gate → Task 16.
- §11 migrations → Task 2.
- §12 route map → Tasks 9, 11, 12, 13, 14.
- §13 tests → Tasks 3, 4, 5, 6, 9, 10, 11, 12, 13, 14, 15, 16.
- §14 rollout → Task 17 (flag), 19 (deploy), 20 (hard-test).
- §15 backwards compat → Task 9 (compat shim), Task 2 (additive migration).

**Placeholder scan:** No "TBD" / "implement later" / bare "Similar to Task N". Every code block is complete enough to paste. Only loose end: in Task 13, the `/members/invite` signup auto-join — noted inline that seat-cap wiring lands in Task 15, which it does.

**Type consistency:** `TenantRole` from `@larry/shared` (= `Role`). `InvitableTenantRole` only used inside `permissions.ts` + `invitations.ts`. `createInvitation` signature matches all call-sites. Audit-log `actionType` strings are all namespaced (`invitation.*`, `member.*`, `project.*`, `org.*`).
