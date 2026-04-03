-- Larry as executor: tasks Larry completes himself
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assigned_to_larry BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_by_larry BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS larry_document_id UUID REFERENCES larry_documents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_larry_assigned ON tasks(project_id) WHERE assigned_to_larry = TRUE;
CREATE INDEX IF NOT EXISTS idx_tasks_larry_completed ON tasks(project_id) WHERE completed_by_larry = TRUE;
