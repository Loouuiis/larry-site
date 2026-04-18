-- Migration 026: project-scoped invitations + shareable invite links
--
-- Context: Anton (#96) reported that tenant-level invites don't land the
-- invitee inside the project they were "invited" to — because invitations
-- only touch `memberships`, never `project_memberships`. We also need a
-- copy-pasteable invite link for "drop-this-in-Slack" onboarding.
--
-- Changes:
--   1. invitations gains nullable project_id + project_role so an accept can
--      atomically also insert a project_memberships row.
--   2. invite_links is a new table for multi-use shareable URLs (uses/expiry/
--      revoke), optionally scoped to a project.
--
-- Idempotent. Safe to re-run.

ALTER TABLE invitations
  ADD COLUMN IF NOT EXISTS project_id UUID
    REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE invitations
  ADD COLUMN IF NOT EXISTS project_role TEXT
    CHECK (project_role IS NULL OR project_role IN ('owner','editor','viewer'));

DO $$ BEGIN
  ALTER TABLE invitations
    ADD CONSTRAINT invitations_project_pair_chk
      CHECK (
        (project_id IS NULL AND project_role IS NULL)
        OR (project_id IS NOT NULL AND project_role IS NOT NULL)
      );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_invitations_project
  ON invitations (tenant_id, project_id)
  WHERE project_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS invite_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  default_role role_type NOT NULL DEFAULT 'member',
  default_project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  default_project_role TEXT
    CHECK (default_project_role IS NULL OR default_project_role IN ('owner','editor','viewer')),
  max_uses INT,
  uses_count INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT invite_links_project_pair_chk CHECK (
    (default_project_id IS NULL AND default_project_role IS NULL)
    OR (default_project_id IS NOT NULL AND default_project_role IS NOT NULL)
  ),
  CONSTRAINT invite_links_uses_nonneg_chk CHECK (uses_count >= 0),
  CONSTRAINT invite_links_max_uses_positive_chk CHECK (max_uses IS NULL OR max_uses > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invite_links_token_hash
  ON invite_links (token_hash);

CREATE INDEX IF NOT EXISTS idx_invite_links_tenant_active
  ON invite_links (tenant_id, created_at DESC)
  WHERE revoked_at IS NULL;
