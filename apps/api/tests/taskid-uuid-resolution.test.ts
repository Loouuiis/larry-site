import { describe, expect, it, vi } from "vitest";
import { ensureTaskId, isUuidShape } from "@larry/db";

/**
 * Regression test for N-5 (TEST-REPORT-2026-04-13 §11).
 *
 * Larry's tool calls occasionally emit `payload.taskId = "<task title>"` —
 * the task's TITLE where a UUID is expected. Pre-fix, `ensureTaskId` blindly
 * ran `SELECT id FROM tasks WHERE id = $2` with the title, triggering
 * Postgres `invalid input syntax for type uuid` which the accept handler's
 * existing retry-with-resolution layer did not match (it looks for the
 * internal "taskId could not be resolved" phrase, not the raw Postgres SQLSTATE
 * error). Result: 422 + no resolution layer hit.
 *
 * Fix: gate the UUID-SELECT on a UUID-shape regex; non-UUID strings in the
 * taskId slot route through `resolveTaskByTitle` instead.
 */

describe("isUuidShape", () => {
  it("accepts canonical UUID v4", () => {
    expect(isUuidShape("63852f08-054b-4e18-b660-8c54472455f8")).toBe(true);
  });

  it("accepts uppercase UUID", () => {
    expect(isUuidShape("63852F08-054B-4E18-B660-8C54472455F8")).toBe(true);
  });

  it("accepts mixed-case UUID", () => {
    expect(isUuidShape("63852f08-054B-4e18-B660-8c54472455f8")).toBe(true);
  });

  it("rejects a task title (N-5 case)", () => {
    expect(isUuidShape("Coordinate Penetration Test Logistics")).toBe(false);
  });

  it("rejects short non-UUID string", () => {
    expect(isUuidShape("abc")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isUuidShape("")).toBe(false);
  });

  it("rejects UUID with extra characters", () => {
    expect(isUuidShape("63852f08-054b-4e18-b660-8c54472455f8-extra")).toBe(false);
  });

  it("rejects trimmable whitespace padding", () => {
    expect(isUuidShape(" 63852f08-054b-4e18-b660-8c54472455f8 ")).toBe(false);
  });
});

describe("ensureTaskId — N-5 title-in-taskId resolution", () => {
  const TENANT = "11111111-1111-4111-8111-111111111111";
  const PROJECT = "22222222-2222-4222-8222-222222222222";
  const RESOLVED = "33333333-3333-4333-8333-333333333333";

  function makeDb(handler: (sql: string, params: unknown[]) => unknown[]) {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const db = {
      queryTenant: vi.fn(async (_tenantId: string, sql: string, params: unknown[]) => {
        calls.push({ sql, params });
        return handler(sql, params);
      }),
    };
    return { db, calls };
  }

  it("returns UUID-shape taskId unchanged when it exists (existing happy path)", async () => {
    const { db, calls } = makeDb((sql) => {
      if (sql.includes("WHERE tenant_id = $1 AND id = $2")) {
        return [{ id: RESOLVED }];
      }
      return [];
    });
    const payload: Record<string, unknown> = { taskId: RESOLVED };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await ensureTaskId(db as any, TENANT, PROJECT, payload);

    expect(result).toBe(RESOLVED);
    expect(payload.taskId).toBe(RESOLVED);
    // exactly one call: the WHERE id = $2 existence check, no title fallback
    expect(calls.length).toBe(1);
    expect(calls[0].sql).toContain("WHERE tenant_id = $1 AND id = $2");
  });

  it("does NOT issue WHERE id = $2 SQL when taskId is a title (no UUID syntax error)", async () => {
    const { db, calls } = makeDb((sql, params) => {
      if (sql.includes("LOWER(title) = LOWER($3)") && params[2] === "Coordinate Penetration Test Logistics") {
        return [{ id: RESOLVED }];
      }
      return [];
    });
    const payload: Record<string, unknown> = {
      taskId: "Coordinate Penetration Test Logistics",
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await ensureTaskId(db as any, TENANT, PROJECT, payload);

    expect(result).toBe(RESOLVED);
    expect(payload.taskId).toBe(RESOLVED);
    // No call was made with WHERE id = $2 — that's the whole point of N-5's fix.
    const idLookups = calls.filter((c) => c.sql.includes("WHERE tenant_id = $1 AND id = $2"));
    expect(idLookups).toHaveLength(0);
  });

  it("mutates payload.taskId to the resolved UUID so downstream executors see a valid id", async () => {
    const { db } = makeDb((sql, params) => {
      if (sql.includes("LOWER(title) = LOWER($3)") && params[2] === "Write retrospective") {
        return [{ id: RESOLVED }];
      }
      return [];
    });
    const payload: Record<string, unknown> = { taskId: "Write retrospective" };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ensureTaskId(db as any, TENANT, PROJECT, payload);

    expect(payload.taskId).toBe(RESOLVED);
  });

  it("returns null and leaves taskId untouched when title does not resolve", async () => {
    const { db } = makeDb(() => []);
    const payload: Record<string, unknown> = { taskId: "Nonexistent task" };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await ensureTaskId(db as any, TENANT, PROJECT, payload);

    expect(result).toBeNull();
    expect(payload.taskId).toBe("Nonexistent task");
  });

  it("falls through to payload.taskTitle when UUID taskId does not exist (existing fallback preserved)", async () => {
    const { db, calls } = makeDb((sql, params) => {
      if (sql.includes("LOWER(title) = LOWER($3)") && params[2] === "Ship executive update") {
        return [{ id: RESOLVED }];
      }
      return [];
    });
    const payload: Record<string, unknown> = {
      taskId: "44444444-4444-4444-8444-444444444444", // hallucinated UUID, not in DB
      taskTitle: "Ship executive update",
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await ensureTaskId(db as any, TENANT, PROJECT, payload);

    expect(result).toBe(RESOLVED);
    // We expect: 1 existence check on the hallucinated UUID, then title resolution.
    const idLookups = calls.filter((c) => c.sql.includes("WHERE tenant_id = $1 AND id = $2"));
    expect(idLookups).toHaveLength(1);
  });
});
