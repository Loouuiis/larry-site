# RBAC Enterprise Overhaul — Design Spec

**Date:** 2026-04-17
**Scope:** "Option B" from the 2026-04-17 org/RBAC audit: fix all critical bugs, add pending-invite flow, give org admins superpowers, add owner tier, transfer-ownership, domain-verified auto-join, seat caps, MFA enforcement toggle. Defer only SCIM and SAML-SSO.

## 1. Goals

- Invite flow matches industry norm: pending state, cryptographic token, 7-day expiry, single-use accept, revoke + resend.
- Org admins can see and manage every project in their tenant without explicit per-project membership.
- A tenant can never be left with zero admins; a project can never be left with zero owners.
- Orgs have a clear ownership hierarchy — exactly one `owner` per tenant, plus any number of `admin`s below that.
- Tenants can scope themselves by verified email domains (auto-join) and by seat caps.
- Admins/owners can be required to have MFA at the tenant level.

## 2. Non-goals (deferred)

- SCIM provisioning, SAML/OIDC SSO, webhook signing for member events, seat-based billing meters, per-project custom roles, cross-tenant guest users. These are tracked but not in this pass.

## 3. Role model

### Tenant roles (`role_type` enum)

Active roles after this pass: **`owner | admin | pm | member`**. This matches the Notion / Linear / Slack norm (`owner/admin/member` with one intermediate operator tier — Larry's `pm`).

| Role | Cardinality | Can invite | Can remove | Can change org settings | Sees all projects | Can transfer org |
|---|---|---|---|---|---|---|
| **owner** | exactly 1 | yes | yes (incl. admins) | yes | yes | yes |
| **admin** | 0..n | yes | yes (not owner, not self if last admin) | yes | yes | no |
| **pm** | 0..n | no | no | no | only projects they're on | no |
| **member** | 0..n | no | no | no | only projects they're on | no |

The `pm` role stays functionally identical to `member` for RBAC in this pass — it's the hook for project-management-specific permissions later.

**`executive` is retired.** The audit confirmed zero users hold it and no route references it. Postgres enum values cannot be safely dropped without rewriting every column, so the value stays in the `role_type` enum for compat but:
- All Zod schemas (`INVITABLE_TENANT_ROLES`, `UpdateMemberSchema`, etc.) exclude it — API rejects any attempt to assign it.
- Permission predicates treat `executive` as equivalent to `member` in case any row ever does leak in.
- A post-deploy query confirms zero `executive` memberships exist; if one is ever found, it is auto-downgraded to `member` at migration time.

### Project roles (`project_memberships.role`)

Unchanged: `owner | editor | viewer`. Admins and owners get implicit `editor`-level access (can read and manage) to every project in their tenant without a row in `project_memberships`.

## 4. Central permission module

New file: `apps/api/src/lib/permissions.ts`.

```ts
// 'executive' is deprecated — never returned from API endpoints, but retained
// as a TS literal so legacy DB rows (none expected) still typecheck.
export type TenantRole = 'owner' | 'admin' | 'pm' | 'member' | 'executive';
export type ProjectRole = 'owner' | 'editor' | 'viewer';

export const ACTIVE_TENANT_ROLES = ['owner','admin','pm','member'] as const;
export const INVITABLE_TENANT_ROLES = ['admin','pm','member'] as const;
// Pure predicates — no DB calls, no side-effects.
export function canInviteMembers(r: TenantRole): boolean;    // owner, admin
export function canManageMembers(r: TenantRole): boolean;    // owner, admin
export function canChangeOrgSettings(r: TenantRole): boolean;// owner, admin
export function canViewAllProjects(r: TenantRole): boolean;  // owner, admin
export function canManageAllProjects(r: TenantRole): boolean;// owner, admin
export function canTransferOrgOwnership(r: TenantRole): boolean; // owner only
export function canInviteRoleAs(actor: TenantRole, target: TenantRole): boolean;
// Any 'executive' row collapses to 'member'-equivalent permissions.
```

Every route replaces its ad-hoc `if (role !== 'admin')` with calls into this module. The scattered-check smell is retired.

## 5. Pending invitation flow

### New table: `invitations`

```sql
CREATE TABLE invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email CITEXT NOT NULL,
  role role_type NOT NULL,
  token_hash TEXT NOT NULL,                  -- SHA-256 of raw token; never store plaintext
  status TEXT NOT NULL
    CHECK (status IN ('pending','accepted','revoked','expired')) DEFAULT 'pending',
  invited_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_by_user_id UUID REFERENCES users(id),
  revoked_at TIMESTAMPTZ,
  revoked_by_user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_invitations_token_hash ON invitations (token_hash);
CREATE UNIQUE INDEX idx_invitations_tenant_email_pending
  ON invitations (tenant_id, lower(email)) WHERE status = 'pending';
CREATE INDEX idx_invitations_tenant_status ON invitations (tenant_id, status, created_at DESC);
```

CITEXT may not be available — we'll fall back to `TEXT` with a `lower(email)` unique index. Migration picks whichever works on both prod and local.

### Flow

1. **Create** — `POST /v1/orgs/invitations` (admin+)
   - Validate role via `INVITABLE_TENANT_ROLES` (excludes `owner` — that comes only via transfer).
   - Reject if email already a member of this tenant.
   - Reject if another `pending` invitation exists for the same `(tenant, email)`.
   - Enforce seat cap (see §9) and MFA step-up (see §10).
   - Generate `rawToken = randomBytes(32).toString('base64url')` (43 chars, 256 bits entropy).
   - Store `tokenHash = sha256(rawToken)`.
   - `expires_at = NOW() + 7 days`.
   - Send email: `${FRONTEND}/invite/accept?token=${rawToken}`. Raw token appears only in the email and API response to the admin.
   - Audit: `invitation.created`.

2. **Preview** — `GET /v1/orgs/invitations/:token` (public, no auth)
   - Look up by `sha256(token)`. 404 on miss.
   - Returns `{ tenantName, tenantSlug, email, role, expiresAt }`. If `status!='pending'` or `expires_at<NOW()`, return specific 410 error codes: `invite_accepted`, `invite_revoked`, `invite_expired`.

3. **Accept** — `POST /v1/orgs/invitations/:token/accept`
   - Two branches:
     - **Unauthenticated, user doesn't exist**: body = `{ password, displayName? }`. Create user (email-verified because the email proves ownership), create membership, mark invitation accepted. Issue access+refresh tokens bound to the new tenant.
     - **Authenticated user whose JWT email matches the invite email**: no body needed (or just `{}`). Create membership, mark accepted.
   - **Strictly reject** if JWT email != invite email — no one can accept another person's invite.
   - Token is single-use: the `WHERE status='pending'` on update guarantees that; a second accept returns 410.
   - Audit: `invitation.accepted`.

4. **Revoke** — `POST /v1/orgs/invitations/:id/revoke` (admin+)
   - Marks `status='revoked'` if currently `pending`.
   - Audit: `invitation.revoked`.

5. **Resend** — `POST /v1/orgs/invitations/:id/resend` (admin+)
   - Only for `pending` invites. Rate-limited via existing `member_invite` email quota.
   - Does NOT rotate the token (so prior email still works). Resets `expires_at` to `NOW() + 7 days` if it was within 24h of expiring.
   - Audit: `invitation.resent`.

6. **List** — `GET /v1/orgs/invitations?status=pending` (admin+)

### Legacy endpoint

`POST /v1/auth/members/invite` (the auto-accept endpoint) stays for one release, but now delegates to the new pending-invite path. Frontend migrates; then we delete it in a follow-up.

## 6. Last-admin / last-owner guards

A helper `assertTenantHasRemainingAdmin(db, tenantId, excludingUserId?)` runs inside the same transaction as any of:

- `DELETE /members/:userId`
- `PATCH /members/:userId` (when demoting the only remaining admin+owner)
- Org-ownership transfer step that first demotes the current owner

It queries `SELECT COUNT(*) FROM memberships WHERE tenant_id=$1 AND role IN ('owner','admin') AND user_id <> $2` inside `FOR UPDATE`-protected transactions. If the count would drop to zero, reject with 409 `last_admin_required`.

Parallel helper for projects: `assertProjectHasRemainingOwner`.

## 7. Admin org-wide project visibility

- `getProjectMembershipAccess` (`apps/api/src/lib/project-memberships.ts:60`) extended: when `tenantRole` is `owner` or `admin`, `canRead=true` and `canManage=true` unconditionally.
- Project list query (`apps/api/src/routes/v1/projects.ts` GET `/projects`) currently joins on `project_memberships`; change to: for `owner | admin` return all `projects WHERE tenant_id = $1`; for everyone else keep the membership join.
- Project detail/task routes: same rule.
- Writes (create/edit/archive/delete) gated on `canManageAllProjects(tenantRole)` OR `projectRole in (owner,editor)`.
- Membership-list endpoints still show the raw `project_memberships` rows — admins are implicit, not listed there.

## 8. Transfer ownership

Two transfers:

1. **Project ownership** — `POST /v1/projects/:id/transfer` body `{ newOwnerUserId }`. Caller must be project owner OR tenant admin/owner. Target must be a tenant member. Txn:
   - Demote current `project_memberships.role='owner'` row to `editor`.
   - Upsert target to `owner`.
   - Update `projects.owner_user_id`.
   - Audit `project.ownership_transferred`.

2. **Org ownership** — `POST /v1/orgs/transfer-ownership` body `{ newOwnerUserId }`. Caller must be tenant `owner`. Target must be a current `admin`. Txn:
   - `UPDATE memberships SET role='admin' WHERE ... AND user_id=<current owner>`
   - `UPDATE memberships SET role='owner' WHERE ... AND user_id=<target>`
   - Last-admin guard still holds (both become admin/owner).
   - Audit `org.ownership_transferred`.

One owner per tenant is enforced by a partial unique index:
```sql
CREATE UNIQUE INDEX idx_memberships_one_owner_per_tenant
  ON memberships (tenant_id) WHERE role = 'owner';
```

Backfill: the first admin in each tenant (by `created_at ASC`) becomes `owner` during migration.

## 9. Domain-verified auto-join + seat caps

### `tenant_domains` table

```sql
CREATE TABLE tenant_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('auto_join','invite_only','blocked')),
  default_role role_type NOT NULL DEFAULT 'member',
  verification_token TEXT,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, lower(domain))
);
CREATE UNIQUE INDEX idx_tenant_domains_verified_domain
  ON tenant_domains (lower(domain)) WHERE verified_at IS NOT NULL;
```

Globally unique verified domains prevent two tenants both claiming `@acme.com`.

### Verification

`POST /v1/orgs/domains` adds a row with a 32-byte `verification_token`; admin places a DNS TXT record `_larry-verify=<token>` under the domain; `POST /v1/orgs/domains/:id/verify` runs `dns.resolveTxt` and on match sets `verified_at`. Unverified domains never influence signup.

### Auto-join on signup

Signup flow (already exists): if the new user's email domain matches a verified `auto_join` domain, also insert a `memberships` row with `default_role`, subject to seat cap.

### Seat cap

`tenants.seat_cap INT` (nullable = unlimited). Enforced by:

- Invitation creation (`INSERT INTO invitations`).
- Invitation accept (final seat check is authoritative — cap may have changed).
- Auto-join on signup.

Violation → 409 `seat_cap_reached`.

## 10. MFA enforcement for admins/owners

- Add `tenants.mfa_required_for_admins BOOLEAN NOT NULL DEFAULT FALSE`.
- Add `users.mfa_enrolled_at TIMESTAMPTZ`. (Actual TOTP/WebAuthn wiring is a follow-up; this spec only introduces the column and the gate, so enabling MFA unlocks the gate as soon as TOTP lands.)
- New Fastify hook `requireMfaIfEnforced`: when `user.role IN ('owner','admin')` AND `tenant.mfa_required_for_admins` AND `user.mfa_enrolled_at IS NULL`, respond 403 with `{ error: 'mfa_enrollment_required' }`.
- Applied to all write routes under `/v1/orgs/**`, `/v1/auth/members/**`, `/v1/admin/**`.
- Read routes (`/me`, `/members` list) stay open so the admin can still log in and enrol.

## 11. DB migrations

All changes live in one new migration `packages/db/src/migrations/2026-04-17-rbac-enterprise.sql`, applied by the existing migration runner. Idempotent (all `IF NOT EXISTS` / `DO $$` guards). Not destructive to existing `memberships` rows.

Summary of DDL:

1. `ALTER TYPE role_type ADD VALUE IF NOT EXISTS 'owner';` (added inside a `DO` block — Postgres requires outside-of-tx for enum add, the runner handles that).
2. Defensive: `UPDATE memberships SET role='member' WHERE role='executive';` — collapses any stray executive rows to the active role model.
3. Promote first admin per tenant to `owner`.
4. Partial unique index: one owner per tenant.
5. Create `invitations`, `tenant_domains`.
6. `ALTER TABLE tenants ADD COLUMN seat_cap INT, mfa_required_for_admins BOOLEAN NOT NULL DEFAULT FALSE;`
7. `ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enrolled_at TIMESTAMPTZ;`
8. The migration-safety gate already in the repo (`migration-safety-gate.test.ts`) must be updated to allow these additive operations explicitly.

## 12. API route map (net new + changed)

```
# Invitations (new)
POST   /v1/orgs/invitations                 admin+  create pending invite
GET    /v1/orgs/invitations?status=         admin+  list
GET    /v1/orgs/invitations/:token          public  preview
POST   /v1/orgs/invitations/:token/accept   optional-auth  accept
POST   /v1/orgs/invitations/:id/revoke      admin+
POST   /v1/orgs/invitations/:id/resend      admin+

# Org + members (changed)
POST   /v1/auth/members/invite              admin+  now delegates to invitations (compat)
PATCH  /v1/auth/members/:userId             admin+  now with last-admin guard
DELETE /v1/auth/members/:userId             admin+  last-admin guard + project-membership cascade
POST   /v1/orgs/transfer-ownership          owner   new
GET    /v1/orgs                             auth    reads tenant settings
PATCH  /v1/orgs                             admin+  seat_cap, mfa_required_for_admins, name

# Domains (new)
GET    /v1/orgs/domains                     admin+
POST   /v1/orgs/domains                     admin+
POST   /v1/orgs/domains/:id/verify          admin+
DELETE /v1/orgs/domains/:id                 admin+

# Project transfer (new)
POST   /v1/projects/:id/transfer            owner/admin/project-owner
```

## 13. Testing strategy

Vitest with a real Postgres (test DB in CI, via existing `TEST_DATABASE_URL`). Three layers:

1. **Unit** — `permissions.test.ts` asserts every permission predicate against every role.
2. **Integration** — for each route, at minimum: happy path, cross-tenant isolation (user in tenant A cannot touch tenant B), insufficient-role rejection, last-admin/last-owner rejection, seat-cap rejection, MFA-enforcement rejection, token single-use, token expiry, email-mismatch rejection on accept.
3. **End-to-end** — one hard test against the deployed Railway API after rollout: create invite → preview → accept (new user path) → list members → transfer ownership → remove original owner → confirm last-admin guard.

Minimum new test files:
- `apps/api/src/lib/permissions.test.ts`
- `apps/api/tests/invitations-routes.test.ts`
- `apps/api/tests/members-last-admin.test.ts`
- `apps/api/tests/projects-admin-visibility.test.ts`
- `apps/api/tests/transfer-ownership.test.ts`
- `apps/api/tests/tenant-domains.test.ts`
- `apps/api/tests/seat-cap.test.ts`
- `apps/api/tests/mfa-enforcement.test.ts`

No mocking of `db` — tests share the real schema.

## 14. Rollout plan

1. Migration applied (idempotent + additive, no behaviour change yet).
2. Permission module + route refactor deployed with feature-flag `RBAC_V2_ENABLED`. Off = old behaviour.
3. Flag flipped on in production; legacy `/members/invite` still works via compat shim.
4. Frontend updates to use new invite URLs (follow-up PR).
5. After 1 week of clean error logs, delete the compat shim and the flag.

## 15. Backwards-compat + risk

- Existing memberships, projects, project_memberships, audit log: untouched.
- First-admin→owner promotion is deterministic and idempotent.
- `pending` unique index on `(tenant_id, lower(email))` means any duplicate pre-existing invites (there are none — no current invites table) are impossible to violate.
- Enum add requires care: wrapped in a guarded block, runner already supports this pattern (see existing `DO $$ ... EXCEPTION WHEN duplicate_object`).
- If migration aborts mid-way, the rollback path is the usual `ROLLBACK` — no data loss because every statement is additive.

## 16. What we are explicitly NOT doing

- No UI work (frontend PR follows separately).
- No SCIM endpoints, no SAML/OIDC SSO.
- No actual MFA TOTP/WebAuthn wiring — only the column and the gate.
- No per-project custom roles beyond `owner/editor/viewer`.
- No billing hooks (`seat_cap` is enforced, not metered to Stripe).

---

**Resolved design decisions (2026-04-17):**

- Auto-promote first admin per tenant to `owner` during migration — **approved**.
- Role model aligned to industry standard: `owner | admin | pm | member`; `executive` retired — **approved**.
