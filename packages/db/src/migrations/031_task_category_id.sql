-- Allow tasks to be associated with a project-scoped category (gantt group/sprint row).
-- Nullable so existing tasks are unaffected; SET NULL on category delete keeps tasks alive.
--
-- FK points at `project_categories`, which is the real category table in this
-- schema. The earlier version of this migration referenced a non-existent
-- `categories` table — schema.sql is what the runner actually executes, so
-- the typo never reached prod, but leaving the standalone file wrong was
-- misleading for anyone reading the migration history.
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES project_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks (tenant_id, category_id)
  WHERE category_id IS NOT NULL;
