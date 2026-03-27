import Fastify from "fastify";
import sensible from "@fastify/sensible";
import type { ApiEnv } from "@larry/config";
import type { Db } from "@larry/db";
import type { TaskCommandResult } from "@larry/ai";
import { afterEach, describe, expect, it } from "vitest";
import { larryRoutes } from "../src/routes/v1/larry.js";

type QueryCall = {
  sql: string;
  values: unknown[];
};

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID = "55555555-5555-4555-8555-555555555555";
const TASK_ID = "66666666-6666-4666-8666-666666666666";
const RUN_ID = "33333333-3333-4333-8333-333333333333";
const ACTION_ID = "44444444-4444-4444-8444-444444444444";

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

function createDbMock(options: {
  taskList?: Array<{ id: string; title: string; status: string; assignee: string | null }>;
}) {
  const calls: QueryCall[] = [];

  return {
    calls,
    async queryTenant<T>(tenantId: string, sql: string, values: unknown[] = []): Promise<T[]> {
      const normalizedSql = normalizeSql(sql);
      calls.push({ sql: normalizedSql, values });

      // Task list query (buildProjectTaskList)
      if (normalizedSql.includes("FROM tasks t") && normalizedSql.includes("LEFT JOIN users u")) {
        return (options.taskList ?? []) as T[];
      }

      // agent_runs insert
      if (normalizedSql.includes("INSERT INTO agent_runs") && normalizedSql.includes("RETURNING id")) {
        return [{ id: RUN_ID } as T];
      }

      // extracted_actions insert
      if (normalizedSql.includes("INSERT INTO extracted_actions") && normalizedSql.includes("RETURNING id")) {
        return [{ id: ACTION_ID } as T];
      }

      // audit log dedup check
      if (normalizedSql.includes("SELECT entry_hash FROM audit_log")) {
        return [];
      }

      return [];
    },
  };
}

function createQueueMock() {
  const published: unknown[] = [];
  return {
    published,
    async publish(msg: unknown) {
      published.push(msg);
    },
  };
}

function createLlmProviderMock(taskCommandResult: TaskCommandResult) {
  return {
    async classifyTaskCommand() { return taskCommandResult; },
    async extractActionsFromTranscript() { return []; },
    async extractProjectStructure() { return { name: "", description: "", tasks: [] }; },
    async summarizeTranscript() { return { title: "", summary: "" }; },
    async generateResponse() { return "mock response"; },
  };
}

async function createTestApp(options: {
  taskList?: Array<{ id: string; title: string; status: string; assignee: string | null }>;
  taskCommandResult: TaskCommandResult;
}) {
  const db = createDbMock({ taskList: options.taskList });
  const queue = createQueueMock();
  const llmProvider = createLlmProviderMock(options.taskCommandResult);

  const app = Fastify({ logger: false });

  app.decorate("db", db as unknown as Db);
  app.decorate("queue", queue);
  app.decorate("llmProvider", llmProvider);
  app.decorate("config", {} as unknown as ApiEnv);
  app.decorate("authenticate", async (request: Parameters<(typeof app)["authenticate"]>[0]) => {
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
  await app.register(larryRoutes, { prefix: "/larry" });
  await app.ready();

  return { app, db, queue };
}

const appsToClose: Array<ReturnType<typeof Fastify>> = [];

afterEach(async () => {
  while (appsToClose.length > 0) {
    const a = appsToClose.pop();
    if (a) await a.close();
  }
});

describe("larry task command fast path", () => {
  it("classifies a task-create prompt into a pending extracted_action without touching the queue", async () => {
    const { app, db, queue } = await createTestApp({
      taskList: [],
      taskCommandResult: {
        type: "task_create",
        title: "Confirm pricing copy",
        dueDate: "2026-04-01",
      },
    });
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/larry/commands",
      payload: {
        intent: "freeform",
        projectId: PROJECT_ID,
        input: "Create a task for launch checklist to confirm pricing copy by Tuesday",
        mode: "execute",
      },
    });

    expect(response.statusCode).toBe(202);
    const body = response.json<{ message: string; runId: string }>();
    expect(body.message).toContain("drafted a task");
    expect(body.message).toContain("Confirm pricing copy");

    // Queue must NOT have been called
    expect(queue.published).toHaveLength(0);

    // agent_runs insert must have happened
    const runInsert = db.calls.find(
      (c) => c.sql.includes("INSERT INTO agent_runs") && c.sql.includes("RETURNING id")
    );
    expect(runInsert).toBeDefined();
    expect(runInsert?.values[1]).toBe(PROJECT_ID);

    // extracted_actions insert must have action_type = task_create in params
    const actionInsert = db.calls.find((c) => c.sql.includes("INSERT INTO extracted_actions"));
    expect(actionInsert).toBeDefined();
    expect(actionInsert?.sql).toContain("task_create");

    // Payload must include the title from the classifier
    const payloadJson = actionInsert?.values[5];
    expect(typeof payloadJson).toBe("string");
    const payload = JSON.parse(payloadJson as string) as { title: string; dueDate: string };
    expect(payload.title).toBe("Confirm pricing copy");
    expect(payload.dueDate).toBe("2026-04-01");
  });

  it("classifies a task-close prompt into a pending status_update with resolved taskId without touching the queue", async () => {
    const { app, db, queue } = await createTestApp({
      taskList: [
        { id: TASK_ID, title: "Security review", status: "in_progress", assignee: null },
      ],
      taskCommandResult: {
        type: "task_close",
        taskId: TASK_ID,
        taskTitle: "Security review",
        confidence: 0.9,
      },
    });
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/larry/commands",
      payload: {
        intent: "freeform",
        projectId: PROJECT_ID,
        input: "Mark the security review as complete",
        mode: "execute",
      },
    });

    expect(response.statusCode).toBe(202);
    const body = response.json<{ message: string; runId: string }>();
    expect(body.message).toContain("Got it");
    expect(body.message).toContain("Security review");

    // Queue must NOT have been called
    expect(queue.published).toHaveLength(0);

    // extracted_actions insert must have action_type = status_update and correct taskId
    const actionInsert = db.calls.find((c) => c.sql.includes("INSERT INTO extracted_actions"));
    expect(actionInsert).toBeDefined();
    expect(actionInsert?.sql).toContain("status_update");

    const payloadJson = actionInsert?.values[6];
    expect(typeof payloadJson).toBe("string");
    const payload = JSON.parse(payloadJson as string) as { taskId: string; status: string };
    expect(payload.taskId).toBe(TASK_ID);
    expect(payload.status).toBe("completed");
  });
});
