import Fastify from "fastify";
import sensible from "@fastify/sensible";
import { afterEach, describe, expect, it } from "vitest";
import { actionRoutes } from "../src/routes/v1/actions.js";

type MockAction = {
  id: string;
  agentRunId: string | null;
  projectId: string | null;
  state: "pending" | "approved" | "rejected" | "overridden" | "executed";
  actionType: string;
  impact: "low" | "medium" | "high";
  payload: Record<string, unknown>;
};

type QueryCall = {
  sql: string;
  values: unknown[];
};

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const RUN_ID = "33333333-3333-4333-8333-333333333333";
const ACTION_ID = "44444444-4444-4444-8444-444444444444";
const PROJECT_ID = "55555555-5555-4555-8555-555555555555";
const TASK_ID = "66666666-6666-4666-8666-666666666666";
const CREATED_TASK_ID = "77777777-7777-4777-8777-777777777777";
const CREATED_PROJECT_ID = "88888888-8888-4888-8888-888888888888";

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

function createDbMock(options: {
  action: MockAction;
  statusTask?: { dueDate: string | null; progressPercent: number };
  createdTaskId?: string;
  createdProjectId?: string;
}) {
  const calls: QueryCall[] = [];

  return {
    calls,
    async queryTenant<T>(tenantId: string, sql: string, values: unknown[] = []): Promise<T[]> {
      const normalizedSql = normalizeSql(sql);
      calls.push({ sql: normalizedSql, values });

      if (tenantId !== TENANT_ID) {
        throw new Error(`Unexpected tenant ${tenantId}`);
      }

      if (normalizedSql.includes("FROM extracted_actions") && normalizedSql.includes("LIMIT 1")) {
        return [options.action as T];
      }

      if (normalizedSql.includes('SELECT due_date as "dueDate", progress_percent as "progressPercent" FROM tasks')) {
        if (!options.statusTask) return [];
        return [options.statusTask as T];
      }

      if (normalizedSql.includes("INSERT INTO tasks") && normalizedSql.includes("RETURNING id")) {
        return [{ id: options.createdTaskId ?? CREATED_TASK_ID } as T];
      }

      if (normalizedSql.includes("INSERT INTO projects") && normalizedSql.includes("RETURNING id")) {
        return [{ id: options.createdProjectId ?? CREATED_PROJECT_ID } as T];
      }

      if (normalizedSql.includes("SELECT state FROM agent_runs")) {
        return [{ state: "APPROVAL_PENDING" } as T];
      }

      if (normalizedSql.includes("SELECT COUNT(*)::int as count FROM extracted_actions")) {
        return [{ count: 0 } as T];
      }

      if (normalizedSql.includes("SELECT entry_hash FROM audit_log")) {
        return [];
      }

      return [];
    },
  };
}

async function createTestApp(options: {
  action: MockAction;
  statusTask?: { dueDate: string | null; progressPercent: number };
  createdTaskId?: string;
  createdProjectId?: string;
}) {
  const db = createDbMock(options);
  const app = Fastify({ logger: false });

  app.decorate("db", db as unknown);
  app.decorate("config", { RESEND_API_KEY: undefined });
  app.decorate("authenticate", async (request) => {
    (request as typeof request & {
      user: { tenantId: string; userId: string; role: "pm"; email: string };
    }).user = {
      tenantId: TENANT_ID,
      userId: USER_ID,
      role: "pm",
      email: "pm@example.com",
    };
  });
  app.decorate("requireRole", () => async () => undefined);

  await app.register(sensible);
  await app.register(actionRoutes, { prefix: "/actions" });
  await app.ready();

  return { app, db };
}

const appsToClose: Array<ReturnType<typeof Fastify>> = [];

afterEach(async () => {
  while (appsToClose.length > 0) {
    const app = appsToClose.pop();
    if (app) {
      await app.close();
    }
  }
});

describe("action approval execution", () => {
  it("executes task_create approvals and returns the created task id", async () => {
    const { app, db } = await createTestApp({
      action: {
        id: ACTION_ID,
        agentRunId: RUN_ID,
        projectId: PROJECT_ID,
        state: "pending",
        actionType: "task_create",
        impact: "medium",
        payload: {
          title: "Draft launch plan",
          description: "Turn the launch brief into a first task.",
          dueDate: "2026-04-03",
        },
      },
      createdTaskId: CREATED_TASK_ID,
    });
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: `/actions/${ACTION_ID}/approve`,
      payload: { note: "Ship it" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      state: "executed",
      taskId: CREATED_TASK_ID,
    });

    const taskInsert = db.calls.find((call) => call.sql.includes("INSERT INTO tasks") && call.sql.includes("RETURNING id"));
    expect(taskInsert?.values).toEqual([
      TENANT_ID,
      PROJECT_ID,
      "Draft launch plan",
      "Turn the launch brief into a first task.",
      "medium",
      "2026-04-03",
      USER_ID,
    ]);

    const executedUpdate = db.calls.find((call) => call.sql.includes("SET state = 'executed', task_id = $3"));
    expect(executedUpdate?.values).toEqual([TENANT_ID, ACTION_ID, CREATED_TASK_ID]);
  });

  it("executes status_update approvals against the target task", async () => {
    const { app, db } = await createTestApp({
      action: {
        id: ACTION_ID,
        agentRunId: RUN_ID,
        projectId: PROJECT_ID,
        state: "pending",
        actionType: "status_update",
        impact: "medium",
        payload: {
          taskId: TASK_ID,
          status: "completed",
        },
      },
      statusTask: {
        dueDate: "2026-04-05",
        progressPercent: 35,
      },
    });
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: `/actions/${ACTION_ID}/approve`,
      payload: { note: "Looks right" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      state: "executed",
      taskId: TASK_ID,
    });

    const taskUpdate = db.calls.find((call) => call.sql.includes("UPDATE tasks") && call.sql.includes("progress_percent = $4"));
    expect(taskUpdate?.values?.[0]).toBe(TENANT_ID);
    expect(taskUpdate?.values?.[1]).toBe(TASK_ID);
    expect(taskUpdate?.values?.[2]).toBe("completed");
    expect(taskUpdate?.values?.[3]).toBe(100);

    const actionUpdate = db.calls.find((call) => call.sql.includes("SET state = 'executed', task_id = $3"));
    expect(actionUpdate?.values).toEqual([TENANT_ID, ACTION_ID, TASK_ID]);
  });

  it("executes project_create approvals, seeds tasks, and returns the project id", async () => {
    const { app, db } = await createTestApp({
      action: {
        id: ACTION_ID,
        agentRunId: RUN_ID,
        projectId: null,
        state: "pending",
        actionType: "project_create",
        impact: "high",
        payload: {
          name: "Client portal launch",
          description: "Launch a new client portal in Q2.",
          targetDate: "2026-06-15",
          tasks: [
            { title: "Define MVP scope", description: "Lock the launch scope." },
            { title: "Prepare stakeholder review", dueDate: "2026-05-10" },
          ],
        },
      },
      createdProjectId: CREATED_PROJECT_ID,
    });
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: `/actions/${ACTION_ID}/approve`,
      payload: { note: "Approve launch draft" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      state: "executed",
      projectId: CREATED_PROJECT_ID,
    });

    const projectInsert = db.calls.find((call) => call.sql.includes("INSERT INTO projects") && call.sql.includes("RETURNING id"));
    expect(projectInsert?.values).toEqual([
      TENANT_ID,
      "Client portal launch",
      "Launch a new client portal in Q2.",
      USER_ID,
      null,
      "2026-06-15",
    ]);

    const seededTaskInserts = db.calls.filter((call) =>
      call.sql.includes("INSERT INTO tasks") && !call.sql.includes("RETURNING id")
    );
    expect(seededTaskInserts).toHaveLength(2);
    expect(seededTaskInserts[0]?.values?.[1]).toBe(CREATED_PROJECT_ID);
    expect(seededTaskInserts[1]?.values?.[1]).toBe(CREATED_PROJECT_ID);

    const actionUpdate = db.calls.find((call) => call.sql.includes("SET state = 'executed', project_id = $3"));
    expect(actionUpdate?.values).toEqual([TENANT_ID, ACTION_ID, CREATED_PROJECT_ID]);
  });
});
