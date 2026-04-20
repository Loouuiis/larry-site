-- B-004: Capture user-provided task labels through create_task.
-- Small, additive column; existing tasks default to an empty array so no
-- backfill is needed.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS labels TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_tasks_labels ON tasks USING GIN (labels)
  WHERE cardinality(labels) > 0;
