-- 021_portfolio_gantt.sql
-- Portfolio Gantt schema — categories for projects, parent tasks for subtasks.

CREATE TABLE IF NOT EXISTS project_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  colour TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_categories_tenant_sort
  ON project_categories (tenant_id, sort_order, created_at);

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES project_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_projects_tenant_category
  ON projects (tenant_id, category_id);

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS parent_task_id UUID REFERENCES tasks(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_tasks_parent
  ON tasks (tenant_id, parent_task_id);

ALTER TABLE project_categories ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY tenant_isolation_project_categories
    ON project_categories
    USING (tenant_id::text = current_setting('app.tenant_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;
