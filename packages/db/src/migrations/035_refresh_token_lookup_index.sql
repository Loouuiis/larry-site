-- Migration 035: refresh token lookup integrity/performance
--
-- /v1/auth/refresh looks up rows by token_hash (scoped by tenant_id in the
-- query). The old schema only indexed (tenant_id, user_id, expires_at), which
-- made refresh validation degrade as the table grew and did not enforce the
-- "one raw token maps to one row" invariant.
--
-- Token hashes are SHA-256 over 384-bit random raw tokens, so real collisions
-- are not expected. A unique index gives the planner the direct lookup path and
-- makes accidental duplicate inserts fail loudly.

CREATE UNIQUE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash
  ON refresh_tokens (token_hash);
