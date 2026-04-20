import { describe, it, expect, beforeEach } from "vitest";
import { recordNotification } from "./record.js";

const writes: Array<{ sql: string; params: unknown[] }> = [];
const fakeDb = {
  queryTenant: async (_tid: string, sql: string, params: unknown[]) => {
    writes.push({ sql, params });
    return [
      {
        id: "00000000-0000-0000-0000-000000000001",
        created_at: "2026-04-20T12:00:00Z",
      },
    ];
  },
};

beforeEach(() => {
  writes.length = 0;
});

describe("recordNotification", () => {
  it("inserts one row with channel=ui and returns the Notification", async () => {
    const n = await recordNotification({
      db: fakeDb as never,
      tenantId: "t1",
      userId: "u1",
      type: "task.created",
      payload: { taskId: "task-1", projectId: "proj-1", title: "Deck" },
    });

    expect(writes).toHaveLength(1);
    expect(writes[0].sql).toMatch(/INSERT INTO notifications/);
    expect(writes[0].params).toContain("task.created");
    expect(writes[0].params).toContain("success");
    expect(n.id).toBe("00000000-0000-0000-0000-000000000001");
    expect(n.deepLink).toBe("/workspace/projects/proj-1/tasks/task-1");
    expect(n.title).toBe("Task created: Deck");
  });

  it("allows severity override", async () => {
    await recordNotification({
      db: fakeDb as never,
      tenantId: "t1",
      userId: "u1",
      type: "task.created",
      payload: { taskId: "t", projectId: "p", title: "x" },
      severityOverride: "warning",
    });
    expect(writes[0].params).toContain("warning");
  });

  it("propagates batchId", async () => {
    await recordNotification({
      db: fakeDb as never,
      tenantId: "t1",
      userId: "u1",
      type: "task.created",
      payload: { taskId: "t", projectId: "p", title: "x" },
      batchId: "batch-1",
    });
    expect(writes[0].params).toContain("batch-1");
  });
});
