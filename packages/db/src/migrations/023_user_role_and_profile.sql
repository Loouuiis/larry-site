-- 023_user_role_and_profile.sql
-- Signup 3-step redesign (#86): persist role at signup + capture
-- work/discovery/tools from a post-signup workspace card.
--
-- The 4 polling steps in today's signup wizard (Role/Work/Discovery/Tools)
-- are UI-only — nothing reaches the backend. This migration gives them a
-- home so the new wizard can actually store the data.

ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT;

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id       UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  work_types    TEXT[] NOT NULL DEFAULT '{}',
  discovery     TEXT[] NOT NULL DEFAULT '{}',
  tools         TEXT[] NOT NULL DEFAULT '{}',
  completed_at  TIMESTAMPTZ,
  dismissed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial index for the "needs polling card" query — filtered to rows that
-- are neither completed nor dismissed, which is the only query the card
-- component runs on workspace load.
CREATE INDEX IF NOT EXISTS user_profiles_pending_idx
  ON user_profiles (user_id)
  WHERE completed_at IS NULL AND dismissed_at IS NULL;
