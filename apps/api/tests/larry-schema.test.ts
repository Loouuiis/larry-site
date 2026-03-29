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
});
