import { vi, describe, it, expect, afterEach, beforeEach } from "vitest";

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
    insertProjectMemoryEntry: vi.fn(),
    listProjectMemoryEntries: vi.fn(),
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

vi.mock("../src/lib/project-memberships.js", () => ({
  getProjectMembershipAccess: vi.fn(),
}));

vi.mock("../src/services/connectors/google-calendar.js", () => ({
  createGoogleCalendarEvent: vi.fn(),
  refreshGoogleAccessToken: vi.fn(),
  updateGoogleCalendarEvent: vi.fn(),
}));

import Fastify from "fastify";
import sensible from "@fastify/sensible";
import type { ApiEnv } from "@larry/config";
import type { Db } from "@larry/db";
import {
  executeAction,
  insertProjectMemoryEntry,
  listProjectMemoryEntries,
} from "@larry/db";
import {
  getLarryActionCentreData,
  getLarryEventForMutation,
  listLarryEventSummaries,
  markLarryEventAccepted,
  markLarryEventDismissed,
} from "../src/lib/larry-ledger.js";
import { getProjectMembershipAccess } from "../src/lib/project-memberships.js";
import {
  createGoogleCalendarEvent,
  refreshGoogleAccessToken,
  updateGoogleCalendarEvent,
} from "../src/services/connectors/google-calendar.js";
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
  app.decorate(
    "config",
    {
      MODEL_PROVIDER: "mock",
      GOOGLE_CLIENT_ID: "google-client-id",
      GOOGLE_CLIENT_SECRET: "google-client-secret",
    } as unknown as ApiEnv
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
  app.decorate("requireRole", () => async () => undefined);

  await app.register(sensible);
  await app.register(larryRoutes, { prefix: "/larry" });
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

describe("Larry action centre routes", () => {
  it("returns 410 for legacy event-list reads", async () => {
    const app = await createTestApp();
    appsToClose.push(app);

    const response = await app.inject({
      method: "GET",
      url: `/larry/events?projectId=${PROJECT_ID}&eventType=suggested`,
    });

    expect(response.statusCode).toBe(410);
    expect(response.json()).toMatchObject({
      error: expect.stringContaining("retired"),
    });
    expect(listLarryEventSummaries).not.toHaveBeenCalled();
  }, 15_000);

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
      PROJECT_ID,
      "all"
    );
  });

  it("returns 403 for project action-centre reads when caller is not a project member", async () => {
    vi.mocked(getProjectMembershipAccess).mockResolvedValue({
      projectExists: true,
      projectRole: null,
      canRead: false,
      canManage: false,
    });

    const app = await createTestApp();
    appsToClose.push(app);

    const response = await app.inject({
      method: "GET",
      url: `/larry/action-centre?projectId=${PROJECT_ID}`,
    });

    expect(response.statusCode).toBe(403);
    expect(getLarryActionCentreData).not.toHaveBeenCalled();
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
      undefined,
      "all"
    );
  });

  it("forwards additive global project status filters to the canonical action-centre runtime", async () => {
    vi.mocked(getLarryActionCentreData).mockResolvedValue({
      suggested: [],
      activity: [],
      conversations: [],
    });

    const app = await createTestApp();
    appsToClose.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/larry/action-centre?projectStatus=active",
    });

    expect(response.statusCode).toBe(200);
    expect(getLarryActionCentreData).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      USER_ID,
      undefined,
      "active"
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
    expect(executeAction).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      PROJECT_ID,
      "deadline_change",
      { taskId: "task-1", newDeadline: "2026-04-10" },
      USER_ID
    );
    expect(insertProjectMemoryEntry).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      PROJECT_ID,
      expect.objectContaining({
        source: "Action Centre",
        sourceKind: "action",
        sourceRecordId: EVENT_ID,
      })
    );
  });

  it("accepts calendar_event_create suggestions through Google Calendar execution", async () => {
    vi.mocked(getLarryEventForMutation).mockResolvedValue({
      id: EVENT_ID,
      projectId: PROJECT_ID,
      eventType: "suggested",
      actionType: "calendar_event_create",
      payload: {
        summary: "Customer kickoff",
        startDateTime: "2026-04-03T10:00:00Z",
        endDateTime: "2026-04-03T10:30:00Z",
        description: "Prep call",
        location: null,
        attendees: ["pm@example.com"],
        calendarId: null,
        timeZone: "UTC",
      },
    });
    vi.mocked(createGoogleCalendarEvent).mockResolvedValue({
      id: "google-event-create-1",
      status: "confirmed",
      htmlLink: "https://calendar.google.com/event?eid=create-1",
    });
    vi.mocked(markLarryEventAccepted).mockResolvedValue(undefined);
    vi.mocked(listLarryEventSummaries).mockResolvedValue([
      {
        id: EVENT_ID,
        projectId: PROJECT_ID,
        projectName: "Alpha Launch",
        eventType: "accepted",
        actionType: "calendar_event_create",
        displayText: "Create customer kickoff event",
        reasoning: "User asked to schedule a kickoff.",
        payload: {},
        executedAt: "2026-03-31T11:10:00.000Z",
        triggeredBy: "chat",
        chatMessage: "Schedule kickoff",
        createdAt: "2026-03-31T11:05:00.000Z",
        conversationId: CONVERSATION_ID,
        requestMessageId: null,
        responseMessageId: null,
        requestedByUserId: USER_ID,
        requestedByName: "pm",
        approvedByUserId: USER_ID,
        approvedByName: "pm",
        approvedAt: "2026-03-31T11:10:00.000Z",
        dismissedByUserId: null,
        dismissedByName: null,
        dismissedAt: null,
        executedByKind: "user",
        executedByUserId: USER_ID,
        executedByName: "pm",
        executionMode: "approval",
        sourceKind: "chat",
        sourceRecordId: "source-calendar-create",
        conversationTitle: "Schedule kickoff",
        requestMessagePreview: "Schedule kickoff",
        responseMessagePreview: "Prepared for approval.",
      },
    ]);

    const app = await createTestApp();
    appsToClose.push(app);
    const queryTenant = (
      app.db as unknown as { queryTenant: ReturnType<typeof vi.fn> }
    ).queryTenant;
    queryTenant.mockImplementation(async (_tenantId: string, sql: string) => {
      if (sql.includes("FROM google_calendar_installations")) {
        return [
          {
            id: "google-install-1",
            project_id: PROJECT_ID,
            google_calendar_id: "primary",
            google_access_token: "calendar-access-token",
            google_refresh_token: "calendar-refresh-token",
            token_expires_at: "2099-01-01T00:00:00.000Z",
          },
        ];
      }
      return [];
    });

    const response = await app.inject({
      method: "POST",
      url: `/larry/events/${EVENT_ID}/accept`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      accepted: true,
      entity: {
        operation: "calendar_event_create",
        calendarId: "primary",
        eventId: "google-event-create-1",
      },
    });
    expect(createGoogleCalendarEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "calendar-access-token",
        calendarId: "primary",
        summary: "Customer kickoff",
      })
    );
    expect(refreshGoogleAccessToken).not.toHaveBeenCalled();
    expect(updateGoogleCalendarEvent).not.toHaveBeenCalled();
    expect(executeAction).not.toHaveBeenCalled();
  });

  it("accepts calendar_event_update suggestions and refreshes expired Google tokens", async () => {
    vi.mocked(getLarryEventForMutation).mockResolvedValue({
      id: EVENT_ID,
      projectId: PROJECT_ID,
      eventType: "suggested",
      actionType: "calendar_event_update",
      payload: {
        eventId: "google-event-abc",
        summary: "Kickoff (updated)",
        startDateTime: "2026-04-03T11:00:00Z",
        endDateTime: "2026-04-03T11:30:00Z",
        description: null,
        location: "Board room",
        attendees: ["pm@example.com", "ops@example.com"],
        calendarId: null,
        timeZone: "UTC",
      },
    });
    vi.mocked(refreshGoogleAccessToken).mockResolvedValue({
      accessToken: "fresh-access-token",
      refreshToken: "fresh-refresh-token",
      scope: "https://www.googleapis.com/auth/calendar",
      expiresAt: "2026-04-01T12:00:00.000Z",
      tokenType: "Bearer",
    });
    vi.mocked(updateGoogleCalendarEvent).mockResolvedValue({
      id: "google-event-abc",
      status: "confirmed",
      htmlLink: "https://calendar.google.com/event?eid=abc",
    });
    vi.mocked(markLarryEventAccepted).mockResolvedValue(undefined);
    vi.mocked(listLarryEventSummaries).mockResolvedValue([
      {
        id: EVENT_ID,
        projectId: PROJECT_ID,
        projectName: "Alpha Launch",
        eventType: "accepted",
        actionType: "calendar_event_update",
        displayText: "Update kickoff event",
        reasoning: "User requested a reschedule.",
        payload: {},
        executedAt: "2026-03-31T11:20:00.000Z",
        triggeredBy: "chat",
        chatMessage: "Reschedule kickoff",
        createdAt: "2026-03-31T11:15:00.000Z",
        conversationId: CONVERSATION_ID,
        requestMessageId: null,
        responseMessageId: null,
        requestedByUserId: USER_ID,
        requestedByName: "pm",
        approvedByUserId: USER_ID,
        approvedByName: "pm",
        approvedAt: "2026-03-31T11:20:00.000Z",
        dismissedByUserId: null,
        dismissedByName: null,
        dismissedAt: null,
        executedByKind: "user",
        executedByUserId: USER_ID,
        executedByName: "pm",
        executionMode: "approval",
        sourceKind: "chat",
        sourceRecordId: "source-calendar-update",
        conversationTitle: "Reschedule kickoff",
        requestMessagePreview: "Reschedule kickoff",
        responseMessagePreview: "Prepared for approval.",
      },
    ]);

    const app = await createTestApp();
    appsToClose.push(app);
    const queryTenant = (
      app.db as unknown as { queryTenant: ReturnType<typeof vi.fn> }
    ).queryTenant;
    queryTenant.mockImplementation(async (_tenantId: string, sql: string) => {
      if (sql.includes("FROM google_calendar_installations")) {
        return [
          {
            id: "google-install-2",
            project_id: PROJECT_ID,
            google_calendar_id: "primary",
            google_access_token: "expired-access-token",
            google_refresh_token: "refresh-token-2",
            token_expires_at: "2026-03-31T00:00:00.000Z",
          },
        ];
      }
      if (sql.includes("UPDATE google_calendar_installations")) {
        return [];
      }
      return [];
    });

    const response = await app.inject({
      method: "POST",
      url: `/larry/events/${EVENT_ID}/accept`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      accepted: true,
      entity: {
        operation: "calendar_event_update",
        calendarId: "primary",
        eventId: "google-event-abc",
      },
    });
    expect(refreshGoogleAccessToken).toHaveBeenCalledWith({
      clientId: "google-client-id",
      clientSecret: "google-client-secret",
      refreshToken: "refresh-token-2",
    });
    expect(updateGoogleCalendarEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "fresh-access-token",
        calendarId: "primary",
        eventId: "google-event-abc",
      })
    );
    expect(
      queryTenant.mock.calls.some(
        (call) => typeof call[1] === "string" && (call[1] as string).includes("UPDATE google_calendar_installations")
      )
    ).toBe(true);
    expect(executeAction).not.toHaveBeenCalled();
  });

  it("returns 422 for calendar accept when no project-linked Google installation exists", async () => {
    vi.mocked(getLarryEventForMutation).mockResolvedValue({
      id: EVENT_ID,
      projectId: PROJECT_ID,
      eventType: "suggested",
      actionType: "calendar_event_create",
      payload: {
        summary: "Kickoff",
        startDateTime: "2026-04-03T10:00:00Z",
        endDateTime: "2026-04-03T10:30:00Z",
      },
    });

    const app = await createTestApp();
    appsToClose.push(app);
    const queryTenant = (
      app.db as unknown as { queryTenant: ReturnType<typeof vi.fn> }
    ).queryTenant;
    queryTenant.mockImplementation(async (_tenantId: string, sql: string) => {
      if (sql.includes("FROM google_calendar_installations")) {
        return [];
      }
      return [];
    });

    const response = await app.inject({
      method: "POST",
      url: `/larry/events/${EVENT_ID}/accept`,
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({
      message: expect.stringContaining("No calendar connector is linked to this project"),
    });
    expect(markLarryEventAccepted).not.toHaveBeenCalled();
    expect(createGoogleCalendarEvent).not.toHaveBeenCalled();
    expect(updateGoogleCalendarEvent).not.toHaveBeenCalled();
    expect(executeAction).not.toHaveBeenCalled();
  });

  it("accepts collaborator and note action types through the same accept flow", async () => {
    const scenarios = [
      {
        eventId: "77777777-1111-4111-8111-111111111111",
        actionType: "collaborator_add",
        payload: {
          userId: "99999999-1111-4111-8111-111111111111",
          role: "viewer",
          displayName: "Alex",
        },
      },
      {
        eventId: "77777777-2222-4222-8222-222222222222",
        actionType: "collaborator_role_update",
        payload: {
          userId: "99999999-2222-4222-8222-222222222222",
          role: "editor",
          displayName: "Marcus",
        },
      },
      {
        eventId: "77777777-3333-4333-8333-333333333333",
        actionType: "collaborator_remove",
        payload: {
          userId: "99999999-3333-4333-8333-333333333333",
          displayName: "Taylor",
        },
      },
      {
        eventId: "77777777-4444-4444-8444-444444444444",
        actionType: "project_note_send",
        payload: {
          visibility: "personal",
          content: "Please share your latest QA status update by EOD.",
          recipientUserId: "99999999-4444-4444-8444-444444444444",
          recipientName: "Jordan",
        },
      },
    ] as const;

    const app = await createTestApp();
    appsToClose.push(app);

    for (const scenario of scenarios) {
      vi.mocked(getLarryEventForMutation).mockResolvedValueOnce({
        id: scenario.eventId,
        projectId: PROJECT_ID,
        eventType: "suggested",
        actionType: scenario.actionType,
        payload: scenario.payload,
      });
      vi.mocked(executeAction).mockResolvedValueOnce({ ok: true });
      vi.mocked(markLarryEventAccepted).mockResolvedValueOnce(undefined);
      vi.mocked(listLarryEventSummaries).mockResolvedValueOnce([
        {
          id: scenario.eventId,
          projectId: PROJECT_ID,
          projectName: "Alpha Launch",
          eventType: "accepted",
          actionType: scenario.actionType,
          displayText: "Accepted action",
          reasoning: "User approved suggestion.",
          payload: scenario.payload,
          executedAt: "2026-03-30T12:00:00.000Z",
          triggeredBy: "chat",
          chatMessage: "please do it",
          createdAt: "2026-03-30T11:59:00.000Z",
          conversationId: CONVERSATION_ID,
          requestMessageId: null,
          responseMessageId: null,
          requestedByUserId: USER_ID,
          requestedByName: "pm",
          approvedByUserId: USER_ID,
          approvedByName: "pm",
          approvedAt: "2026-03-30T12:00:00.000Z",
          dismissedByUserId: null,
          dismissedByName: null,
          dismissedAt: null,
          executedByKind: "user",
          executedByUserId: USER_ID,
          executedByName: "pm",
          executionMode: "approval",
          sourceKind: "chat",
          sourceRecordId: "source-new",
          conversationTitle: "please do it",
          requestMessagePreview: "please do it",
          responseMessagePreview: "Accepted action",
        },
      ]);

      const response = await app.inject({
        method: "POST",
        url: `/larry/events/${scenario.eventId}/accept`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        accepted: true,
        event: {
          id: scenario.eventId,
          actionType: scenario.actionType,
        },
      });
      const expectedPayload =
        scenario.actionType === "project_note_send"
          ? {
              ...scenario.payload,
              sourceKind: "action",
              sourceRecordId: scenario.eventId,
            }
          : scenario.payload;
      expect(executeAction).toHaveBeenCalledWith(
        expect.anything(),
        TENANT_ID,
        PROJECT_ID,
        scenario.actionType,
        expectedPayload,
        USER_ID
      );
    }
  });

  it("blocks accept when caller cannot manage project collaborators/actions", async () => {
    vi.mocked(getProjectMembershipAccess).mockResolvedValue({
      projectExists: true,
      projectRole: "viewer",
      canRead: true,
      canManage: false,
    });
    vi.mocked(getLarryEventForMutation).mockResolvedValue({
      id: EVENT_ID,
      projectId: PROJECT_ID,
      eventType: "suggested",
      actionType: "project_create",
      payload: { name: "New project from suggestion", description: "desc", tasks: [] },
    });

    const app = await createTestApp();
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: `/larry/events/${EVENT_ID}/accept`,
    });

    expect(response.statusCode).toBe(403);
    expect(executeAction).not.toHaveBeenCalled();
  });

  it("blocks accepting suggested events when the project is archived", async () => {
    vi.mocked(getProjectMembershipAccess).mockResolvedValue({
      projectExists: true,
      projectStatus: "archived",
      projectRole: "owner",
      canRead: true,
      canManage: true,
    });
    vi.mocked(getLarryEventForMutation).mockResolvedValue({
      id: EVENT_ID,
      projectId: PROJECT_ID,
      eventType: "suggested",
      actionType: "deadline_change",
      payload: { taskId: "task-1", newDeadline: "2026-04-10" },
    });

    const app = await createTestApp();
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: `/larry/events/${EVENT_ID}/accept`,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      message: "Archived projects are read-only. Unarchive the project before making changes.",
    });
    expect(executeAction).not.toHaveBeenCalled();
    expect(markLarryEventAccepted).not.toHaveBeenCalled();
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

  it("blocks dismissing suggested events when the project is archived", async () => {
    vi.mocked(getProjectMembershipAccess).mockResolvedValue({
      projectExists: true,
      projectStatus: "archived",
      projectRole: "owner",
      canRead: true,
      canManage: true,
    });
    vi.mocked(getLarryEventForMutation).mockResolvedValue({
      id: EVENT_ID,
      projectId: PROJECT_ID,
      eventType: "suggested",
      actionType: "deadline_change",
      payload: { taskId: "task-1", newDeadline: "2026-04-10" },
    });

    const app = await createTestApp();
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: `/larry/events/${EVENT_ID}/dismiss`,
      payload: { reason: "Not needed" },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      message: "Archived projects are read-only. Unarchive the project before making changes.",
    });
    expect(markLarryEventDismissed).not.toHaveBeenCalled();
  });

  it("returns project memory entries with optional source filter", async () => {
    vi.mocked(listProjectMemoryEntries).mockResolvedValue([
      {
        id: "memory-1",
        source: "Larry chat",
        sourceKind: "chat",
        sourceRecordId: "msg-1",
        content: "User asked for launch risks and Larry suggested a mitigation plan.",
        createdAt: "2026-03-30T19:00:00.000Z",
      },
    ]);

    const app = await createTestApp();
    appsToClose.push(app);

    const response = await app.inject({
      method: "GET",
      url: `/larry/memory?projectId=${PROJECT_ID}&sourceKind=chat&limit=10`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      items: [
        {
          id: "memory-1",
          sourceKind: "chat",
          sourceRecordId: "msg-1",
        },
      ],
    });
    expect(listProjectMemoryEntries).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      PROJECT_ID,
      {
        sourceKind: "chat",
        limit: 10,
      }
    );
  });

  it("returns 400 when projectId is missing for /larry/memory", async () => {
    const app = await createTestApp();
    appsToClose.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/larry/memory?sourceKind=chat",
    });

    expect(response.statusCode).toBe(400);
    expect(listProjectMemoryEntries).not.toHaveBeenCalled();
  });
});
