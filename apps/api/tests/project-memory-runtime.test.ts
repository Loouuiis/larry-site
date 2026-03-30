import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it, vi } from "vitest";

type InsertProjectMemoryEntry = (
  db: { queryTenant: (tenantId: string, sql: string, values?: unknown[]) => Promise<unknown[]> },
  tenantId: string,
  projectId: string,
  entry: { source: string; sourceKind: string; sourceRecordId?: string | null; content: string }
) => Promise<string>;

type ListProjectMemoryEntries = (
  db: { queryTenant: (tenantId: string, sql: string, values?: unknown[]) => Promise<unknown[]> },
  tenantId: string,
  projectId: string,
  opts?: { sourceKind?: string; limit?: number }
) => Promise<
  Array<{
    id: string;
    source: string;
    sourceKind: string;
    sourceRecordId: string | null;
    content: string;
    createdAt: string;
  }>
>;

let insertProjectMemoryEntry: InsertProjectMemoryEntry;
let listProjectMemoryEntries: ListProjectMemoryEntries;

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";

function hash(content: string): string {
  return createHash("sha256").update(content.replace(/\s+/g, " ").trim()).digest("hex");
}

beforeAll(async () => {
  const modulePath = resolve(process.cwd(), "..", "..", "packages", "db", "src", "larry-executor.ts");
  const module = (await import(pathToFileURL(modulePath).href)) as {
    insertProjectMemoryEntry: InsertProjectMemoryEntry;
    listProjectMemoryEntries: ListProjectMemoryEntries;
  };

  insertProjectMemoryEntry = module.insertProjectMemoryEntry;
  listProjectMemoryEntries = module.listProjectMemoryEntries;
});

describe("project memory runtime helpers", () => {
  it("normalizes source filters and normalized source kinds in read payloads", async () => {
    const queryTenant = vi.fn().mockResolvedValue([
      {
        id: "memory-1",
        source: "Meeting transcript",
        source_kind: "meeting transcript",
        source_record_id: "note-1",
        content: "Summary text",
        created_at: "2026-03-30T10:00:00.000Z",
      },
    ]);

    const rows = await listProjectMemoryEntries(
      { queryTenant },
      TENANT_ID,
      PROJECT_ID,
      { sourceKind: "Meeting transcript", limit: 10 }
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.sourceKind).toBe("meeting");

    const sql = String(queryTenant.mock.calls[0]?.[1]);
    const params = queryTenant.mock.calls[0]?.[2] as unknown[];
    expect(sql).toContain("source_kind = ANY");
    expect(params[2]).toEqual(
      expect.arrayContaining(["meeting", "meetings", "transcript", "meetingtranscript", "meeting transcript"])
    );
  });

  it("returns existing id without insert for replay-identical source records", async () => {
    const queryTenant = vi.fn().mockResolvedValueOnce([{ id: "existing-memory-id" }]);

    const id = await insertProjectMemoryEntry({ queryTenant }, TENANT_ID, PROJECT_ID, {
      source: "Slack signal",
      sourceKind: "slack signal",
      sourceRecordId: "canonical-event-1",
      content: " Slack   follow-up captured  ",
    });

    expect(id).toBe("existing-memory-id");
    expect(queryTenant).toHaveBeenCalledTimes(1);

    const params = queryTenant.mock.calls[0]?.[2] as unknown[];
    expect(params).toEqual([
      TENANT_ID,
      PROJECT_ID,
      "slack",
      "canonical-event-1",
      hash(" Slack   follow-up captured  "),
    ]);
  });

  it("falls back to lookup on unique-key race and returns canonical row id", async () => {
    const uniqueViolation = Object.assign(new Error("duplicate key"), { code: "23505" });
    const queryTenant = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(uniqueViolation)
      .mockResolvedValueOnce([{ id: "race-winner-id" }]);

    const id = await insertProjectMemoryEntry({ queryTenant }, TENANT_ID, PROJECT_ID, {
      source: "Email signal",
      sourceKind: "email",
      sourceRecordId: "canonical-event-2",
      content: "Email follow-up summary",
    });

    expect(id).toBe("race-winner-id");
    expect(queryTenant).toHaveBeenCalledTimes(3);
  });
});
