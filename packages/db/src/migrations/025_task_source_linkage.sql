-- Migration 025: source linkage columns on tasks
--
-- Lets a task point back to the project_memory_entries row that triggered
-- it (typically an inbound Gmail thread, but also Slack/calendar/etc).
-- Powers the "Reply in Gmail" button on Gmail-sourced tasks (#92).
--
-- Idempotent: safe to re-run.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS source_kind TEXT,
  ADD COLUMN IF NOT EXISTS source_record_id TEXT;

CREATE INDEX IF NOT EXISTS idx_tasks_source
  ON tasks (tenant_id, source_kind, source_record_id)
  WHERE source_record_id IS NOT NULL;
