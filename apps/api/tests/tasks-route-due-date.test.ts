import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/audit.js", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/lib/project-write-lock.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/project-write-lock.js")>();
  return {
    ...actual,
    loadProjectWriteState: vi.fn(),
    loadTaskProjectWriteState: vi.fn(),
  };
});

import Fastify from "fastify";
import sensible from "@fastify/sensible";
import type { ApiEnv } from "@larry/config";
import type { Db } from "@larry/db";
import { taskRoutes } from "../src/routes/v1/tasks.js";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";

interface CapturedQuery {
  sql: string;
  values: unknown[];
}

function createDb(): { db: Db; queries: CapturedQuery[]; setRows: (rows: unknown[]) => void } {
  const queries: CapturedQuery[] = [];
  let nextRows: unknown[] = [];
  const db = {
    queryTenant: vi.fn(async (_tenantId: string, sql: string, values: unknown[]) => {
      queries.push({ sql, values });
      return nextRows;
    }),
    tx: vi.fn(),
  } as unknown as Db;
  return {
    db,
    queries,
    setRows: (rows) => {
      nextRows = rows;
    },
  };
}

async function createTestApp(db: Db) {
  const app = Fastify({ logger: false });
  app.decorate("db", db);
  app.decorate("config", { MODEL_PROVIDER: "mock" } as unknown as ApiEnv);
  app.decorate(
    "authenticate",
    async (request: Parameters<(typeof app)["authenticate"]>[0]) => {
      (
        request as typeof request & {
          user: { tenantId: string; userId: string; role: "pm"; email: string };
        }
      ).user = {
        tenantId: TENANT_ID,
        userId: USER_ID,
        role: "pm",
        email: "pm@example.com",
      };
    }
  );
  app.decorate("requireRole", () => async () => undefined);
  await app.register(sensible);
  await app.register(taskRoutes, { prefix: "" });
  await app.ready();
  return app;
}

const appsToClose: Array<ReturnType<typeof Fastify>> = [];

afterEach(async () => {
  vi.clearAllMocks();
  while (appsToClose.length > 0) {
    const app = appsToClose.pop();
    if (app) await app.close();
  }
});

// QA-2026-04-12 "Invalid Date" regression guard.
//
// /workspace/my-work concatenated `task.dueDate + "T12:00:00"` on the
// assumption that dueDate was a YYYY-MM-DD string. /v1/tasks's SELECT
// returned tasks.due_date with the pg driver's default DATE serialization,
// which produced a JS Date that JSON-stringified to a full ISO timestamp
// like "2026-04-18T00:00:00.000Z". Concatenating "T12:00:00" onto that
// yielded "2026-04-18T00:00:00.000ZT12:00:00" → new Date(...) is
// Invalid Date → every row in /workspace/my-work rendered "Invalid Date".
//
// Fix: cast `tasks.due_date::text as "dueDate"` (and the other DATE
// columns the route exposes) so the API returns the same YYYY-MM-DD shape
// the frontend formatters expect. This guard pins the SQL projection so a
// future edit can't silently revert.
describe("GET /tasks SQL projection (QA-2026-04-12 Invalid Date guard)", () => {
  it("casts due_date and start_date to text so the response is YYYY-MM-DD, not an ISO timestamp", async () => {
    const { db, queries, setRows } = createDb();
    setRows([]);
    const app = await createTestApp(db);
    appsToClose.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/?projectStatus=active",
    });

    expect(response.statusCode).toBe(200);
    expect(queries.length).toBeGreaterThan(0);
    const sql = queries[0].sql;

    // The fix: explicit ::text casts on date columns. Without these the
    // pg driver returns a Date object that JSON.stringifies with a time
    // component, breaking my-work's `dueDate + "T12:00:00"` formatter.
    expect(sql).toMatch(/tasks\.due_date::text\s+as\s+"dueDate"/i);
    expect(sql).toMatch(/tasks\.start_date::text\s+as\s+"startDate"/i);
  });
});
