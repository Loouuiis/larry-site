import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

const schemaPath = resolve(process.cwd(), "..", "..", "packages", "db", "src", "schema.sql");
const schema = readFileSync(schemaPath, "utf8");

describe("Larry ledger schema", () => {
  it("adds the action-linkage columns and indexes to larry_events", () => {
    expect(schema).toContain("conversation_id UUID REFERENCES larry_conversations(id) ON DELETE SET NULL");
    expect(schema).toContain("request_message_id UUID REFERENCES larry_messages(id) ON DELETE SET NULL");
    expect(schema).toContain("response_message_id UUID REFERENCES larry_messages(id) ON DELETE SET NULL");
    expect(schema).toContain("requested_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL");
    expect(schema).toContain("approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL");
    expect(schema).toContain("dismissed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL");
    expect(schema).toContain("executed_by_kind TEXT CHECK (executed_by_kind IN ('larry', 'user'))");
    expect(schema).toContain("execution_mode TEXT CHECK (execution_mode IN ('auto', 'approval'))");
    expect(schema).toContain("source_kind TEXT");
    expect(schema).toContain("source_record_id UUID");
    expect(schema).toContain("CREATE INDEX IF NOT EXISTS idx_larry_events_project_conversation_created");
    expect(schema).toContain("CREATE INDEX IF NOT EXISTS idx_larry_events_request_message");
    expect(schema).toContain("CREATE INDEX IF NOT EXISTS idx_larry_events_response_message");
    expect(schema).toContain("CREATE INDEX IF NOT EXISTS idx_larry_events_source_record");
  });

  it("backfills new larry_events attribution fields", () => {
    expect(schema).toContain("SET execution_mode = CASE");
    expect(schema).toContain("SET executed_by_kind = 'larry'");
    expect(schema).toContain("SET source_kind = triggered_by");
  });

  it("adds actor attribution to larry_messages with a backfill and index", () => {
    expect(schema).toContain("actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL");
    expect(schema).toContain("SET actor_user_id = lc.user_id");
    expect(schema).toContain("AND lm.role = 'user'");
    expect(schema).toContain("CREATE INDEX IF NOT EXISTS idx_larry_messages_conversation_created");
  });

  it("detaches meeting_notes.agent_run_id from agent_runs with an idempotent migration block", () => {
    const meetingNotesTable = schema.match(/CREATE TABLE IF NOT EXISTS meeting_notes \([\s\S]*?\n\);/);
    expect(meetingNotesTable).not.toBeNull();

    const meetingNotesTableSql = meetingNotesTable?.[0] ?? "";
    expect(meetingNotesTableSql).toContain("agent_run_id UUID,");
    expect(meetingNotesTableSql).not.toContain(
      "agent_run_id UUID REFERENCES agent_runs(id) ON DELETE SET NULL"
    );

    expect(schema).toContain("Phase 2.7d: detach meeting_notes.agent_run_id from legacy agent_runs FK.");
    expect(schema).toContain("tc.table_name = 'meeting_notes'");
    expect(schema).toContain("kcu.column_name = 'agent_run_id'");
    expect(schema).toContain("ccu.table_name = 'agent_runs'");
    expect(schema).toContain("ALTER TABLE meeting_notes DROP CONSTRAINT %I");
  });

  it("detaches email_outbound_drafts.action_id from extracted_actions with an idempotent migration block", () => {
    const emailDraftsTable = schema.match(/CREATE TABLE IF NOT EXISTS email_outbound_drafts \([\s\S]*?\n\);/);
    expect(emailDraftsTable).not.toBeNull();

    const emailDraftsTableSql = emailDraftsTable?.[0] ?? "";
    expect(emailDraftsTableSql).toContain("action_id UUID,");
    expect(emailDraftsTableSql).not.toContain(
      "action_id UUID REFERENCES extracted_actions(id) ON DELETE SET NULL"
    );

    expect(schema).toContain(
      "Phase 2.7g: detach email_outbound_drafts.action_id from legacy extracted_actions FK."
    );
    expect(schema).toContain("tc.table_name = 'email_outbound_drafts'");
    expect(schema).toContain("kcu.column_name = 'action_id'");
    expect(schema).toContain("ccu.table_name = 'extracted_actions'");
    expect(schema).toContain("ALTER TABLE email_outbound_drafts DROP CONSTRAINT %I");
  });

  it("detaches correction_feedback.action_id from extracted_actions with an idempotent migration block", () => {
    const correctionFeedbackTable = schema.match(/CREATE TABLE IF NOT EXISTS correction_feedback \([\s\S]*?\n\);/);
    expect(correctionFeedbackTable).not.toBeNull();

    const correctionFeedbackTableSql = correctionFeedbackTable?.[0] ?? "";
    expect(correctionFeedbackTableSql).toContain("action_id UUID,");
    expect(correctionFeedbackTableSql).not.toContain(
      "action_id UUID REFERENCES extracted_actions(id) ON DELETE SET NULL"
    );

    expect(schema).toContain(
      "Phase 2.7g: detach correction_feedback.action_id from legacy extracted_actions FK."
    );
    expect(schema).toContain("tc.table_name = 'correction_feedback'");
    expect(schema).toContain("kcu.column_name = 'action_id'");
    expect(schema).toContain("ccu.table_name = 'extracted_actions'");
    expect(schema).toContain("ALTER TABLE correction_feedback DROP CONSTRAINT %I");
  });

  it("retires migration D extraction child tables with explicit idempotent drops", () => {
    expect(schema).not.toContain("CREATE TABLE IF NOT EXISTS approval_decisions (");
    expect(schema).not.toContain("CREATE TABLE IF NOT EXISTS interventions (");
    expect(schema).not.toContain("CREATE TABLE IF NOT EXISTS agent_run_transitions (");

    expect(schema).toContain("Phase 2.7h Migration D: retire extraction child tables after FK-detach prep.");
    expect(schema).toContain("DROP TABLE IF EXISTS approval_decisions;");
    expect(schema).toContain("DROP TABLE IF EXISTS interventions;");
    expect(schema).toContain("DROP TABLE IF EXISTS agent_run_transitions;");

    expect(schema).not.toContain("ALTER TABLE approval_decisions ENABLE ROW LEVEL SECURITY;");
    expect(schema).not.toContain("ALTER TABLE interventions ENABLE ROW LEVEL SECURITY;");
    expect(schema).not.toContain("ALTER TABLE agent_run_transitions ENABLE ROW LEVEL SECURITY;");
  });

  it("retires migration E extraction parent tables with explicit idempotent drops", () => {
    expect(schema).not.toContain("CREATE TABLE IF NOT EXISTS extracted_actions (");
    expect(schema).not.toContain("CREATE TABLE IF NOT EXISTS agent_runs (");

    expect(schema).toContain("Phase 2.7i Migration E: retire extraction parent tables after child retirement.");
    expect(schema).toContain("DROP TABLE IF EXISTS extracted_actions;");
    expect(schema).toContain("DROP TABLE IF EXISTS agent_runs;");

    expect(schema).not.toContain("ALTER TABLE extracted_actions ENABLE ROW LEVEL SECURITY;");
    expect(schema).not.toContain("ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;");
    expect(schema).not.toContain("CREATE POLICY tenant_isolation_actions ON extracted_actions");
    expect(schema).not.toContain("CREATE POLICY tenant_isolation_agent_runs ON agent_runs");
  });

  it("adds project_memory_entries with tenant RLS and source indexes", () => {
    expect(schema).toContain("CREATE TABLE IF NOT EXISTS project_memory_entries (");
    expect(schema).toContain("tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE");
    expect(schema).toContain("project_id       UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE");
    expect(schema).toContain("source_kind      VARCHAR NOT NULL");
    expect(schema).toContain("source_record_id TEXT");
    expect(schema).toContain("content_hash     TEXT");
    expect(schema).toContain("ALTER TABLE project_memory_entries");
    expect(schema).toContain("ADD COLUMN IF NOT EXISTS content_hash TEXT;");
    expect(schema).toContain("CREATE INDEX IF NOT EXISTS idx_project_memory_entries_project");
    expect(schema).toContain("CREATE INDEX IF NOT EXISTS idx_project_memory_entries_source_kind");
    expect(schema).toContain("CREATE UNIQUE INDEX IF NOT EXISTS idx_project_memory_entries_replay_dedup");
    expect(schema).toContain("ALTER TABLE project_memory_entries ENABLE ROW LEVEL SECURITY;");
    expect(schema).toContain("CREATE POLICY tenant_isolation_project_memory_entries");
  });

  it("normalizes project memory source aliases and backfills replay dedup metadata", () => {
    expect(schema).toContain("UPDATE project_memory_entries");
    expect(schema).toContain("SET source_kind = 'meeting'");
    expect(schema).toContain("SET source_kind = 'email'");
    expect(schema).toContain("SET source_kind = 'slack'");
    expect(schema).toContain("SET source_kind = 'calendar'");
    expect(schema).toContain("SET content_hash = encode(digest(");
    expect(schema).toContain("DELETE FROM project_memory_entries pme");
    expect(schema).toContain("ROW_NUMBER() OVER (");
    expect(schema).toContain("PARTITION BY tenant_id, project_id, source_kind, source_record_id, content_hash");
    expect(schema).toContain("WHERE source_record_id IS NOT NULL");
    expect(schema).toContain("AND content_hash IS NOT NULL;");
  });

  it("adds project_intake_drafts with mode/status checks, indexes, and tenant RLS", () => {
    expect(schema).toContain("CREATE TABLE IF NOT EXISTS project_intake_drafts (");
    expect(schema).toContain("mode TEXT NOT NULL CHECK (mode IN ('manual', 'chat', 'meeting'))");
    expect(schema).toContain(
      "status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'bootstrapped', 'finalized'))"
    );
    expect(schema).toContain("chat_answers JSONB NOT NULL DEFAULT '[]'::jsonb");
    expect(schema).toContain("bootstrap_tasks JSONB NOT NULL DEFAULT '[]'::jsonb");
    expect(schema).toContain("bootstrap_actions JSONB NOT NULL DEFAULT '[]'::jsonb");
    expect(schema).toContain(
      "finalized_meeting_note_id UUID REFERENCES meeting_notes(id) ON DELETE SET NULL"
    );
    expect(schema).toContain(
      "finalized_canonical_event_id UUID REFERENCES canonical_events(id) ON DELETE SET NULL"
    );
    expect(schema).toContain("CREATE INDEX IF NOT EXISTS idx_project_intake_drafts_tenant_created");
    expect(schema).toContain("CREATE INDEX IF NOT EXISTS idx_project_intake_drafts_tenant_status");
    expect(schema).toContain("CREATE INDEX IF NOT EXISTS idx_project_intake_drafts_tenant_mode");
    expect(schema).toContain("CREATE INDEX IF NOT EXISTS idx_project_intake_drafts_attach_project");
    expect(schema).toContain("ALTER TABLE project_intake_drafts ENABLE ROW LEVEL SECURITY;");
    expect(schema).toContain("CREATE POLICY tenant_isolation_project_intake_drafts");
  });

  it("adds project_memberships with role checks, backfill, indexes, and tenant RLS", () => {
    expect(schema).toContain("CREATE TABLE IF NOT EXISTS project_memberships (");
    expect(schema).toContain("role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer'))");
    expect(schema).toContain("PRIMARY KEY (tenant_id, project_id, user_id)");
    expect(schema).toContain("CREATE INDEX IF NOT EXISTS idx_project_memberships_tenant_project");
    expect(schema).toContain("CREATE INDEX IF NOT EXISTS idx_project_memberships_tenant_user");
    expect(schema).toContain("INSERT INTO project_memberships (tenant_id, project_id, user_id, role)");
    expect(schema).toContain("SELECT p.tenant_id, p.id, p.owner_user_id, 'owner'");
    expect(schema).toContain("SELECT p.tenant_id, p.id, m.user_id, 'viewer'");
    expect(schema).toContain("ALTER TABLE project_memberships ENABLE ROW LEVEL SECURITY;");
    expect(schema).toContain("CREATE POLICY tenant_isolation_project_memberships");
  });

  it("adds project_notes with visibility constraints, indexes, and tenant RLS", () => {
    expect(schema).toContain("CREATE TABLE IF NOT EXISTS project_notes (");
    expect(schema).toContain("author_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE");
    expect(schema).toContain("visibility TEXT NOT NULL CHECK (visibility IN ('shared', 'personal'))");
    expect(schema).toContain("recipient_user_id UUID REFERENCES users(id) ON DELETE CASCADE");
    expect(schema).toContain("source_kind TEXT");
    expect(schema).toContain("source_record_id TEXT");
    expect(schema).toContain("CONSTRAINT project_notes_visibility_recipient_check CHECK");
    expect(schema).toContain("(visibility = 'shared' AND recipient_user_id IS NULL)");
    expect(schema).toContain("(visibility = 'personal' AND recipient_user_id IS NOT NULL)");
    expect(schema).toContain("CREATE INDEX IF NOT EXISTS idx_project_notes_tenant_project_created");
    expect(schema).toContain("CREATE INDEX IF NOT EXISTS idx_project_notes_tenant_recipient_created");
    expect(schema).toContain("ALTER TABLE project_notes ENABLE ROW LEVEL SECURITY;");
    expect(schema).toContain("CREATE POLICY tenant_isolation_project_notes");
  });

  it("extends documents into an asset model with source/version/metadata fields and indexes", () => {
    expect(schema).toContain("CREATE TABLE IF NOT EXISTS documents (");
    expect(schema).toContain("source_kind TEXT");
    expect(schema).toContain("source_record_id TEXT");
    expect(schema).toContain("version INT NOT NULL DEFAULT 1");
    expect(schema).toContain("metadata JSONB NOT NULL DEFAULT '{}'::jsonb");
    expect(schema).toContain("updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()");
    expect(schema).toContain("ALTER TABLE documents");
    expect(schema).toContain("ADD COLUMN IF NOT EXISTS source_kind TEXT;");
    expect(schema).toContain("ADD COLUMN IF NOT EXISTS source_record_id TEXT;");
    expect(schema).toContain("ADD COLUMN IF NOT EXISTS version INT;");
    expect(schema).toContain("ADD COLUMN IF NOT EXISTS metadata JSONB;");
    expect(schema).toContain("ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;");
    expect(schema).toContain("CREATE INDEX IF NOT EXISTS idx_documents_tenant_project_updated");
    expect(schema).toContain("CREATE INDEX IF NOT EXISTS idx_documents_tenant_doc_type_updated");
    expect(schema).toContain("CREATE INDEX IF NOT EXISTS idx_documents_tenant_source");
    expect(schema).toContain("ALTER TABLE documents ENABLE ROW LEVEL SECURITY;");
    expect(schema).toContain("CREATE POLICY tenant_isolation_documents");
  });

  it("adds task_document_attachments with uniqueness, indexes, and tenant RLS", () => {
    expect(schema).toContain("CREATE TABLE IF NOT EXISTS task_document_attachments (");
    expect(schema).toContain("task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE");
    expect(schema).toContain("document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE");
    expect(schema).toContain("UNIQUE (tenant_id, task_id, document_id)");
    expect(schema).toContain(
      "CREATE INDEX IF NOT EXISTS idx_task_document_attachments_tenant_task_created"
    );
    expect(schema).toContain(
      "CREATE INDEX IF NOT EXISTS idx_task_document_attachments_tenant_document_created"
    );
    expect(schema).toContain("ALTER TABLE task_document_attachments ENABLE ROW LEVEL SECURITY;");
    expect(schema).toContain("CREATE POLICY tenant_isolation_task_document_attachments");
  });
});
