import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/audit.js", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/services/ingest/pipeline.js", () => ({
  insertCanonicalEventRecords: vi.fn(),
  publishCanonicalEventCreated: vi.fn(),
}));

vi.mock("../src/lib/project-memberships.js", () => ({
  createProjectOwnerMembership: vi.fn(),
}));

vi.mock("@larry/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@larry/db")>();
  return {
    ...actual,
    executeTaskCreate: vi.fn(),
    insertProjectMemoryEntry: vi.fn(),
    storeSuggestions: vi.fn(),
  };
});

import Fastify from "fastify";
import sensible from "@fastify/sensible";
import type { Db } from "@larry/db";
import {
  executeTaskCreate,
  insertProjectMemoryEntry,
  storeSuggestions,
} from "@larry/db";
import {
  insertCanonicalEventRecords,
  publishCanonicalEventCreated,
} from "../src/services/ingest/pipeline.js";
import { createProjectOwnerMembership } from "../src/lib/project-memberships.js";
import { projectIntakeRoutes } from "../src/routes/v1/project-intake.js";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const DRAFT_ID = "33333333-3333-4333-8333-333333333333";
const PROJECT_ID = "44444444-4444-4444-8444-444444444444";
const ATTACH_PROJECT_ID = "55555555-5555-4555-8555-555555555555";
const MEETING_NOTE_ID = "66666666-6666-4666-8666-666666666666";
const CANONICAL_EVENT_ID = "77777777-7777-4777-8777-777777777777";

interface DraftRow {
  id: string;
  mode: string;
  status: string;
  project_name: string | null;
  project_description: string | null;
  project_start_date: string | null;
  project_target_date: string | null;
  attach_to_project_id: string | null;
  chat_answers: unknown;
  meeting_title: string | null;
  meeting_transcript: string | null;
  bootstrap_summary: string | null;
  bootstrap_tasks: unknown;
  bootstrap_actions: unknown;
  bootstrap_seed_message: string | null;
  finalized_project_id: string | null;
  finalized_meeting_note_id: string | null;
  finalized_canonical_event_id: string | null;
  finalized_at: string | null;
  created_at: string;
  updated_at: string;
}

function makeDraftRow(overrides: Partial<DraftRow> = {}): DraftRow {
  return {
    id: DRAFT_ID,
    mode: "chat",
    status: "draft",
    project_name: "New Intake Project",
    project_description: "Initial intake description",
    project_start_date: "2026-04-01",
    project_target_date: "2026-05-01",
    attach_to_project_id: null,
    chat_answers: [],
    meeting_title: null,
    meeting_transcript: null,
    bootstrap_summary: null,
    bootstrap_tasks: [],
    bootstrap_actions: [],
    bootstrap_seed_message: null,
    finalized_project_id: null,
    finalized_meeting_note_id: null,
    finalized_canonical_event_id: null,
    finalized_at: null,
    created_at: "2026-03-30T10:00:00.000Z",
    updated_at: "2026-03-30T10:00:00.000Z",
    ...overrides,
  };
}

function createDbStub(input: {
  initialDraft: DraftRow | null;
  attachProjectExists?: boolean;
  createdProjectId?: string;
}) {
  const state = {
    draft: input.initialDraft ? { ...input.initialDraft } : null,
    attachProjectExists: input.attachProjectExists ?? true,
    createdProjectId: input.createdProjectId ?? PROJECT_ID,
  };

  const queryTenant = vi.fn(async (_tenantId: string, sql: string, values: unknown[] = []) => {
    if (sql.includes("INSERT INTO project_intake_drafts")) {
      state.draft = makeDraftRow({
        id: DRAFT_ID,
        mode: String(values[1]),
        status: "draft",
        project_name: values[2] as string | null,
        project_description: values[3] as string | null,
        project_start_date: values[4] as string | null,
        project_target_date: values[5] as string | null,
        attach_to_project_id: values[6] as string | null,
        chat_answers: JSON.parse(String(values[7] ?? "[]")),
        meeting_title: values[8] as string | null,
        meeting_transcript: values[9] as string | null,
      });
      return [{ id: DRAFT_ID }];
    }

    if (sql.includes("FROM project_intake_drafts") && sql.includes("SELECT id, mode, status")) {
      const draftId = values[1];
      if (!state.draft || state.draft.id !== draftId) return [];
      return [{ ...state.draft }];
    }

    if (sql.includes("UPDATE project_intake_drafts") && sql.includes("SET mode = $3")) {
      if (!state.draft) return [];
      state.draft = {
        ...state.draft,
        mode: String(values[2]),
        status: "draft",
        project_name: values[3] as string | null,
        project_description: values[4] as string | null,
        project_start_date: values[5] as string | null,
        project_target_date: values[6] as string | null,
        attach_to_project_id: values[7] as string | null,
        chat_answers: JSON.parse(String(values[8] ?? "[]")),
        meeting_title: values[9] as string | null,
        meeting_transcript: values[10] as string | null,
      };
      return [];
    }

    if (sql.includes("UPDATE project_intake_drafts") && sql.includes("SET status = 'bootstrapped'")) {
      if (!state.draft) return [];
      state.draft = {
        ...state.draft,
        status: "bootstrapped",
        bootstrap_summary: values[2] as string | null,
        bootstrap_tasks: JSON.parse(String(values[3] ?? "[]")),
        bootstrap_actions: JSON.parse(String(values[4] ?? "[]")),
        bootstrap_seed_message: values[5] as string | null,
      };
      return [];
    }

    if (sql.includes("INSERT INTO projects")) {
      return [{ id: state.createdProjectId }];
    }

    if (sql.includes("FROM projects") && sql.includes("WHERE tenant_id = $1")) {
      if (!state.attachProjectExists) return [];
      return [{ id: ATTACH_PROJECT_ID }];
    }

    if (sql.includes("UPDATE project_intake_drafts") && sql.includes("SET status = 'finalized'")) {
      if (!state.draft) return [];
      state.draft = {
        ...state.draft,
        status: "finalized",
        finalized_project_id: values[2] as string | null,
        finalized_meeting_note_id: values[3] as string | null,
        finalized_canonical_event_id: values[4] as string | null,
        finalized_at: "2026-03-30T12:00:00.000Z",
      };
      return [];
    }

    return [];
  });

  const tx = vi.fn(async (fn: (client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[] }> }) => Promise<unknown>) => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("INSERT INTO meeting_notes")) {
          return { rows: [{ id: MEETING_NOTE_ID }] };
        }
        return { rows: [] };
      }),
    };
    return fn(client);
  });

  return { queryTenant, tx } as unknown as Db;
}

async function createTestApp(db: Db) {
  const app = Fastify({ logger: false });

  app.decorate("db", db);
  app.decorate("queue", { publish: vi.fn(async () => undefined), close: vi.fn(async () => undefined) });
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
  await app.register(projectIntakeRoutes, { prefix: "/projects" });
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

describe("Project intake runtime routes", () => {
  it("creates and updates intake drafts via POST /projects/intake/drafts", async () => {
    const db = createDbStub({ initialDraft: null });
    const app = await createTestApp(db);
    appsToClose.push(app);

    const createResponse = await app.inject({
      method: "POST",
      url: "/projects/intake/drafts",
      payload: {
        mode: "manual",
        project: { name: "Manual Intake", description: "First draft" },
      },
    });

    expect(createResponse.statusCode).toBe(200);
    const createBody = createResponse.json();
    expect(createBody).toMatchObject({
      draft: {
        id: DRAFT_ID,
        mode: "manual",
        status: "draft",
        project: {
          name: "Manual Intake",
          description: "First draft",
        },
      },
    });

    const updateResponse = await app.inject({
      method: "POST",
      url: "/projects/intake/drafts",
      payload: {
        draftId: DRAFT_ID,
        mode: "manual",
        project: {
          name: "Manual Intake Updated",
          targetDate: "2026-05-30",
        },
      },
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json()).toMatchObject({
      draft: {
        id: DRAFT_ID,
        project: {
          name: "Manual Intake Updated",
          targetDate: "2026-05-30",
        },
      },
    });
  });

  it("bootstraps chat draft tasks/actions without requiring a pre-existing project", async () => {
    const db = createDbStub({
      initialDraft: makeDraftRow({
        mode: "chat",
        status: "draft",
        project_name: "Alpha Launch",
        chat_answers: [
          "Alpha Launch",
          "Deliver launch readiness",
          "Go-live May 20",
          "Finalize messaging; Align launch checklist; Prep stakeholder update",
          "Risk: delayed design assets",
        ],
      }),
    });
    const app = await createTestApp(db);
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: `/projects/intake/drafts/${DRAFT_ID}/bootstrap`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.draft.status).toBe("bootstrapped");
    expect(body.draft.bootstrap.tasks.length).toBeGreaterThan(0);
    expect(body.draft.bootstrap.actions.length).toBeGreaterThan(0);
    expect(body.draft.bootstrap.seedMessage).toContain("I just created a new project from guided intake answers.");
  });

  it("finalizes chat draft by creating project + starter tasks + non-task suggestions", async () => {
    vi.mocked(executeTaskCreate).mockResolvedValue({ id: "task-id" });
    vi.mocked(storeSuggestions).mockResolvedValue({ executedCount: 0, suggestedCount: 1, eventIds: ["ev-1"] });
    vi.mocked(insertProjectMemoryEntry).mockResolvedValue("memory-1");

    const db = createDbStub({
      initialDraft: makeDraftRow({
        mode: "chat",
        status: "bootstrapped",
        project_name: "Chat Intake Project",
        bootstrap_tasks: [
          { title: "Task A", description: null, dueDate: null, assigneeName: null, priority: "medium" },
          { title: "Task B", description: null, dueDate: null, assigneeName: null, priority: "medium" },
        ],
        bootstrap_actions: [
          {
            type: "task_create",
            displayText: "Create task \"Task A\"",
            reasoning: "Captured in intake",
            payload: { title: "Task A", description: null, dueDate: null, assigneeName: null, priority: "medium" },
          },
          {
            type: "scope_change",
            displayText: "Refine project scope from intake context",
            reasoning: "Scope context exists",
            payload: { entityId: "__PROJECT_ID__", entityType: "project", newDescription: "Updated scope text" },
          },
        ],
        bootstrap_seed_message: "seed message",
      }),
      createdProjectId: PROJECT_ID,
    });
    const app = await createTestApp(db);
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: `/projects/intake/drafts/${DRAFT_ID}/finalize`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      draft: {
        status: "finalized",
        finalized: {
          projectId: PROJECT_ID,
        },
      },
    });
    expect(executeTaskCreate).toHaveBeenCalledTimes(2);
    expect(storeSuggestions).toHaveBeenCalledTimes(1);
    const suggestedActions = vi.mocked(storeSuggestions).mock.calls[0]?.[4];
    expect(Array.isArray(suggestedActions)).toBe(true);
    expect(suggestedActions).toHaveLength(1);
    expect((suggestedActions?.[0] as { payload: { entityId: string } }).payload.entityId).toBe(PROJECT_ID);
    expect(insertProjectMemoryEntry).toHaveBeenCalledTimes(1);
    expect(createProjectOwnerMembership).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      PROJECT_ID,
      USER_ID
    );
  });

  it("finalizes meeting draft (create-new path) by creating project and enqueuing canonical transcript processing", async () => {
    vi.mocked(insertCanonicalEventRecords).mockResolvedValue({
      canonicalEventId: CANONICAL_EVENT_ID,
      idempotencyKey: "idem-1",
      source: "transcript",
      eventType: "commitment",
    });
    vi.mocked(publishCanonicalEventCreated).mockResolvedValue(undefined);

    const db = createDbStub({
      initialDraft: makeDraftRow({
        mode: "meeting",
        status: "draft",
        project_name: "Meeting Intake Project",
        meeting_title: "Weekly sync",
        meeting_transcript: "This transcript is long enough to pass validation and enqueue canonical processing.",
      }),
      createdProjectId: PROJECT_ID,
    });
    const app = await createTestApp(db);
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: `/projects/intake/drafts/${DRAFT_ID}/finalize`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      draft: {
        status: "finalized",
        finalized: {
          projectId: PROJECT_ID,
          meetingNoteId: MEETING_NOTE_ID,
          canonicalEventId: CANONICAL_EVENT_ID,
        },
      },
    });
    expect(insertCanonicalEventRecords).toHaveBeenCalledTimes(1);
    expect(publishCanonicalEventCreated).toHaveBeenCalledTimes(1);
    expect(createProjectOwnerMembership).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      PROJECT_ID,
      USER_ID
    );
  });

  it("finalizes meeting draft (attach-existing path) without creating a new project", async () => {
    vi.mocked(insertCanonicalEventRecords).mockResolvedValue({
      canonicalEventId: CANONICAL_EVENT_ID,
      idempotencyKey: "idem-attach-1",
      source: "transcript",
      eventType: "commitment",
    });
    vi.mocked(publishCanonicalEventCreated).mockResolvedValue(undefined);

    const db = createDbStub({
      initialDraft: makeDraftRow({
        mode: "meeting",
        status: "draft",
        attach_to_project_id: ATTACH_PROJECT_ID,
        meeting_title: "Attach path sync",
        meeting_transcript: "This transcript is long enough to pass validation and attach to an existing project.",
      }),
      attachProjectExists: true,
    });
    const app = await createTestApp(db);
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: `/projects/intake/drafts/${DRAFT_ID}/finalize`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      draft: {
        status: "finalized",
        finalized: {
          projectId: ATTACH_PROJECT_ID,
          meetingNoteId: MEETING_NOTE_ID,
        },
      },
    });

    const insertProjectCalls = (db.queryTenant as ReturnType<typeof vi.fn>).mock.calls.filter(
      (call) => String(call[1]).includes("INSERT INTO projects")
    );
    expect(insertProjectCalls).toHaveLength(0);
    expect(createProjectOwnerMembership).not.toHaveBeenCalled();
  });

  it("enforces validation on draft payloads and meeting finalize prerequisites", async () => {
    const db = createDbStub({
      initialDraft: makeDraftRow({
        mode: "meeting",
        status: "draft",
        meeting_transcript: "too short",
      }),
    });
    const app = await createTestApp(db);
    appsToClose.push(app);

    const invalidDraftResponse = await app.inject({
      method: "POST",
      url: "/projects/intake/drafts",
      payload: {
        mode: "manual",
        project: { name: "" },
      },
    });
    expect(invalidDraftResponse.statusCode).toBe(400);

    const finalizeResponse = await app.inject({
      method: "POST",
      url: `/projects/intake/drafts/${DRAFT_ID}/finalize`,
    });
    expect(finalizeResponse.statusCode).toBe(400);
    expect(insertCanonicalEventRecords).not.toHaveBeenCalled();
  });

  it("returns existing payload for already-finalized drafts without re-running side effects", async () => {
    const db = createDbStub({
      initialDraft: makeDraftRow({
        mode: "chat",
        status: "finalized",
        finalized_project_id: PROJECT_ID,
        finalized_at: "2026-03-30T11:00:00.000Z",
      }),
    });
    const app = await createTestApp(db);
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: `/projects/intake/drafts/${DRAFT_ID}/finalize`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      draft: {
        status: "finalized",
        finalized: {
          projectId: PROJECT_ID,
        },
      },
    });
    expect(executeTaskCreate).not.toHaveBeenCalled();
    expect(storeSuggestions).not.toHaveBeenCalled();
    expect(insertCanonicalEventRecords).not.toHaveBeenCalled();
  });
});
