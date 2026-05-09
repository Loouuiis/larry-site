-- 038: Timeline 2 Gantt upgrade primitives.

ALTER TABLE timeline2_nodes
  ADD COLUMN IF NOT EXISTS progress SMALLINT NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE timeline2_nodes
    ADD CONSTRAINT timeline2_nodes_progress_chk CHECK (progress >= 0 AND progress <= 100);
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE timeline2_nodes
  ALTER COLUMN sort_order TYPE DOUBLE PRECISION USING sort_order::DOUBLE PRECISION;

ALTER TABLE timeline2_dependencies
  ADD COLUMN IF NOT EXISTS lag_days INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS timeline2_user_preferences (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  column_order JSONB NOT NULL DEFAULT '[]'::jsonb,
  visible_columns JSONB NOT NULL DEFAULT '[]'::jsonb,
  column_widths JSONB NOT NULL DEFAULT '{}'::jsonb,
  outline_width INT NOT NULL DEFAULT 520,
  day_width INT NOT NULL DEFAULT 38,
  collapsed_node_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, user_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_timeline2_user_preferences_project
  ON timeline2_user_preferences (tenant_id, project_id, user_id);

ALTER TABLE timeline2_user_preferences ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY tenant_isolation_timeline2_user_preferences
    ON timeline2_user_preferences
    USING (tenant_id::text = current_setting('app.tenant_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;
