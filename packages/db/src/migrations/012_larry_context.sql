-- Larry project context: persistent per-project knowledge file
ALTER TABLE projects ADD COLUMN IF NOT EXISTS larry_context TEXT;

COMMENT ON COLUMN projects.larry_context IS
  'Markdown context file Larry maintains — project understanding, patterns, decisions, risks';
