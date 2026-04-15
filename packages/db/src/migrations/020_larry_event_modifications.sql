-- 020_larry_event_modifications.sql
-- Adds audit columns for the Modify Action flow (spec 2026-04-15-modify-action-design.md).
-- previous_payload stores the payload before the user's most recent in-place edit so
-- before/after is recoverable from a single row. Nullable so existing rows are unaffected.

ALTER TABLE larry_events
  ADD COLUMN IF NOT EXISTS previous_payload    JSONB,
  ADD COLUMN IF NOT EXISTS modified_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS modified_at         TIMESTAMPTZ;

COMMENT ON COLUMN larry_events.previous_payload IS
  'Snapshot of payload before the most recent user edit via Modify. NULL if the event has never been modified.';
COMMENT ON COLUMN larry_events.modified_by_user_id IS
  'User who most recently applied a Modify edit to this event.';
COMMENT ON COLUMN larry_events.modified_at IS
  'Timestamp of the most recent Modify edit on this event.';
