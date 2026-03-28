import { vi, describe, it, expect, afterEach } from "vitest";

// Hoist mocks before importing the module under test

vi.mock("@larry/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@larry/ai")>();
  return { ...actual, runIntelligence: vi.fn() };
});

vi.mock("@larry/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@larry/db")>();
  return {
    ...actual,
    getProjectSnapshot: vi.fn(),
    runAutoActions: vi.fn(),
    storeSuggestions: vi.fn(),
  };
});

vi.mock("../src/lib/audit.js", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

// Briefing service is imported by larry.ts but only called by /briefing, not /chat.
// Mock it to prevent import-time side-effects from its own dependencies.
vi.mock("../src/services/larry-briefing.js", () => ({
  getOrGenerateBriefing: vi.fn(),
}));

import Fastify from "fastify";
import sensible from "@fastify/sensible";
import type { ApiEnv } from "@larry/config";
import type { Db } from "@larry/db";
import type { ProjectSnapshot } from "@larry/shared";
import { runIntelligence } from "@larry/ai";
import { getProjectSnapshot, runAutoActions, storeSuggestions } from "@larry/db";
import { larryRoutes } from "../src/routes/v1/larry.js";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID = "55555555-5555-4555-8555-555555555555";

const MOCK_SNAPSHOT: ProjectSnapshot = {
  project: {
    id: PROJECT_ID,
    tenantId: TENANT_ID,
    name: "Test Project",
    description: null,
    status: "active",
    riskScore: 0,
    riskLevel: "low",
    startDate: null,
    targetDate: null,
  },
  tasks: [],
  team: [],
  recentActivity: [],
  signals: [],
  generatedAt: new Date().toISOString(),
};

async function createTestApp() {
  const app = Fastify({ logger: false });

  app.decorate("db", {} as Db);
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
  await app.register(larryRoutes, { prefix: "/larry" });
  await app.ready();

  return app;
}

const appsToClose: Array<ReturnType<typeof Fastify>> = [];

afterEach(async () => {
  vi.clearAllMocks();
  while (appsToClose.length > 0) {
    const a = appsToClose.pop();
    if (a) await a.close();
  }
});

describe("POST /larry/chat", () => {
  it("returns the briefing and action counts from the intelligence result", async () => {
    vi.mocked(getProjectSnapshot).mockResolvedValue(MOCK_SNAPSHOT);
    vi.mocked(runIntelligence).mockResolvedValue({
      briefing: "Three tasks are at risk. Security review is blocked.",
      autoActions: [
        {
          type: "risk_flag",
          displayText: "Flagged security review as high risk",
          reasoning: "Blocked for 5 days with no update",
          payload: { taskId: "abc", taskTitle: "Security review", riskLevel: "high" },
        },
      ],
      suggestedActions: [
        {
          type: "deadline_change",
          displayText: "Extend security review deadline",
          reasoning: "Task is blocked",
          payload: { taskId: "abc", taskTitle: "Security review", newDeadline: "2026-04-10" },
        },
      ],
    });
    vi.mocked(runAutoActions).mockResolvedValue({ executedCount: 1, suggestedCount: 0, eventIds: ["ev-auto-1"] });
    vi.mocked(storeSuggestions).mockResolvedValue({ executedCount: 0, suggestedCount: 1, eventIds: ["ev-sug-1"] });

    const app = await createTestApp();
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/larry/chat",
      payload: { projectId: PROJECT_ID, message: "What tasks are at risk?" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      message: "Three tasks are at risk. Security review is blocked.",
      actionsExecuted: 1,
      suggestionCount: 1,
    });

    expect(getProjectSnapshot).toHaveBeenCalledWith(expect.anything(), TENANT_ID, PROJECT_ID);
    expect(runIntelligence).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "mock" }),
      MOCK_SNAPSHOT,
      `user said: "What tasks are at risk?"`
    );
    expect(runAutoActions).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      PROJECT_ID,
      "chat",
      expect.any(Array),
      "What tasks are at risk?"
    );
    expect(storeSuggestions).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      PROJECT_ID,
      "chat",
      expect.any(Array),
      "What tasks are at risk?"
    );
  });

  it("returns 404 when getProjectSnapshot throws", async () => {
    vi.mocked(getProjectSnapshot).mockRejectedValue(new Error("Project not found"));

    const app = await createTestApp();
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/larry/chat",
      payload: { projectId: PROJECT_ID, message: "Status update?" },
    });

    expect(response.statusCode).toBe(404);
    expect(runIntelligence).not.toHaveBeenCalled();
  });

  it("returns 503 when runIntelligence throws", async () => {
    vi.mocked(getProjectSnapshot).mockResolvedValue(MOCK_SNAPSHOT);
    vi.mocked(runIntelligence).mockRejectedValue(new Error("OpenAI timeout"));

    const app = await createTestApp();
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/larry/chat",
      payload: { projectId: PROJECT_ID, message: "Any blockers?" },
    });

    expect(response.statusCode).toBe(503);
  });

  it("returns 400 when projectId is not a valid UUID", async () => {
    const app = await createTestApp();
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/larry/chat",
      payload: { projectId: "not-a-uuid", message: "Hello" },
    });

    expect(response.statusCode).toBe(400);
    expect(getProjectSnapshot).not.toHaveBeenCalled();
  });

  it("returns 400 when message is empty", async () => {
    const app = await createTestApp();
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/larry/chat",
      payload: { projectId: PROJECT_ID, message: "" },
    });

    expect(response.statusCode).toBe(400);
    expect(getProjectSnapshot).not.toHaveBeenCalled();
  });

  it("returns 400 when body is missing required fields", async () => {
    const app = await createTestApp();
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/larry/chat",
      payload: { message: "Hello Larry" },
    });

    expect(response.statusCode).toBe(400);
  });
});
