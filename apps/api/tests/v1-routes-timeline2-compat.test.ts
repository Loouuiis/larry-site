import { beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("../src/routes/v1/auth.js", () => ({ authRoutes: async () => undefined }));
vi.mock("../src/routes/v1/invitations.js", () => ({ invitationsRoutes: async () => undefined }));
vi.mock("../src/routes/v1/invite-links.js", () => ({ inviteLinksRoutes: async () => undefined }));
vi.mock("../src/routes/v1/projects.js", () => ({ projectRoutes: async () => undefined }));
vi.mock("../src/routes/v1/tasks.js", () => ({ taskRoutes: async () => undefined }));
vi.mock("../src/routes/v1/categories.js", () => ({ categoryRoutes: async () => undefined }));
vi.mock("../src/routes/v1/ingest.js", () => ({ ingestRoutes: async () => undefined }));
vi.mock("../src/routes/v1/reporting.js", () => ({ reportingRoutes: async () => undefined }));
vi.mock("../src/routes/v1/connectors-slack.js", () => ({ slackConnectorRoutes: async () => undefined }));
vi.mock("../src/routes/v1/connectors-google-calendar.js", () => ({
  googleCalendarConnectorRoutes: async () => undefined,
}));
vi.mock("../src/routes/v1/connectors-outlook-calendar.js", () => ({
  outlookCalendarConnectorRoutes: async () => undefined,
}));
vi.mock("../src/routes/v1/larry.js", () => ({ larryRoutes: async () => undefined }));
vi.mock("../src/routes/v1/larry-documents.js", () => ({
  larryDocumentsRoutes: async () => undefined,
}));
vi.mock("../src/routes/v1/connectors-email.js", () => ({
  emailConnectorRoutes: async () => undefined,
}));
vi.mock("../src/routes/v1/activity.js", () => ({ activityRoutes: async () => undefined }));
vi.mock("../src/routes/v1/notifications.js", () => ({ notificationRoutes: async () => undefined }));
vi.mock("../src/routes/v1/meetings.js", () => ({ meetingRoutes: async () => undefined }));
vi.mock("../src/routes/v1/orgs.js", () => ({ orgRoutes: async () => undefined }));
vi.mock("../src/routes/v1/orgs-admin.js", () => ({ orgsAdminRoutes: async () => undefined }));
vi.mock("../src/routes/v1/project-intake.js", () => ({
  projectIntakeRoutes: async () => undefined,
}));
vi.mock("../src/routes/v1/documents.js", () => ({ documentRoutes: async () => undefined }));
vi.mock("../src/routes/v1/folders.js", () => ({ folderRoutes: async () => undefined }));
vi.mock("../src/routes/v1/settings.js", () => ({ settingsRoutes: async () => undefined }));
vi.mock("../src/routes/v1/search.js", () => ({ searchRoutes: async () => undefined }));
vi.mock("../src/routes/v1/admin.js", () => ({ adminRoutes: async () => undefined }));
vi.mock("../src/routes/v1/webhooks-resend.js", () => ({
  resendWebhookRoutes: async () => undefined,
}));
vi.mock("../src/routes/v1/timeline.js", () => ({ timelineRoutes: async () => undefined }));
vi.mock("../src/routes/v1/user-profile.js", () => ({ userProfileRoutes: async () => undefined }));

import Fastify from "fastify";
import sensible from "@fastify/sensible";
import type { Db } from "@larry/db";
import { getApiEnv } from "@larry/config";
import {
  getProjectMembershipAccess,
  listProjectMembers,
} from "../src/lib/project-memberships.js";
import { v1Routes } from "../src/routes/v1/index.js";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const USER_2_ID = "33333333-3333-4333-8333-333333333333";
const PROJECT_ID = "44444444-4444-4444-8444-444444444444";
const PLAN_ID = "55555555-5555-4555-8555-555555555555";
const REVISION_ID = "66666666-6666-4666-8666-666666666666";
const NODE_ID = "77777777-7777-4777-8777-777777777777";
const CREATED_AT = "2026-05-04T08:00:00.000Z";
const UPDATED_AT = "2026-05-04T09:00:00.000Z";

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
  await app.register(v1Routes, { prefix: "/v1" });
  await app.ready();
  return app;
}

beforeEach(() => {
  vi.mocked(getApiEnv).mockReturnValue(TIMELINE2_TEST_OPENAI_ENV);
  vi.mocked(getProjectMembershipAccess).mockResolvedValue({
    projectExists: true,
    projectStatus: "active",
    projectRole: "owner",
    canRead: true,
    canManage: true,
  });
  vi.mocked(listProjectMembers).mockResolvedValue([
    {
      userId: USER_ID,
      name: "Philip",
      email: "philip@example.com",
      tenantRole: "pm",
      projectRole: "owner",
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    },
    {
      userId: USER_2_ID,
      name: "Ada",
      email: "ada@example.com",
      tenantRole: "member",
      projectRole: "editor",
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    },
  ]);
});

describe("v1 Timeline 2 compatibility routing", () => {
  it("serves Timeline 2 AI2 health through /v1/timeline2/ai2/health", async () => {
    const app = await buildApp(vi.fn());

    const response = await app.inject({
      method: "GET",
      url: "/v1/timeline2/ai2/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      route: "timeline2.ai2.health",
      providerConfigured: true,
      provider: "openai",
      model: "gpt-4o-mini",
    });

    await app.close();
  });

  it("creates a Timeline 2 node through the full /v1 router tree", async () => {
    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (/INSERT INTO timeline2_plans/i.test(sql)) return [planRow];
      if (/FROM timeline2_plans/i.test(sql)) return [planRow];
      if (/INSERT INTO timeline2_nodes/i.test(sql)) return [{ id: NODE_ID }];
      if (/DELETE FROM timeline2_node_assignees/i.test(sql)) return [];
      if (/INSERT INTO timeline2_revisions/i.test(sql)) return [{ id: REVISION_ID }];
      if (/UPDATE timeline2_plans/i.test(sql)) return [];
      if (/FROM timeline2_revisions/i.test(sql)) return [revisionRow];
      if (/FROM timeline2_node_assignees/i.test(sql)) return [];
      if (/FROM timeline2_dependencies/i.test(sql)) return [];
      if (/FROM timeline2_nodes/i.test(sql) && /ORDER BY sort_order/i.test(sql)) return [];
      if (/SELECT target_date::text AS "targetDate"/i.test(sql)) return [{ targetDate: null }];
      return [];
    });
    const app = await buildApp(queryTenant);

    const response = await app.inject({
      method: "POST",
      url: `/v1/timeline2/projects/${PROJECT_ID}/nodes`,
      payload: {
        title: "Ship launch checklist",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ id: NODE_ID });

    await app.close();
  });
});
