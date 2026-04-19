-- Migration 028: refresh_tokens.device_id for loose-fingerprint known-device checks
--
-- Context: login audit 2026-04-19 P2-3. The old known-device check at
-- /v1/auth/login used exact (ip, user_agent) match, which churns with
-- every OS update and Wi-Fi handoff — producing constant "new device"
-- emails even for the user's daily browser. Replace with a persistent
-- `larry_device_id` cookie that we persist alongside each refresh token.
--
-- device_id is nullable — existing rows stay untouched; only new logins
-- populate it. Known-device = cookie matches any non-revoked token row
-- for this user within the last 30 days.
--
-- Idempotent. Safe to re-run.

ALTER TABLE refresh_tokens
  ADD COLUMN IF NOT EXISTS device_id UUID;

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_device_active
  ON refresh_tokens (user_id, device_id)
  WHERE revoked_at IS NULL AND device_id IS NOT NULL;
