import { describe, expect, it, vi } from "vitest";
import type { Db } from "./client.js";
import { executeAction } from "./larry-executor.js";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const ACTOR_USER_ID = "33333333-3333-4333-8333-333333333333";
const ASSIGNEE_USER_ID = "44444444-4444-4444-8444-444444444444";
const NEW_TASK_ID = "55555555-5555-4555-8555-555555555555";

describe("executeAction task_create — payload preservation (regression)", () => {
  function buildMockDb(params: {
    assigneeResolves?: boolean;
    capturedInsert: { sql?: string; values?: unknown[] };
  }): Db {
    const queryTenant = vi.fn(async (_tenantId: string, sql: string, values?: unknown[]) => {
      if (sql.includes("FROM users u") && sql.includes("JOIN memberships")) {
        return params.assigneeResolves ? [{ id: ASSIGNEE_USER_ID }] : [];
      }
      if (sql.includes("INSERT INTO tasks")) {
        params.capturedInsert.sql = sql;
        params.capturedInsert.values = values;
        return [
          {
            id: NEW_TASK_ID,
            tenant_id: TENANT_ID,
            project_id: PROJECT_ID,
            title: (values?.[2] as string) ?? "",
            description: (values?.[3] as string | null) ?? null,
            status: "not_started",
            priority: (values?.[4] as string) ?? "medium",
            assignee_user_id: (values?.[5] as string | null) ?? null,
            progress_percent: 0,
            risk_score: 0,
            risk_level: "low",
            start_date: (values?.[6] as string | null) ?? null,
            due_date: (values?.[7] as string | null) ?? null,
            created_at: "2026-04-17T00:00:00.000Z",
          },
        ];
      }
      if (sql.includes("INSERT INTO activities")) return [];
      if (sql.includes("SELECT") && sql.includes("tenant_policies")) return [];
      if (sql.includes("INSERT INTO larry_events")) return [{ id: "ev-1" }];
      return [];
    });
    return { queryTenant, tx: vi.fn() } as unknown as Db;
  }

  it("preserves the user-supplied description instead of overwriting with reasoning", async () => {
    const captured: { sql?: string; values?: unknown[] } = {};
    const db = buildMockDb({ assigneeResolves: true, capturedInsert: captured });

    await executeAction(
      db,
      TENANT_ID,
      PROJECT_ID,
      "task_create",
      {
        title: "Ship feature X",
        // description as the user phrased it (NOT the reasoning string)
        description: "Wire up the feature-flag gate and add the acceptance tests noted in CHAT-42.",
        priority: "high",
        assigneeName: "Anna",
        reasoning: "User asked for a new task in chat.",
        displayText: "Create task: Ship feature X",
      } as unknown as Parameters<typeof executeAction>[4],
      ACTOR_USER_ID
    );

    expect(captured.sql).toContain("INSERT INTO tasks");
    expect(captured.values?.[3]).toBe(
      "Wire up the feature-flag gate and add the acceptance tests noted in CHAT-42."
    );
    expect(captured.values?.[3]).not.toBe("User asked for a new task in chat.");
  });

  it("passes startDate and dueDate through to the INSERT", async () => {
    const captured: { sql?: string; values?: unknown[] } = {};
    const db = buildMockDb({ assigneeResolves: true, capturedInsert: captured });

    await executeAction(
      db,
      TENANT_ID,
      PROJECT_ID,
      "task_create",
      {
        title: "Kick off discovery",
        description: "A task with explicit start and due dates.",
        startDate: "2026-06-01",
        dueDate: "2026-06-15",
        priority: "medium",
        assigneeName: "Anna",
        reasoning: "User specified a window.",
        displayText: "Create task: Kick off discovery",
      } as unknown as Parameters<typeof executeAction>[4],
      ACTOR_USER_ID
    );

    expect(captured.sql).toContain("start_date");
    expect(captured.sql).toContain("due_date");
    // Params layout: [tenantId, projectId, title, description, priority, assigneeId, startDate, dueDate]
    expect(captured.values?.[6]).toBe("2026-06-01");
    expect(captured.values?.[7]).toBe("2026-06-15");
  });

  it("stores null for both dates when the payload omits them", async () => {
    const captured: { sql?: string; values?: unknown[] } = {};
    const db = buildMockDb({ assigneeResolves: true, capturedInsert: captured });

    await executeAction(
      db,
      TENANT_ID,
      PROJECT_ID,
      "task_create",
      {
        title: "Undated task",
        description: "No dates provided.",
        priority: "low",
        assigneeName: "Anna",
        reasoning: "User omitted dates.",
        displayText: "Create task: Undated task",
      } as unknown as Parameters<typeof executeAction>[4],
      ACTOR_USER_ID
    );

    expect(captured.values?.[6]).toBeNull();
    expect(captured.values?.[7]).toBeNull();
  });
});

describe("executeAction task_create — source linkage from memory entry (#92)", () => {
  const MEMORY_ENTRY_ID = "66666666-6666-4666-8666-666666666666";
  const GMAIL_THREAD_ID = "thread-abc123xyz";

  function buildMockDb(params: {
    memoryEntryFound: boolean;
    memorySourceKind?: string;
    memorySourceRecordId?: string | null;
    capturedInsert: { sql?: string; values?: unknown[] };
  }): Db {
    const queryTenant = vi.fn(async (_tenantId: string, sql: string, values?: unknown[]) => {
      if (sql.includes("FROM users u") && sql.includes("JOIN memberships")) {
        return [{ id: ASSIGNEE_USER_ID }];
      }
      if (sql.includes("FROM project_memory_entries") && sql.includes("WHERE tenant_id")) {
        return params.memoryEntryFound
          ? [{
              source_kind: params.memorySourceKind ?? "email",
              source_record_id: params.memorySourceRecordId ?? GMAIL_THREAD_ID,
            }]
          : [];
      }
      if (sql.includes("INSERT INTO tasks")) {
        params.capturedInsert.sql = sql;
        params.capturedInsert.values = values;
        return [
          {
            id: NEW_TASK_ID,
            tenant_id: TENANT_ID,
            project_id: PROJECT_ID,
            title: (values?.[2] as string) ?? "",
            description: (values?.[3] as string | null) ?? null,
            status: "not_started",
            priority: (values?.[4] as string) ?? "medium",
            assignee_user_id: (values?.[5] as string | null) ?? null,
            progress_percent: 0,
            risk_score: 0,
            risk_level: "low",
            start_date: (values?.[6] as string | null) ?? null,
            due_date: (values?.[7] as string | null) ?? null,
            source_kind: (values?.[8] as string | null) ?? null,
            source_record_id: (values?.[9] as string | null) ?? null,
            created_at: "2026-04-18T00:00:00.000Z",
          },
        ];
      }
      if (sql.includes("INSERT INTO activities")) return [];
      if (sql.includes("SELECT") && sql.includes("tenant_policies")) return [];
      if (sql.includes("INSERT INTO larry_events")) return [{ id: "ev-1" }];
      return [];
    });
    return { queryTenant, tx: vi.fn() } as unknown as Db;
  }

  it("copies source_kind + source_record_id from the cited memory entry onto the task", async () => {
    const captured: { sql?: string; values?: unknown[] } = {};
    const db = buildMockDb({
      memoryEntryFound: true,
      memorySourceKind: "email",
      memorySourceRecordId: GMAIL_THREAD_ID,
      capturedInsert: captured,
    });

    await executeAction(
      db,
      TENANT_ID,
      PROJECT_ID,
      "task_create",
      {
        title: "Reply to Acme about RFP",
        description: "Draft a response to the Acme RFP question.",
        priority: "high",
        assigneeName: "Anna",
        sourceMemoryEntryId: MEMORY_ENTRY_ID,
        reasoning: "Inbound email from Acme requires a response.",
        displayText: "Create task: Reply to Acme",
      } as unknown as Parameters<typeof executeAction>[4],
      ACTOR_USER_ID
    );

    expect(captured.sql).toContain("source_kind");
    expect(captured.sql).toContain("source_record_id");
    // Params layout: [tenantId, projectId, title, description, priority, assigneeId, startDate, dueDate, sourceKind, sourceRecordId]
    expect(captured.values?.[8]).toBe("email");
    expect(captured.values?.[9]).toBe(GMAIL_THREAD_ID);
  });

  it("silently drops the source when the cited memory entry does not exist", async () => {
    const captured: { sql?: string; values?: unknown[] } = {};
    const db = buildMockDb({ memoryEntryFound: false, capturedInsert: captured });

    await executeAction(
      db,
      TENANT_ID,
      PROJECT_ID,
      "task_create",
      {
        title: "Some task",
        description: "Whatever.",
        priority: "medium",
        assigneeName: "Anna",
        sourceMemoryEntryId: "99999999-9999-4999-8999-999999999999",
        reasoning: "Testing hallucinated memory id.",
        displayText: "Create task",
      } as unknown as Parameters<typeof executeAction>[4],
      ACTOR_USER_ID
    );

    expect(captured.values?.[8]).toBeNull();
    expect(captured.values?.[9]).toBeNull();
  });

  it("stores null source fields when sourceMemoryEntryId is omitted", async () => {
    const captured: { sql?: string; values?: unknown[] } = {};
    const db = buildMockDb({ memoryEntryFound: true, capturedInsert: captured });

    await executeAction(
      db,
      TENANT_ID,
      PROJECT_ID,
      "task_create",
      {
        title: "Unlinked task",
        description: "No memory source cited.",
        priority: "low",
        assigneeName: "Anna",
        reasoning: "No source.",
        displayText: "Create task",
      } as unknown as Parameters<typeof executeAction>[4],
      ACTOR_USER_ID
    );

    expect(captured.values?.[8]).toBeNull();
    expect(captured.values?.[9]).toBeNull();
  });

  it("rejects a malformed sourceMemoryEntryId without querying the DB", async () => {
    const captured: { sql?: string; values?: unknown[] } = {};
    const db = buildMockDb({ memoryEntryFound: true, capturedInsert: captured });

    await executeAction(
      db,
      TENANT_ID,
      PROJECT_ID,
      "task_create",
      {
        title: "Malformed id task",
        description: "Hallucinated id that is not a UUID.",
        priority: "low",
        assigneeName: "Anna",
        sourceMemoryEntryId: "not-a-uuid",
        reasoning: "Testing bad UUID guard.",
        displayText: "Create task",
      } as unknown as Parameters<typeof executeAction>[4],
      ACTOR_USER_ID
    );

    // Guard rejects before the SELECT runs
    const calls = (db.queryTenant as ReturnType<typeof vi.fn>).mock.calls;
    const memorySelectCalls = calls.filter((c) => String(c[1]).includes("FROM project_memory_entries"));
    expect(memorySelectCalls.length).toBe(0);
    expect(captured.values?.[8]).toBeNull();
    expect(captured.values?.[9]).toBeNull();
  });
});
