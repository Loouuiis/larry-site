-- 024_portfolio_gantt_v4.sql
-- Gantt v4 — Subcategories + project-scoped categories + project sort order.
-- Slice 1 of spec 2026-04-18-gantt-v4-subcategories-sync-design.md
--
-- Schema runner (packages/db/src/migrate.ts) applies schema.sql as the source
-- of truth; this file exists as a historical record mirroring the equivalent
-- block appended to schema.sql. All statements are idempotent.

-- 1. project_categories: flexible parent (either another category OR a project).
ALTER TABLE project_categories
  ADD COLUMN IF NOT EXISTS parent_category_id uuid NULL
    REFERENCES project_categories(id) ON DELETE CASCADE;

ALTER TABLE project_categories
  ADD COLUMN IF NOT EXISTS project_id uuid NULL
    REFERENCES projects(id) ON DELETE CASCADE;

-- 2. Exactly one of parent_category_id / project_id may be non-null at a time
--    (both null = top-level org category).
DO $$ BEGIN
  ALTER TABLE project_categories
    ADD CONSTRAINT project_categories_single_parent_chk
      CHECK (parent_category_id IS NULL OR project_id IS NULL);
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS idx_project_categories_parent_category
  ON project_categories (tenant_id, parent_category_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_project_categories_project
  ON project_categories (tenant_id, project_id, sort_order);

-- 3. projects: add sort_order for DnD reorder within a category.
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_projects_tenant_category_sort
  ON projects (tenant_id, category_id, sort_order);
