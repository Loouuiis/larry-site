-- Migration 027: MFA (TOTP) secrets + scratch codes
--
-- Context: login audit 2026-04-19 P1-2. `tenants.mfa_required_for_admins`
-- and `users.mfa_enrolled_at` shipped in migration 022 but no table exists
-- to store the actual shared secret or the backup scratch codes.
--
-- Changes:
--   1. `user_mfa_secrets` — one row per enrolled user. `secret` is the
--      base32 TOTP shared secret. Pending (unconfirmed) rows are kept with
--      `confirmed_at IS NULL` so an enrolment can resume after a refresh.
--   2. `user_mfa_scratch_codes` — 10 one-time backup codes per user,
--      stored as SHA-256 hashes. `used_at IS NULL` means unspent.
--
-- Secrets live on the user (not the tenant) because a user is the same
-- identity across tenants — we don't want to re-enrol MFA per tenant.
--
-- Idempotent. Safe to re-run.

CREATE TABLE IF NOT EXISTS user_mfa_secrets (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  secret TEXT NOT NULL,
  confirmed_at TIMESTAMPTZ,
  last_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_mfa_scratch_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_mfa_scratch_codes_user
  ON user_mfa_scratch_codes(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_mfa_scratch_codes_hash
  ON user_mfa_scratch_codes(code_hash);
