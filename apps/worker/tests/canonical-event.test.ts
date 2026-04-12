import { afterEach, describe, expect, it, vi } from "vitest";

const contextMocks = vi.hoisted(() => ({
  queryTenant: vi.fn(),
  tx: vi.fn(),
}));

vi.mock("../src/context.js", () => ({
  db: { queryTenant: contextMocks.queryTenant, tx: contextMocks.tx },
  env: { MODEL_PROVIDER: "mock" },
}));

vi.mock("../src/escalation.js", () => ({
  runEscalationScan: vi.fn(),
}));

vi.mock("../src/calendar-renewal.js", () => ({
  runCalendarWebhookRenewal: vi.fn(),
}));

vi.mock("@larry/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@larry/ai")>();
  return {
    ...actual,
    generateBootstrapFromTranscript: vi.fn(),
    runIntelligence: vi.fn(),
  };
});

vi.mock("@larry/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@larry/db")>();
  return {
    ...actual,
    getProjectSnapshot: vi.fn(),
    insertProjectMemoryEntry: vi.fn(),
    listLarryEventIdsBySource: vi.fn(),
    runAutoActions: vi.fn(),
    storeSuggestions: vi.fn(),
  };
});

import { generateBootstrapFromTranscript, runIntelligence } from "@larry/ai";
import {
  getProjectSnapshot,
  insertProjectMemoryEntry,
  listLarryEventIdsBySource,
  runAutoActions,
  storeSuggestions,
} from "@larry/db";
import { processQueueJob } from "../src/handlers.js";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const MEETING_NOTE_ID = "44444444-4444-4444-8444-444444444444";
const CANONICAL_EVENT_ID = "55555555-5555-4555-8555-555555555555";
const EMAIL_CANONICAL_EVENT_ID = "66666666-6666-4666-8666-666666666666";
const SLACK_CANONICAL_EVENT_ID = "77777777-7777-4777-8777-777777777777";
const CALENDAR_CANONICAL_EVENT_ID = "88888888-8888-4888-8888-888888888888";
const SLACK_TEAM_ID = "T12345";
const SLACK_CHANNEL_ID = "C67890";

afterEach(() => {
  vi.clearAllMocks();
  contextMocks.queryTenant.mockReset();
  contextMocks.tx.mockReset();
  contextMocks.queryTenant.mockResolvedValue([]);
  contextMocks.tx.mockResolvedValue(undefined);
});

function createCanonicalEventJob(payload: Record<string, unknown>) {
  return {
    name: "canonical_event.created",
    data: {
      type: "canonical_event.created",
      tenantId: TENANT_ID,
      payload,
    },
  };
}

function createSnapshot(projectId = PROJECT_ID) {
  return {
    project: {
      id: projectId,
      tenantId: TENANT_ID,
      name: "Launch",
      description: null,
      status: "active",
      riskScore: 12,
      riskLevel: "low",
      startDate: null,
      targetDate: null,
    },
    tasks: [],
    team: [],
    recentActivity: [],
    signals: [],
    generatedAt: "2026-03-29T10:00:00.000Z",
  };
}

describe("processQueueJob canonical_event.created", () => {
  it("processes transcript events once and reconciles meeting note metadata from source-linked events", async () => {
    contextMocks.queryTenant.mockImplementation(async (_tenantId, sql) => {
      const statement = String(sql);
      if (statement.includes("FROM canonical_events")) {
        return [
          {
            id: CANONICAL_EVENT_ID,
            source: "transcript",
            payload: {
              transcript: "Transcript body with enough context to produce actions.",
              meetingNoteId: MEETING_NOTE_ID,
              projectId: PROJECT_ID,
              submittedByUserId: USER_ID,
            },
          },
        ];
      }
      if (statement.includes("FROM meeting_notes")) {
        return [{ id: MEETING_NOTE_ID, project_id: PROJECT_ID, title: "Weekly sync", summary: null }];
      }
      if (statement.includes("FROM folders")) {
        return [{ id: "folder-1" }];
      }
      if (statement.includes("FROM documents")) {
        return [];
      }
      return [];
    });

    vi.mocked(listLarryEventIdsBySource)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(["ev-suggest-1"]);
    vi.mocked(generateBootstrapFromTranscript).mockResolvedValue({
      summary: "The meeting surfaced one urgent follow-up.",
      tasks: [
        {
          title: "Meeting follow-up",
          description: "The team committed to a new deliverable.",
          priority: "high",
          workstream: null,
          dueDate: null,
        },
      ],
    });
    vi.mocked(storeSuggestions).mockResolvedValue({
      executedCount: 0,
      suggestedCount: 1,
      eventIds: ["ev-suggest-1"],
    });

    await processQueueJob(createCanonicalEventJob({ canonicalEventId: CANONICAL_EVENT_ID }) as never);

    expect(generateBootstrapFromTranscript).toHaveBeenCalledWith(expect.anything(), {
      projectName: "Weekly sync",
      meetingTitle: "Weekly sync",
      transcript: "Transcript body with enough context to produce actions.",
    });
    expect(runAutoActions).not.toHaveBeenCalled();
    expect(storeSuggestions).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      PROJECT_ID,
      "signal",
      [
        expect.objectContaining({
          type: "task_create",
          displayText: 'Create task: "Meeting follow-up"',
        }),
      ],
      undefined,
      {
        requesterUserId: USER_ID,
        sourceKind: "meeting",
        sourceRecordId: MEETING_NOTE_ID,
      }
    );
    expect(insertProjectMemoryEntry).toHaveBeenCalledWith(expect.anything(), TENANT_ID, PROJECT_ID, {
      source: "Meeting transcript",
      sourceKind: "meeting",
      sourceRecordId: MEETING_NOTE_ID,
      content: expect.stringContaining("Meeting:"),
    });

    const updateCalls = contextMocks.queryTenant.mock.calls.filter(([, sql]) =>
      String(sql).includes("UPDATE meeting_notes")
    );
    expect(updateCalls).toHaveLength(2);
    expect(updateCalls[0]?.[2]).toEqual([
      TENANT_ID,
      MEETING_NOTE_ID,
      PROJECT_ID,
      "The meeting surfaced one urgent follow-up.",
      1,
    ]);
    expect(updateCalls[1]?.[2]).toEqual([
      TENANT_ID,
      MEETING_NOTE_ID,
      PROJECT_ID,
      "The meeting surfaced one urgent follow-up.",
      1,
    ]);

    const insertDocumentCall = contextMocks.queryTenant.mock.calls.find(([, sql]) =>
      String(sql).includes("INSERT INTO documents")
    );
    expect(insertDocumentCall?.[2]).toEqual([
      TENANT_ID,
      PROJECT_ID,
      "folder-1",
      "Weekly sync analysis",
      "The meeting surfaced one urgent follow-up.",
      MEETING_NOTE_ID,
      expect.any(String),
      USER_ID,
    ]);
  });

  it("updates the existing transcript analysis document on replay without duplicating suggestions", async () => {
    contextMocks.queryTenant.mockImplementation(async (_tenantId, sql) => {
      const statement = String(sql);
      if (statement.includes("FROM canonical_events")) {
        return [
          {
            id: CANONICAL_EVENT_ID,
            source: "transcript",
            payload: {
              transcript: "Transcript body with enough context to produce actions.",
              meetingNoteId: MEETING_NOTE_ID,
              projectId: PROJECT_ID,
              submittedByUserId: USER_ID,
            },
          },
        ];
      }
      if (statement.includes("FROM meeting_notes")) {
        return [
          {
            id: MEETING_NOTE_ID,
            project_id: PROJECT_ID,
            title: "Weekly sync",
            summary: "Existing transcript analysis",
          },
        ];
      }
      if (statement.includes("FROM folders")) {
        return [{ id: "folder-1" }];
      }
      if (statement.includes("FROM documents")) {
        return [{ id: "doc-1" }];
      }
      return [];
    });

    vi.mocked(listLarryEventIdsBySource).mockResolvedValueOnce(["existing-event-1"]);

    await processQueueJob(createCanonicalEventJob({ canonicalEventId: CANONICAL_EVENT_ID }) as never);

    expect(generateBootstrapFromTranscript).not.toHaveBeenCalled();
    expect(getProjectSnapshot).not.toHaveBeenCalled();
    expect(runIntelligence).not.toHaveBeenCalled();
    expect(runAutoActions).not.toHaveBeenCalled();
    expect(storeSuggestions).not.toHaveBeenCalled();
    expect(insertProjectMemoryEntry).not.toHaveBeenCalled();

    const updateCall = contextMocks.queryTenant.mock.calls.find(([, sql]) =>
      String(sql).includes("UPDATE meeting_notes")
    );
    expect(updateCall?.[2]).toEqual([
      TENANT_ID,
      MEETING_NOTE_ID,
      PROJECT_ID,
      null,
      1,
    ]);

    const updateDocumentCall = contextMocks.queryTenant.mock.calls.find(([, sql]) =>
      String(sql).includes("UPDATE documents")
    );
    expect(updateDocumentCall?.[2]).toEqual([
      TENANT_ID,
      "doc-1",
      PROJECT_ID,
      "folder-1",
      "Weekly sync analysis",
      "Existing transcript analysis",
      expect.any(String),
    ]);
  });

  it("skips replayed transcript jobs without an existing summary document payload", async () => {
    contextMocks.queryTenant.mockImplementation(async (_tenantId, sql) => {
      const statement = String(sql);
      if (statement.includes("FROM canonical_events")) {
        return [
          {
            id: CANONICAL_EVENT_ID,
            source: "transcript",
            payload: {
              transcript: "Transcript body with enough context to produce actions.",
              meetingNoteId: MEETING_NOTE_ID,
              projectId: PROJECT_ID,
            },
          },
        ];
      }
      if (statement.includes("FROM meeting_notes")) {
        return [{ id: MEETING_NOTE_ID, project_id: PROJECT_ID, title: "Weekly sync", summary: null }];
      }
      return [];
    });

    vi.mocked(listLarryEventIdsBySource).mockResolvedValueOnce(["existing-event-1"]);

    await processQueueJob(createCanonicalEventJob({ canonicalEventId: CANONICAL_EVENT_ID }) as never);

    expect(runIntelligence).not.toHaveBeenCalled();
    expect(runAutoActions).not.toHaveBeenCalled();
    expect(storeSuggestions).not.toHaveBeenCalled();
    expect(insertProjectMemoryEntry).not.toHaveBeenCalled();

    const updateCall = contextMocks.queryTenant.mock.calls.find(([, sql]) =>
      String(sql).includes("UPDATE meeting_notes")
    );
    expect(updateCall?.[2]).toEqual([
      TENANT_ID,
      MEETING_NOTE_ID,
      PROJECT_ID,
      null,
      1,
    ]);
  });

  it("fails transcript processing without writing the extraction error into the meeting summary", async () => {
    contextMocks.queryTenant.mockImplementation(async (_tenantId, sql) => {
      const statement = String(sql);
      if (statement.includes("FROM canonical_events")) {
        return [
          {
            id: CANONICAL_EVENT_ID,
            source: "transcript",
            payload: {
              transcript: "Transcript body with enough context to produce actions.",
              meetingNoteId: MEETING_NOTE_ID,
              projectId: PROJECT_ID,
              submittedByUserId: USER_ID,
            },
          },
        ];
      }
      if (statement.includes("FROM meeting_notes")) {
        return [{ id: MEETING_NOTE_ID, project_id: PROJECT_ID, title: "Weekly sync", summary: null }];
      }
      return [];
    });

    vi.mocked(listLarryEventIdsBySource).mockResolvedValueOnce([]);
    vi.mocked(generateBootstrapFromTranscript).mockRejectedValueOnce(
      new Error("Your project has exceeded its monthly spending cap.")
    );

    await expect(
      processQueueJob(createCanonicalEventJob({ canonicalEventId: CANONICAL_EVENT_ID }) as never)
    ).rejects.toThrow("Your project has exceeded its monthly spending cap.");

    const updateCalls = contextMocks.queryTenant.mock.calls.filter(([, sql]) =>
      String(sql).includes("UPDATE meeting_notes")
    );
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]?.[2]).toEqual([
      TENANT_ID,
      MEETING_NOTE_ID,
      PROJECT_ID,
      null,
      0,
    ]);

    expect(
      contextMocks.queryTenant.mock.calls.some(([, sql]) => String(sql).includes("INSERT INTO documents"))
    ).toBe(false);
    expect(storeSuggestions).not.toHaveBeenCalled();
    expect(insertProjectMemoryEntry).not.toHaveBeenCalled();
  });

  it("processes email canonical events with project scope into the Larry ledger", async () => {
    contextMocks.queryTenant.mockResolvedValueOnce([
      {
        id: EMAIL_CANONICAL_EVENT_ID,
        source: "email",
        payload: {
          projectId: PROJECT_ID,
          from: "ops@example.com",
          subject: "Launch prep follow-up",
          bodyText: "Please follow up on the launch prep checklist.",
          threadId: "thread-1",
        },
      },
    ]);

    vi.mocked(listLarryEventIdsBySource).mockResolvedValueOnce([]);
    vi.mocked(getProjectSnapshot).mockResolvedValue(createSnapshot());
    vi.mocked(runIntelligence).mockResolvedValue({
      briefing: "The email indicates one follow-up for launch prep.",
      autoActions: [],
      suggestedActions: [
        {
          type: "task_create",
          displayText: "Create launch prep follow-up task",
          reasoning: "The inbound email requests launch prep follow-up.",
          payload: { title: "Follow up on launch prep checklist" },
        },
      ],
    });
    vi.mocked(runAutoActions).mockResolvedValue({
      executedCount: 0,
      suggestedCount: 0,
      eventIds: [],
    });
    vi.mocked(storeSuggestions).mockResolvedValue({
      executedCount: 0,
      suggestedCount: 1,
      eventIds: ["ev-email-suggest-1"],
    });

    await processQueueJob(createCanonicalEventJob({ canonicalEventId: EMAIL_CANONICAL_EVENT_ID }) as never);

    expect(listLarryEventIdsBySource).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      "email",
      EMAIL_CANONICAL_EVENT_ID
    );
    expect(runIntelligence).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.stringContaining('subject: "Launch prep follow-up"')
    );
    expect(runIntelligence).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.stringContaining('email signal from "ops@example.com"')
    );
    expect(runAutoActions).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      PROJECT_ID,
      "signal",
      expect.any(Array),
      undefined,
      {
        sourceKind: "email",
        sourceRecordId: EMAIL_CANONICAL_EVENT_ID,
      }
    );
    expect(storeSuggestions).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      PROJECT_ID,
      "signal",
      expect.any(Array),
      undefined,
      {
        sourceKind: "email",
        sourceRecordId: EMAIL_CANONICAL_EVENT_ID,
      }
    );
    expect(insertProjectMemoryEntry).toHaveBeenCalledWith(expect.anything(), TENANT_ID, PROJECT_ID, {
      source: "Email signal",
      sourceKind: "email",
      sourceRecordId: EMAIL_CANONICAL_EVENT_ID,
      content: expect.stringContaining("Email:"),
    });
  });

  it("skips replayed email canonical events when source-linked email events already exist", async () => {
    contextMocks.queryTenant.mockResolvedValueOnce([
      {
        id: EMAIL_CANONICAL_EVENT_ID,
        source: "email",
        payload: {
          projectId: PROJECT_ID,
          from: "ops@example.com",
          subject: "Launch prep follow-up",
          bodyText: "Please follow up on the launch prep checklist.",
        },
      },
    ]);

    vi.mocked(listLarryEventIdsBySource).mockResolvedValueOnce(["existing-email-event-1"]);

    await processQueueJob(createCanonicalEventJob({ canonicalEventId: EMAIL_CANONICAL_EVENT_ID }) as never);

    expect(getProjectSnapshot).not.toHaveBeenCalled();
    expect(runIntelligence).not.toHaveBeenCalled();
    expect(runAutoActions).not.toHaveBeenCalled();
    expect(storeSuggestions).not.toHaveBeenCalled();
    expect(insertProjectMemoryEntry).not.toHaveBeenCalled();
  });

  it("processes Slack canonical events, auto-learns channel mapping, and writes source-linked ledger rows", async () => {
    contextMocks.queryTenant
      .mockResolvedValueOnce([
        {
          id: SLACK_CANONICAL_EVENT_ID,
          source: "slack",
          payload: {
            team_id: SLACK_TEAM_ID,
            projectId: PROJECT_ID,
            event: {
              channel: SLACK_CHANNEL_ID,
              user: "U12345",
              text: "We are blocked on legal approval",
            },
          },
        },
      ])
      .mockResolvedValueOnce([]);

    vi.mocked(listLarryEventIdsBySource).mockResolvedValueOnce([]);
    vi.mocked(getProjectSnapshot).mockResolvedValue(createSnapshot());
    vi.mocked(runIntelligence).mockResolvedValue({
      briefing: "Slack indicates one blocker that needs follow-up.",
      autoActions: [],
      suggestedActions: [
        {
          type: "task_create",
          displayText: "Create legal approval unblocker task",
          reasoning: "Slack message reports a legal blocker.",
          payload: { title: "Unblock legal approval" },
        },
      ],
    });
    vi.mocked(runAutoActions).mockResolvedValue({
      executedCount: 0,
      suggestedCount: 0,
      eventIds: [],
    });
    vi.mocked(storeSuggestions).mockResolvedValue({
      executedCount: 0,
      suggestedCount: 1,
      eventIds: ["ev-slack-suggest-1"],
    });

    await processQueueJob(createCanonicalEventJob({ canonicalEventId: SLACK_CANONICAL_EVENT_ID }) as never);

    expect(getProjectSnapshot).toHaveBeenCalledWith(expect.anything(), TENANT_ID, PROJECT_ID);
    expect(runIntelligence).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.stringContaining(`channel "${SLACK_CHANNEL_ID}"`)
    );
    expect(runAutoActions).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      PROJECT_ID,
      "signal",
      expect.any(Array),
      undefined,
      {
        sourceKind: "slack",
        sourceRecordId: SLACK_CANONICAL_EVENT_ID,
      }
    );
    expect(insertProjectMemoryEntry).toHaveBeenCalledWith(expect.anything(), TENANT_ID, PROJECT_ID, {
      source: "Slack signal",
      sourceKind: "slack",
      sourceRecordId: SLACK_CANONICAL_EVENT_ID,
      content: expect.stringContaining("Slack:"),
    });
    expect(storeSuggestions).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      PROJECT_ID,
      "signal",
      expect.any(Array),
      undefined,
      {
        sourceKind: "slack",
        sourceRecordId: SLACK_CANONICAL_EVENT_ID,
      }
    );

    const mappingUpsertCall = contextMocks.queryTenant.mock.calls.find(([, sql]) =>
      String(sql).includes("INSERT INTO slack_channel_project_mappings")
    );
    expect(mappingUpsertCall?.[2]).toEqual([
      TENANT_ID,
      SLACK_TEAM_ID,
      SLACK_CHANNEL_ID,
      PROJECT_ID,
    ]);
  });

  it("processes Slack events via mapped channel scope when project hints are absent", async () => {
    contextMocks.queryTenant
      .mockResolvedValueOnce([
        {
          id: SLACK_CANONICAL_EVENT_ID,
          source: "slack",
          payload: {
            team_id: SLACK_TEAM_ID,
            event: {
              channel: SLACK_CHANNEL_ID,
              user: "U12345",
              text: "Could we add a launch-readiness task?",
            },
          },
        },
      ])
      .mockResolvedValueOnce([{ project_id: PROJECT_ID }]);

    vi.mocked(listLarryEventIdsBySource).mockResolvedValueOnce([]);
    vi.mocked(getProjectSnapshot).mockResolvedValue(createSnapshot());
    vi.mocked(runIntelligence).mockResolvedValue({
      briefing: "Slack suggests one follow-up task.",
      autoActions: [],
      suggestedActions: [
        {
          type: "task_create",
          displayText: "Create launch-readiness follow-up task",
          reasoning: "Slack asks for a new launch-readiness action.",
          payload: { title: "Launch readiness follow-up" },
        },
      ],
    });
    vi.mocked(runAutoActions).mockResolvedValue({
      executedCount: 0,
      suggestedCount: 0,
      eventIds: [],
    });
    vi.mocked(storeSuggestions).mockResolvedValue({
      executedCount: 0,
      suggestedCount: 1,
      eventIds: ["ev-slack-suggest-2"],
    });

    await processQueueJob(createCanonicalEventJob({ canonicalEventId: SLACK_CANONICAL_EVENT_ID }) as never);

    expect(getProjectSnapshot).toHaveBeenCalledWith(expect.anything(), TENANT_ID, PROJECT_ID);
    const mappingLookupCall = contextMocks.queryTenant.mock.calls.find(([, sql]) =>
      String(sql).includes("FROM slack_channel_project_mappings")
    );
    expect(mappingLookupCall?.[2]).toEqual([TENANT_ID, SLACK_TEAM_ID, SLACK_CHANNEL_ID]);
    expect(
      contextMocks.queryTenant.mock.calls.some(([, sql]) =>
        String(sql).includes("INSERT INTO slack_channel_project_mappings")
      )
    ).toBe(false);
  });

  it("skips replayed Slack canonical events when source-linked Slack events already exist", async () => {
    contextMocks.queryTenant.mockResolvedValueOnce([
      {
        id: SLACK_CANONICAL_EVENT_ID,
        source: "slack",
        payload: {
          team_id: SLACK_TEAM_ID,
          projectId: PROJECT_ID,
          event: {
            channel: SLACK_CHANNEL_ID,
            text: "Replay should be ignored.",
          },
        },
      },
    ]);

    vi.mocked(listLarryEventIdsBySource).mockResolvedValueOnce(["existing-slack-event-1"]);

    await processQueueJob(createCanonicalEventJob({ canonicalEventId: SLACK_CANONICAL_EVENT_ID }) as never);

    expect(getProjectSnapshot).not.toHaveBeenCalled();
    expect(runIntelligence).not.toHaveBeenCalled();
    expect(runAutoActions).not.toHaveBeenCalled();
    expect(storeSuggestions).not.toHaveBeenCalled();
    expect(insertProjectMemoryEntry).not.toHaveBeenCalled();
  });

  it("processes calendar canonical events with project scope into the Larry ledger", async () => {
    contextMocks.queryTenant.mockResolvedValueOnce([
      {
        id: CALENDAR_CANONICAL_EVENT_ID,
        source: "calendar",
        payload: {
          projectId: PROJECT_ID,
          channelId: "calendar-channel-1",
          resourceState: "exists",
          resourceId: "calendar-resource-1",
          messageNumber: "42",
          body: {
            eventId: "evt-123",
            summary: "Launch sync",
          },
        },
      },
    ]);

    vi.mocked(listLarryEventIdsBySource).mockResolvedValueOnce([]);
    vi.mocked(getProjectSnapshot).mockResolvedValue(createSnapshot());
    vi.mocked(runIntelligence).mockResolvedValue({
      briefing: "Calendar signal indicates one launch follow-up.",
      autoActions: [],
      suggestedActions: [
        {
          type: "task_create",
          displayText: "Create launch sync follow-up task",
          reasoning: "Calendar update indicates a new launch sync action item.",
          payload: { title: "Follow up after launch sync" },
        },
      ],
    });
    vi.mocked(runAutoActions).mockResolvedValue({
      executedCount: 0,
      suggestedCount: 0,
      eventIds: [],
    });
    vi.mocked(storeSuggestions).mockResolvedValue({
      executedCount: 0,
      suggestedCount: 1,
      eventIds: ["ev-calendar-suggest-1"],
    });

    await processQueueJob(createCanonicalEventJob({ canonicalEventId: CALENDAR_CANONICAL_EVENT_ID }) as never);

    expect(listLarryEventIdsBySource).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      "calendar",
      CALENDAR_CANONICAL_EVENT_ID
    );
    expect(runIntelligence).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.stringContaining('resourceState: "exists"')
    );
    expect(runAutoActions).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      PROJECT_ID,
      "signal",
      expect.any(Array),
      undefined,
      {
        sourceKind: "calendar",
        sourceRecordId: CALENDAR_CANONICAL_EVENT_ID,
      }
    );
    expect(storeSuggestions).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      PROJECT_ID,
      "signal",
      expect.any(Array),
      undefined,
      {
        sourceKind: "calendar",
        sourceRecordId: CALENDAR_CANONICAL_EVENT_ID,
      }
    );
    expect(insertProjectMemoryEntry).toHaveBeenCalledWith(expect.anything(), TENANT_ID, PROJECT_ID, {
      source: "Calendar signal",
      sourceKind: "calendar",
      sourceRecordId: CALENDAR_CANONICAL_EVENT_ID,
      content: expect.stringContaining("Calendar:"),
    });
  });

  it("skips replayed calendar canonical events when source-linked calendar events already exist", async () => {
    contextMocks.queryTenant.mockResolvedValueOnce([
      {
        id: CALENDAR_CANONICAL_EVENT_ID,
        source: "calendar",
        payload: {
          projectId: PROJECT_ID,
          channelId: "calendar-channel-1",
          resourceState: "exists",
        },
      },
    ]);

    vi.mocked(listLarryEventIdsBySource).mockResolvedValueOnce(["existing-calendar-event-1"]);

    await processQueueJob(createCanonicalEventJob({ canonicalEventId: CALENDAR_CANONICAL_EVENT_ID }) as never);

    expect(getProjectSnapshot).not.toHaveBeenCalled();
    expect(runIntelligence).not.toHaveBeenCalled();
    expect(runAutoActions).not.toHaveBeenCalled();
    expect(storeSuggestions).not.toHaveBeenCalled();
    expect(insertProjectMemoryEntry).not.toHaveBeenCalled();
  });

  it("processes calendar canonical events via mapped channel fallback when payload project hint is absent", async () => {
    contextMocks.queryTenant
      .mockResolvedValueOnce([
        {
          id: CALENDAR_CANONICAL_EVENT_ID,
          source: "calendar",
          payload: {
            channelId: "calendar-channel-1",
            resourceState: "exists",
            body: {
              summary: "Launch sync without project hint",
            },
          },
        },
      ])
      .mockResolvedValueOnce([{ project_id: PROJECT_ID }]);

    vi.mocked(listLarryEventIdsBySource).mockResolvedValueOnce([]);
    vi.mocked(getProjectSnapshot).mockResolvedValue(createSnapshot());
    vi.mocked(runIntelligence).mockResolvedValue({
      briefing: "Calendar signal maps to the launch project through connector defaults.",
      autoActions: [],
      suggestedActions: [
        {
          type: "task_create",
          displayText: "Create launch sync follow-up task",
          reasoning: "Calendar signal mapped to project via connector link.",
          payload: { title: "Follow up after mapped calendar sync" },
        },
      ],
    });
    vi.mocked(runAutoActions).mockResolvedValue({
      executedCount: 0,
      suggestedCount: 0,
      eventIds: [],
    });
    vi.mocked(storeSuggestions).mockResolvedValue({
      executedCount: 0,
      suggestedCount: 1,
      eventIds: ["ev-calendar-suggest-2"],
    });

    await processQueueJob(createCanonicalEventJob({ canonicalEventId: CALENDAR_CANONICAL_EVENT_ID }) as never);

    expect(getProjectSnapshot).toHaveBeenCalledWith(expect.anything(), TENANT_ID, PROJECT_ID);
    const mappingLookupCall = contextMocks.queryTenant.mock.calls.find(([, sql]) =>
      String(sql).includes("FROM google_calendar_installations")
    );
    expect(mappingLookupCall?.[2]).toEqual([TENANT_ID, "calendar-channel-1"]);
    expect(runAutoActions).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      PROJECT_ID,
      "signal",
      expect.any(Array),
      undefined,
      {
        sourceKind: "calendar",
        sourceRecordId: CALENDAR_CANONICAL_EVENT_ID,
      }
    );
    expect(insertProjectMemoryEntry).toHaveBeenCalledWith(expect.anything(), TENANT_ID, PROJECT_ID, {
      source: "Calendar signal",
      sourceKind: "calendar",
      sourceRecordId: CALENDAR_CANONICAL_EVENT_ID,
      content: expect.stringContaining("Calendar:"),
    });
  });

  it("skips calendar canonical events when no project hint can be resolved", async () => {
    contextMocks.queryTenant
      .mockResolvedValueOnce([
        {
          id: CALENDAR_CANONICAL_EVENT_ID,
          source: "calendar",
          payload: {
            channelId: "calendar-channel-1",
            resourceState: "exists",
            body: {
              summary: "No project hint available",
            },
          },
        },
      ])
      .mockResolvedValueOnce([]);

    vi.mocked(listLarryEventIdsBySource).mockResolvedValueOnce([]);

    await processQueueJob(createCanonicalEventJob({ canonicalEventId: CALENDAR_CANONICAL_EVENT_ID }) as never);

    expect(getProjectSnapshot).not.toHaveBeenCalled();
    expect(runIntelligence).not.toHaveBeenCalled();
    expect(runAutoActions).not.toHaveBeenCalled();
    expect(storeSuggestions).not.toHaveBeenCalled();
    const mappingLookupCall = contextMocks.queryTenant.mock.calls.find(([, sql]) =>
      String(sql).includes("FROM google_calendar_installations")
    );
    expect(mappingLookupCall?.[2]).toEqual([TENANT_ID, "calendar-channel-1"]);
  });

  it("skips Slack canonical events when no project hint or channel mapping can be resolved", async () => {
    contextMocks.queryTenant
      .mockResolvedValueOnce([
        {
          id: SLACK_CANONICAL_EVENT_ID,
          source: "slack",
          payload: {
            team_id: SLACK_TEAM_ID,
            event: {
              channel: SLACK_CHANNEL_ID,
              user: "U12345",
              text: "No mapping yet.",
            },
          },
        },
      ])
      .mockResolvedValueOnce([]);

    vi.mocked(listLarryEventIdsBySource).mockResolvedValueOnce([]);

    await processQueueJob(createCanonicalEventJob({ canonicalEventId: SLACK_CANONICAL_EVENT_ID }) as never);

    expect(getProjectSnapshot).not.toHaveBeenCalled();
    expect(runIntelligence).not.toHaveBeenCalled();
    expect(runAutoActions).not.toHaveBeenCalled();
    expect(storeSuggestions).not.toHaveBeenCalled();
  });
});
