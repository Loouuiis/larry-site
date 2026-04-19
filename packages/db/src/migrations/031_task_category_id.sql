-- Allow tasks to be associated with a project-scoped category (gantt group/sprint row).
-- Nullable so existing tasks are unaffected; SET NULL on category delete keeps tasks alive.
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks (tenant_id, category_id)
  WHERE category_id IS NOT NULL;
