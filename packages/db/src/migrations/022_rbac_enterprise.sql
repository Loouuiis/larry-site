-- 022_rbac_enterprise.sql
-- Enterprise RBAC: owner tier, invitations, tenant_domains, seat cap, MFA flag.
-- Additive migration. Idempotent via IF NOT EXISTS / DO guards.

-- 1. Add 'owner' to role_type enum.
DO $$ BEGIN
  ALTER TYPE role_type ADD VALUE IF NOT EXISTS 'owner';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Defensive: collapse any stray 'executive' memberships to 'member'.
UPDATE memberships SET role = 'member' WHERE role = 'executive';

-- 3. Promote first admin per tenant (by created_at ASC) to owner — but only
--    on tenants that currently have no owner.
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

-- 7. Tenant-level settings.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS seat_cap INT;
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS mfa_required_for_admins BOOLEAN NOT NULL DEFAULT FALSE;

-- 8. User MFA enrolment column (TOTP wiring is a follow-up).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS mfa_enrolled_at TIMESTAMPTZ;
