-- Migration 030 — make larry_events.project_id nullable so Larry can
-- emit org-wide timeline_* suggestions (no single project anchor).
--
-- Forward: ALTER column + CHECK constraint + partial index.
-- Rollback: SET NOT NULL after deleting any org-scope rows.
-- Safe: instant metadata change on Postgres, no table rewrite.

BEGIN;

ALTER TABLE larry_events
  ALTER COLUMN project_id DROP NOT NULL;

ALTER TABLE larry_events
  ADD CONSTRAINT larry_events_project_scope_check
  CHECK (
    project_id IS NOT NULL
    OR action_type LIKE 'timeline\_%' ESCAPE '\'
  );

CREATE INDEX IF NOT EXISTS idx_larry_events_org_pending
  ON larry_events (tenant_id, created_at DESC)
  WHERE project_id IS NULL AND event_type = 'suggested';

COMMIT;
