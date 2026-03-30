import { vi, describe, it, expect, afterEach, beforeEach } from "vitest";

vi.mock("@larry/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@larry/ai")>();
  return { ...actual, runIntelligence: vi.fn() };
});

vi.mock("@larry/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@larry/db")>();
  return {
    ...actual,
    getProjectSnapshot: vi.fn(),
    getPendingSuggestionTexts: vi.fn(),
    insertProjectMemoryEntry: vi.fn(),
    runAutoActions: vi.fn(),
    storeSuggestions: vi.fn(),
  };
});

vi.mock("../src/lib/larry-ledger.js", () => ({
  createLarryConversation: vi.fn(),
  getLarryActionCentreData: vi.fn(),
  getLarryConversationForUser: vi.fn(),
  getLarryEventForMutation: vi.fn(),
  insertLarryMessage: vi.fn(),
  listLarryConversationPreviews: vi.fn(),
  listLarryEventSummaries: vi.fn(),
  listLarryMessagesByIds: vi.fn(),
  listLarryMessagesForConversation: vi.fn(),
  markLarryEventAccepted: vi.fn(),
  markLarryEventDismissed: vi.fn(),
  touchLarryConversation: vi.fn(),
}));

vi.mock("../src/lib/audit.js", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/services/larry-briefing.js", () => ({
  getOrGenerateBriefing: vi.fn(),
}));

vi.mock("../src/services/ingest/pipeline.js", () => ({
  ingestCanonicalEvent: vi.fn(),
  insertCanonicalEventRecords: vi.fn(),
  publishCanonicalEventCreated: vi.fn(),
}));

vi.mock("../src/lib/project-memberships.js", () => ({
  getProjectMembershipAccess: vi.fn(),
}));

import Fastify from "fastify";
import sensible from "@fastify/sensible";
import type { ApiEnv } from "@larry/config";
import type { Db } from "@larry/db";
import type { ProjectSnapshot } from "@larry/shared";
import { runIntelligence } from "@larry/ai";
import {
  getPendingSuggestionTexts,
  getProjectSnapshot,
  insertProjectMemoryEntry,
  runAutoActions,
  storeSuggestions,
} from "@larry/db";
import {
  createLarryConversation,
  getLarryConversationForUser,
  insertLarryMessage,
  listLarryMessagesByIds,
  touchLarryConversation,
} from "../src/lib/larry-ledger.js";
import {
  insertCanonicalEventRecords,
  publishCanonicalEventCreated,
} from "../src/services/ingest/pipeline.js";
import { getProjectMembershipAccess } from "../src/lib/project-memberships.js";
import { ingestRoutes } from "../src/routes/v1/ingest.js";
import { larryRoutes } from "../src/routes/v1/larry.js";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID = "55555555-5555-4555-8555-555555555555";
const CONVERSATION_ID = "66666666-6666-4666-8666-666666666666";

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

const SNAPSHOT_WITH_MULTIPLE_TASKS: ProjectSnapshot = {
  ...MOCK_SNAPSHOT,
  tasks: [
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      title: "QA sign-off on checkout flow",
      description: null,
      status: "in_progress",
      priority: "high",
      assigneeId: USER_ID,
      assigneeName: "pm",
      progressPercent: 40,
      riskScore: 62,
      riskLevel: "medium",
      dueDate: "2026-04-10",
      startDate: "2026-03-20",
      lastActivityAt: "2026-03-28T10:00:00.000Z",
      dependsOnTitles: [],
    },
    {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      title: "Prepare investor demo deck",
      description: null,
      status: "not_started",
      priority: "medium",
      assigneeId: USER_ID,
      assigneeName: "pm",
      progressPercent: 10,
      riskScore: 45,
      riskLevel: "medium",
      dueDate: "2026-04-15",
      startDate: "2026-03-22",
      lastActivityAt: "2026-03-27T08:00:00.000Z",
      dependsOnTitles: [],
    },
  ],
};

function createMockDb() {
  return {
    queryTenant: vi.fn().mockResolvedValue([]),
    tx: vi.fn(async (fn: (client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[] }> }) => Promise<unknown>) => {
      const client = {
        query: vi.fn(async (sql: string) => {
          if (sql.includes("INSERT INTO meeting_notes")) {
            return { rows: [{ id: "meeting-note-1" }] };
          }
          return { rows: [] };
        }),
      };
      return fn(client);
    }),
  } as unknown as Db;
}

async function createTestApp() {
  const app = Fastify({ logger: false });

  app.decorate("db", createMockDb());
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
  await app.register(ingestRoutes, { prefix: "/ingest" });
  await app.ready();

  return app;
}

async function createV1PrefixedTestApp() {
  const app = Fastify({ logger: false });

  app.decorate("db", createMockDb());
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
  await app.register(larryRoutes, { prefix: "/v1/larry" });
  await app.register(ingestRoutes, { prefix: "/v1/ingest" });
  await app.ready();

  return app;
}

const appsToClose: Array<ReturnType<typeof Fastify>> = [];

beforeEach(() => {
  vi.mocked(getProjectMembershipAccess).mockResolvedValue({
    projectExists: true,
    projectRole: "owner",
    canRead: true,
    canManage: true,
  });
});

afterEach(async () => {
  vi.clearAllMocks();
  while (appsToClose.length > 0) {
    const app = appsToClose.pop();
    if (app) await app.close();
  }
});

describe("POST /larry/chat", () => {
  it("returns 410 for legacy conversation creation writes", async () => {
    const app = await createTestApp();
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/larry/conversations",
      payload: { projectId: PROJECT_ID, title: "Legacy write" },
    });

    expect(response.statusCode).toBe(410);
    expect(response.json()).toMatchObject({
      error: expect.stringContaining("retired"),
    });
    expect(createLarryConversation).not.toHaveBeenCalled();
  });

  it("returns 410 for legacy conversation message writes", async () => {
    const app = await createTestApp();
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: `/larry/conversations/${CONVERSATION_ID}/messages`,
      payload: { role: "user", content: "Legacy write" },
    });

    expect(response.statusCode).toBe(410);
    expect(response.json()).toMatchObject({
      error: expect.stringContaining("retired"),
    });
    expect(getLarryConversationForUser).not.toHaveBeenCalled();
    expect(insertLarryMessage).not.toHaveBeenCalled();
  });

  it("returns the persisted conversation, messages, and linked actions", async () => {
    vi.mocked(getLarryConversationForUser).mockResolvedValue(null);
    vi.mocked(getProjectSnapshot).mockResolvedValue(MOCK_SNAPSHOT);
    vi.mocked(getPendingSuggestionTexts).mockResolvedValue([]);
    vi.mocked(runIntelligence).mockResolvedValue({
      briefing: "Security review is blocked and needs attention.",
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
    vi.mocked(createLarryConversation).mockResolvedValue({
      id: CONVERSATION_ID,
      projectId: PROJECT_ID,
      title: "What tasks are at risk?",
      createdAt: "2026-03-28T10:00:00.000Z",
      updatedAt: "2026-03-28T10:00:00.000Z",
      lastMessagePreview: null,
      lastMessageAt: null,
    });
    vi.mocked(insertLarryMessage)
      .mockResolvedValueOnce({ id: "77777777-7777-4777-8777-777777777777", createdAt: "2026-03-28T10:01:00.000Z" })
      .mockResolvedValueOnce({ id: "88888888-8888-4888-8888-888888888888", createdAt: "2026-03-28T10:01:02.000Z" });
    vi.mocked(runAutoActions).mockResolvedValue({ executedCount: 1, suggestedCount: 0, eventIds: ["ev-auto-1"] });
    vi.mocked(storeSuggestions).mockResolvedValue({ executedCount: 0, suggestedCount: 1, eventIds: ["ev-sug-1"] });
    vi.mocked(listLarryMessagesByIds).mockResolvedValue([
      {
        id: "77777777-7777-4777-8777-777777777777",
        role: "user",
        content: "What tasks are at risk?",
        reasoning: null,
        createdAt: "2026-03-28T10:01:00.000Z",
        actorUserId: USER_ID,
        actorDisplayName: "pm",
        linkedActions: [],
      },
      {
        id: "88888888-8888-4888-8888-888888888888",
        role: "larry",
        content: "Security review is blocked and needs attention.",
        reasoning: null,
        createdAt: "2026-03-28T10:01:02.000Z",
        actorUserId: null,
        actorDisplayName: null,
        linkedActions: [
          {
            id: "ev-auto-1",
            projectId: PROJECT_ID,
            projectName: "Alpha Launch",
            eventType: "auto_executed",
            actionType: "risk_flag",
            displayText: "Flagged security review as high risk",
            reasoning: "Blocked for 5 days with no update",
            payload: {},
            executedAt: "2026-03-28T10:01:03.000Z",
            triggeredBy: "chat",
            chatMessage: "What tasks are at risk?",
            createdAt: "2026-03-28T10:01:03.000Z",
            conversationId: CONVERSATION_ID,
            requestMessageId: "77777777-7777-4777-8777-777777777777",
            responseMessageId: "88888888-8888-4888-8888-888888888888",
            requestedByUserId: USER_ID,
            requestedByName: "pm",
            approvedByUserId: null,
            approvedByName: null,
            approvedAt: null,
            dismissedByUserId: null,
            dismissedByName: null,
            dismissedAt: null,
            executedByKind: "larry",
            executedByUserId: null,
            executedByName: null,
            executionMode: "auto",
            sourceKind: "chat",
            sourceRecordId: "77777777-7777-4777-8777-777777777777",
            conversationTitle: "What tasks are at risk?",
            requestMessagePreview: "What tasks are at risk?",
            responseMessagePreview: "Security review is blocked and needs attention.",
          },
        ],
      },
    ]);

    const app = await createTestApp();
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/larry/chat",
      payload: { projectId: PROJECT_ID, message: "What tasks are at risk?" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      conversationId: CONVERSATION_ID,
      message: "Security review is blocked and needs attention.",
      actionsExecuted: 1,
      suggestionCount: 1,
      userMessage: {
        id: "77777777-7777-4777-8777-777777777777",
        role: "user",
      },
      assistantMessage: {
        id: "88888888-8888-4888-8888-888888888888",
        role: "larry",
      },
      linkedActions: [
        {
          id: "ev-auto-1",
          requestedByUserId: USER_ID,
          executionMode: "auto",
        },
      ],
    });

    expect(runAutoActions).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      PROJECT_ID,
      "chat",
      expect.any(Array),
      "What tasks are at risk?",
      {
        conversationId: CONVERSATION_ID,
        requestMessageId: "77777777-7777-4777-8777-777777777777",
        responseMessageId: "88888888-8888-4888-8888-888888888888",
        requesterUserId: USER_ID,
        sourceKind: "chat",
        sourceRecordId: "77777777-7777-4777-8777-777777777777",
      }
    );
    expect(storeSuggestions).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      PROJECT_ID,
      "chat",
      expect.any(Array),
      "What tasks are at risk?",
      {
        conversationId: CONVERSATION_ID,
        requestMessageId: "77777777-7777-4777-8777-777777777777",
        responseMessageId: "88888888-8888-4888-8888-888888888888",
        requesterUserId: USER_ID,
        sourceKind: "chat",
        sourceRecordId: "77777777-7777-4777-8777-777777777777",
      }
    );
    expect(touchLarryConversation).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      CONVERSATION_ID,
      "What tasks are at risk?"
    );
    expect(insertProjectMemoryEntry).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      PROJECT_ID,
      expect.objectContaining({
        source: "Larry chat",
        sourceKind: "chat",
        sourceRecordId: "77777777-7777-4777-8777-777777777777",
      })
    );
  });

  it("returns a clarification prompt for ambiguous mutation requests and skips action execution", async () => {
    vi.mocked(getLarryConversationForUser).mockResolvedValue(null);
    vi.mocked(getProjectSnapshot).mockResolvedValue(SNAPSHOT_WITH_MULTIPLE_TASKS);
    vi.mocked(createLarryConversation).mockResolvedValue({
      id: CONVERSATION_ID,
      projectId: PROJECT_ID,
      title: "Please mark this as complete",
      createdAt: "2026-03-28T10:00:00.000Z",
      updatedAt: "2026-03-28T10:00:00.000Z",
      lastMessagePreview: null,
      lastMessageAt: null,
    });
    vi.mocked(insertLarryMessage)
      .mockResolvedValueOnce({ id: "clarify-user-1", createdAt: "2026-03-28T10:04:00.000Z" })
      .mockResolvedValueOnce({ id: "clarify-assistant-1", createdAt: "2026-03-28T10:04:01.000Z" });
    vi.mocked(listLarryMessagesByIds).mockResolvedValue([
      {
        id: "clarify-user-1",
        role: "user",
        content: "Please mark this as complete",
        reasoning: null,
        createdAt: "2026-03-28T10:04:00.000Z",
        actorUserId: USER_ID,
        actorDisplayName: "pm",
        linkedActions: [],
      },
      {
        id: "clarify-assistant-1",
        role: "larry",
        content: "I can apply that update, but I need the target task first.",
        reasoning: null,
        createdAt: "2026-03-28T10:04:01.000Z",
        actorUserId: null,
        actorDisplayName: null,
        linkedActions: [],
      },
    ]);

    const app = await createTestApp();
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/larry/chat",
      payload: { projectId: PROJECT_ID, message: "Please mark this as complete" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      conversationId: CONVERSATION_ID,
      actionsExecuted: 0,
      suggestionCount: 0,
      requiresClarification: true,
      clarificationQuestions: [expect.stringContaining("target task")],
    });
    expect(runIntelligence).not.toHaveBeenCalled();
    expect(getPendingSuggestionTexts).not.toHaveBeenCalled();
    expect(runAutoActions).not.toHaveBeenCalled();
    expect(storeSuggestions).not.toHaveBeenCalled();
  });

  it("includes rerouted auto-actions in suggestionCount", async () => {
    vi.mocked(getLarryConversationForUser).mockResolvedValue(null);
    vi.mocked(getProjectSnapshot).mockResolvedValue(MOCK_SNAPSHOT);
    vi.mocked(getPendingSuggestionTexts).mockResolvedValue([]);
    vi.mocked(runIntelligence).mockResolvedValue({
      briefing: "I prepared one routed action and two fresh suggestions.",
      autoActions: [],
      suggestedActions: [],
    });
    vi.mocked(createLarryConversation).mockResolvedValue({
      id: CONVERSATION_ID,
      projectId: PROJECT_ID,
      title: "Review actions",
      createdAt: "2026-03-28T10:00:00.000Z",
      updatedAt: "2026-03-28T10:00:00.000Z",
      lastMessagePreview: null,
      lastMessageAt: null,
    });
    vi.mocked(insertLarryMessage)
      .mockResolvedValueOnce({ id: "route-user-1", createdAt: "2026-03-28T10:05:00.000Z" })
      .mockResolvedValueOnce({ id: "route-assistant-1", createdAt: "2026-03-28T10:05:01.000Z" });
    vi.mocked(runAutoActions).mockResolvedValue({
      executedCount: 0,
      suggestedCount: 1,
      eventIds: ["ev-rerouted-1"],
    });
    vi.mocked(storeSuggestions).mockResolvedValue({
      executedCount: 0,
      suggestedCount: 2,
      eventIds: ["ev-suggest-1", "ev-suggest-2"],
    });
    vi.mocked(listLarryMessagesByIds).mockResolvedValue([
      {
        id: "route-user-1",
        role: "user",
        content: "Review actions",
        reasoning: null,
        createdAt: "2026-03-28T10:05:00.000Z",
        actorUserId: USER_ID,
        actorDisplayName: "pm",
        linkedActions: [],
      },
      {
        id: "route-assistant-1",
        role: "larry",
        content: "I prepared one routed action and two fresh suggestions.",
        reasoning: null,
        createdAt: "2026-03-28T10:05:01.000Z",
        actorUserId: null,
        actorDisplayName: null,
        linkedActions: [
          {
            id: "ev-rerouted-1",
            projectId: PROJECT_ID,
            projectName: "Alpha Launch",
            eventType: "suggested",
            actionType: "risk_flag",
            displayText: "Review this routed action",
            reasoning: "Policy routed this for approval",
            payload: {},
            executedAt: null,
            triggeredBy: "chat",
            chatMessage: "Review actions",
            createdAt: "2026-03-28T10:05:02.000Z",
            conversationId: CONVERSATION_ID,
            requestMessageId: "route-user-1",
            responseMessageId: "route-assistant-1",
            requestedByUserId: USER_ID,
            requestedByName: "pm",
            approvedByUserId: null,
            approvedByName: null,
            approvedAt: null,
            dismissedByUserId: null,
            dismissedByName: null,
            dismissedAt: null,
            executedByKind: null,
            executedByUserId: null,
            executedByName: null,
            executionMode: "approval",
            sourceKind: "chat",
            sourceRecordId: "route-user-1",
            conversationTitle: "Review actions",
            requestMessagePreview: "Review actions",
            responseMessagePreview: "I prepared one routed action and two fresh suggestions.",
          },
        ],
      },
    ]);

    const app = await createTestApp();
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/larry/chat",
      payload: { projectId: PROJECT_ID, message: "Review actions" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      suggestionCount: 3,
      actionsExecuted: 0,
    });
  });

  it("reuses an existing conversation when conversationId is supplied", async () => {
    vi.mocked(getLarryConversationForUser).mockResolvedValue({
      id: CONVERSATION_ID,
      projectId: PROJECT_ID,
      title: "Existing chat",
      createdAt: "2026-03-28T10:00:00.000Z",
      updatedAt: "2026-03-28T10:00:00.000Z",
      lastMessagePreview: null,
      lastMessageAt: null,
    });
    vi.mocked(getProjectSnapshot).mockResolvedValue(MOCK_SNAPSHOT);
    vi.mocked(getPendingSuggestionTexts).mockResolvedValue([]);
    vi.mocked(runIntelligence).mockResolvedValue({
      briefing: "Looks stable.",
      autoActions: [],
      suggestedActions: [],
    });
    vi.mocked(insertLarryMessage)
      .mockResolvedValueOnce({ id: "99999999-9999-4999-8999-999999999999", createdAt: "2026-03-28T10:02:00.000Z" })
      .mockResolvedValueOnce({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", createdAt: "2026-03-28T10:02:01.000Z" });
    vi.mocked(runAutoActions).mockResolvedValue({ executedCount: 0, suggestedCount: 0, eventIds: [] });
    vi.mocked(storeSuggestions).mockResolvedValue({ executedCount: 0, suggestedCount: 0, eventIds: [] });
    vi.mocked(listLarryMessagesByIds).mockResolvedValue([
      {
        id: "99999999-9999-4999-8999-999999999999",
        role: "user",
        content: "Any blockers?",
        reasoning: null,
        createdAt: "2026-03-28T10:02:00.000Z",
        actorUserId: USER_ID,
        actorDisplayName: "pm",
        linkedActions: [],
      },
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        role: "larry",
        content: "Looks stable.",
        reasoning: null,
        createdAt: "2026-03-28T10:02:01.000Z",
        actorUserId: null,
        actorDisplayName: null,
        linkedActions: [],
      },
    ]);

    const app = await createTestApp();
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/larry/chat",
      payload: {
        projectId: PROJECT_ID,
        conversationId: CONVERSATION_ID,
        message: "Any blockers?",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(createLarryConversation).not.toHaveBeenCalled();
    expect(response.json()).toMatchObject({ conversationId: CONVERSATION_ID });
  });

  it("returns 404 when getProjectSnapshot throws", async () => {
    vi.mocked(getProjectSnapshot).mockRejectedValue(new Error("Project not found"));
    vi.mocked(getLarryConversationForUser).mockResolvedValue(null);

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

  it("returns 403 when user lacks project membership for project chat", async () => {
    vi.mocked(getProjectMembershipAccess).mockResolvedValue({
      projectExists: true,
      projectRole: null,
      canRead: false,
      canManage: false,
    });

    const app = await createTestApp();
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/larry/chat",
      payload: { projectId: PROJECT_ID, message: "Status update?" },
    });

    expect(response.statusCode).toBe(403);
    expect(getProjectSnapshot).not.toHaveBeenCalled();
  });

  it("returns 404 when project does not exist in membership access check", async () => {
    vi.mocked(getProjectMembershipAccess).mockResolvedValue({
      projectExists: false,
      projectRole: null,
      canRead: false,
      canManage: false,
    });

    const app = await createTestApp();
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/larry/chat",
      payload: { projectId: PROJECT_ID, message: "Status update?" },
    });

    expect(response.statusCode).toBe(404);
    expect(getProjectSnapshot).not.toHaveBeenCalled();
  });

  it("returns 404 when the provided conversation does not exist", async () => {
    vi.mocked(getLarryConversationForUser).mockResolvedValue(null);

    const app = await createTestApp();
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/larry/chat",
      payload: {
        projectId: PROJECT_ID,
        conversationId: CONVERSATION_ID,
        message: "Status update?",
      },
    });

    expect(response.statusCode).toBe(404);
    expect(getProjectSnapshot).not.toHaveBeenCalled();
  });

  it("returns 503 when runIntelligence throws", async () => {
    vi.mocked(getLarryConversationForUser).mockResolvedValue(null);
    vi.mocked(getProjectSnapshot).mockResolvedValue(MOCK_SNAPSHOT);
    vi.mocked(getPendingSuggestionTexts).mockResolvedValue([]);
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
});

describe("POST /larry/transcript", () => {
  it("accepts transcript uploads, patches canonical metadata, and enqueues worker processing", async () => {
    vi.mocked(insertCanonicalEventRecords).mockResolvedValue({
      canonicalEventId: "canon-event-1",
      idempotencyKey: "idem-1",
      source: "transcript",
      eventType: "commitment",
    });
    vi.mocked(publishCanonicalEventCreated).mockResolvedValue(undefined);

    const app = await createTestApp();
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/larry/transcript",
      payload: {
        sourceEventId: "web-upload-123",
        transcript: "Anton will send the updated integration spec by Friday and Joel will review it.",
        projectId: PROJECT_ID,
        meetingTitle: "Weekly sync",
        payload: {},
      },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      accepted: true,
      canonicalEventId: "canon-event-1",
      idempotencyKey: "idem-1",
      meetingNoteId: "meeting-note-1",
    });
    expect(insertCanonicalEventRecords).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      expect.objectContaining({
        source: "transcript",
        sourceEventId: "web-upload-123",
        payload: expect.objectContaining({
          transcript: "Anton will send the updated integration spec by Friday and Joel will review it.",
          meetingTitle: "Weekly sync",
        }),
      })
    );
    expect(publishCanonicalEventCreated).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      expect.objectContaining({
        canonicalEventId: "canon-event-1",
        idempotencyKey: "idem-1",
        meetingNoteId: "meeting-note-1",
      })
    );
    expect(getProjectSnapshot).not.toHaveBeenCalled();
    expect(runIntelligence).not.toHaveBeenCalled();
    expect(runAutoActions).not.toHaveBeenCalled();
    expect(storeSuggestions).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid transcript payload", async () => {
    const app = await createTestApp();
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/larry/transcript",
      payload: {
        sourceEventId: "web-upload-123",
        transcript: "too short",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(insertCanonicalEventRecords).not.toHaveBeenCalled();
    expect(publishCanonicalEventCreated).not.toHaveBeenCalled();
  });
});

describe("POST /ingest/transcript compatibility shim", () => {
  it("forwards to /larry/transcript and returns deprecation metadata", async () => {
    vi.mocked(insertCanonicalEventRecords).mockResolvedValue({
      canonicalEventId: "canon-event-2",
      idempotencyKey: "idem-2",
      source: "transcript",
      eventType: "commitment",
    });
    vi.mocked(publishCanonicalEventCreated).mockResolvedValue(undefined);

    const app = await createV1PrefixedTestApp();
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/v1/ingest/transcript",
      payload: {
        sourceEventId: "web-upload-compat",
        transcript: "Joel will finalise rollout notes and Krish will prep stakeholder summary by Tuesday.",
        projectId: PROJECT_ID,
        meetingTitle: "Compat path test",
        payload: {},
      },
    });

    expect(response.statusCode).toBe(202);
    expect(response.headers["x-larry-deprecated-endpoint"]).toBe("/v1/ingest/transcript");
    expect(response.json()).toMatchObject({
      accepted: true,
      canonicalEventId: "canon-event-2",
      idempotencyKey: "idem-2",
      meetingNoteId: "meeting-note-1",
      deprecatedEndpoint: "/v1/ingest/transcript",
      replacementEndpoint: "/v1/larry/transcript",
    });
    expect(getProjectSnapshot).not.toHaveBeenCalled();
    expect(runIntelligence).not.toHaveBeenCalled();
    expect(runAutoActions).not.toHaveBeenCalled();
    expect(storeSuggestions).not.toHaveBeenCalled();
  });
});
