import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/audit.js", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/lib/project-memberships.js", () => ({
  getProjectMembershipAccess: vi.fn(),
  listProjectMembers: vi.fn(),
}));

vi.mock("@larry/ai", () => ({
  createLlmProvider: vi.fn(),
  createModel: vi.fn(),
  getStructuredOutputOptions: vi.fn(() => ({})),
}));

vi.mock("@larry/config", () => ({
  getApiEnv: vi.fn(),
}));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    generateObject: vi.fn(),
  };
});

import Fastify from "fastify";
import sensible from "@fastify/sensible";
import type { Db } from "@larry/db";
import { timeline2Routes } from "../src/routes/v1/timeline2.js";
import { createLlmProvider, createModel, getStructuredOutputOptions } from "@larry/ai";
import { getApiEnv } from "@larry/config";
import { generateObject, NoObjectGeneratedError } from "ai";
import {
  getProjectMembershipAccess,
  listProjectMembers,
} from "../src/lib/project-memberships.js";
import {
  TIMELINE2_AI2_ERROR_USER_MESSAGES,
  normalizeTimeline2UserPreferences,
  type Timeline2UserPreferences,
} from "@larry/shared";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const USER_2_ID = "33333333-3333-4333-8333-333333333333";
const PROJECT_ID = "44444444-4444-4444-8444-444444444444";
const PLAN_ID = "55555555-5555-4555-8555-555555555555";
const REVISION_ID = "66666666-6666-4666-8666-666666666666";
const ROOT_NODE_ID = "77777777-7777-4777-8777-777777777777";
const CHILD_NODE_ID = "88888888-8888-4888-8888-888888888888";
const LEAF_NODE_ID = "99999999-9999-4999-8999-999999999999";
const DEPENDENCY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BRANCH_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CONVERSATION_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const DEV_REVISION_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const CREATED_AT = "2026-05-04T08:00:00.000Z";
const UPDATED_AT = "2026-05-04T09:00:00.000Z";
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

function defaultTimeline2ApiUserPreferences(): Timeline2UserPreferences {
  return normalizeTimeline2UserPreferences({
    columnOrder: [],
    visibleColumns: [],
    columnWidths: {},
    outlineWidth: 520,
    dayWidth: 38,
    collapsedNodeIds: [],
  });
}

/** Minimal `getApiEnv()` payload so Timeline 2 AI 2 structured tests can call the model stack. */
const TIMELINE2_TEST_OPENAI_ENV = {
  NODE_ENV: "test",
  LOG_LEVEL: "info",
  DATABASE_URL: "postgres://example",
  REDIS_URL: "redis://example",
  MODEL_PROVIDER: "openai",
  OPENAI_API_KEY: "test-key",
  OPENAI_MODEL: "gpt-4o-mini",
  ANTHROPIC_MODEL: "claude-haiku-4-5-20251001",
  GEMINI_MODEL: "gemini-1.5-flash",
  GROQ_MODEL: "llama-3.3-70b-versatile",
  JWT_ACCESS_SECRET: "12345678901234567890123456789012",
  JWT_REFRESH_SECRET: "12345678901234567890123456789012",
  ACCESS_TOKEN_TTL: "4h",
  REFRESH_TOKEN_TTL: "7d",
  CORS_ORIGINS: "http://localhost:3000",
  SLACK_BOT_SCOPES:
    "channels:read,channels:history,groups:history,im:history,mpim:history,chat:write,users:read,users:read.email,im:write",
  SLACK_SIGNATURE_TOLERANCE_SECONDS: 300,
  SLACK_OAUTH_STATE_TTL_SECONDS: 3600,
  GOOGLE_CALENDAR_SCOPES: "https://www.googleapis.com/auth/calendar.readonly",
  GOOGLE_OAUTH_STATE_TTL_SECONDS: 3600,
  OUTLOOK_CALENDAR_SCOPES: "offline_access openid profile User.Read Calendars.ReadWrite",
  OUTLOOK_OAUTH_STATE_TTL_SECONDS: 3600,
  EMAIL_CONNECTOR_PROVIDER: "mock",
  EMAIL_CONNECTOR_OAUTH_STATE_TTL_SECONDS: 3600,
  GMAIL_SCOPES:
    "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email",
  RESEND_FROM_NOREPLY: "Larry <noreply@larry-pm.com>",
  RESEND_FROM_LARRY: "Larry <larry@larry-pm.com>",
  RATE_LIMIT_REDIS_ENABLED: true,
  EMAIL_QUOTA_ENABLED: true,
  LLM_BUDGET_ENABLED: true,
  LLM_TENANT_DAILY_TOKENS: 30000,
  LLM_GLOBAL_DAILY_TOKENS: 80000,
  OAUTH_STATE_SINGLE_USE_ENABLED: true,
  RBAC_V2_ENABLED: false,
  PORT: 8080,
} as const;

const planRow = {
  id: PLAN_ID,
  projectId: PROJECT_ID,
  activeRevisionId: REVISION_ID,
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
};

const revisionRow = {
  id: REVISION_ID,
  revisionNumber: 2,
  reason: "Human updated Timeline 2 node",
  createdAt: UPDATED_AT,
  createdByUserId: USER_ID,
};

const teamMembers = [
  {
    userId: USER_ID,
    name: "Philip",
    email: "philip@example.com",
    tenantRole: "pm",
    projectRole: "owner" as const,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
  },
  {
    userId: USER_2_ID,
    name: "Ada",
    email: "ada@example.com",
    tenantRole: "member",
    projectRole: "editor" as const,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
  },
];

async function buildApp(queryTenant: ReturnType<typeof vi.fn>) {
  const app = Fastify({ logger: false });
  app.decorate("db", { queryTenant } as unknown as Db);
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
    },
  );
  app.decorate("requireRole", () => async () => undefined);
  await app.register(sensible);
  await app.register(timeline2Routes, { prefix: "/timeline2" });
  await app.ready();
  return app;
}

function allSql(queryTenant: ReturnType<typeof vi.fn>) {
  return queryTenant.mock.calls.map((call) => String(call[1])).join("\n");
}

function parseTimeline2Ai2SseDataLines(body: string): Record<string, unknown>[] {
  const events: Record<string, unknown>[] = [];
  for (const line of body.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    try {
      events.push(JSON.parse(line.slice(6)) as Record<string, unknown>);
    } catch {
      // ignore
    }
  }
  return events;
}

function assertEveryEventHasReqId(events: Record<string, unknown>[], reqId: string) {
  for (const ev of events) {
    expect(ev.reqId, JSON.stringify(ev)).toBe(reqId);
  }
}

function structuredPlannerSchemaFailure(): NoObjectGeneratedError {
  return new NoObjectGeneratedError({
    message: "Schema validation failed.",
    text: "{ invalid planner output",
    response: { id: "stub" } as never,
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } as never,
    finishReason: "stop",
  });
}

function expectNoOldTaskTimelineTables(sql: string) {
  for (const table of [
    "tasks",
    "task_dependencies",
    "project_categories",
    "larry_events",
    "larry_conversations",
  ]) {
    expect(sql).not.toMatch(
      new RegExp(`\\b(?:FROM|JOIN|INTO|UPDATE|DELETE\\s+FROM)\\s+${table}\\b`, "i"),
    );
  }
}

beforeEach(() => {
  vi.mocked(getProjectMembershipAccess).mockResolvedValue({
    projectExists: true,
    projectStatus: "active",
    projectRole: "owner",
    canRead: true,
    canManage: true,
  });
  vi.mocked(listProjectMembers).mockResolvedValue(teamMembers);
  vi.mocked(getApiEnv).mockImplementation(() => {
    throw new Error("No Timeline 2 AI provider configured in tests.");
  });
  vi.mocked(createLlmProvider).mockReset();
  vi.mocked(createModel).mockReset();
  vi.mocked(getStructuredOutputOptions).mockReturnValue({});
  vi.mocked(generateObject).mockReset();
});

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  vi.clearAllMocks();
});

describe("Timeline 2 routes", () => {
  it("returns an isolated snapshot with hierarchy, multiple assignees, and upward rollups", async () => {
    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (/FROM timeline2_branches/i.test(sql)) return [];
      if (/FROM timeline2_revisions/i.test(sql)) return [revisionRow];
      if (/FROM timeline2_node_assignees/i.test(sql)) {
        return [
          { nodeId: CHILD_NODE_ID, userId: USER_ID, name: "Philip", email: "philip@example.com" },
          { nodeId: LEAF_NODE_ID, userId: USER_2_ID, name: "Ada", email: "ada@example.com" },
        ];
      }
      if (/FROM timeline2_dependencies/i.test(sql)) {
        return [
          {
            id: DEPENDENCY_ID,
            fromNodeId: CHILD_NODE_ID,
            toNodeId: LEAF_NODE_ID,
            relation: "finish_to_start",
            createdAt: CREATED_AT,
          },
        ];
      }
      if (/FROM timeline2_nodes/i.test(sql) && /ORDER BY sort_order/i.test(sql)) {
        return [
          {
            id: ROOT_NODE_ID,
            planId: PLAN_ID,
            parentId: null,
            kind: "group",
            title: "Construction",
            description: null,
            status: "not_started",
            priority: "medium",
            startDate: "2026-05-01",
            dueDate: "2026-05-05",
            sortOrder: 0,
            actionRequired: false,
            actionRequiredNote: null,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
          {
            id: CHILD_NODE_ID,
            planId: PLAN_ID,
            parentId: ROOT_NODE_ID,
            kind: "task",
            title: "Electrical",
            description: null,
            status: "in_progress",
            priority: "high",
            startDate: "2026-05-06",
            dueDate: "2026-05-10",
            sortOrder: 0,
            actionRequired: true,
            actionRequiredNote: "Permit needed",
            createdAt: "2026-05-04T08:05:00.000Z",
            updatedAt: UPDATED_AT,
          },
          {
            id: LEAF_NODE_ID,
            planId: PLAN_ID,
            parentId: CHILD_NODE_ID,
            kind: "milestone",
            title: "Inspection",
            description: null,
            status: "waiting",
            priority: "critical",
            startDate: "2026-05-09",
            dueDate: "2026-05-15",
            sortOrder: 0,
            actionRequired: false,
            actionRequiredNote: null,
            createdAt: "2026-05-04T08:10:00.000Z",
            updatedAt: UPDATED_AT,
          },
        ];
      }
      if (/FROM timeline2_plans/i.test(sql)) return [planRow];
      return [];
    });

    const app = await buildApp(queryTenant);
    const response = await app.inject({
      method: "GET",
      url: `/timeline2/projects/${PROJECT_ID}/snapshot`,
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    const body = response.json();
    const root = body.tree[0];

    expect(root.children[0].children[0].title).toBe("Inspection");
    expect(root.status).toBe("not_started");
    expect(root.rollup).toMatchObject({
      healthStatus: "blocked",
      priority: "critical",
      startDate: "2026-05-09",
      dueDate: "2026-05-15",
      actionRequiredCount: 1,
      dependencyWarningCount: 1,
      descendantCount: 2,
    });
    expect(root.rollup.assignees.map((assignee: { userId: string }) => assignee.userId).sort()).toEqual([
      USER_2_ID,
      USER_ID,
    ].sort());
    expect(body.teamMembers.map((member: { userId: string }) => member.userId)).toEqual([
      USER_ID,
      USER_2_ID,
    ]);
    expect(listProjectMembers).toHaveBeenCalledWith(expect.anything(), TENANT_ID, PROJECT_ID);

    const sql = allSql(queryTenant);
    expect(sql).toMatch(/timeline2_plans/i);
    expect(sql).toMatch(/timeline2_nodes/i);
    expect(sql).toMatch(/timeline2_dependencies/i);
    expectNoOldTaskTimelineTables(sql);
  });

  it("returns default Timeline 2 user preferences when no row is stored yet", async () => {
    const queryTenant = vi.fn(async () => []);

    const app = await buildApp(queryTenant);
    const response = await app.inject({
      method: "GET",
      url: `/timeline2/projects/${PROJECT_ID}/preferences`,
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      columnOrder: ["task_name", "status", "priority", "progress", "start_date", "due_date", "assignee"],
      visibleColumns: ["status", "priority", "progress", "start_date", "due_date", "assignee"],
      columnWidths: {
        task_name: 320,
        status: 108,
        priority: 92,
        progress: 100,
        start_date: 84,
        due_date: 84,
        assignee: 140,
      },
      outlineWidth: 520,
      dayWidth: 38,
      collapsedNodeIds: [],
    });
  });

  it("saves Timeline 2 user preferences through the dedicated endpoint", async () => {
    const queryTenant = vi.fn(async () => []);
    const payload = {
      columnOrder: ["task", "due", "workflow", "signals"],
      visibleColumns: ["task", "due", "signals"],
      columnWidths: { workflow: 150, due: 96, signals: 160 },
      outlineWidth: 540,
      dayWidth: 44,
      collapsedNodeIds: [ROOT_NODE_ID],
    };

    const app = await buildApp(queryTenant);
    const response = await app.inject({
      method: "PUT",
      url: `/timeline2/projects/${PROJECT_ID}/preferences`,
      payload,
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    const defaults = defaultTimeline2ApiUserPreferences();
    expect(response.json()).toEqual(
      normalizeTimeline2UserPreferences({
        ...defaults,
        ...payload,
        columnWidths: { ...defaults.columnWidths, ...(payload.columnWidths ?? {}) },
      } as Timeline2UserPreferences),
    );
    expect(allSql(queryTenant)).toMatch(/INSERT INTO timeline2_user_preferences/i);
  });

  it("returns computed critical-path metrics from the explicit endpoint", async () => {
    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (/FROM timeline2_branches/i.test(sql)) return [];
      if (/FROM timeline2_revisions/i.test(sql)) return [revisionRow];
      if (/FROM timeline2_node_assignees/i.test(sql)) return [];
      if (/FROM timeline2_dependencies/i.test(sql)) {
        return [
          {
            id: DEPENDENCY_ID,
            fromNodeId: CHILD_NODE_ID,
            toNodeId: LEAF_NODE_ID,
            relation: "finish_to_start",
            lagDays: 0,
            createdAt: CREATED_AT,
          },
        ];
      }
      if (/FROM timeline2_nodes/i.test(sql) && /ORDER BY sort_order/i.test(sql)) {
        return [
          {
            id: CHILD_NODE_ID,
            planId: PLAN_ID,
            parentId: null,
            kind: "task",
            title: "Electrical",
            description: null,
            status: "in_progress",
            priority: "high",
            startDate: "2026-05-06",
            dueDate: "2026-05-10",
            sortOrder: 0,
            progress: 40,
            actionRequired: false,
            actionRequiredNote: null,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
          {
            id: LEAF_NODE_ID,
            planId: PLAN_ID,
            parentId: null,
            kind: "milestone",
            title: "Inspection",
            description: null,
            status: "waiting",
            priority: "critical",
            startDate: "2026-05-11",
            dueDate: "2026-05-11",
            sortOrder: 1,
            progress: 0,
            actionRequired: false,
            actionRequiredNote: null,
            createdAt: "2026-05-04T08:10:00.000Z",
            updatedAt: UPDATED_AT,
          },
        ];
      }
      if (/SELECT target_date::text AS "targetDate"/i.test(sql)) return [{ targetDate: null }];
      if (/FROM timeline2_plans/i.test(sql)) return [planRow];
      return [];
    });

    const app = await buildApp(queryTenant);
    const response = await app.inject({
      method: "GET",
      url: `/timeline2/projects/${PROJECT_ID}/critical-path`,
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      criticalNodeIds: [CHILD_NODE_ID, LEAF_NODE_ID],
      projectedEndDate: "2026-05-11",
    });
  });

  it("rejects write attempts from read-only project members before touching Timeline 2 tables", async () => {
    vi.mocked(getProjectMembershipAccess).mockResolvedValue({
      projectExists: true,
      projectStatus: "active",
      projectRole: "viewer",
      canRead: true,
      canManage: false,
    });
    const queryTenant = vi.fn().mockResolvedValue([]);

    const app = await buildApp(queryTenant);
    const response = await app.inject({
      method: "POST",
      url: `/timeline2/projects/${PROJECT_ID}/nodes`,
      payload: { title: "Should not be created" },
    });
    await app.close();

    expect(response.statusCode).toBe(403);
    expect(queryTenant).not.toHaveBeenCalled();
  });

  it("prevents dependency cycles before inserting a v2 dependency", async () => {
    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (/INSERT INTO timeline2_plans/i.test(sql)) return [planRow];
      if (/SELECT id FROM timeline2_nodes/i.test(sql)) return [{ id: ROOT_NODE_ID }, { id: CHILD_NODE_ID }];
      if (/FROM timeline2_dependencies/i.test(sql)) {
        return [{ fromNodeId: CHILD_NODE_ID, toNodeId: ROOT_NODE_ID }];
      }
      return [];
    });

    const app = await buildApp(queryTenant);
    const response = await app.inject({
      method: "POST",
      url: `/timeline2/projects/${PROJECT_ID}/dependencies`,
      payload: {
        fromNodeId: ROOT_NODE_ID,
        toNodeId: CHILD_NODE_ID,
        relation: "finish_to_start",
      },
    });
    await app.close();

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toMatch(/cycle/i);
    expect(allSql(queryTenant)).not.toMatch(/INSERT INTO timeline2_dependencies/i);
  });

  it("allows creating deeper nested items in Timeline 2", async () => {
    process.env.NODE_ENV = "development";
    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (/INSERT INTO timeline2_plans/i.test(sql)) return [planRow];
      if (/SELECT id, parent_node_id AS "parentId", kind/i.test(sql)) {
        return [
          { id: ROOT_NODE_ID, parentId: null, kind: "group" },
          { id: CHILD_NODE_ID, parentId: ROOT_NODE_ID, kind: "task" },
        ];
      }
      if (/INSERT INTO timeline2_nodes/i.test(sql)) return [{ id: LEAF_NODE_ID }];
      if (/DELETE FROM timeline2_node_assignees/i.test(sql)) return [];
      if (/SELECT COALESCE\(MAX\(revision_number\), 0\) \+ 1 AS "nextRevision"/i.test(sql)) {
        return [{ nextRevision: 3 }];
      }
      if (/INSERT INTO timeline2_revisions/i.test(sql)) return [{ id: DEV_REVISION_ID }];
      if (/UPDATE timeline2_plans/i.test(sql)) return [];
      if (/SELECT id,\s+project_id AS "projectId",\s+active_revision_id AS "activeRevisionId"/i.test(sql)) return [planRow];
      if (/SELECT id,\s+revision_number AS "revisionNumber"/i.test(sql)) return [revisionRow];
      if (/SELECT id,\s+plan_id AS "planId",\s+parent_node_id AS "parentId"/i.test(sql) && /ORDER BY sort_order/i.test(sql)) return [];
      if (/SELECT na\.node_id AS "nodeId"/i.test(sql)) return [];
      if (/SELECT id,\s+from_node_id AS "fromNodeId"/i.test(sql)) return [];
      return [];
    });

    const app = await buildApp(queryTenant);
    const response = await app.inject({
      method: "POST",
      url: `/timeline2/projects/${PROJECT_ID}/nodes`,
      payload: {
        title: "Level 3 task",
        parentId: CHILD_NODE_ID,
      },
    });
    await app.close();

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ id: LEAF_NODE_ID });
  });

  it("does not auto-seed placeholder nodes when creating a fresh plan", async () => {
    process.env.NODE_ENV = "development";
    let nodeInsertCount = 0;
    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (/INSERT INTO timeline2_plans/i.test(sql)) {
        return [{ ...planRow, activeRevisionId: null }];
      }
      if (/SELECT COALESCE\(MAX\(revision_number\), 0\) \+ 1 AS "nextRevision"/i.test(sql)) {
        return [{ nextRevision: 1 }];
      }
      if (/INSERT INTO timeline2_revisions/i.test(sql)) {
        return [{ id: DEV_REVISION_ID }];
      }
      if (/UPDATE timeline2_plans/i.test(sql)) return [];
      if (/SELECT id,\s+project_id AS "projectId",\s+active_revision_id AS "activeRevisionId"/i.test(sql)) {
        return [{ ...planRow, activeRevisionId: DEV_REVISION_ID }];
      }
      if (/SELECT id,\s+revision_number AS "revisionNumber"/i.test(sql)) return [];
      if (/SELECT id,\s+plan_id AS "planId",\s+parent_node_id AS "parentId"/i.test(sql) && /ORDER BY sort_order/i.test(sql)) return [];
      if (/SELECT na\.node_id AS "nodeId"/i.test(sql)) return [];
      if (/SELECT id,\s+from_node_id AS "fromNodeId"/i.test(sql)) return [];
      if (/SELECT id,\s+project_id AS "projectId",\s+plan_id AS "planId"/i.test(sql)) return [];
      return [];
    });

    const app = await buildApp(queryTenant);
    const response = await app.inject({
      method: "POST",
      url: `/timeline2/projects/${PROJECT_ID}/ensure`,
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(nodeInsertCount).toBe(0);
  });

  it("seeds placeholder nodes only through the explicit development endpoint", async () => {
    process.env.NODE_ENV = "development";
    let nodeInsertCount = 0;
    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (/INSERT INTO timeline2_plans/i.test(sql)) {
        return [{ ...planRow, activeRevisionId: null }];
      }
      if (/SELECT COALESCE\(MAX\(revision_number\), 0\) \+ 1 AS "nextRevision"/i.test(sql)) {
        return [{ nextRevision: 1 }];
      }
      if (/INSERT INTO timeline2_revisions/i.test(sql)) {
        return [{ id: DEV_REVISION_ID }];
      }
      if (/UPDATE timeline2_plans/i.test(sql)) return [];
      if (/SELECT id,\s+project_id AS "projectId",\s+active_revision_id AS "activeRevisionId"/i.test(sql)) {
        return [{ ...planRow, activeRevisionId: DEV_REVISION_ID }];
      }
      if (/SELECT id,\s+revision_number AS "revisionNumber"/i.test(sql)) return [];
      if (/SELECT id,\s+plan_id AS "planId",\s+parent_node_id AS "parentId"/i.test(sql) && /ORDER BY sort_order/i.test(sql)) return [];
      if (/SELECT na\.node_id AS "nodeId"/i.test(sql)) return [];
      if (/SELECT id,\s+from_node_id AS "fromNodeId"/i.test(sql)) return [];
      if (/SELECT id,\s+project_id AS "projectId",\s+plan_id AS "planId"/i.test(sql)) return [];
      if (/SELECT COUNT\(\*\)::int AS count\s+FROM timeline2_nodes/i.test(sql)) return [{ count: 0 }];
      if (/INSERT INTO timeline2_nodes/i.test(sql)) {
        nodeInsertCount += 1;
        return [{ id: `${ROOT_NODE_ID.slice(0, 30)}${nodeInsertCount.toString().padStart(2, "0")}` }];
      }
      if (/SELECT user_id AS "userId"/i.test(sql)) return [{ userId: USER_ID }];
      if (/DELETE FROM timeline2_node_assignees/i.test(sql)) return [];
      if (/INSERT INTO timeline2_node_assignees/i.test(sql)) return [];
      if (/INSERT INTO timeline2_dependencies/i.test(sql)) return [];
      return [];
    });

    const app = await buildApp(queryTenant);
    const response = await app.inject({
      method: "POST",
      url: `/timeline2/projects/${PROJECT_ID}/dev-seed-sample`,
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ planId: PLAN_ID, seeded: true });
    expect(nodeInsertCount).toBeGreaterThanOrEqual(4);
  });

  it("hides explicit sample seeding in production", async () => {
    process.env.NODE_ENV = "production";
    const queryTenant = vi.fn().mockResolvedValue([]);

    const app = await buildApp(queryTenant);
    const response = await app.inject({
      method: "POST",
      url: `/timeline2/projects/${PROJECT_ID}/dev-seed-sample`,
    });
    await app.close();

    expect(response.statusCode).toBe(404);
    expect(queryTenant).not.toHaveBeenCalled();
  });

  it("rejects node parent updates that would create a hierarchy cycle", async () => {
    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (/FROM timeline2_nodes n/i.test(sql) && /JOIN timeline2_plans p/i.test(sql)) {
        return [{ planId: PLAN_ID, projectId: PROJECT_ID }];
      }
      if (/SELECT id, parent_node_id AS "parentId"/i.test(sql)) {
        return [
          { id: ROOT_NODE_ID, parentId: null, kind: "group" },
          { id: CHILD_NODE_ID, parentId: ROOT_NODE_ID, kind: "task" },
          { id: LEAF_NODE_ID, parentId: CHILD_NODE_ID, kind: "task" },
        ];
      }
      return [];
    });

    const app = await buildApp(queryTenant);
    const response = await app.inject({
      method: "PATCH",
      url: `/timeline2/nodes/${ROOT_NODE_ID}`,
      payload: { parentId: LEAF_NODE_ID },
    });
    await app.close();

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toMatch(/hierarchy cycle/i);
    expect(allSql(queryTenant)).not.toMatch(/UPDATE timeline2_nodes/i);
  });

  it("rejects milestones as parents for child items", async () => {
    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (/INSERT INTO timeline2_plans/i.test(sql)) return [planRow];
      if (/SELECT id, parent_node_id AS "parentId", kind/i.test(sql)) {
        return [
          { id: ROOT_NODE_ID, parentId: null, kind: "group" },
          { id: LEAF_NODE_ID, parentId: ROOT_NODE_ID, kind: "milestone" },
        ];
      }
      return [];
    });

    const app = await buildApp(queryTenant);
    const response = await app.inject({
      method: "POST",
      url: `/timeline2/projects/${PROJECT_ID}/nodes`,
      payload: {
        title: "Should fail",
        parentId: LEAF_NODE_ID,
      },
    });
    await app.close();

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toMatch(/milestones cannot contain child items/i);
    expect(allSql(queryTenant)).not.toMatch(/INSERT INTO timeline2_nodes/i);
  });

  it("rejects branch accept requests that pass an empty operationIds array", async () => {
    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (/SELECT project_id AS "projectId", plan_id AS "planId", status/i.test(sql)) {
        return [{ projectId: PROJECT_ID, planId: PLAN_ID, status: "open" }];
      }
      if (/FROM timeline2_branches/i.test(sql)) {
        return [
          {
            id: BRANCH_ID,
            projectId: PROJECT_ID,
            planId: PLAN_ID,
            title: "Timeline 2 AI proposal",
            summary: "AI branch from: Add permit review",
            status: "open",
            baseRevisionId: REVISION_ID,
            baseSnapshot: { nodes: [], dependencies: [] },
            proposedSnapshot: { nodes: [], dependencies: [] },
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
          {
            id: LEAF_NODE_ID,
            planId: PLAN_ID,
            parentId: ROOT_NODE_ID,
            kind: "task",
            title: "Release sign-off",
            description: null,
            status: "not_started",
            priority: "high",
            startDate: "2026-07-01",
            dueDate: "2026-07-05",
            sortOrder: 1,
            actionRequired: false,
            actionRequiredNote: null,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
          {
            id: LEAF_NODE_ID,
            planId: PLAN_ID,
            parentId: ROOT_NODE_ID,
            kind: "task",
            title: "Release sign-off",
            description: null,
            status: "not_started",
            priority: "high",
            startDate: "2026-07-01",
            dueDate: "2026-07-05",
            sortOrder: 1,
            actionRequired: false,
            actionRequiredNote: null,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
          {
            id: LEAF_NODE_ID,
            planId: PLAN_ID,
            parentId: ROOT_NODE_ID,
            kind: "task",
            title: "Release sign-off",
            description: null,
            status: "not_started",
            priority: "high",
            startDate: "2026-07-01",
            dueDate: "2026-07-05",
            sortOrder: 1,
            actionRequired: false,
            actionRequiredNote: null,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
        ];
      }
      if (/FROM timeline2_branch_operations/i.test(sql)) {
        return [
          {
            id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            branchId: BRANCH_ID,
            operationType: "create_node",
            targetNodeId: null,
            dependencyId: null,
            before: null,
            after: { title: "Proposal task", kind: "task", status: "not_started", priority: "medium" },
            rationale: "AI proposed work item",
            status: "pending",
            sortOrder: 0,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
        ];
      }
      return [];
    });

    const app = await buildApp(queryTenant);
    const response = await app.inject({
      method: "POST",
      url: `/timeline2/branches/${BRANCH_ID}/accept`,
      payload: { operationIds: [] },
    });
    await app.close();

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toMatch(/operationIds/i);
    const sql = allSql(queryTenant);
    expect(sql).not.toMatch(/UPDATE timeline2_branch_operations\s+SET status = 'applied'/i);
    expect(sql).not.toMatch(/INSERT INTO timeline2_revisions/i);
  });

  it("rejects a branch without mutating canonical nodes or dependencies", async () => {
    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (/SELECT project_id AS "projectId", status/i.test(sql) && /FROM timeline2_branches/i.test(sql)) {
        return [{ projectId: PROJECT_ID, status: "open" }];
      }
      if (/SELECT COUNT\(\*\)::int AS count/i.test(sql)) return [{ count: 0 }];
      return [];
    });

    const app = await buildApp(queryTenant);
    const response = await app.inject({
      method: "POST",
      url: `/timeline2/branches/${BRANCH_ID}/reject`,
      payload: {},
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    const sql = allSql(queryTenant);
    expect(sql).toMatch(/UPDATE timeline2_branch_operations/i);
    expect(sql).toMatch(/UPDATE timeline2_branches/i);
    expect(sql).not.toMatch(/\b(?:INSERT INTO|UPDATE|DELETE FROM)\s+timeline2_nodes\b/i);
    expect(sql).not.toMatch(/\b(?:INSERT INTO|UPDATE|DELETE FROM)\s+timeline2_dependencies\b/i);
  });

  it("builds a structured fallback branch with chained tasks and dependencies when no AI provider is available", async () => {
    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (/INSERT INTO timeline2_plans/i.test(sql)) return [planRow];
      if (/INSERT INTO timeline2_ai2_conversations/i.test(sql)) return [{ id: CONVERSATION_ID }];
      if (/INSERT INTO timeline2_ai2_messages/i.test(sql)) return [];
      if (/UPDATE timeline2_ai2_conversations/i.test(sql)) return [];
      if (/FROM timeline2_ai2_messages/i.test(sql)) return [];
      if (/INSERT INTO timeline2_ai_conversations/i.test(sql)) return [{ id: CONVERSATION_ID }];
      if (/INSERT INTO timeline2_ai_messages/i.test(sql)) return [];
      if (/INSERT INTO timeline2_branches/i.test(sql)) return [{ id: BRANCH_ID }];
      if (/INSERT INTO timeline2_branch_operations/i.test(sql)) return [];
      if (/FROM timeline2_branch_operations/i.test(sql)) return [];
      if (/FROM timeline2_branches/i.test(sql)) {
        return [
          {
            id: BRANCH_ID,
            projectId: PROJECT_ID,
            planId: PLAN_ID,
            title: "Timeline 2 AI proposal",
            summary: "AI branch from: Create a new project, called Product X",
            status: "open",
            baseRevisionId: REVISION_ID,
            baseSnapshot: { nodes: [], dependencies: [] },
            proposedSnapshot: { nodes: [], dependencies: [] },
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
        ];
      }
      if (/FROM timeline2_revisions/i.test(sql)) return [revisionRow];
      if (/FROM timeline2_node_assignees/i.test(sql)) return [];
      if (/FROM timeline2_dependencies/i.test(sql)) return [];
      if (/FROM timeline2_nodes/i.test(sql)) return [];
      if (/FROM timeline2_plans/i.test(sql)) return [planRow];
      return [];
    });

    const app = await buildApp(queryTenant);
    const response = await app.inject({
      method: "POST",
      url: `/timeline2/projects/${PROJECT_ID}/ai/chat/stream`,
      payload: {
        message:
          "Create a new project, called product x. I want that to start in June, when have 3 assignments all dependent on each other. first market research 2 weeks, product development 1 month and last sales one week",
      },
    });
    await app.close();

    expect(response.statusCode).toBe(200);

    const operationCalls = queryTenant.mock.calls.filter((call) =>
      /INSERT INTO timeline2_branch_operations/i.test(String(call[1])),
    );
    const operationTypes = operationCalls.map((call) => (call[2] as unknown[])[2]);
    expect(operationTypes.filter((type) => type === "create_node")).toHaveLength(4);
    expect(operationTypes.filter((type) => type === "set_dependency")).toHaveLength(2);

    const afterPayloads = operationCalls.map((call) =>
      JSON.parse(String((call[2] as unknown[])[6])) as Record<string, unknown>,
    );
    expect(afterPayloads.map((payload) => payload.title).filter(Boolean)).toEqual(
      expect.arrayContaining(["Product X", "Market Research", "Product Development", "Sales"]),
    );
  });

  it("returns an explicit AI failure instead of creating a generic branch for unsupported prompts", async () => {
    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (/INSERT INTO timeline2_plans/i.test(sql)) return [planRow];
      if (/FROM timeline2_revisions/i.test(sql)) return [revisionRow];
      if (/FROM timeline2_node_assignees/i.test(sql)) return [];
      if (/FROM timeline2_dependencies/i.test(sql)) return [];
      if (/FROM timeline2_nodes/i.test(sql) && /ORDER BY sort_order/i.test(sql)) {
        return [
          {
            id: ROOT_NODE_ID,
            planId: PLAN_ID,
            parentId: null,
            kind: "group",
            title: "Existing workstream",
            description: null,
            status: "in_progress",
            priority: "medium",
            startDate: "2026-05-01",
            dueDate: "2026-05-30",
            sortOrder: 0,
            actionRequired: false,
            actionRequiredNote: null,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
        ];
      }
      if (/FROM timeline2_plans/i.test(sql)) return [planRow];
      if (/FROM timeline2_branches/i.test(sql)) return [];
      return [];
    });

    const app = await buildApp(queryTenant);
    const response = await app.inject({
      method: "POST",
      url: `/timeline2/projects/${PROJECT_ID}/ai/chat/stream`,
      payload: { message: "Add milestones and dependencies for the critical path" },
    });
    await app.close();

    expect(response.body).toContain('"type":"error"');
    expect(response.body).toContain("No Timeline 2 AI provider configured in tests.");
    expect(allSql(queryTenant)).not.toMatch(/INSERT INTO timeline2_branches/i);
  });

  it("runs the Timeline 2 AI agent loop and stages mixed operations", async () => {
    vi.mocked(getApiEnv).mockReturnValue({
      NODE_ENV: "test",
      LOG_LEVEL: "info",
      DATABASE_URL: "postgres://example",
      REDIS_URL: "redis://example",
      MODEL_PROVIDER: "openai",
      OPENAI_API_KEY: "test-key",
      OPENAI_MODEL: "gpt-4o-mini",
      ANTHROPIC_MODEL: "claude-haiku-4-5-20251001",
      GEMINI_MODEL: "gemini-1.5-flash",
      GROQ_MODEL: "llama-3.3-70b-versatile",
      JWT_ACCESS_SECRET: "12345678901234567890123456789012",
      JWT_REFRESH_SECRET: "12345678901234567890123456789012",
      ACCESS_TOKEN_TTL: "4h",
      REFRESH_TOKEN_TTL: "7d",
      CORS_ORIGINS: "http://localhost:3000",
      SLACK_BOT_SCOPES:
        "channels:read,channels:history,groups:history,im:history,mpim:history,chat:write,users:read,users:read.email,im:write",
      SLACK_SIGNATURE_TOLERANCE_SECONDS: 300,
      SLACK_OAUTH_STATE_TTL_SECONDS: 3600,
      GOOGLE_CALENDAR_SCOPES: "https://www.googleapis.com/auth/calendar.readonly",
      GOOGLE_OAUTH_STATE_TTL_SECONDS: 3600,
      OUTLOOK_CALENDAR_SCOPES: "offline_access openid profile User.Read Calendars.ReadWrite",
      OUTLOOK_OAUTH_STATE_TTL_SECONDS: 3600,
      EMAIL_CONNECTOR_PROVIDER: "mock",
      EMAIL_CONNECTOR_OAUTH_STATE_TTL_SECONDS: 3600,
      GMAIL_SCOPES:
        "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email",
      RESEND_FROM_NOREPLY: "Larry <noreply@larry-pm.com>",
      RESEND_FROM_LARRY: "Larry <larry@larry-pm.com>",
      RATE_LIMIT_REDIS_ENABLED: true,
      EMAIL_QUOTA_ENABLED: true,
      LLM_BUDGET_ENABLED: true,
      LLM_TENANT_DAILY_TOKENS: 30000,
      LLM_GLOBAL_DAILY_TOKENS: 80000,
      OAUTH_STATE_SINGLE_USE_ENABLED: true,
      RBAC_V2_ENABLED: false,
      PORT: 8080,
    } as never);
    const generateResponse = vi.fn()
      .mockResolvedValueOnce(
        JSON.stringify({
          trace: "Loaded the plan overview before staging any changes.",
          toolName: "get_plan_overview",
          arguments: {},
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          trace: "The dependency graph is empty, so I am analyzing the likely critical path.",
          toolName: "analyze_critical_path",
          arguments: {},
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          trace: "Creating a finish milestone for the inferred path.",
          toolName: "stage_create_node",
          arguments: {
            ref: "critical_path_finish",
            kind: "milestone",
            title: "Critical Path Finish",
            parentId: ROOT_NODE_ID,
            status: "not_started",
            priority: "high",
            startDate: "2026-06-30",
            dueDate: "2026-06-30",
            rationale: "A finish gate makes the inferred path reviewable.",
          },
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          trace: "Linking the downstream task to the new milestone.",
          toolName: "stage_set_dependency",
          arguments: {
            fromNodeId: CHILD_NODE_ID,
            toNodeId: "critical_path_finish",
            relation: "finish_to_start",
            rationale: "The task should complete before the new finish milestone.",
          },
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          trace: "Finalizing the proposal branch.",
          toolName: "finalize_branch",
          arguments: {
            title: "Critical path proposal",
            summary: "Add a finish milestone and dependency for the inferred critical path",
            finalSummary: "Loaded the plan, found no dependencies, inferred a likely critical path, and staged a finish milestone plus dependency for review.",
          },
        }),
      );
    vi.mocked(createLlmProvider).mockReturnValue({ generateResponse } as never);

    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (/INSERT INTO timeline2_plans/i.test(sql)) return [planRow];
      if (/INSERT INTO timeline2_ai2_conversations/i.test(sql)) return [{ id: CONVERSATION_ID }];
      if (/INSERT INTO timeline2_ai2_messages/i.test(sql)) return [];
      if (/UPDATE timeline2_ai2_conversations/i.test(sql)) return [];
      if (/FROM timeline2_ai2_messages/i.test(sql)) return [];
      if (/INSERT INTO timeline2_ai_conversations/i.test(sql)) return [{ id: CONVERSATION_ID }];
      if (/INSERT INTO timeline2_ai_messages/i.test(sql)) return [];
      if (/INSERT INTO timeline2_branches/i.test(sql)) return [{ id: BRANCH_ID }];
      if (/INSERT INTO timeline2_branch_operations/i.test(sql)) return [];
      if (/FROM timeline2_branch_operations/i.test(sql)) return [];
      if (/FROM timeline2_branches/i.test(sql)) {
        return [
          {
            id: BRANCH_ID,
            projectId: PROJECT_ID,
            planId: PLAN_ID,
            title: "Product X branch",
            summary: "Create Product X delivery chain",
            status: "open",
            baseRevisionId: REVISION_ID,
            baseSnapshot: { nodes: [], dependencies: [] },
            proposedSnapshot: { nodes: [], dependencies: [] },
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
        ];
      }
      if (/FROM timeline2_revisions/i.test(sql)) return [revisionRow];
      if (/FROM timeline2_node_assignees/i.test(sql)) return [];
      if (/FROM timeline2_dependencies/i.test(sql)) return [];
      if (/FROM timeline2_nodes/i.test(sql) && /ORDER BY sort_order/i.test(sql)) {
        return [
          {
            id: ROOT_NODE_ID,
            planId: PLAN_ID,
            parentId: null,
            kind: "group",
            title: "Existing workstream",
            description: null,
            status: "in_progress",
            priority: "medium",
            startDate: "2026-05-01",
            dueDate: "2026-05-30",
            sortOrder: 0,
            actionRequired: false,
            actionRequiredNote: null,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
          {
            id: CHILD_NODE_ID,
            planId: PLAN_ID,
            parentId: ROOT_NODE_ID,
            kind: "task",
            title: "Existing downstream task",
            description: null,
            status: "not_started",
            priority: "medium",
            startDate: "2026-06-15",
            dueDate: "2026-06-30",
            sortOrder: 0,
            actionRequired: false,
            actionRequiredNote: null,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
          {
            id: LEAF_NODE_ID,
            planId: PLAN_ID,
            parentId: ROOT_NODE_ID,
            kind: "task",
            title: "Release sign-off",
            description: null,
            status: "not_started",
            priority: "high",
            startDate: "2026-07-01",
            dueDate: "2026-07-05",
            sortOrder: 1,
            actionRequired: false,
            actionRequiredNote: null,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
        ];
      }
      if (/FROM timeline2_plans/i.test(sql)) return [planRow];
      return [];
    });

    const app = await buildApp(queryTenant);
    const response = await app.inject({
      method: "POST",
      url: `/timeline2/projects/${PROJECT_ID}/ai/chat/stream`,
      payload: { message: "Add milestones and dependencies for the critical path." },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('"type":"trace"');
    expect(response.body).toContain('"type":"tool_start"');
    expect(response.body).toContain('"type":"analysis_summary"');

    const operationCalls = queryTenant.mock.calls.filter((call) =>
      /INSERT INTO timeline2_branch_operations/i.test(String(call[1])),
    );
    expect(operationCalls.map((call) => (call[2] as unknown[])[2])).toEqual([
      "create_node",
      "set_dependency",
    ]);

    const milestonePayload = JSON.parse(String((operationCalls[0][2] as unknown[])[6])) as Record<string, unknown>;
    expect(milestonePayload.title).toBe("Critical Path Finish");

    const dependencyPayload = JSON.parse(String((operationCalls[1][2] as unknown[])[6])) as Record<string, unknown>;
    expect(dependencyPayload.fromNodeId).toBe(CHILD_NODE_ID);
    expect(String(dependencyPayload.toNodeId)).toMatch(/^proposal-/);
    expect(dependencyPayload.relation).toBe("finish_to_start");
    expect(generateResponse).toHaveBeenCalledTimes(5);
  });

  it("routes critical-path requests through Timeline 2 AI 2 deterministic planning", async () => {
    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (/INSERT INTO timeline2_plans/i.test(sql)) return [planRow];
      if (/INSERT INTO timeline2_ai2_conversations/i.test(sql)) return [{ id: CONVERSATION_ID }];
      if (/INSERT INTO timeline2_ai2_messages/i.test(sql)) return [];
      if (/UPDATE timeline2_ai2_conversations/i.test(sql)) return [];
      if (/FROM timeline2_ai2_messages/i.test(sql)) return [];
      if (/INSERT INTO timeline2_ai_conversations/i.test(sql)) return [{ id: CONVERSATION_ID }];
      if (/INSERT INTO timeline2_ai_messages/i.test(sql)) return [];
      if (/INSERT INTO timeline2_branches/i.test(sql)) return [{ id: BRANCH_ID }];
      if (/INSERT INTO timeline2_branch_operations/i.test(sql)) return [];
      if (/FROM timeline2_branch_operations/i.test(sql)) return [];
      if (/FROM timeline2_branches/i.test(sql)) {
        return [
          {
            id: BRANCH_ID,
            projectId: PROJECT_ID,
            planId: PLAN_ID,
            title: "Critical path proposal",
            summary: "Add milestones and dependencies for the current critical path",
            status: "open",
            baseRevisionId: REVISION_ID,
            baseSnapshot: { nodes: [], dependencies: [] },
            proposedSnapshot: { nodes: [], dependencies: [] },
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
        ];
      }
      if (/FROM timeline2_revisions/i.test(sql)) return [revisionRow];
      if (/FROM timeline2_node_assignees/i.test(sql)) return [];
      if (/FROM timeline2_dependencies/i.test(sql)) return [];
      if (/FROM timeline2_nodes/i.test(sql) && /ORDER BY sort_order/i.test(sql)) {
        return [
          {
            id: ROOT_NODE_ID,
            planId: PLAN_ID,
            parentId: null,
            kind: "group",
            title: "Existing workstream",
            description: null,
            status: "in_progress",
            priority: "medium",
            startDate: "2026-05-01",
            dueDate: "2026-05-30",
            sortOrder: 0,
            actionRequired: false,
            actionRequiredNote: null,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
          {
            id: CHILD_NODE_ID,
            planId: PLAN_ID,
            parentId: ROOT_NODE_ID,
            kind: "task",
            title: "Existing downstream task",
            description: null,
            status: "not_started",
            priority: "medium",
            startDate: "2026-06-15",
            dueDate: "2026-06-30",
            sortOrder: 0,
            actionRequired: false,
            actionRequiredNote: null,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
          {
            id: LEAF_NODE_ID,
            planId: PLAN_ID,
            parentId: ROOT_NODE_ID,
            kind: "task",
            title: "Release sign-off",
            description: null,
            status: "not_started",
            priority: "high",
            startDate: "2026-07-01",
            dueDate: "2026-07-05",
            sortOrder: 1,
            actionRequired: false,
            actionRequiredNote: null,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
        ];
      }
      if (/FROM timeline2_plans/i.test(sql)) return [planRow];
      return [];
    });

    const app = await buildApp(queryTenant);
    const response = await app.inject({
      method: "POST",
      url: `/timeline2/projects/${PROJECT_ID}/ai2/chat/stream`,
      payload: { message: "Add milestones and dependencies for the critical path" },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('"type":"conversation_started"');
    expect(response.body).toContain('"type":"analysis_summary"');
    expect(response.body).toContain('"type":"branch_created"');

    const operationCalls = queryTenant.mock.calls.filter((call) =>
      /INSERT INTO timeline2_branch_operations/i.test(String(call[1])),
    );
    expect(operationCalls.map((call) => (call[2] as unknown[])[2])).toEqual([
      "set_dependency",
      "create_node",
      "set_dependency",
    ]);

    const milestonePayload = JSON.parse(String((operationCalls[1][2] as unknown[])[6])) as Record<string, unknown>;
    expect(milestonePayload.title).toBe("Complete Existing workstream");

    const dependencyPayload = JSON.parse(String((operationCalls[2][2] as unknown[])[6])) as Record<string, unknown>;
    expect(dependencyPayload.fromNodeId).toBe(LEAF_NODE_ID);
    expect(String(dependencyPayload.toNodeId)).toMatch(/^proposal-/);
  });

  it("creates sequential Product X tasks from a natural language prompt", async () => {
    const today = new Date();
    const anchor = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const addDays = (days: number) => {
      const next = new Date(anchor);
      next.setUTCDate(next.getUTCDate() + days);
      return next.toISOString().slice(0, 10);
    };

    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (/INSERT INTO timeline2_plans/i.test(sql)) return [planRow];
      if (/INSERT INTO timeline2_ai2_conversations/i.test(sql)) return [{ id: CONVERSATION_ID }];
      if (/INSERT INTO timeline2_ai2_messages/i.test(sql)) return [];
      if (/UPDATE timeline2_ai2_conversations/i.test(sql)) return [];
      if (/FROM timeline2_ai2_messages/i.test(sql)) return [];
      if (/INSERT INTO timeline2_ai_conversations/i.test(sql)) return [{ id: CONVERSATION_ID }];
      if (/INSERT INTO timeline2_ai_messages/i.test(sql)) return [];
      if (/INSERT INTO timeline2_branches/i.test(sql)) return [{ id: BRANCH_ID }];
      if (/INSERT INTO timeline2_branch_operations/i.test(sql)) return [];
      if (/FROM timeline2_branch_operations/i.test(sql)) return [];
      if (/FROM timeline2_branches/i.test(sql)) {
        return [
          {
            id: BRANCH_ID,
            projectId: PROJECT_ID,
            planId: PLAN_ID,
            title: "Timeline 2 AI proposal",
            summary: "AI branch from: Add a group called product x that has tasks development and sales both 2 weeks after each other starting in 1 week",
            status: "open",
            baseRevisionId: REVISION_ID,
            baseSnapshot: { nodes: [], dependencies: [] },
            proposedSnapshot: { nodes: [], dependencies: [] },
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
        ];
      }
      if (/FROM timeline2_revisions/i.test(sql)) return [revisionRow];
      if (/FROM timeline2_node_assignees/i.test(sql)) return [];
      if (/FROM timeline2_dependencies/i.test(sql)) return [];
      if (/FROM timeline2_nodes/i.test(sql)) return [];
      if (/FROM timeline2_plans/i.test(sql)) return [planRow];
      return [];
    });

    const app = await buildApp(queryTenant);
    const response = await app.inject({
      method: "POST",
      url: `/timeline2/projects/${PROJECT_ID}/ai2/chat/stream`,
      payload: {
        message: "Add a group called product x that has tasks development and sales both 2 weeks after each other starting in 1 week",
      },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('"type":"conversation_started"');
    expect(response.body).toContain('"type":"branch_created"');

    const operationCalls = queryTenant.mock.calls.filter((call) =>
      /INSERT INTO timeline2_branch_operations/i.test(String(call[1])),
    );
    const afterPayloads = operationCalls.map((call) =>
      JSON.parse(String((call[2] as unknown[])[6])) as Record<string, unknown>,
    );

    expect(afterPayloads.map((payload) => payload.title).filter(Boolean)).toEqual(
      expect.arrayContaining(["Product X", "Development", "Sales"]),
    );

    const groupPayload = afterPayloads.find((payload) => payload.kind === "group")!;
    expect(groupPayload.startDate).toBe(addDays(7));
    expect(groupPayload.dueDate).toBe(addDays(34));

    const taskPayloads = afterPayloads.filter((payload) => payload.kind === "task");
    expect(taskPayloads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "Development", startDate: addDays(7), dueDate: addDays(20) }),
        expect.objectContaining({ title: "Sales", startDate: addDays(21), dueDate: addDays(34) }),
      ]),
    );
  });

  it("runs the Timeline 2 AI 2 structured planner loop with schema-enforced steps", async () => {
    vi.mocked(getApiEnv).mockReturnValue(TIMELINE2_TEST_OPENAI_ENV as never);
    vi.mocked(createModel).mockReturnValue({} as never);
    vi.mocked(generateObject)
      .mockResolvedValueOnce({
        object: { kind: "tool_call", trace: "Load the plan overview first.", toolName: "get_plan_overview", arguments: {} },
      } as never)
      .mockResolvedValueOnce({
        object: { kind: "tool_call", trace: "Analyze the likely critical path.", toolName: "analyze_critical_path", arguments: {} },
      } as never)
      .mockResolvedValueOnce({
        object: {
          kind: "tool_call",
          trace: "Create a finish milestone for review.",
          toolName: "stage_create_node",
          arguments: {
            ref: "critical_path_finish",
            kind: "milestone",
            title: "Critical Path Finish",
            parentId: ROOT_NODE_ID,
            status: "not_started",
            priority: "high",
            startDate: "2026-06-30",
            dueDate: "2026-06-30",
            rationale: "A finish gate makes the inferred path reviewable.",
          },
        },
      } as never)
      .mockResolvedValueOnce({
        object: {
          kind: "tool_call",
          trace: "Link the downstream task to the milestone.",
          toolName: "stage_set_dependency",
          arguments: {
            fromNodeId: CHILD_NODE_ID,
            toNodeId: "critical_path_finish",
            relation: "finish_to_start",
            rationale: "The task should complete before the finish milestone.",
          },
        },
      } as never)
      .mockResolvedValueOnce({
        object: {
          kind: "finalize_branch",
          trace: "Finalize the reviewable branch.",
          title: "AI 2 critical path proposal",
          summary: "Add a finish milestone and dependency from AI 2",
          finalSummary: "AI 2 inspected the current plan, staged a milestone, and linked the downstream work for review.",
        },
      } as never);

    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (/INSERT INTO timeline2_plans/i.test(sql)) return [planRow];
      if (/INSERT INTO timeline2_ai2_conversations/i.test(sql)) return [{ id: CONVERSATION_ID }];
      if (/INSERT INTO timeline2_ai2_messages/i.test(sql)) return [];
      if (/UPDATE timeline2_ai2_conversations/i.test(sql)) return [];
      if (/FROM timeline2_ai2_messages/i.test(sql)) return [];
      if (/INSERT INTO timeline2_ai_conversations/i.test(sql)) return [{ id: CONVERSATION_ID }];
      if (/INSERT INTO timeline2_ai_messages/i.test(sql)) return [];
      if (/INSERT INTO timeline2_branches/i.test(sql)) return [{ id: BRANCH_ID }];
      if (/INSERT INTO timeline2_branch_operations/i.test(sql)) return [];
      if (/FROM timeline2_branch_operations/i.test(sql)) return [];
      if (/FROM timeline2_branches/i.test(sql)) {
        return [
          {
            id: BRANCH_ID,
            projectId: PROJECT_ID,
            planId: PLAN_ID,
            title: "AI 2 critical path proposal",
            summary: "Add a finish milestone and dependency from AI 2",
            status: "open",
            baseRevisionId: REVISION_ID,
            baseSnapshot: { nodes: [], dependencies: [] },
            proposedSnapshot: { nodes: [], dependencies: [] },
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
        ];
      }
      if (/FROM timeline2_revisions/i.test(sql)) return [revisionRow];
      if (/FROM timeline2_node_assignees/i.test(sql)) return [];
      if (/FROM timeline2_dependencies/i.test(sql)) return [];
      if (/FROM timeline2_nodes/i.test(sql) && /ORDER BY sort_order/i.test(sql)) {
        return [
          {
            id: ROOT_NODE_ID,
            planId: PLAN_ID,
            parentId: null,
            kind: "group",
            title: "Existing workstream",
            description: null,
            status: "in_progress",
            priority: "medium",
            startDate: "2026-05-01",
            dueDate: "2026-05-30",
            sortOrder: 0,
            actionRequired: false,
            actionRequiredNote: null,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
          {
            id: CHILD_NODE_ID,
            planId: PLAN_ID,
            parentId: ROOT_NODE_ID,
            kind: "task",
            title: "Existing downstream task",
            description: null,
            status: "not_started",
            priority: "medium",
            startDate: "2026-06-15",
            dueDate: "2026-06-30",
            sortOrder: 0,
            actionRequired: false,
            actionRequiredNote: null,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
        ];
      }
      if (/FROM timeline2_plans/i.test(sql)) return [planRow];
      return [];
    });

    const app = await buildApp(queryTenant);
    const response = await app.inject({
      method: "POST",
      url: `/timeline2/projects/${PROJECT_ID}/ai2/chat/stream`,
      payload: { message: "Review the current plan and add a finish milestone." },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('"type":"conversation_started"');
    expect(response.body).toContain('"type":"tool_start"');
    expect(response.body).toContain('"type":"analysis_summary"');

    const operationCalls = queryTenant.mock.calls.filter((call) =>
      /INSERT INTO timeline2_branch_operations/i.test(String(call[1])),
    );
    expect(operationCalls.map((call) => (call[2] as unknown[])[2])).toEqual([
      "create_node",
      "set_dependency",
    ]);
    expect(generateObject).toHaveBeenCalledTimes(5);
  });

  it("streams conversation_started before question and done without branch_created for AI 2 clarifying questions", async () => {
    vi.mocked(getApiEnv).mockReturnValue(TIMELINE2_TEST_OPENAI_ENV as never);
    vi.mocked(createModel).mockReturnValue({} as never);
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: {
        kind: "ask_clarifying_question",
        trace: "Need more detail.",
        question: "Which deliverable should we prioritize?",
        context: "Several items could match your request.",
      },
    } as never);

    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (/INSERT INTO timeline2_plans/i.test(sql)) return [planRow];
      if (/INSERT INTO timeline2_ai2_conversations/i.test(sql)) return [{ id: CONVERSATION_ID }];
      if (/INSERT INTO timeline2_ai2_messages/i.test(sql)) return [];
      if (/UPDATE timeline2_ai2_conversations/i.test(sql)) return [];
      if (/FROM timeline2_ai2_messages/i.test(sql)) return [];
      if (/INSERT INTO timeline2_ai_conversations/i.test(sql)) return [{ id: CONVERSATION_ID }];
      if (/INSERT INTO timeline2_ai_messages/i.test(sql)) return [];
      if (/INSERT INTO timeline2_branches/i.test(sql)) return [{ id: BRANCH_ID }];
      if (/INSERT INTO timeline2_branch_operations/i.test(sql)) return [];
      if (/FROM timeline2_branch_operations/i.test(sql)) return [];
      if (/FROM timeline2_branches/i.test(sql)) return [];
      if (/FROM timeline2_revisions/i.test(sql)) return [revisionRow];
      if (/FROM timeline2_node_assignees/i.test(sql)) return [];
      if (/FROM timeline2_dependencies/i.test(sql)) return [];
      if (/FROM timeline2_nodes/i.test(sql) && /ORDER BY sort_order/i.test(sql)) {
        return [
          {
            id: ROOT_NODE_ID,
            planId: PLAN_ID,
            parentId: null,
            kind: "group",
            title: "Program",
            description: null,
            status: "in_progress",
            priority: "medium",
            startDate: "2026-05-01",
            dueDate: "2026-05-30",
            sortOrder: 0,
            actionRequired: false,
            actionRequiredNote: null,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
        ];
      }
      if (/FROM timeline2_plans/i.test(sql)) return [planRow];
      return [];
    });

    const app = await buildApp(queryTenant);
    const response = await app.inject({
      method: "POST",
      url: `/timeline2/projects/${PROJECT_ID}/ai2/chat/stream`,
      payload: { message: "Improve the schedule somehow." },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    const body = response.body;
    const ixConv = body.indexOf('"type":"conversation_started"');
    const ixQ = body.indexOf('"type":"question"');
    const ixDone = body.indexOf('"type":"done"');
    expect(ixConv).toBeGreaterThan(-1);
    expect(ixQ).toBeGreaterThan(ixConv);
    expect(ixDone).toBeGreaterThan(ixQ);
    expect(body).not.toContain('"type":"branch_created"');
    expect(body).toContain(`"conversationId":"${CONVERSATION_ID}"`);
    expect(generateObject).toHaveBeenCalledTimes(1);
  });

  it("records three AI 2 chat messages after clarification plus fallback follow-up", async () => {
    let envInvocation = 0;
    vi.mocked(getApiEnv).mockImplementation(() => {
      envInvocation += 1;
      if (envInvocation === 1) return TIMELINE2_TEST_OPENAI_ENV as never;
      throw new Error("No Timeline 2 AI provider configured in tests.");
    });
    vi.mocked(createModel).mockReturnValue({} as never);
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: {
        kind: "ask_clarifying_question",
        trace: "Clarify.",
        question: "Which region?",
      },
    } as never);

    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (/INSERT INTO timeline2_plans/i.test(sql)) return [planRow];
      if (/INSERT INTO timeline2_ai2_conversations/i.test(sql)) return [{ id: CONVERSATION_ID }];
      if (/INSERT INTO timeline2_ai2_messages/i.test(sql)) return [];
      if (/UPDATE timeline2_ai2_conversations/i.test(sql)) return [];
      if (/FROM timeline2_ai2_messages/i.test(sql)) return [];
      if (/INSERT INTO timeline2_ai_conversations/i.test(sql)) return [{ id: CONVERSATION_ID }];
      if (/INSERT INTO timeline2_ai_messages/i.test(sql)) return [];
      if (/INSERT INTO timeline2_branches/i.test(sql)) return [{ id: BRANCH_ID }];
      if (/INSERT INTO timeline2_branch_operations/i.test(sql)) return [];
      if (/FROM timeline2_branch_operations/i.test(sql)) return [];
      if (/FROM timeline2_branches/i.test(sql)) {
        return [
          {
            id: BRANCH_ID,
            projectId: PROJECT_ID,
            planId: PLAN_ID,
            title: "Timeline 2 AI proposal",
            summary: "AI branch",
            status: "open",
            baseRevisionId: REVISION_ID,
            baseSnapshot: { nodes: [], dependencies: [] },
            proposedSnapshot: { nodes: [], dependencies: [] },
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
        ];
      }
      if (/FROM timeline2_revisions/i.test(sql)) return [revisionRow];
      if (/FROM timeline2_node_assignees/i.test(sql)) return [];
      if (/FROM timeline2_dependencies/i.test(sql)) return [];
      if (/FROM timeline2_nodes/i.test(sql)) return [];
      if (/FROM timeline2_plans/i.test(sql)) return [planRow];
      return [];
    });

    const app = await buildApp(queryTenant);
    const followUp =
      "Add a group called product x that has tasks development and sales both 2 weeks after each other starting in 1 week";
    const r1 = await app.inject({
      method: "POST",
      url: `/timeline2/projects/${PROJECT_ID}/ai2/chat/stream`,
      payload: { message: "Something vague about scheduling." },
    });
    expect(r1.statusCode).toBe(200);

    vi.mocked(generateObject).mockReset();

    const r2 = await app.inject({
      method: "POST",
      url: `/timeline2/projects/${PROJECT_ID}/ai2/chat/stream`,
      payload: {
        message: "Something vague about scheduling.",
        answer: followUp,
        conversationId: CONVERSATION_ID,
      },
    });
    expect(r2.statusCode).toBe(200);
    await app.close();

    const ai2MsgInserts = queryTenant.mock.calls.filter((call) =>
      /INSERT INTO timeline2_ai2_messages/i.test(String(call[1])),
    );
    expect(ai2MsgInserts.length).toBe(3);
  });

  it("runs get_at_risk_tasks when the AI 2 planner selects that tool", async () => {
    vi.mocked(getApiEnv).mockReturnValue(TIMELINE2_TEST_OPENAI_ENV as never);
    vi.mocked(createModel).mockReturnValue({} as never);
    vi.mocked(generateObject)
      .mockResolvedValueOnce({
        object: {
          kind: "tool_call",
          trace: "Identify schedule risk.",
          toolName: "get_at_risk_tasks",
          arguments: {},
        },
      } as never)
      .mockResolvedValueOnce({
        object: {
          kind: "fail_with_reason",
          trace: "End after risk snapshot.",
          message: "Stopped after risk listing.",
          reason: "test_cutoff",
        },
      } as never);

    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (/INSERT INTO timeline2_plans/i.test(sql)) return [planRow];
      if (/INSERT INTO timeline2_ai2_conversations/i.test(sql)) return [{ id: CONVERSATION_ID }];
      if (/INSERT INTO timeline2_ai2_messages/i.test(sql)) return [];
      if (/UPDATE timeline2_ai2_conversations/i.test(sql)) return [];
      if (/FROM timeline2_ai2_messages/i.test(sql)) return [];
      if (/INSERT INTO timeline2_ai_conversations/i.test(sql)) return [{ id: CONVERSATION_ID }];
      if (/INSERT INTO timeline2_ai_messages/i.test(sql)) return [];
      if (/INSERT INTO timeline2_branches/i.test(sql)) return [{ id: BRANCH_ID }];
      if (/INSERT INTO timeline2_branch_operations/i.test(sql)) return [];
      if (/FROM timeline2_branch_operations/i.test(sql)) return [];
      if (/FROM timeline2_branches/i.test(sql)) return [];
      if (/FROM timeline2_revisions/i.test(sql)) return [revisionRow];
      if (/FROM timeline2_node_assignees/i.test(sql)) return [];
      if (/FROM timeline2_dependencies/i.test(sql)) return [];
      if (/FROM timeline2_nodes/i.test(sql) && /ORDER BY sort_order/i.test(sql)) {
        return [
          {
            id: ROOT_NODE_ID,
            planId: PLAN_ID,
            parentId: null,
            kind: "group",
            title: "Workstream",
            description: null,
            status: "in_progress",
            priority: "medium",
            startDate: "2026-05-01",
            dueDate: "2026-05-30",
            sortOrder: 0,
            actionRequired: false,
            actionRequiredNote: null,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
        ];
      }
      if (/FROM timeline2_plans/i.test(sql)) return [planRow];
      return [];
    });

    const app = await buildApp(queryTenant);
    const response = await app.inject({
      method: "POST",
      url: `/timeline2/projects/${PROJECT_ID}/ai2/chat/stream`,
      payload: { message: "which tasks are at risk?" },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    const toolStartIdx = response.body.indexOf('"type":"tool_start"');
    const atRiskIdx = response.body.indexOf("get_at_risk_tasks");
    expect(toolStartIdx).toBeGreaterThan(-1);
    expect(atRiskIdx).toBeGreaterThan(-1);
    expect(atRiskIdx).toBeGreaterThan(toolStartIdx);
  });

  it("runs get_team_workload when someone asks who has capacity this week", async () => {
    vi.mocked(getApiEnv).mockReturnValue(TIMELINE2_TEST_OPENAI_ENV as never);
    vi.mocked(createModel).mockReturnValue({} as never);
    vi.mocked(generateObject)
      .mockResolvedValueOnce({
        object: {
          kind: "tool_call",
          trace: "Summarize weekly capacity.",
          toolName: "get_team_workload",
          arguments: { windowDays: 7 },
        },
      } as never)
      .mockResolvedValueOnce({
        object: {
          kind: "fail_with_reason",
          trace: "Stop after the snapshot.",
          message: "Here is the workload window you asked about.",
          reason: "test_cutoff",
        },
      } as never);

    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (/INSERT INTO timeline2_plans/i.test(sql)) return [planRow];
      if (/INSERT INTO timeline2_ai2_conversations/i.test(sql)) return [{ id: CONVERSATION_ID }];
      if (/INSERT INTO timeline2_ai2_messages/i.test(sql)) return [];
      if (/UPDATE timeline2_ai2_conversations/i.test(sql)) return [];
      if (/FROM timeline2_ai2_messages/i.test(sql)) return [];
      if (/INSERT INTO timeline2_ai_conversations/i.test(sql)) return [{ id: CONVERSATION_ID }];
      if (/INSERT INTO timeline2_ai_messages/i.test(sql)) return [];
      if (/INSERT INTO timeline2_branches/i.test(sql)) return [{ id: BRANCH_ID }];
      if (/INSERT INTO timeline2_branch_operations/i.test(sql)) return [];
      if (/FROM timeline2_branch_operations/i.test(sql)) return [];
      if (/FROM timeline2_branches/i.test(sql)) return [];
      if (/FROM timeline2_revisions/i.test(sql)) return [revisionRow];
      if (/FROM timeline2_node_assignees/i.test(sql)) return [];
      if (/FROM timeline2_dependencies/i.test(sql)) return [];
      if (/FROM timeline2_nodes/i.test(sql) && /ORDER BY sort_order/i.test(sql)) {
        return [
          {
            id: ROOT_NODE_ID,
            planId: PLAN_ID,
            parentId: null,
            kind: "group",
            title: "Workstream",
            description: null,
            status: "in_progress",
            priority: "medium",
            startDate: "2026-05-01",
            dueDate: "2026-05-30",
            sortOrder: 0,
            actionRequired: false,
            actionRequiredNote: null,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
        ];
      }
      if (/FROM timeline2_plans/i.test(sql)) return [planRow];
      return [];
    });

    const app = await buildApp(queryTenant);
    const response = await app.inject({
      method: "POST",
      url: `/timeline2/projects/${PROJECT_ID}/ai2/chat/stream`,
      payload: { message: "Who has capacity this week?" },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    const toolStartIdx = response.body.indexOf('"type":"tool_start"');
    const workloadIdx = response.body.indexOf("get_team_workload");
    expect(toolStartIdx).toBeGreaterThan(-1);
    expect(workloadIdx).toBeGreaterThan(-1);
    expect(workloadIdx).toBeGreaterThan(toolStartIdx);
  });

  it("buildPlanOverview handles plans with no dependencies without throwing", async () => {
    vi.mocked(getApiEnv).mockReturnValue(TIMELINE2_TEST_OPENAI_ENV as never);
    vi.mocked(createModel).mockReturnValue({} as never);
    vi.mocked(generateObject)
      .mockResolvedValueOnce({
        object: {
          kind: "tool_call",
          trace: "Load overview.",
          toolName: "get_plan_overview",
          arguments: {},
        },
      } as never)
      .mockResolvedValueOnce({
        object: {
          kind: "fail_with_reason",
          trace: "Cut short.",
          message: "Test ended.",
          reason: "no_deps_overview_only",
        },
      } as never);

    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (/INSERT INTO timeline2_plans/i.test(sql)) return [planRow];
      if (/INSERT INTO timeline2_ai2_conversations/i.test(sql)) return [{ id: CONVERSATION_ID }];
      if (/INSERT INTO timeline2_ai2_messages/i.test(sql)) return [];
      if (/UPDATE timeline2_ai2_conversations/i.test(sql)) return [];
      if (/FROM timeline2_ai2_messages/i.test(sql)) return [];
      if (/INSERT INTO timeline2_ai_conversations/i.test(sql)) return [{ id: CONVERSATION_ID }];
      if (/INSERT INTO timeline2_ai_messages/i.test(sql)) return [];
      if (/INSERT INTO timeline2_branches/i.test(sql)) return [{ id: BRANCH_ID }];
      if (/INSERT INTO timeline2_branch_operations/i.test(sql)) return [];
      if (/FROM timeline2_branch_operations/i.test(sql)) return [];
      if (/FROM timeline2_branches/i.test(sql)) return [];
      if (/FROM timeline2_revisions/i.test(sql)) return [revisionRow];
      if (/FROM timeline2_node_assignees/i.test(sql)) return [];
      if (/FROM timeline2_dependencies/i.test(sql)) return [];
      if (/FROM timeline2_nodes/i.test(sql) && /ORDER BY sort_order/i.test(sql)) {
        return [
          {
            id: ROOT_NODE_ID,
            planId: PLAN_ID,
            parentId: null,
            kind: "group",
            title: "Root",
            description: null,
            status: "in_progress",
            priority: "medium",
            startDate: "2026-05-01",
            dueDate: "2026-05-30",
            sortOrder: 0,
            actionRequired: false,
            actionRequiredNote: null,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
          {
            id: CHILD_NODE_ID,
            planId: PLAN_ID,
            parentId: ROOT_NODE_ID,
            kind: "task",
            title: "Dated A",
            description: null,
            status: "not_started",
            priority: "medium",
            startDate: "2026-06-01",
            dueDate: "2026-06-10",
            sortOrder: 0,
            actionRequired: false,
            actionRequiredNote: null,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
          {
            id: LEAF_NODE_ID,
            planId: PLAN_ID,
            parentId: ROOT_NODE_ID,
            kind: "task",
            title: "Dated B",
            description: null,
            status: "not_started",
            priority: "medium",
            startDate: "2026-06-11",
            dueDate: "2026-06-20",
            sortOrder: 1,
            actionRequired: false,
            actionRequiredNote: null,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
        ];
      }
      if (/FROM timeline2_plans/i.test(sql)) return [planRow];
      return [];
    });

    const app = await buildApp(queryTenant);
    const response = await app.inject({
      method: "POST",
      url: `/timeline2/projects/${PROJECT_ID}/ai2/chat/stream`,
      payload: { message: "Summarize schedule health." },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('"type":"conversation_started"');
    expect(response.body).toContain("SCHEDULE HEALTH");
    expect(response.body).toContain('"type":"error"');
  });

  it("accepts branch operations that create nodes and then connect them with dependencies", async () => {
    let createdNodeCount = 0;
    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (/SELECT project_id AS "projectId", plan_id AS "planId", status/i.test(sql)) {
        return [{ projectId: PROJECT_ID, planId: PLAN_ID, status: "open" }];
      }
      if (/FROM timeline2_branches/i.test(sql)) {
        return [
          {
            id: BRANCH_ID,
            projectId: PROJECT_ID,
            planId: PLAN_ID,
            title: "Timeline 2 AI proposal",
            summary: "AI branch from: Add dependency chain",
            status: "open",
            baseRevisionId: REVISION_ID,
            baseSnapshot: { nodes: [], dependencies: [] },
            proposedSnapshot: { nodes: [], dependencies: [] },
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
        ];
      }
      if (/FROM timeline2_branch_operations/i.test(sql)) {
        return [
          {
            id: "10000000-0000-4000-8000-000000000001",
            branchId: BRANCH_ID,
            operationType: "create_node",
            targetNodeId: null,
            dependencyId: null,
            before: null,
            after: {
              clientTempId: "temp-root",
              parentId: null,
              kind: "group",
              title: "Product X",
              description: null,
              status: "not_started",
              priority: "medium",
              startDate: "2026-06-01",
              dueDate: "2026-07-21",
              sortOrder: 0,
              actionRequired: { required: false, note: null },
              assigneeUserIds: [],
            },
            rationale: "Create the workstream",
            status: "pending",
            sortOrder: 0,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
          {
            id: "10000000-0000-4000-8000-000000000002",
            branchId: BRANCH_ID,
            operationType: "create_node",
            targetNodeId: null,
            dependencyId: null,
            before: null,
            after: {
              clientTempId: "temp-research",
              parentId: "temp-root",
              kind: "task",
              title: "Market Research",
              description: null,
              status: "not_started",
              priority: "medium",
              startDate: "2026-06-01",
              dueDate: "2026-06-14",
              sortOrder: 0,
              actionRequired: { required: false, note: null },
              assigneeUserIds: [],
            },
            rationale: "Create task one",
            status: "pending",
            sortOrder: 1,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
          {
            id: "10000000-0000-4000-8000-000000000003",
            branchId: BRANCH_ID,
            operationType: "create_node",
            targetNodeId: null,
            dependencyId: null,
            before: null,
            after: {
              clientTempId: "temp-development",
              parentId: "temp-root",
              kind: "task",
              title: "Product Development",
              description: null,
              status: "not_started",
              priority: "medium",
              startDate: "2026-06-15",
              dueDate: "2026-07-14",
              sortOrder: 1,
              actionRequired: { required: false, note: null },
              assigneeUserIds: [],
            },
            rationale: "Create task two",
            status: "pending",
            sortOrder: 2,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
          {
            id: "10000000-0000-4000-8000-000000000004",
            branchId: BRANCH_ID,
            operationType: "set_dependency",
            targetNodeId: null,
            dependencyId: null,
            before: null,
            after: {
              fromNodeId: "temp-research",
              toNodeId: "temp-development",
              relation: "finish_to_start",
            },
            rationale: "Link the tasks",
            status: "pending",
            sortOrder: 3,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
        ];
      }
      if (/INSERT INTO timeline2_nodes/i.test(sql)) {
        createdNodeCount += 1;
        return [{ id: `20000000-0000-4000-8000-00000000000${createdNodeCount}` }];
      }
      if (/SELECT id, parent_node_id AS "parentId", kind/i.test(sql)) {
        if (createdNodeCount === 0) return [];
        const rows = [{ id: "20000000-0000-4000-8000-000000000001", parentId: null, kind: "group" }];
        if (createdNodeCount >= 2) {
          rows.push({ id: "20000000-0000-4000-8000-000000000002", parentId: "20000000-0000-4000-8000-000000000001", kind: "task" });
        }
        return rows;
      }
      if (/DELETE FROM timeline2_node_assignees/i.test(sql)) return [];
      if (/SELECT id FROM timeline2_nodes\s+WHERE tenant_id = \$1 AND plan_id = \$2 AND id = ANY/i.test(sql)) {
        return [{ id: "20000000-0000-4000-8000-000000000002" }, { id: "20000000-0000-4000-8000-000000000003" }];
      }
      if (/FROM timeline2_dependencies/i.test(sql)) return [];
      if (/INSERT INTO timeline2_dependencies/i.test(sql)) return [];
      if (/UPDATE timeline2_branch_operations/i.test(sql)) return [];
      if (/SELECT COUNT\(\*\)::int AS count\s+FROM timeline2_branch_operations/i.test(sql)) return [{ count: 0 }];
      if (/UPDATE timeline2_branches/i.test(sql)) return [];
      if (/SELECT COALESCE\(MAX\(revision_number\), 0\) \+ 1 AS "nextRevision"/i.test(sql)) return [{ nextRevision: 3 }];
      if (/INSERT INTO timeline2_revisions/i.test(sql)) return [{ id: DEV_REVISION_ID }];
      if (/UPDATE timeline2_plans/i.test(sql)) return [];
      if (/SELECT id,\s+project_id AS "projectId",\s+active_revision_id AS "activeRevisionId"/i.test(sql)) return [planRow];
      if (/SELECT id,\s+revision_number AS "revisionNumber"/i.test(sql)) return [revisionRow];
      if (/SELECT id,\s+plan_id AS "planId",\s+parent_node_id AS "parentId"/i.test(sql) && /ORDER BY sort_order/i.test(sql)) return [];
      if (/SELECT na\.node_id AS "nodeId"/i.test(sql)) return [];
      if (/SELECT id,\s+project_id AS "projectId",\s+plan_id AS "planId"/i.test(sql)) return [];
      return [];
    });

    const app = await buildApp(queryTenant);
    const response = await app.inject({
      method: "POST",
      url: `/timeline2/branches/${BRANCH_ID}/accept`,
      payload: {},
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(allSql(queryTenant)).toMatch(/INSERT INTO timeline2_dependencies/i);
  });

  it("GET /timeline2/ai2/health returns safe AI 2 diagnostics", async () => {
    vi.mocked(getApiEnv).mockReturnValue(TIMELINE2_TEST_OPENAI_ENV as never);
    const app = await buildApp(vi.fn().mockResolvedValue([]));
    const response = await app.inject({ method: "GET", url: "/timeline2/ai2/health" });
    await app.close();
    expect(response.statusCode).toBe(200);
    const body = response.json() as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.route).toBe("timeline2.ai2.health");
    expect(body).toHaveProperty("providerConfigured");
    expect(body).toHaveProperty("debugTraceEnabled");
    expect(body).toHaveProperty("openaiBaseUrlSanitized");
  });

  it("correlates Timeline 2 AI 2 SSE events with the incoming x-request-id header", async () => {
    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (/INSERT INTO timeline2_plans/i.test(sql)) return [planRow];
      if (/INSERT INTO timeline2_ai2_conversations/i.test(sql)) return [{ id: CONVERSATION_ID }];
      if (/INSERT INTO timeline2_ai2_messages/i.test(sql)) return [];
      if (/UPDATE timeline2_ai2_conversations/i.test(sql)) return [];
      if (/FROM timeline2_ai2_messages/i.test(sql)) return [];
      if (/INSERT INTO timeline2_ai_conversations/i.test(sql)) return [{ id: CONVERSATION_ID }];
      if (/INSERT INTO timeline2_ai_messages/i.test(sql)) return [];
      if (/INSERT INTO timeline2_branches/i.test(sql)) return [{ id: BRANCH_ID }];
      if (/INSERT INTO timeline2_branch_operations/i.test(sql)) return [];
      if (/FROM timeline2_branch_operations/i.test(sql)) return [];
      if (/FROM timeline2_branches/i.test(sql)) {
        return [
          {
            id: BRANCH_ID,
            projectId: PROJECT_ID,
            planId: PLAN_ID,
            title: "Critical path proposal",
            summary: "Add milestones and dependencies for the current critical path",
            status: "open",
            baseRevisionId: REVISION_ID,
            baseSnapshot: { nodes: [], dependencies: [] },
            proposedSnapshot: { nodes: [], dependencies: [] },
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
        ];
      }
      if (/FROM timeline2_revisions/i.test(sql)) return [revisionRow];
      if (/FROM timeline2_node_assignees/i.test(sql)) return [];
      if (/FROM timeline2_dependencies/i.test(sql)) return [];
      if (/FROM timeline2_nodes/i.test(sql) && /ORDER BY sort_order/i.test(sql)) {
        return [
          {
            id: ROOT_NODE_ID,
            planId: PLAN_ID,
            parentId: null,
            kind: "group",
            title: "Existing workstream",
            description: null,
            status: "in_progress",
            priority: "medium",
            startDate: "2026-05-01",
            dueDate: "2026-05-30",
            sortOrder: 0,
            actionRequired: false,
            actionRequiredNote: null,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
          {
            id: CHILD_NODE_ID,
            planId: PLAN_ID,
            parentId: ROOT_NODE_ID,
            kind: "task",
            title: "Existing downstream task",
            description: null,
            status: "not_started",
            priority: "medium",
            startDate: "2026-06-15",
            dueDate: "2026-06-30",
            sortOrder: 0,
            actionRequired: false,
            actionRequiredNote: null,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
          {
            id: LEAF_NODE_ID,
            planId: PLAN_ID,
            parentId: ROOT_NODE_ID,
            kind: "task",
            title: "Release sign-off",
            description: null,
            status: "not_started",
            priority: "high",
            startDate: "2026-07-01",
            dueDate: "2026-07-05",
            sortOrder: 1,
            actionRequired: false,
            actionRequiredNote: null,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
        ];
      }
      if (/FROM timeline2_plans/i.test(sql)) return [planRow];
      return [];
    });

    const app = await buildApp(queryTenant);
    const reqId = "e2e-correlation-req-id-1";
    const response = await app.inject({
      method: "POST",
      url: `/timeline2/projects/${PROJECT_ID}/ai2/chat/stream`,
      headers: { "x-request-id": reqId },
      payload: { message: "Add milestones and dependencies for the critical path" },
    });
    await app.close();
    expect(response.statusCode).toBe(200);
    const events = parseTimeline2Ai2SseDataLines(response.body);
    expect(events.length).toBeGreaterThan(1);
    assertEveryEventHasReqId(events, reqId);
  });

  it("returns a planning_domain_failure when critical path lacks enough dated tasks", async () => {
    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (/INSERT INTO timeline2_plans/i.test(sql)) return [planRow];
      if (/INSERT INTO timeline2_ai2_conversations/i.test(sql)) return [{ id: CONVERSATION_ID }];
      if (/INSERT INTO timeline2_ai2_messages/i.test(sql)) return [];
      if (/UPDATE timeline2_ai2_conversations/i.test(sql)) return [];
      if (/FROM timeline2_ai2_messages/i.test(sql)) return [];
      if (/INSERT INTO timeline2_branches/i.test(sql)) return [{ id: BRANCH_ID }];
      if (/INSERT INTO timeline2_branch_operations/i.test(sql)) return [];
      if (/FROM timeline2_branch_operations/i.test(sql)) return [];
      if (/FROM timeline2_branches/i.test(sql)) return [];
      if (/FROM timeline2_revisions/i.test(sql)) return [revisionRow];
      if (/FROM timeline2_node_assignees/i.test(sql)) return [];
      if (/FROM timeline2_dependencies/i.test(sql)) return [];
      if (/FROM timeline2_nodes/i.test(sql) && /ORDER BY sort_order/i.test(sql)) {
        return [
          {
            id: ROOT_NODE_ID,
            planId: PLAN_ID,
            parentId: null,
            kind: "group",
            title: "Undated workstream",
            description: null,
            status: "in_progress",
            priority: "medium",
            startDate: null,
            dueDate: null,
            sortOrder: 0,
            actionRequired: false,
            actionRequiredNote: null,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
          {
            id: CHILD_NODE_ID,
            planId: PLAN_ID,
            parentId: ROOT_NODE_ID,
            kind: "task",
            title: "Task without dates A",
            description: null,
            status: "not_started",
            priority: "medium",
            startDate: null,
            dueDate: null,
            sortOrder: 0,
            actionRequired: false,
            actionRequiredNote: null,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
          {
            id: LEAF_NODE_ID,
            planId: PLAN_ID,
            parentId: ROOT_NODE_ID,
            kind: "task",
            title: "Task without dates B",
            description: null,
            status: "not_started",
            priority: "medium",
            startDate: null,
            dueDate: null,
            sortOrder: 1,
            actionRequired: false,
            actionRequiredNote: null,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
        ];
      }
      if (/FROM timeline2_plans/i.test(sql)) return [planRow];
      return [];
    });

    const app = await buildApp(queryTenant);
    const response = await app.inject({
      method: "POST",
      url: `/timeline2/projects/${PROJECT_ID}/ai2/chat/stream`,
      payload: { message: "Add milestones and dependencies for the critical path" },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    const events = parseTimeline2Ai2SseDataLines(response.body);
    const err = events.find((e) => e.type === "error") as
      | { type: string; errorCategory?: string; message?: string }
      | undefined;
    expect(err?.errorCategory).toBe("planning_domain_failure");
    expect(err?.message).toBe(TIMELINE2_AI2_ERROR_USER_MESSAGES.planning_domain_failure);
    expect(events.some((e) => e.type === "branch_created")).toBe(false);
  });

  it("responds with a clarifying question when the structured planner asks for missing details", async () => {
    vi.mocked(getApiEnv).mockReturnValue(TIMELINE2_TEST_OPENAI_ENV as never);
    vi.mocked(createModel).mockReturnValue({} as never);
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: {
        kind: "ask_clarifying_question",
        trace: "Need one detail before editing the timeline.",
        question: "Which workstream should this apply to?",
        context: "The plan has several top-level groups.",
      },
    } as never);

    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (/INSERT INTO timeline2_plans/i.test(sql)) return [planRow];
      if (/INSERT INTO timeline2_ai2_conversations/i.test(sql)) return [{ id: CONVERSATION_ID }];
      if (/INSERT INTO timeline2_ai2_messages/i.test(sql)) return [];
      if (/UPDATE timeline2_ai2_conversations/i.test(sql)) return [];
      if (/FROM timeline2_ai2_messages/i.test(sql)) return [];
      if (/FROM timeline2_revisions/i.test(sql)) return [revisionRow];
      if (/FROM timeline2_node_assignees/i.test(sql)) return [];
      if (/FROM timeline2_dependencies/i.test(sql)) return [];
      if (/FROM timeline2_nodes/i.test(sql) && /ORDER BY sort_order/i.test(sql)) {
        return [
          {
            id: ROOT_NODE_ID,
            planId: PLAN_ID,
            parentId: null,
            kind: "group",
            title: "Root",
            description: null,
            status: "in_progress",
            priority: "medium",
            startDate: "2026-05-01",
            dueDate: "2026-05-30",
            sortOrder: 0,
            actionRequired: false,
            actionRequiredNote: null,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
        ];
      }
      if (/FROM timeline2_plans/i.test(sql)) return [planRow];
      return [];
    });

    const app = await buildApp(queryTenant);
    const response = await app.inject({
      method: "POST",
      url: `/timeline2/projects/${PROJECT_ID}/ai2/chat/stream`,
      payload: { message: "Make that 3 weeks instead" },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    const events = parseTimeline2Ai2SseDataLines(response.body);
    expect(events.some((e) => e.type === "question")).toBe(true);
    expect(events.some((e) => e.type === "error")).toBe(false);
    expect(events.every((e) => typeof e.reqId === "string" && (e.reqId as string).length > 0)).toBe(true);
  });

  it("returns description-aware search and subtree payloads with derived schedule facts", async () => {
    vi.mocked(getApiEnv).mockReturnValue(TIMELINE2_TEST_OPENAI_ENV as never);
    vi.mocked(createModel).mockReturnValue({} as never);

    const today = new Date();
    const anchor = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const addDays = (days: number) => {
      const next = new Date(anchor);
      next.setUTCDate(next.getUTCDate() + days);
      return next.toISOString().slice(0, 10);
    };

    vi.mocked(generateObject)
      .mockResolvedValueOnce({
        object: {
          kind: "tool_call",
          trace: "Find the task by description.",
          toolName: "search_nodes",
          arguments: { query: "permit notes" },
        },
      } as never)
      .mockResolvedValueOnce({
        object: {
          kind: "tool_call",
          trace: "Read the subtree details.",
          toolName: "get_node_subtree",
          arguments: { nodeId: CHILD_NODE_ID, depth: 2 },
        },
      } as never)
      .mockResolvedValueOnce({
        object: {
          kind: "fail_with_reason",
          trace: "Stop after inspection.",
          message: "Inspection finished.",
          reason: "test_cutoff",
        },
      } as never);

    const description =
      "Use permit notes to coordinate the vendor handoff and confirm the building inspection checklist before execution.";

    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (/INSERT INTO timeline2_plans/i.test(sql)) return [planRow];
      if (/INSERT INTO timeline2_ai2_conversations/i.test(sql)) return [{ id: CONVERSATION_ID }];
      if (/INSERT INTO timeline2_ai2_messages/i.test(sql)) return [];
      if (/UPDATE timeline2_ai2_conversations/i.test(sql)) return [];
      if (/FROM timeline2_ai2_messages/i.test(sql)) return [];
      if (/FROM timeline2_revisions/i.test(sql)) return [revisionRow];
      if (/FROM timeline2_node_assignees/i.test(sql)) {
        return [{ nodeId: CHILD_NODE_ID, userId: USER_ID, name: "Philip", email: "philip@example.com" }];
      }
      if (/FROM timeline2_dependencies/i.test(sql)) {
        return [
          {
            id: DEPENDENCY_ID,
            fromNodeId: CHILD_NODE_ID,
            toNodeId: LEAF_NODE_ID,
            relation: "finish_to_start",
            createdAt: CREATED_AT,
          },
        ];
      }
      if (/FROM timeline2_nodes/i.test(sql) && /ORDER BY sort_order/i.test(sql)) {
        return [
          {
            id: ROOT_NODE_ID,
            planId: PLAN_ID,
            parentId: null,
            kind: "group",
            title: "Launch Stream",
            description: "Top-level coordination",
            status: "in_progress",
            priority: "medium",
            startDate: addDays(1),
            dueDate: addDays(12),
            sortOrder: 0,
            actionRequired: false,
            actionRequiredNote: null,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
          {
            id: CHILD_NODE_ID,
            planId: PLAN_ID,
            parentId: ROOT_NODE_ID,
            kind: "task",
            title: "Permit Review",
            description,
            status: "not_started",
            priority: "high",
            startDate: addDays(3),
            dueDate: addDays(10),
            sortOrder: 0,
            actionRequired: true,
            actionRequiredNote: "Read the permit notes before execution.",
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
          {
            id: LEAF_NODE_ID,
            planId: PLAN_ID,
            parentId: CHILD_NODE_ID,
            kind: "task",
            title: "Inspection Sign-off",
            description: "Confirm inspector availability.",
            status: "waiting",
            priority: "medium",
            startDate: addDays(11),
            dueDate: addDays(11),
            sortOrder: 0,
            actionRequired: false,
            actionRequiredNote: null,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
        ];
      }
      if (/FROM timeline2_plans/i.test(sql)) return [planRow];
      if (/SELECT target_date::text AS "targetDate"/i.test(sql)) return [{ targetDate: null }];
      return [];
    });

    const app = await buildApp(queryTenant);
    const response = await app.inject({
      method: "POST",
      url: `/timeline2/projects/${PROJECT_ID}/ai2/chat/stream`,
      payload: { message: "Find the work that mentions permit notes and read the descriptions." },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    const events = parseTimeline2Ai2SseDataLines(response.body);
    const searchEvent = events.find((event) => event.type === "tool_done" && event.toolName === "search_nodes") as
      | { summary?: string }
      | undefined;
    const subtreeEvent = events.find((event) => event.type === "tool_done" && event.toolName === "get_node_subtree") as
      | { summary?: string }
      | undefined;

    const searchPayload = JSON.parse(searchEvent?.summary ?? "{}") as {
      matches?: Array<Record<string, unknown>>;
    };
    const subtreePayload = JSON.parse(subtreeEvent?.summary ?? "{}") as {
      root?: Record<string, unknown>;
      descendants?: Array<Record<string, unknown>>;
    };

    expect(searchPayload.matches?.[0]).toMatchObject({
      id: CHILD_NODE_ID,
      title: "Permit Review",
      hasDescription: true,
      descriptionKind: "plain_note",
      embeddedRequestText: null,
      descriptionExcerpt: expect.stringContaining("permit notes"),
      scheduleState: "scheduled",
      durationDays: 8,
      startsInDays: 3,
      childCount: 1,
      dependencyOutCount: 1,
    });

    expect(subtreePayload.root).toMatchObject({
      id: CHILD_NODE_ID,
      description,
      descriptionKind: "plain_note",
      embeddedRequestText: null,
      descriptionExcerpt: expect.stringContaining("permit notes"),
      actionRequired: { required: true, note: "Read the permit notes before execution." },
      dependencySummary: {
        incomingCount: 0,
        outgoingCount: 1,
        predecessorNodeIds: [],
        successorNodeIds: [LEAF_NODE_ID],
      },
    });
    expect(
      subtreePayload.descendants?.some(
        (node) =>
          node.id === LEAF_NODE_ID &&
          node.description === "Confirm inspector availability." &&
          node.scheduleState === "milestone_like",
      ),
    ).toBe(true);
  });

  it("marks machine-generated descriptions as replay hints in search and subtree payloads", async () => {
    vi.mocked(getApiEnv).mockReturnValue(TIMELINE2_TEST_OPENAI_ENV as never);
    vi.mocked(createModel).mockReturnValue({} as never);
    vi.mocked(generateObject)
      .mockResolvedValueOnce({
        object: {
          kind: "tool_call",
          trace: "Locate the replay-hint task.",
          toolName: "search_nodes",
          arguments: { query: "Product X That Has Tasks Development And Sales Both 2 Weeks After Each Other Star" },
        },
      } as never)
      .mockResolvedValueOnce({
        object: {
          kind: "tool_call",
          trace: "Inspect the replay-hint subtree.",
          toolName: "get_node_subtree",
          arguments: { nodeId: ROOT_NODE_ID, depth: 2 },
        },
      } as never)
      .mockResolvedValueOnce({
        object: {
          kind: "fail_with_reason",
          trace: "Stop after provenance inspection.",
          message: "Inspection finished.",
          reason: "test_cutoff",
        },
      } as never);

    const replayText =
      "Add a group called product x that has tasks development and sales both 2 weeks after each other starting in 1 week";

    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (/INSERT INTO timeline2_plans/i.test(sql)) return [planRow];
      if (/INSERT INTO timeline2_ai2_conversations/i.test(sql)) return [{ id: CONVERSATION_ID }];
      if (/INSERT INTO timeline2_ai2_messages/i.test(sql)) return [];
      if (/UPDATE timeline2_ai2_conversations/i.test(sql)) return [];
      if (/FROM timeline2_ai2_messages/i.test(sql)) return [];
      if (/FROM timeline2_revisions/i.test(sql)) return [revisionRow];
      if (/FROM timeline2_node_assignees/i.test(sql)) return [];
      if (/FROM timeline2_dependencies/i.test(sql)) return [];
      if (/FROM timeline2_nodes/i.test(sql) && /ORDER BY sort_order/i.test(sql)) {
        return [
          {
            id: ROOT_NODE_ID,
            planId: PLAN_ID,
            parentId: null,
            kind: "task",
            title: "Product X That Has Tasks Development And Sales Both 2 Weeks After Each Other Star",
            description: `Created from AI request: ${replayText}`,
            status: "cancelled",
            priority: "medium",
            startDate: null,
            dueDate: null,
            sortOrder: 0,
            actionRequired: false,
            actionRequiredNote: null,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
          {
            id: CHILD_NODE_ID,
            planId: PLAN_ID,
            parentId: ROOT_NODE_ID,
            kind: "task",
            title: "Add A Group Called Product X That Has Tasks Development And Sales Both",
            description: `Created from AI request: ${replayText}`,
            status: "cancelled",
            priority: "medium",
            startDate: null,
            dueDate: null,
            sortOrder: 0,
            actionRequired: false,
            actionRequiredNote: null,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
        ];
      }
      if (/FROM timeline2_plans/i.test(sql)) return [planRow];
      if (/SELECT target_date::text AS "targetDate"/i.test(sql)) return [{ targetDate: null }];
      return [];
    });

    const app = await buildApp(queryTenant);
    const response = await app.inject({
      method: "POST",
      url: `/timeline2/projects/${PROJECT_ID}/ai2/chat/stream`,
      payload: { message: "Read the Product X descriptions and inspect their provenance." },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    const events = parseTimeline2Ai2SseDataLines(response.body);
    const searchEvent = events.find((event) => event.type === "tool_done" && event.toolName === "search_nodes") as
      | { summary?: string }
      | undefined;
    const subtreeEvent = events.find((event) => event.type === "tool_done" && event.toolName === "get_node_subtree") as
      | { summary?: string }
      | undefined;
    const searchPayload = JSON.parse(searchEvent?.summary ?? "{}") as {
      matches?: Array<Record<string, unknown>>;
    };
    const subtreePayload = JSON.parse(subtreeEvent?.summary ?? "{}") as {
      root?: Record<string, unknown>;
    };

    expect(searchPayload.matches?.[0]).toMatchObject({
      descriptionKind: "ai_request_replay_hint",
      embeddedRequestText: replayText,
    });
    expect(subtreePayload.root).toMatchObject({
      descriptionKind: "ai_request_replay_hint",
      embeddedRequestText: replayText,
    });
  });

  it("asks a clarifying question when a replay-hint description is used for implementation plus deletion", async () => {
    vi.mocked(getApiEnv).mockReturnValue(TIMELINE2_TEST_OPENAI_ENV as never);
    vi.mocked(createModel).mockReturnValue({} as never);
    vi.mocked(generateObject)
      .mockResolvedValueOnce({
        object: {
          kind: "tool_call",
          trace: "Locate the deprecated workstream.",
          toolName: "search_nodes",
          arguments: { query: "Product X That Has Tasks Development And Sales Both 2 Weeks After Each Other Star" },
        },
      } as never)
      .mockResolvedValueOnce({
        object: {
          kind: "tool_call",
          trace: "Read the root task and sub-task descriptions before deleting.",
          toolName: "get_node_subtree",
          arguments: { nodeId: ROOT_NODE_ID, depth: 3 },
        },
      } as never)
      .mockResolvedValueOnce({
        object: {
          kind: "tool_call",
          trace: "Read the root task and sub-task descriptions before deciding what to do.",
          toolName: "get_node_subtree",
          arguments: { nodeId: ROOT_NODE_ID, depth: 3 },
        },
      } as never);
    const replayText =
      "Add a group called product x that has tasks development and sales both 2 weeks after each other starting in 1 week";

    const queryTenant = vi.fn(async (_tenantId: string, sql: string, values?: unknown[]) => {
      if (/INSERT INTO timeline2_plans/i.test(sql)) return [planRow];
      if (/INSERT INTO timeline2_ai2_conversations/i.test(sql)) return [{ id: CONVERSATION_ID }];
      if (/INSERT INTO timeline2_ai2_messages/i.test(sql)) return [];
      if (/UPDATE timeline2_ai2_conversations/i.test(sql)) return [];
      if (/FROM timeline2_ai2_messages/i.test(sql)) return [];
      if (/INSERT INTO timeline2_branch_operations/i.test(sql)) return [];
      if (/FROM timeline2_branch_operations/i.test(sql)) return [];
      if (/FROM timeline2_branches/i.test(sql)) return [];
      if (/FROM timeline2_revisions/i.test(sql)) return [revisionRow];
      if (/FROM timeline2_node_assignees/i.test(sql)) return [];
      if (/FROM timeline2_dependencies/i.test(sql)) {
        return [
          {
            id: DEPENDENCY_ID,
            fromNodeId: CHILD_NODE_ID,
            toNodeId: LEAF_NODE_ID,
            relation: "finish_to_start",
            createdAt: CREATED_AT,
          },
        ];
      }
      if (/FROM timeline2_nodes/i.test(sql) && /ORDER BY sort_order/i.test(sql)) {
        return [
          {
            id: ROOT_NODE_ID,
            planId: PLAN_ID,
            parentId: null,
            kind: "task",
            title: "Product X That Has Tasks Development And Sales Both 2 Weeks After Each Other Star",
            description: `Created from AI request: ${replayText}`,
            status: "cancelled",
            priority: "medium",
            startDate: null,
            dueDate: null,
            sortOrder: 0,
            actionRequired: false,
            actionRequiredNote: null,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
          {
            id: CHILD_NODE_ID,
            planId: PLAN_ID,
            parentId: ROOT_NODE_ID,
            kind: "task",
            title: "Add A Group Called Product X That Has Tasks Development And Sales Both",
            description: `Created from AI request: ${replayText}`,
            status: "cancelled",
            priority: "medium",
            startDate: null,
            dueDate: null,
            sortOrder: 0,
            actionRequired: false,
            actionRequiredNote: null,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
          {
            id: LEAF_NODE_ID,
            planId: PLAN_ID,
            parentId: CHILD_NODE_ID,
            kind: "task",
            title: "Nested Legacy Step",
            description: "Safe to delete.",
            status: "cancelled",
            priority: "medium",
            startDate: null,
            dueDate: null,
            sortOrder: 0,
            actionRequired: false,
            actionRequiredNote: null,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
          {
            id: "12121212-3434-4567-8999-aaaaaaaaaaaa",
            planId: PLAN_ID,
            parentId: null,
            kind: "task",
            title: "Keep Me",
            description: "Unrelated active work.",
            status: "in_progress",
            priority: "high",
            startDate: null,
            dueDate: null,
            sortOrder: 1,
            actionRequired: false,
            actionRequiredNote: null,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
        ];
      }
      if (/FROM timeline2_plans/i.test(sql)) return [planRow];
      if (/SELECT target_date::text AS "targetDate"/i.test(sql)) return [{ targetDate: null }];
      return [];
    });

    const app = await buildApp(queryTenant);
    const response = await app.inject({
      method: "POST",
      url: `/timeline2/projects/${PROJECT_ID}/ai2/chat/stream`,
      payload: {
        message:
          'Go over the task "Product X That Has Tasks Development And Sales Both 2 Weeks After Each Other Star" and the sub-task. read the descriptions and use that as the instruction to implement. Delete these task',
      },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    const events = parseTimeline2Ai2SseDataLines(response.body);
    const questionEvent = events.find((event) => event.type === "question") as
      | { question?: string; questionContext?: string }
      | undefined;
    expect(questionEvent?.question).toContain("Do you want me to recreate that plan elsewhere");
    expect(questionEvent?.questionContext).toContain(replayText);
    expect(events.some((event) => event.type === "branch_created")).toBe(false);
    expect(queryTenant.mock.calls.some((call) => /INSERT INTO timeline2_branches/i.test(String(call[1])))).toBe(false);
  });

  it("stages node deletion after subtree inspection for delete-only requests and removes the subtree from the proposed snapshot", async () => {
    vi.mocked(getApiEnv).mockReturnValue(TIMELINE2_TEST_OPENAI_ENV as never);
    vi.mocked(createModel).mockReturnValue({} as never);
    vi.mocked(generateObject)
      .mockResolvedValueOnce({
        object: {
          kind: "tool_call",
          trace: "Locate the deprecated workstream.",
          toolName: "search_nodes",
          arguments: { query: "Product X That Has Tasks Development And Sales Both 2 Weeks After Each Other Star" },
        },
      } as never)
      .mockResolvedValueOnce({
        object: {
          kind: "tool_call",
          trace: "Inspect the subtree before deletion.",
          toolName: "get_node_subtree",
          arguments: { nodeId: ROOT_NODE_ID, depth: 3 },
        },
      } as never)
      .mockResolvedValueOnce({
        object: {
          kind: "tool_call",
          trace: "Stage deletion now that the subtree is confirmed.",
          toolName: "stage_delete_node",
          arguments: {
            nodeId: ROOT_NODE_ID,
            includeDescendants: true,
            rationale: "The user explicitly asked to delete this deprecated subtree.",
          },
        },
      } as never)
      .mockResolvedValueOnce({
        object: {
          kind: "finalize_branch",
          trace: "Finalize the reviewed deletion branch.",
          title: "Delete deprecated Product X subtree",
          summary: "Remove the deprecated Product X workstream after inspection",
          finalSummary: "Reviewed the subtree and staged its deletion for approval.",
        },
      } as never);

    let capturedProposedSnapshot: Record<string, unknown> | null = null;

    const queryTenant = vi.fn(async (_tenantId: string, sql: string, values?: unknown[]) => {
      if (/INSERT INTO timeline2_plans/i.test(sql)) return [planRow];
      if (/INSERT INTO timeline2_ai2_conversations/i.test(sql)) return [{ id: CONVERSATION_ID }];
      if (/INSERT INTO timeline2_ai2_messages/i.test(sql)) return [];
      if (/UPDATE timeline2_ai2_conversations/i.test(sql)) return [];
      if (/FROM timeline2_ai2_messages/i.test(sql)) return [];
      if (/INSERT INTO timeline2_ai_conversations/i.test(sql)) return [{ id: CONVERSATION_ID }];
      if (/INSERT INTO timeline2_ai_messages/i.test(sql)) return [];
      if (/INSERT INTO timeline2_branches/i.test(sql)) {
        capturedProposedSnapshot = JSON.parse(String((values as unknown[])[7])) as Record<string, unknown>;
        return [{ id: BRANCH_ID }];
      }
      if (/INSERT INTO timeline2_branch_operations/i.test(sql)) return [];
      if (/FROM timeline2_branch_operations/i.test(sql)) return [];
      if (/FROM timeline2_branches/i.test(sql)) {
        return [
          {
            id: BRANCH_ID,
            projectId: PROJECT_ID,
            planId: PLAN_ID,
            title: "Delete deprecated Product X subtree",
            summary: "Remove the deprecated Product X workstream after inspection",
            status: "open",
            baseRevisionId: REVISION_ID,
            baseSnapshot: { nodes: [], dependencies: [] },
            proposedSnapshot: { nodes: [], dependencies: [] },
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
        ];
      }
      if (/FROM timeline2_revisions/i.test(sql)) return [revisionRow];
      if (/FROM timeline2_node_assignees/i.test(sql)) return [];
      if (/FROM timeline2_dependencies/i.test(sql)) {
        return [
          {
            id: DEPENDENCY_ID,
            fromNodeId: CHILD_NODE_ID,
            toNodeId: LEAF_NODE_ID,
            relation: "finish_to_start",
            createdAt: CREATED_AT,
          },
        ];
      }
      if (/FROM timeline2_nodes/i.test(sql) && /ORDER BY sort_order/i.test(sql)) {
        return [
          {
            id: ROOT_NODE_ID,
            planId: PLAN_ID,
            parentId: null,
            kind: "task",
            title: "Product X That Has Tasks Development And Sales Both 2 Weeks After Each Other Star",
            description: "Deprecated workstream. Delete after reviewing the notes below.",
            status: "cancelled",
            priority: "medium",
            startDate: null,
            dueDate: null,
            sortOrder: 0,
            actionRequired: false,
            actionRequiredNote: null,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
          {
            id: CHILD_NODE_ID,
            planId: PLAN_ID,
            parentId: ROOT_NODE_ID,
            kind: "task",
            title: "Add A Group Called Product X That Has Tasks Development And Sales Both",
            description: "Sub-task instructions exist here and confirm that this tree can be removed.",
            status: "cancelled",
            priority: "medium",
            startDate: null,
            dueDate: null,
            sortOrder: 0,
            actionRequired: false,
            actionRequiredNote: null,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
          {
            id: LEAF_NODE_ID,
            planId: PLAN_ID,
            parentId: CHILD_NODE_ID,
            kind: "task",
            title: "Nested Legacy Step",
            description: "Safe to delete.",
            status: "cancelled",
            priority: "medium",
            startDate: null,
            dueDate: null,
            sortOrder: 0,
            actionRequired: false,
            actionRequiredNote: null,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
          {
            id: "12121212-3434-4567-8999-aaaaaaaaaaaa",
            planId: PLAN_ID,
            parentId: null,
            kind: "task",
            title: "Keep Me",
            description: "Unrelated active work.",
            status: "in_progress",
            priority: "high",
            startDate: null,
            dueDate: null,
            sortOrder: 1,
            actionRequired: false,
            actionRequiredNote: null,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
        ];
      }
      if (/FROM timeline2_plans/i.test(sql)) return [planRow];
      if (/SELECT target_date::text AS "targetDate"/i.test(sql)) return [{ targetDate: null }];
      return [];
    });

    const app = await buildApp(queryTenant);
    const response = await app.inject({
      method: "POST",
      url: `/timeline2/projects/${PROJECT_ID}/ai2/chat/stream`,
      payload: {
        message:
          'Go over the task "Product X That Has Tasks Development And Sales Both 2 Weeks After Each Other Star" and the sub-task. read the descriptions, then delete these task',
      },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    const operationCalls = queryTenant.mock.calls.filter((call) =>
      /INSERT INTO timeline2_branch_operations/i.test(String(call[1])),
    );
    expect(
      operationCalls.some((call) => String((call[2] as unknown[])[2]) === "delete_node"),
    ).toBe(true);

    const events = parseTimeline2Ai2SseDataLines(response.body);
    const subtreeEvent = events.find((event) => event.type === "tool_done" && event.toolName === "get_node_subtree") as
      | { summary?: string }
      | undefined;
    const subtreePayload = JSON.parse(subtreeEvent?.summary ?? "{}") as {
      root?: Record<string, unknown>;
      descendants?: Array<Record<string, unknown>>;
    };
    expect(subtreePayload.root?.description).toBe(
      "Deprecated workstream. Delete after reviewing the notes below.",
    );
    expect(
      subtreePayload.descendants?.some(
        (node) =>
          node.id === CHILD_NODE_ID &&
          node.description === "Sub-task instructions exist here and confirm that this tree can be removed.",
      ),
    ).toBe(true);

    const proposedNodes = (capturedProposedSnapshot?.nodes as Array<{ id: string; title: string }> | undefined) ?? [];
    const proposedDependencies =
      (capturedProposedSnapshot?.dependencies as Array<{ id: string }> | undefined) ?? [];
    expect(proposedNodes.map((node) => node.title)).toEqual(["Keep Me"]);
    expect(proposedDependencies).toEqual([]);
  });

  it("allows replay-hint implementation plus cleanup in one branch when the target is explicit", async () => {
    vi.mocked(getApiEnv).mockReturnValue(TIMELINE2_TEST_OPENAI_ENV as never);
    vi.mocked(createModel).mockReturnValue({} as never);
    const TARGET_GROUP_ID = "abababab-1111-4222-8333-cccccccccccc";
    vi.mocked(generateObject)
      .mockResolvedValueOnce({
        object: {
          kind: "tool_call",
          trace: "Locate the source task subtree.",
          toolName: "search_nodes",
          arguments: { query: "Product X That Has Tasks Development And Sales Both 2 Weeks After Each Other Star" },
        },
      } as never)
      .mockResolvedValueOnce({
        object: {
          kind: "tool_call",
          trace: "Inspect the source subtree and replay hint.",
          toolName: "get_node_subtree",
          arguments: { nodeId: ROOT_NODE_ID, depth: 3 },
        },
      } as never)
      .mockResolvedValueOnce({
        object: {
          kind: "tool_call",
          trace: "Create the recreated workstream under the explicit target group.",
          toolName: "stage_create_node",
          arguments: {
            ref: "replayed_product_x",
            parentId: TARGET_GROUP_ID,
            kind: "group",
            title: "Product X Recreated",
            description: "Recreated from the replay hint under the explicit target group.",
            rationale: "The user gave an explicit destination for recreating the replay-hint work.",
          },
        },
      } as never)
      .mockResolvedValueOnce({
        object: {
          kind: "tool_call",
          trace: "Add the replayed Development task.",
          toolName: "stage_create_node",
          arguments: {
            ref: "replayed_development",
            parentId: "replayed_product_x",
            kind: "task",
            title: "Development",
            rationale: "Replay the first task from the embedded request.",
          },
        },
      } as never)
      .mockResolvedValueOnce({
        object: {
          kind: "tool_call",
          trace: "Add the replayed Sales task.",
          toolName: "stage_create_node",
          arguments: {
            ref: "replayed_sales",
            parentId: "replayed_product_x",
            kind: "task",
            title: "Sales",
            rationale: "Replay the second task from the embedded request.",
          },
        },
      } as never)
      .mockResolvedValueOnce({
        object: {
          kind: "tool_call",
          trace: "Link the replayed tasks.",
          toolName: "stage_set_dependency",
          arguments: {
            fromNodeId: "replayed_development",
            toNodeId: "replayed_sales",
            relation: "finish_to_start",
            rationale: "Preserve the handoff sequence from the embedded request.",
          },
        },
      } as never)
      .mockResolvedValueOnce({
        object: {
          kind: "tool_call",
          trace: "Delete the old source subtree after recreating it.",
          toolName: "stage_delete_node",
          arguments: {
            nodeId: ROOT_NODE_ID,
            includeDescendants: true,
            rationale: "The source subtree can be deleted once the recreated version is staged in the explicit target group.",
          },
        },
      } as never)
      .mockResolvedValueOnce({
        object: {
          kind: "finalize_branch",
          trace: "Finalize replay plus cleanup.",
          title: "Replay Product X under explicit target and delete source",
          summary: "Recreate Product X under Roadmap Backlog and remove the legacy source nodes",
          finalSummary: "Staged the recreated Product X workstream under the explicit target and queued deletion of the legacy source nodes.",
        },
      } as never);

    const replayText =
      "Add a group called product x that has tasks development and sales both 2 weeks after each other starting in 1 week";

    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (/INSERT INTO timeline2_plans/i.test(sql)) return [planRow];
      if (/INSERT INTO timeline2_ai2_conversations/i.test(sql)) return [{ id: CONVERSATION_ID }];
      if (/INSERT INTO timeline2_ai2_messages/i.test(sql)) return [];
      if (/UPDATE timeline2_ai2_conversations/i.test(sql)) return [];
      if (/FROM timeline2_ai2_messages/i.test(sql)) return [];
      if (/INSERT INTO timeline2_ai_conversations/i.test(sql)) return [{ id: CONVERSATION_ID }];
      if (/INSERT INTO timeline2_ai_messages/i.test(sql)) return [];
      if (/INSERT INTO timeline2_branches/i.test(sql)) return [{ id: BRANCH_ID }];
      if (/INSERT INTO timeline2_branch_operations/i.test(sql)) return [];
      if (/FROM timeline2_branch_operations/i.test(sql)) return [];
      if (/FROM timeline2_branches/i.test(sql)) {
        return [
          {
            id: BRANCH_ID,
            projectId: PROJECT_ID,
            planId: PLAN_ID,
            title: "Replay Product X under explicit target and delete source",
            summary: "Recreate Product X under Roadmap Backlog and remove the legacy source nodes",
            status: "open",
            baseRevisionId: REVISION_ID,
            baseSnapshot: { nodes: [], dependencies: [] },
            proposedSnapshot: { nodes: [], dependencies: [] },
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
        ];
      }
      if (/FROM timeline2_revisions/i.test(sql)) return [revisionRow];
      if (/FROM timeline2_node_assignees/i.test(sql)) return [];
      if (/FROM timeline2_dependencies/i.test(sql)) return [];
      if (/FROM timeline2_nodes/i.test(sql) && /ORDER BY sort_order/i.test(sql)) {
        return [
          {
            id: TARGET_GROUP_ID,
            planId: PLAN_ID,
            parentId: null,
            kind: "group",
            title: "Roadmap Backlog",
            description: "Explicit target group for recreated work.",
            status: "in_progress",
            priority: "medium",
            startDate: null,
            dueDate: null,
            sortOrder: 0,
            actionRequired: false,
            actionRequiredNote: null,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
          {
            id: ROOT_NODE_ID,
            planId: PLAN_ID,
            parentId: null,
            kind: "task",
            title: "Product X That Has Tasks Development And Sales Both 2 Weeks After Each Other Star",
            description: `Created from AI request: ${replayText}`,
            status: "cancelled",
            priority: "medium",
            startDate: null,
            dueDate: null,
            sortOrder: 1,
            actionRequired: false,
            actionRequiredNote: null,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
          {
            id: CHILD_NODE_ID,
            planId: PLAN_ID,
            parentId: ROOT_NODE_ID,
            kind: "task",
            title: "Add A Group Called Product X That Has Tasks Development And Sales Both",
            description: `Created from AI request: ${replayText}`,
            status: "cancelled",
            priority: "medium",
            startDate: null,
            dueDate: null,
            sortOrder: 0,
            actionRequired: false,
            actionRequiredNote: null,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
        ];
      }
      if (/FROM timeline2_plans/i.test(sql)) return [planRow];
      if (/SELECT target_date::text AS "targetDate"/i.test(sql)) return [{ targetDate: null }];
      return [];
    });

    const app = await buildApp(queryTenant);
    const response = await app.inject({
      method: "POST",
      url: `/timeline2/projects/${PROJECT_ID}/ai2/chat/stream`,
      payload: {
        message:
          'Go over the task "Product X That Has Tasks Development And Sales Both 2 Weeks After Each Other Star" and the sub-task. Read the descriptions, recreate that plan under the "Roadmap Backlog" group, then delete these tasks.',
      },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    const operationCalls = queryTenant.mock.calls.filter((call) =>
      /INSERT INTO timeline2_branch_operations/i.test(String(call[1])),
    );
    const operationTypes = operationCalls.map((call) => String((call[2] as unknown[])[2]));
    expect(operationTypes).toEqual(
      expect.arrayContaining(["create_node", "set_dependency", "delete_node"]),
    );
    const events = parseTimeline2Ai2SseDataLines(response.body);
    expect(events.some((event) => event.type === "question")).toBe(false);
    expect(events.some((event) => event.type === "branch_created")).toBe(true);
  });

  it("blocks finalize when only cleanup was staged for a mixed replay-hint request", async () => {
    vi.mocked(getApiEnv).mockReturnValue(TIMELINE2_TEST_OPENAI_ENV as never);
    vi.mocked(createModel).mockReturnValue({} as never);
    const replayText =
      "Add a group called product x that has tasks development and sales both 2 weeks after each other starting in 1 week";
    vi.mocked(generateObject)
      .mockResolvedValueOnce({
        object: {
          kind: "tool_call",
          trace: "Find the source subtree by title.",
          toolName: "search_nodes",
          arguments: { query: "Product X That Has Tasks Development And Sales Both 2 Weeks After Each Other Star" },
        },
      } as never)
      .mockResolvedValueOnce({
        object: {
          kind: "tool_call",
          trace: "Stage delete immediately.",
          toolName: "stage_delete_node",
          arguments: {
            nodeId: ROOT_NODE_ID,
            includeDescendants: true,
            rationale: "Delete the legacy subtree.",
          },
        },
      } as never)
      .mockResolvedValueOnce({
        object: {
          kind: "finalize_branch",
          trace: "Finalize the deletion branch.",
          title: "Delete Product X subtree",
          summary: "Delete the source nodes",
          finalSummary: "Deleted the source nodes after reading the request.",
        },
      } as never);

    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (/INSERT INTO timeline2_plans/i.test(sql)) return [planRow];
      if (/INSERT INTO timeline2_ai2_conversations/i.test(sql)) return [{ id: CONVERSATION_ID }];
      if (/INSERT INTO timeline2_ai2_messages/i.test(sql)) return [];
      if (/UPDATE timeline2_ai2_conversations/i.test(sql)) return [];
      if (/FROM timeline2_ai2_messages/i.test(sql)) return [];
      if (/INSERT INTO timeline2_branch_operations/i.test(sql)) return [];
      if (/FROM timeline2_branch_operations/i.test(sql)) return [];
      if (/FROM timeline2_branches/i.test(sql)) return [];
      if (/FROM timeline2_revisions/i.test(sql)) return [revisionRow];
      if (/FROM timeline2_node_assignees/i.test(sql)) return [];
      if (/FROM timeline2_dependencies/i.test(sql)) return [];
      if (/FROM timeline2_nodes/i.test(sql) && /ORDER BY sort_order/i.test(sql)) {
        return [
          {
            id: ROOT_NODE_ID,
            planId: PLAN_ID,
            parentId: null,
            kind: "task",
            title: "Product X That Has Tasks Development And Sales Both 2 Weeks After Each Other Star",
            description: `Created from AI request: ${replayText}`,
            status: "cancelled",
            priority: "medium",
            startDate: null,
            dueDate: null,
            sortOrder: 0,
            actionRequired: false,
            actionRequiredNote: null,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
          {
            id: CHILD_NODE_ID,
            planId: PLAN_ID,
            parentId: ROOT_NODE_ID,
            kind: "task",
            title: "Add A Group Called Product X That Has Tasks Development And Sales Both",
            description: `Created from AI request: ${replayText}`,
            status: "cancelled",
            priority: "medium",
            startDate: null,
            dueDate: null,
            sortOrder: 0,
            actionRequired: false,
            actionRequiredNote: null,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
        ];
      }
      if (/FROM timeline2_plans/i.test(sql)) return [planRow];
      if (/SELECT target_date::text AS "targetDate"/i.test(sql)) return [{ targetDate: null }];
      return [];
    });

    const app = await buildApp(queryTenant);
    const response = await app.inject({
      method: "POST",
      url: `/timeline2/projects/${PROJECT_ID}/ai2/chat/stream`,
      payload: {
        message:
          'Go over the task "Product X That Has Tasks Development And Sales Both 2 Weeks After Each Other Star". Read the descriptions, use that as the instruction to implement, and delete these tasks.',
      },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    const events = parseTimeline2Ai2SseDataLines(response.body);
    expect(events.some((event) => event.type === "question")).toBe(true);
    expect(events.some((event) => event.type === "branch_created")).toBe(false);
    expect(queryTenant.mock.calls.some((call) => /INSERT INTO timeline2_branches/i.test(String(call[1])))).toBe(false);
  });

  it("asks a clarifying question after an ambiguous delete search", async () => {
    vi.mocked(getApiEnv).mockReturnValue(TIMELINE2_TEST_OPENAI_ENV as never);
    vi.mocked(createModel).mockReturnValue({} as never);
    vi.mocked(generateObject)
      .mockResolvedValueOnce({
        object: {
          kind: "tool_call",
          trace: "Search for the matching release task title.",
          toolName: "search_nodes",
          arguments: { query: "Release Plan" },
        },
      } as never)
      .mockResolvedValueOnce({
        object: {
          kind: "ask_clarifying_question",
          trace: "Two matching tasks remain after search.",
          question: "Which \"Release Plan\" should I delete?",
          context: "I found more than one task with that title, so I need you to choose the exact one before I stage deletion.",
        },
      } as never);

    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (/INSERT INTO timeline2_plans/i.test(sql)) return [planRow];
      if (/INSERT INTO timeline2_ai2_conversations/i.test(sql)) return [{ id: CONVERSATION_ID }];
      if (/INSERT INTO timeline2_ai2_messages/i.test(sql)) return [];
      if (/UPDATE timeline2_ai2_conversations/i.test(sql)) return [];
      if (/FROM timeline2_ai2_messages/i.test(sql)) return [];
      if (/FROM timeline2_revisions/i.test(sql)) return [revisionRow];
      if (/FROM timeline2_node_assignees/i.test(sql)) return [];
      if (/FROM timeline2_dependencies/i.test(sql)) return [];
      if (/FROM timeline2_nodes/i.test(sql) && /ORDER BY sort_order/i.test(sql)) {
        return [
          {
            id: ROOT_NODE_ID,
            planId: PLAN_ID,
            parentId: null,
            kind: "task",
            title: "Release Plan",
            description: "Deprecated quarterly version.",
            status: "cancelled",
            priority: "medium",
            startDate: null,
            dueDate: null,
            sortOrder: 0,
            actionRequired: false,
            actionRequiredNote: null,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
          {
            id: CHILD_NODE_ID,
            planId: PLAN_ID,
            parentId: null,
            kind: "task",
            title: "Release Plan",
            description: "Current active version.",
            status: "in_progress",
            priority: "high",
            startDate: null,
            dueDate: null,
            sortOrder: 1,
            actionRequired: false,
            actionRequiredNote: null,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
        ];
      }
      if (/FROM timeline2_plans/i.test(sql)) return [planRow];
      if (/SELECT target_date::text AS "targetDate"/i.test(sql)) return [{ targetDate: null }];
      return [];
    });

    const app = await buildApp(queryTenant);
    const response = await app.inject({
      method: "POST",
      url: `/timeline2/projects/${PROJECT_ID}/ai2/chat/stream`,
      payload: { message: 'Delete "Release Plan".' },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    const events = parseTimeline2Ai2SseDataLines(response.body);
    expect(events.some((event) => event.type === "question")).toBe(true);
    expect(events.some((event) => event.type === "branch_created")).toBe(false);
  });

  it("uses deterministic fallback when structured output fails but the request is safely translatable", async () => {
    vi.mocked(getApiEnv).mockReturnValue(TIMELINE2_TEST_OPENAI_ENV as never);
    vi.mocked(createModel).mockReturnValue({} as never);
    vi.mocked(generateObject).mockRejectedValueOnce(structuredPlannerSchemaFailure());

    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (/INSERT INTO timeline2_plans/i.test(sql)) return [planRow];
      if (/INSERT INTO timeline2_ai2_conversations/i.test(sql)) return [{ id: CONVERSATION_ID }];
      if (/INSERT INTO timeline2_ai2_messages/i.test(sql)) return [];
      if (/UPDATE timeline2_ai2_conversations/i.test(sql)) return [];
      if (/FROM timeline2_ai2_messages/i.test(sql)) return [];
      if (/INSERT INTO timeline2_ai_conversations/i.test(sql)) return [{ id: CONVERSATION_ID }];
      if (/INSERT INTO timeline2_ai_messages/i.test(sql)) return [];
      if (/INSERT INTO timeline2_branches/i.test(sql)) return [{ id: BRANCH_ID }];
      if (/INSERT INTO timeline2_branch_operations/i.test(sql)) return [];
      if (/FROM timeline2_branch_operations/i.test(sql)) return [];
      if (/FROM timeline2_branches/i.test(sql)) {
        return [
          {
            id: BRANCH_ID,
            projectId: PROJECT_ID,
            planId: PLAN_ID,
            title: "Timeline 2 AI proposal",
            summary: "AI branch from: Add a group called product x …",
            status: "open",
            baseRevisionId: REVISION_ID,
            baseSnapshot: { nodes: [], dependencies: [] },
            proposedSnapshot: { nodes: [], dependencies: [] },
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
        ];
      }
      if (/FROM timeline2_revisions/i.test(sql)) return [revisionRow];
      if (/FROM timeline2_node_assignees/i.test(sql)) return [];
      if (/FROM timeline2_dependencies/i.test(sql)) return [];
      if (/FROM timeline2_nodes/i.test(sql)) return [];
      if (/FROM timeline2_plans/i.test(sql)) return [planRow];
      return [];
    });

    const app = await buildApp(queryTenant);
    const response = await app.inject({
      method: "POST",
      url: `/timeline2/projects/${PROJECT_ID}/ai2/chat/stream`,
      payload: {
        message:
          "Add a group called product x that has tasks development and sales both 2 weeks after each other starting in 1 week",
      },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(generateObject).toHaveBeenCalledTimes(1);
    const events = parseTimeline2Ai2SseDataLines(response.body);
    expect(events.some((e) => e.type === "branch_created")).toBe(true);
    expect(events.some((e) => e.type === "error")).toBe(false);
  });

  it("refuses deterministic fallback after structured output failure when the request is not safely translatable", async () => {
    vi.mocked(getApiEnv).mockReturnValue(TIMELINE2_TEST_OPENAI_ENV as never);
    vi.mocked(createModel).mockReturnValue({} as never);
    vi.mocked(generateObject).mockRejectedValueOnce(structuredPlannerSchemaFailure());

    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (/INSERT INTO timeline2_plans/i.test(sql)) return [planRow];
      if (/INSERT INTO timeline2_ai2_conversations/i.test(sql)) return [{ id: CONVERSATION_ID }];
      if (/INSERT INTO timeline2_ai2_messages/i.test(sql)) return [];
      if (/UPDATE timeline2_ai2_conversations/i.test(sql)) return [];
      if (/FROM timeline2_ai2_messages/i.test(sql)) return [];
      if (/FROM timeline2_revisions/i.test(sql)) return [revisionRow];
      if (/FROM timeline2_node_assignees/i.test(sql)) return [];
      if (/FROM timeline2_dependencies/i.test(sql)) return [];
      if (/FROM timeline2_nodes/i.test(sql) && /ORDER BY sort_order/i.test(sql)) return [];
      if (/FROM timeline2_plans/i.test(sql)) return [planRow];
      return [];
    });

    const app = await buildApp(queryTenant);
    const response = await app.inject({
      method: "POST",
      url: `/timeline2/projects/${PROJECT_ID}/ai2/chat/stream`,
      payload: { message: "Rewrite the corporate strategy memo in iambic pentameter." },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    const events = parseTimeline2Ai2SseDataLines(response.body);
    const err = events.find((e) => e.type === "error") as { errorCategory?: string } | undefined;
    expect(err?.errorCategory).toBe("fallback_refusal");
    expect(events.some((e) => e.type === "done")).toBe(true);
  });

  it("surfaces persistence_failure when a valid branch cannot be saved", async () => {
    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (/INSERT INTO timeline2_plans/i.test(sql)) return [planRow];
      if (/INSERT INTO timeline2_ai2_conversations/i.test(sql)) return [{ id: CONVERSATION_ID }];
      if (/INSERT INTO timeline2_ai2_messages/i.test(sql)) return [];
      if (/UPDATE timeline2_ai2_conversations/i.test(sql)) return [];
      if (/FROM timeline2_ai2_messages/i.test(sql)) return [];
      if (/INSERT INTO timeline2_ai_conversations/i.test(sql)) return [{ id: CONVERSATION_ID }];
      if (/INSERT INTO timeline2_ai_messages/i.test(sql)) return [];
      if (/INSERT INTO timeline2_branches/i.test(sql)) throw new Error("simulated database outage");
      if (/INSERT INTO timeline2_branch_operations/i.test(sql)) return [];
      if (/FROM timeline2_branch_operations/i.test(sql)) return [];
      if (/FROM timeline2_branches/i.test(sql)) {
        return [
          {
            id: BRANCH_ID,
            projectId: PROJECT_ID,
            planId: PLAN_ID,
            title: "Critical path proposal",
            summary: "Add milestones and dependencies for the current critical path",
            status: "open",
            baseRevisionId: REVISION_ID,
            baseSnapshot: { nodes: [], dependencies: [] },
            proposedSnapshot: { nodes: [], dependencies: [] },
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
        ];
      }
      if (/FROM timeline2_revisions/i.test(sql)) return [revisionRow];
      if (/FROM timeline2_node_assignees/i.test(sql)) return [];
      if (/FROM timeline2_dependencies/i.test(sql)) return [];
      if (/FROM timeline2_nodes/i.test(sql) && /ORDER BY sort_order/i.test(sql)) {
        return [
          {
            id: ROOT_NODE_ID,
            planId: PLAN_ID,
            parentId: null,
            kind: "group",
            title: "Existing workstream",
            description: null,
            status: "in_progress",
            priority: "medium",
            startDate: "2026-05-01",
            dueDate: "2026-05-30",
            sortOrder: 0,
            actionRequired: false,
            actionRequiredNote: null,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
          {
            id: CHILD_NODE_ID,
            planId: PLAN_ID,
            parentId: ROOT_NODE_ID,
            kind: "task",
            title: "Existing downstream task",
            description: null,
            status: "not_started",
            priority: "medium",
            startDate: "2026-06-15",
            dueDate: "2026-06-30",
            sortOrder: 0,
            actionRequired: false,
            actionRequiredNote: null,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
          {
            id: LEAF_NODE_ID,
            planId: PLAN_ID,
            parentId: ROOT_NODE_ID,
            kind: "task",
            title: "Release sign-off",
            description: null,
            status: "not_started",
            priority: "high",
            startDate: "2026-07-01",
            dueDate: "2026-07-05",
            sortOrder: 1,
            actionRequired: false,
            actionRequiredNote: null,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
        ];
      }
      if (/FROM timeline2_plans/i.test(sql)) return [planRow];
      return [];
    });

    const app = await buildApp(queryTenant);
    const response = await app.inject({
      method: "POST",
      url: `/timeline2/projects/${PROJECT_ID}/ai2/chat/stream`,
      payload: { message: "Add milestones and dependencies for the critical path" },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    const events = parseTimeline2Ai2SseDataLines(response.body);
    const err = events.find((e) => e.type === "error") as { errorCategory?: string; message?: string } | undefined;
    expect(err?.errorCategory).toBe("persistence_failure");
    expect(err?.message).toBe(TIMELINE2_AI2_ERROR_USER_MESSAGES.persistence_failure);
  });

  it("preserves conversation context for follow-up duration edits", async () => {
    const today = new Date();
    const anchor = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const addDays = (days: number) => {
      const next = new Date(anchor);
      next.setUTCDate(next.getUTCDate() + days);
      return next.toISOString().slice(0, 10);
    };

    vi.mocked(getApiEnv).mockReturnValue(TIMELINE2_TEST_OPENAI_ENV as never);
    vi.mocked(createModel).mockReturnValue({} as never);
    vi.mocked(generateObject)
      .mockResolvedValueOnce({
        object: {
          kind: "tool_call",
          trace: "Refresh context.",
          toolName: "get_plan_overview",
          arguments: {},
        },
      } as never)
      .mockResolvedValueOnce({
        object: {
          kind: "tool_call",
          trace: "Extend development to honor three-week spacing.",
          toolName: "stage_update_node",
          arguments: {
            nodeId: CHILD_NODE_ID,
            startDate: addDays(7),
            dueDate: addDays(27),
            rationale: "Cadence widened to three weeks per the follow-up instruction.",
          },
        },
      } as never)
      .mockResolvedValueOnce({
        object: {
          kind: "tool_call",
          trace: "Shift sales to keep the hand-off clean.",
          toolName: "stage_update_node",
          arguments: {
            nodeId: LEAF_NODE_ID,
            startDate: addDays(28),
            dueDate: addDays(48),
            rationale: "Sales follows development with the wider gap.",
          },
        },
      } as never)
      .mockResolvedValueOnce({
        object: {
          kind: "finalize_branch",
          trace: "Finalize updated spacing.",
          title: "Follow-up: widen task spacing",
          summary: "Adjust development and sales dates after follow-up",
          finalSummary: "Staged updates so tasks reflect the three-week spacing you requested.",
        },
      } as never);

    const priorPrompt =
      "Add a group called product x that has tasks development and sales both 2 weeks after each other starting in 1 week";

    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (/INSERT INTO timeline2_plans/i.test(sql)) return [planRow];
      if (/INSERT INTO timeline2_ai2_conversations/i.test(sql)) return [{ id: CONVERSATION_ID }];
      if (/INSERT INTO timeline2_ai2_messages/i.test(sql)) return [];
      if (/UPDATE timeline2_ai2_conversations/i.test(sql)) return [];
      if (/FROM timeline2_ai2_messages/i.test(sql)) {
        return [{ role: "user", content: priorPrompt }];
      }
      if (/INSERT INTO timeline2_ai_conversations/i.test(sql)) return [{ id: CONVERSATION_ID }];
      if (/INSERT INTO timeline2_ai_messages/i.test(sql)) return [];
      if (/INSERT INTO timeline2_branches/i.test(sql)) return [{ id: BRANCH_ID }];
      if (/INSERT INTO timeline2_branch_operations/i.test(sql)) return [];
      if (/FROM timeline2_branch_operations/i.test(sql)) return [];
      if (/FROM timeline2_branches/i.test(sql)) {
        return [
          {
            id: BRANCH_ID,
            projectId: PROJECT_ID,
            planId: PLAN_ID,
            title: "Timeline 2 AI proposal",
            summary: `AI branch from: ${priorPrompt}`,
            status: "open",
            baseRevisionId: REVISION_ID,
            baseSnapshot: { nodes: [], dependencies: [] },
            proposedSnapshot: { nodes: [], dependencies: [] },
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
        ];
      }
      if (/FROM timeline2_revisions/i.test(sql)) return [revisionRow];
      if (/FROM timeline2_node_assignees/i.test(sql)) return [];
      if (/FROM timeline2_dependencies/i.test(sql)) return [];
      if (/FROM timeline2_nodes/i.test(sql) && /ORDER BY sort_order/i.test(sql)) {
        return [
          {
            id: ROOT_NODE_ID,
            planId: PLAN_ID,
            parentId: null,
            kind: "group",
            title: "Product X",
            description: null,
            status: "in_progress",
            priority: "medium",
            startDate: addDays(7),
            dueDate: addDays(34),
            sortOrder: 0,
            actionRequired: false,
            actionRequiredNote: null,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
          {
            id: CHILD_NODE_ID,
            planId: PLAN_ID,
            parentId: ROOT_NODE_ID,
            kind: "task",
            title: "Development",
            description: null,
            status: "not_started",
            priority: "medium",
            startDate: addDays(7),
            dueDate: addDays(20),
            sortOrder: 0,
            actionRequired: false,
            actionRequiredNote: null,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
          {
            id: LEAF_NODE_ID,
            planId: PLAN_ID,
            parentId: ROOT_NODE_ID,
            kind: "task",
            title: "Sales",
            description: null,
            status: "not_started",
            priority: "medium",
            startDate: addDays(21),
            dueDate: addDays(34),
            sortOrder: 1,
            actionRequired: false,
            actionRequiredNote: null,
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
        ];
      }
      if (/FROM timeline2_plans/i.test(sql)) return [planRow];
      if (/SELECT target_date::text AS "targetDate"/i.test(sql)) return [{ targetDate: null }];
      return [];
    });

    const app = await buildApp(queryTenant);
    const response = await app.inject({
      method: "POST",
      url: `/timeline2/projects/${PROJECT_ID}/ai2/chat/stream`,
      payload: { message: "Make that 3 weeks instead", conversationId: CONVERSATION_ID },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    const convoCreates = queryTenant.mock.calls.filter((call) =>
      /INSERT INTO timeline2_ai2_conversations/i.test(String(call[1])),
    );
    expect(convoCreates.length).toBe(0);

    const events = parseTimeline2Ai2SseDataLines(response.body);
    expect(events.every((e) => e.conversationId === undefined || e.conversationId === CONVERSATION_ID)).toBe(true);

    const operationCalls = queryTenant.mock.calls.filter((call) =>
      /INSERT INTO timeline2_branch_operations/i.test(String(call[1])),
    );
    const developmentUpdateAfter = operationCalls
      .map((call) => {
        const values = call[2] as unknown[];
        return {
          op: String(values[2]),
          after: JSON.parse(String(values[6])) as Record<string, unknown>,
        };
      })
      .find((row) => row.op === "update_node" && row.after.startDate === addDays(7));
    expect(developmentUpdateAfter?.after.dueDate).toBe(addDays(27));

    const salesUpdateAfter = operationCalls
      .map((call) => {
        const values = call[2] as unknown[];
        return {
          op: String(values[2]),
          after: JSON.parse(String(values[6])) as Record<string, unknown>,
        };
      })
      .find((row) => row.op === "update_node" && row.after.startDate === addDays(28));
    expect(salesUpdateAfter?.after.dueDate).toBe(addDays(48));
  });

  it("streams v2 AI branch creation from a Timeline 2 JSON context only", async () => {
    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (/INSERT INTO timeline2_plans/i.test(sql)) return [planRow];
      if (/INSERT INTO timeline2_ai2_conversations/i.test(sql)) return [{ id: CONVERSATION_ID }];
      if (/INSERT INTO timeline2_ai2_messages/i.test(sql)) return [];
      if (/UPDATE timeline2_ai2_conversations/i.test(sql)) return [];
      if (/FROM timeline2_ai2_messages/i.test(sql)) return [];
      if (/INSERT INTO timeline2_ai_conversations/i.test(sql)) return [{ id: CONVERSATION_ID }];
      if (/INSERT INTO timeline2_ai_messages/i.test(sql)) return [];
      if (/INSERT INTO timeline2_branches/i.test(sql)) return [{ id: BRANCH_ID }];
      if (/INSERT INTO timeline2_branch_operations/i.test(sql)) return [];
      if (/FROM timeline2_branch_operations/i.test(sql)) return [];
      if (/FROM timeline2_branches/i.test(sql)) {
        return [
          {
            id: BRANCH_ID,
            projectId: PROJECT_ID,
            planId: PLAN_ID,
            title: "Timeline 2 AI proposal",
            summary: "AI branch from: Add permit review",
            status: "open",
            baseRevisionId: REVISION_ID,
            baseSnapshot: { nodes: [], dependencies: [] },
            proposedSnapshot: { nodes: [], dependencies: [] },
            createdAt: CREATED_AT,
            updatedAt: UPDATED_AT,
          },
        ];
      }
      if (/FROM timeline2_revisions/i.test(sql)) return [revisionRow];
      if (/FROM timeline2_node_assignees/i.test(sql)) return [];
      if (/FROM timeline2_dependencies/i.test(sql)) return [];
      if (/FROM timeline2_nodes/i.test(sql)) return [];
      if (/FROM timeline2_plans/i.test(sql)) return [planRow];
      return [];
    });

    const app = await buildApp(queryTenant);
    const response = await app.inject({
      method: "POST",
      url: `/timeline2/projects/${PROJECT_ID}/ai/chat/stream`,
      payload: {
        message:
          "Create a new workstream called Permit Review. Start in June with site visit 1 week and approval 1 week.",
      },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");
    expect(response.payload).toContain('"type":"branch_created"');
    expect(response.payload).toContain('"type":"analysis_summary"');
    expect(response.payload).toContain('"type":"done"');

    const sql = allSql(queryTenant);
    expect(sql).toMatch(/INSERT INTO timeline2_ai_conversations/i);
    expect(sql).toMatch(/INSERT INTO timeline2_ai_messages/i);
    expect(sql).toMatch(/INSERT INTO timeline2_branches/i);
    expect(sql).toMatch(/INSERT INTO timeline2_branch_operations/i);
    expectNoOldTaskTimelineTables(sql);
  });
});
