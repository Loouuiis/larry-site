import { vi, describe, it, expect, afterEach } from "vitest";

vi.mock("@larry/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@larry/ai")>();
  return { ...actual, runIntelligence: vi.fn() };
});

vi.mock("@larry/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@larry/db")>();
  return {
    ...actual,
    executeAction: vi.fn(),
    getPendingSuggestionTexts: vi.fn(),
    getProjectSnapshot: vi.fn(),
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

import Fastify from "fastify";
import sensible from "@fastify/sensible";
import type { ApiEnv } from "@larry/config";
import type { Db } from "@larry/db";
import { executeAction } from "@larry/db";
import {
  getLarryActionCentreData,
  getLarryEventForMutation,
  listLarryEventSummaries,
  markLarryEventAccepted,
  markLarryEventDismissed,
} from "../src/lib/larry-ledger.js";
import { larryRoutes } from "../src/routes/v1/larry.js";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID = "55555555-5555-4555-8555-555555555555";
const OTHER_PROJECT_ID = "56565656-5656-4565-8565-565656565656";
const EVENT_ID = "66666666-6666-4666-8666-666666666666";
const CONVERSATION_ID = "77777777-7777-4777-8777-777777777777";

async function createTestApp() {
  const app = Fastify({ logger: false });

  app.decorate(
    "db",
    {
      queryTenant: vi.fn().mockResolvedValue([]),
    } as unknown as Db
  );
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
    const app = appsToClose.pop();
    if (app) await app.close();
  }
});

describe("Larry action centre routes", () => {
  it("returns the canonical action-centre payload", async () => {
    vi.mocked(getLarryActionCentreData).mockResolvedValue({
      suggested: [
        {
          id: "meeting-event-1",
          projectId: PROJECT_ID,
          projectName: "Alpha Launch",
          eventType: "suggested",
          actionType: "task_create",
          displayText: "Create follow-up task from the meeting",
          reasoning: "The meeting captured a new action item.",
          payload: { title: "Follow up with finance" },
          executedAt: null,
          triggeredBy: "signal",
          chatMessage: null,
          createdAt: "2026-03-28T12:01:00.000Z",
          conversationId: null,
          requestMessageId: null,
          responseMessageId: null,
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
          sourceKind: "meeting",
          sourceRecordId: "99999999-9999-4999-8999-999999999999",
          conversationTitle: null,
          requestMessagePreview: null,
          responseMessagePreview: null,
        },
      ],
      activity: [
        {
          id: EVENT_ID,
          projectId: PROJECT_ID,
          projectName: "Alpha Launch",
          eventType: "auto_executed",
          actionType: "risk_flag",
          displayText: "Flagged security review as high risk",
          reasoning: "Blocked for 5 days with no update",
          payload: {},
          executedAt: "2026-03-28T12:00:00.000Z",
          triggeredBy: "chat",
          chatMessage: "Any blockers?",
          createdAt: "2026-03-28T11:59:00.000Z",
          conversationId: CONVERSATION_ID,
          requestMessageId: null,
          responseMessageId: null,
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
          sourceRecordId: "source-1",
          conversationTitle: "Any blockers?",
          requestMessagePreview: "Any blockers?",
          responseMessagePreview: "Flagged security review as high risk",
        },
      ],
      conversations: [],
    });

    const app = await createTestApp();
    appsToClose.push(app);

    const response = await app.inject({
      method: "GET",
      url: `/larry/action-centre?projectId=${PROJECT_ID}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      suggested: [
        {
          id: "meeting-event-1",
          sourceKind: "meeting",
          sourceRecordId: "99999999-9999-4999-8999-999999999999",
        },
      ],
      activity: [{ id: EVENT_ID, executionMode: "auto", requestedByName: "pm" }],
      conversations: [],
    });
    expect(getLarryActionCentreData).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      USER_ID,
      PROJECT_ID
    );
  });

  it("returns tenant-wide action-centre data with project names when projectId is omitted", async () => {
    vi.mocked(getLarryActionCentreData).mockResolvedValue({
      suggested: [
        {
          id: "meeting-event-1",
          projectId: PROJECT_ID,
          projectName: "Alpha Launch",
          eventType: "suggested",
          actionType: "task_create",
          displayText: "Create follow-up task from the meeting",
          reasoning: "The meeting captured a new action item.",
          payload: { title: "Follow up with finance" },
          executedAt: null,
          triggeredBy: "signal",
          chatMessage: null,
          createdAt: "2026-03-28T12:01:00.000Z",
          conversationId: null,
          requestMessageId: null,
          responseMessageId: null,
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
          sourceKind: "meeting",
          sourceRecordId: "99999999-9999-4999-8999-999999999999",
          conversationTitle: null,
          requestMessagePreview: null,
          responseMessagePreview: null,
        },
      ],
      activity: [
        {
          id: EVENT_ID,
          projectId: OTHER_PROJECT_ID,
          projectName: "Beta Expansion",
          eventType: "accepted",
          actionType: "email_draft",
          displayText: "Drafted customer update email",
          reasoning: "The account team requested a follow-up note.",
          payload: {},
          executedAt: "2026-03-28T13:00:00.000Z",
          triggeredBy: "chat",
          chatMessage: "Draft the follow-up email.",
          createdAt: "2026-03-28T12:58:00.000Z",
          conversationId: CONVERSATION_ID,
          requestMessageId: null,
          responseMessageId: null,
          requestedByUserId: USER_ID,
          requestedByName: "pm",
          approvedByUserId: USER_ID,
          approvedByName: "pm",
          approvedAt: "2026-03-28T13:00:00.000Z",
          dismissedByUserId: null,
          dismissedByName: null,
          dismissedAt: null,
          executedByKind: "user",
          executedByUserId: USER_ID,
          executedByName: "pm",
          executionMode: "approval",
          sourceKind: "chat",
          sourceRecordId: "source-2",
          conversationTitle: "Draft the follow-up email.",
          requestMessagePreview: "Draft the follow-up email.",
          responseMessagePreview: "I drafted it for review.",
        },
      ],
      conversations: [],
    });

    const app = await createTestApp();
    appsToClose.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/larry/action-centre",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      suggested: [{ projectId: PROJECT_ID, projectName: "Alpha Launch", sourceKind: "meeting" }],
      activity: [{ projectId: OTHER_PROJECT_ID, projectName: "Beta Expansion", executionMode: "approval" }],
      conversations: [],
    });
    expect(getLarryActionCentreData).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      USER_ID,
      undefined
    );
  });

  it("accepts a suggested event and returns the updated attribution", async () => {
    vi.mocked(getLarryEventForMutation).mockResolvedValue({
      id: EVENT_ID,
      projectId: PROJECT_ID,
      eventType: "suggested",
      actionType: "deadline_change",
      payload: { taskId: "task-1", newDeadline: "2026-04-10" },
    });
    vi.mocked(executeAction).mockResolvedValue({ id: "task-1" });
    vi.mocked(markLarryEventAccepted).mockResolvedValue(undefined);
    vi.mocked(listLarryEventSummaries).mockResolvedValue([
      {
        id: EVENT_ID,
        projectId: PROJECT_ID,
        projectName: "Alpha Launch",
        eventType: "accepted",
        actionType: "deadline_change",
        displayText: "Extend security review deadline",
        reasoning: "Task is blocked",
        payload: {},
        executedAt: "2026-03-28T12:05:00.000Z",
        triggeredBy: "chat",
        chatMessage: "Any blockers?",
        createdAt: "2026-03-28T12:00:00.000Z",
        conversationId: CONVERSATION_ID,
        requestMessageId: null,
        responseMessageId: null,
        requestedByUserId: USER_ID,
        requestedByName: "pm",
        approvedByUserId: USER_ID,
        approvedByName: "pm",
        approvedAt: "2026-03-28T12:05:00.000Z",
        dismissedByUserId: null,
        dismissedByName: null,
        dismissedAt: null,
        executedByKind: "user",
        executedByUserId: USER_ID,
        executedByName: "pm",
        executionMode: "approval",
        sourceKind: "chat",
        sourceRecordId: "source-1",
        conversationTitle: "Any blockers?",
        requestMessagePreview: "Any blockers?",
        responseMessagePreview: "Extend security review deadline",
      },
    ]);

    const app = await createTestApp();
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: `/larry/events/${EVENT_ID}/accept`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      accepted: true,
      event: {
        id: EVENT_ID,
        approvedByUserId: USER_ID,
        executedByKind: "user",
        executionMode: "approval",
      },
    });
    expect(markLarryEventAccepted).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      EVENT_ID,
      USER_ID
    );
  });

  it("dismisses a suggested event and returns the updated attribution", async () => {
    vi.mocked(getLarryEventForMutation).mockResolvedValue({
      id: EVENT_ID,
      projectId: PROJECT_ID,
      eventType: "suggested",
      actionType: "deadline_change",
      payload: { taskId: "task-1", newDeadline: "2026-04-10" },
    });
    vi.mocked(markLarryEventDismissed).mockResolvedValue(undefined);
    vi.mocked(listLarryEventSummaries).mockResolvedValue([
      {
        id: EVENT_ID,
        projectId: PROJECT_ID,
        projectName: "Alpha Launch",
        eventType: "dismissed",
        actionType: "deadline_change",
        displayText: "Extend security review deadline",
        reasoning: "Task is blocked",
        payload: { dismissReason: "Not needed" },
        executedAt: null,
        triggeredBy: "chat",
        chatMessage: "Any blockers?",
        createdAt: "2026-03-28T12:00:00.000Z",
        conversationId: CONVERSATION_ID,
        requestMessageId: null,
        responseMessageId: null,
        requestedByUserId: USER_ID,
        requestedByName: "pm",
        approvedByUserId: null,
        approvedByName: null,
        approvedAt: null,
        dismissedByUserId: USER_ID,
        dismissedByName: "pm",
        dismissedAt: "2026-03-28T12:07:00.000Z",
        executedByKind: null,
        executedByUserId: null,
        executedByName: null,
        executionMode: "approval",
        sourceKind: "chat",
        sourceRecordId: "source-1",
        conversationTitle: "Any blockers?",
        requestMessagePreview: "Any blockers?",
        responseMessagePreview: "Extend security review deadline",
      },
    ]);

    const app = await createTestApp();
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: `/larry/events/${EVENT_ID}/dismiss`,
      payload: { reason: "Not needed" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      dismissed: true,
      event: {
        id: EVENT_ID,
        dismissedByUserId: USER_ID,
        executionMode: "approval",
      },
    });
    expect(markLarryEventDismissed).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      EVENT_ID,
      USER_ID,
      "Not needed"
    );
  });
});
