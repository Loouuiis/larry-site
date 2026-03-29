import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import sensible from "@fastify/sensible";
import type { Db } from "@larry/db";
import { meetingRoutes } from "../src/routes/v1/meetings.js";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const MEETING_ID = "44444444-4444-4444-8444-444444444444";

const appsToClose: Array<ReturnType<typeof Fastify>> = [];

afterEach(async () => {
  vi.clearAllMocks();
  while (appsToClose.length > 0) {
    const app = appsToClose.pop();
    if (app) await app.close();
  }
});

async function createTestApp(queryTenant: Db["queryTenant"]) {
  const app = Fastify({ logger: false });

  app.decorate(
    "db",
    {
      queryTenant,
    } as unknown as Db
  );
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

  await app.register(sensible);
  await app.register(meetingRoutes, { prefix: "/v1" });
  await app.ready();
  return app;
}

describe("meetings runtime cutover", () => {
  it("lists meetings without querying agent_runs and returns compatibility placeholders", async () => {
    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (sql.includes("FROM agent_runs")) {
        throw new Error("meetings list should not query agent_runs");
      }
      if (sql.includes("FROM meeting_notes")) {
        return [
          {
            id: MEETING_ID,
            title: "Launch sync",
            summary: "Follow-up actions identified.",
            action_count: 2,
            meeting_date: "2026-03-29",
            created_at: "2026-03-29T10:00:00.000Z",
            project_id: PROJECT_ID,
            agent_run_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          },
        ];
      }
      return [];
    }) as unknown as Db["queryTenant"];

    const app = await createTestApp(queryTenant);
    appsToClose.push(app);

    const response = await app.inject({
      method: "GET",
      url: `/v1/meetings?projectId=${PROJECT_ID}&limit=20`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      items: [
        {
          id: MEETING_ID,
          title: "Launch sync",
          summary: "Follow-up actions identified.",
          actionCount: 2,
          meetingDate: "2026-03-29",
          createdAt: "2026-03-29T10:00:00.000Z",
          projectId: PROJECT_ID,
          agentRunId: null,
          agentRunState: null,
        },
      ],
    });

    const sqlCalls = vi.mocked(queryTenant).mock.calls.map(([, sql]) => String(sql));
    expect(sqlCalls.some((sql) => sql.includes("agent_runs"))).toBe(false);
  });

  it("returns meeting detail without agent_runs join and keeps nullable compatibility fields", async () => {
    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (sql.includes("agent_runs")) {
        throw new Error("meeting detail should not query agent_runs");
      }
      if (sql.includes("FROM meeting_notes")) {
        return [
          {
            id: MEETING_ID,
            title: "Launch sync",
            transcript: "Transcript text",
            summary: "Follow-up actions identified.",
            action_count: 2,
            meeting_date: "2026-03-29",
            created_at: "2026-03-29T10:00:00.000Z",
            project_id: PROJECT_ID,
            agent_run_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          },
        ];
      }
      return [];
    }) as unknown as Db["queryTenant"];

    const app = await createTestApp(queryTenant);
    appsToClose.push(app);

    const response = await app.inject({
      method: "GET",
      url: `/v1/meetings/${MEETING_ID}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: MEETING_ID,
      title: "Launch sync",
      transcript: "Transcript text",
      summary: "Follow-up actions identified.",
      actionCount: 2,
      meetingDate: "2026-03-29",
      createdAt: "2026-03-29T10:00:00.000Z",
      projectId: PROJECT_ID,
      agentRunId: null,
      agentRunState: null,
    });

    const sqlCalls = vi.mocked(queryTenant).mock.calls.map(([, sql]) => String(sql));
    expect(sqlCalls.some((sql) => sql.includes("agent_runs"))).toBe(false);
  });
});
