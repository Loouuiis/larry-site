-- 037: AI 2 multi-turn conversation persistence (separate from branch-scoped timeline2_ai_* tables).

CREATE TABLE IF NOT EXISTS timeline2_ai2_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_timeline2_ai2_conversations_project
  ON timeline2_ai2_conversations (tenant_id, project_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS timeline2_ai2_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES timeline2_ai2_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_timeline2_ai2_messages_conversation
  ON timeline2_ai2_messages (tenant_id, conversation_id, created_at ASC);

ALTER TABLE timeline2_ai2_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE timeline2_ai2_messages ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY tenant_isolation_timeline2_ai2_conversations
    ON timeline2_ai2_conversations
    USING (tenant_id::text = current_setting('app.tenant_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_timeline2_ai2_messages
    ON timeline2_ai2_messages
    USING (tenant_id::text = current_setting('app.tenant_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;
