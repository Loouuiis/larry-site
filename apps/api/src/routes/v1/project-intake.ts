import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  executeTaskCreate,
  insertProjectMemoryEntry,
  storeSuggestions,
} from "@larry/db";
import type { LarryAction, IntelligenceConfig } from "@larry/shared";
import { generateBootstrapTasks, generateBootstrapFromTranscript } from "@larry/ai";
import { getApiEnv } from "@larry/config";
import { writeAuditLog } from "../../lib/audit.js";
import { createProjectOwnerMembership } from "../../lib/project-memberships.js";
import {
  ARCHIVED_PROJECT_WRITE_LOCK_MESSAGE,
  isProjectWriteLocked,
  loadProjectWriteState,
} from "../../lib/project-write-lock.js";
import {
  insertCanonicalEventRecords,
  publishCanonicalEventCreated,
} from "../../services/ingest/pipeline.js";

const IntakeModeSchema = z.enum(["manual", "chat", "meeting"]);
const DraftStatusSchema = z.enum(["draft", "bootstrapped", "finalized"]);

const DraftProjectInputSchema = z.object({
  name: z.string().trim().min(1).max(200).optional().nullable(),
  description: z.string().trim().max(4_000).optional().nullable(),
  startDate: z.string().date().optional().nullable(),
  targetDate: z.string().date().optional().nullable(),
  attachToProjectId: z.string().uuid().optional().nullable(),
});

const DraftChatInputSchema = z.object({
  answers: z.array(z.string().trim().max(1_000)).max(20).optional(),
});

const DraftMeetingInputSchema = z.object({
  meetingTitle: z.string().trim().max(300).optional().nullable(),
  transcript: z.string().trim().max(500_000).optional().nullable(),
});

const UpsertDraftSchema = z.object({
  draftId: z.string().uuid().optional(),
  mode: IntakeModeSchema,
  project: DraftProjectInputSchema.optional(),
  chat: DraftChatInputSchema.optional(),
  meeting: DraftMeetingInputSchema.optional(),
});

const DraftIdParamSchema = z.object({
  id: z.string().uuid(),
});

const BootstrapTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2_000).nullable().optional(),
  dueDate: z.string().date().nullable().optional(),
  assigneeName: z.string().trim().max(160).nullable().optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
});

const BootstrapActionSchema = z.object({
  type: z.enum([
    "task_create",
    "status_update",
    "risk_flag",
    "reminder_send",
    "deadline_change",
    "owner_change",
    "scope_change",
    "email_draft",
    "project_create",
  ]),
  displayText: z.string().trim().min(1).max(300),
  reasoning: z.string().trim().min(1).max(200),
  payload: z.record(z.string(), z.unknown()),
});

type IntakeMode = z.infer<typeof IntakeModeSchema>;
type DraftStatus = z.infer<typeof DraftStatusSchema>;

type IntakeBootstrapTask = z.infer<typeof BootstrapTaskSchema>;

interface IntakeDraftModel {
  id: string;
  mode: IntakeMode;
  status: DraftStatus;
  projectName: string | null;
  projectDescription: string | null;
  projectStartDate: string | null;
  projectTargetDate: string | null;
  attachToProjectId: string | null;
  chatAnswers: string[];
  meetingTitle: string | null;
  meetingTranscript: string | null;
  bootstrapSummary: string | null;
  bootstrapTasks: IntakeBootstrapTask[];
  bootstrapActions: LarryAction[];
  bootstrapSeedMessage: string | null;
  finalizedProjectId: string | null;
  finalizedMeetingNoteId: string | null;
  finalizedCanonicalEventId: string | null;
  finalizedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

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

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function parseBootstrapTasks(value: unknown): IntakeBootstrapTask[] {
  if (!Array.isArray(value)) return [];
  const parsed = z.array(BootstrapTaskSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}

function parseBootstrapActions(value: unknown): LarryAction[] {
  if (!Array.isArray(value)) return [];
  const parsed = z.array(BootstrapActionSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}

function normalizeDraftRow(row: DraftRow): IntakeDraftModel {
  return {
    id: row.id,
    mode: IntakeModeSchema.parse(row.mode),
    status: DraftStatusSchema.parse(row.status),
    projectName: row.project_name,
    projectDescription: row.project_description,
    projectStartDate: row.project_start_date,
    projectTargetDate: row.project_target_date,
    attachToProjectId: row.attach_to_project_id,
    chatAnswers: parseStringArray(row.chat_answers),
    meetingTitle: row.meeting_title,
    meetingTranscript: row.meeting_transcript,
    bootstrapSummary: row.bootstrap_summary,
    bootstrapTasks: parseBootstrapTasks(row.bootstrap_tasks),
    bootstrapActions: parseBootstrapActions(row.bootstrap_actions),
    bootstrapSeedMessage: row.bootstrap_seed_message,
    finalizedProjectId: row.finalized_project_id,
    finalizedMeetingNoteId: row.finalized_meeting_note_id,
    finalizedCanonicalEventId: row.finalized_canonical_event_id,
    finalizedAt: row.finalized_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function buildDraftResponse(model: IntakeDraftModel) {
  return {
    draft: {
      id: model.id,
      mode: model.mode,
      status: model.status,
      project: {
        name: model.projectName,
        description: model.projectDescription,
        startDate: model.projectStartDate,
        targetDate: model.projectTargetDate,
        attachToProjectId: model.attachToProjectId,
      },
      chat: {
        answers: model.chatAnswers,
      },
      meeting: {
        meetingTitle: model.meetingTitle,
        transcriptPresent: Boolean(model.meetingTranscript && model.meetingTranscript.trim().length > 0),
      },
      bootstrap: {
        summary: model.bootstrapSummary,
        tasks: model.bootstrapTasks,
        actions: model.bootstrapActions,
        seedMessage: model.bootstrapSeedMessage,
      },
      finalized: {
        projectId: model.finalizedProjectId,
        meetingNoteId: model.finalizedMeetingNoteId,
        canonicalEventId: model.finalizedCanonicalEventId,
        finalizedAt: model.finalizedAt,
      },
    },
  };
}

async function getDraftById(
  fastify: Parameters<FastifyPluginAsync>[0],
  tenantId: string,
  draftId: string
): Promise<IntakeDraftModel | null> {
  const rows = await fastify.db.queryTenant<DraftRow>(
    tenantId,
    `SELECT id, mode, status,
            project_name, project_description, project_start_date::text, project_target_date::text, attach_to_project_id,
            chat_answers, meeting_title, meeting_transcript,
            bootstrap_summary, bootstrap_tasks, bootstrap_actions, bootstrap_seed_message,
            finalized_project_id, finalized_meeting_note_id, finalized_canonical_event_id, finalized_at::text,
            created_at::text, updated_at::text
       FROM project_intake_drafts
      WHERE tenant_id = $1
        AND id = $2
      LIMIT 1`,
    [tenantId, draftId]
  );

  if (!rows[0]) return null;
  return normalizeDraftRow(rows[0]);
}

function buildIntelligenceConfig(config: ReturnType<typeof getApiEnv>): IntelligenceConfig {
  if (config.MODEL_PROVIDER === "openai") {
    return { provider: "openai", apiKey: config.OPENAI_API_KEY, model: config.OPENAI_MODEL };
  }
  if (config.MODEL_PROVIDER === "anthropic") {
    return { provider: "anthropic", apiKey: config.ANTHROPIC_API_KEY, model: config.ANTHROPIC_MODEL };
  }
  if (config.MODEL_PROVIDER === "gemini") {
    return { provider: "gemini", apiKey: config.GEMINI_API_KEY, model: config.GEMINI_MODEL };
  }
  return { provider: "mock", model: "mock" };
}

function tokenizeTaskTitles(text: string): string[] {
  return text
    .split(/[\n;,|]+/g)
    .map((chunk) => chunk.replace(/^[\s\-*•\d.()]+/, "").trim())
    .filter((chunk) => chunk.length > 0)
    .flatMap((chunk) => chunk.split(/\s+\band\b\s+/i))
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);
}

function buildIntakeSeedMessage(input: { answers: string[]; summary: string; projectName: string }): string {
  const [name = "", outcome = "", milestone = "", deliverables = "", risks = ""] = input.answers;
  return [
    "I just created a new project from guided intake answers.",
    "Use this context to bootstrap the project chat: summarize the setup and propose the most useful next actions.",
    input.summary,
    [
      `Project name: ${name || input.projectName}`,
      `Outcome: ${outcome}`,
      `Milestone: ${milestone}`,
      `Deliverables or workstreams: ${deliverables}`,
      `Risks, constraints, and dependencies: ${risks}`,
    ].join("\n"),
  ].join("\n\n");
}

async function buildBootstrapFromDraft(draft: IntakeDraftModel, aiConfig?: IntelligenceConfig): Promise<{
  summary: string;
  tasks: IntakeBootstrapTask[];
  actions: LarryAction[];
  seedMessage: string;
}> {
  if (draft.mode === "meeting") {
    const projectName = draft.projectName ?? draft.meetingTitle ?? "New Project";
    const transcript = draft.meetingTranscript ?? "";

    let tasks: IntakeBootstrapTask[];
    let summary: string;

    if (aiConfig && aiConfig.provider !== "mock" && transcript.length >= 20) {
      try {
        const aiResult = await generateBootstrapFromTranscript(aiConfig, {
          projectName,
          meetingTitle: draft.meetingTitle ?? null,
          transcript,
        });

        tasks = aiResult.tasks.map((t) => ({
          title: t.title.slice(0, 200),
          description: t.description ?? null,
          dueDate: t.dueDate ?? draft.projectTargetDate,
          assigneeName: null,
          priority: t.priority ?? "medium",
        }));

        summary = aiResult.summary || `Larry identified ${tasks.length} action item${tasks.length === 1 ? "" : "s"} from "${draft.meetingTitle ?? "the meeting transcript"}".`;
      } catch (err) {
        console.error("[bootstrap] AI transcript extraction failed, falling back:", err);
        const fallback = fallbackMeetingBootstrap(draft, projectName, transcript);
        tasks = fallback.tasks;
        summary = fallback.summary;
      }
    } else {
      const fallback = fallbackMeetingBootstrap(draft, projectName, transcript);
      tasks = fallback.tasks;
      summary = fallback.summary;
    }

    const taskActions: LarryAction[] = tasks.map((task) => ({
      type: "task_create",
      displayText: `Create task "${task.title}"`,
      reasoning: task.description ?? "Extracted from meeting transcript",
      payload: {
        title: task.title,
        description: task.description ?? null,
        dueDate: task.dueDate ?? null,
        assigneeName: null,
        priority: task.priority ?? "medium",
      },
    }));

    const transcriptExcerpt = transcript.slice(0, 500);
    const seedMessage = [
      "I just created a project from a meeting transcript.",
      "Use this context to bootstrap the project: summarize the key decisions and propose the most useful next actions.",
      summary,
      draft.meetingTitle ? `Meeting: ${draft.meetingTitle}` : null,
      `Transcript excerpt:\n${transcriptExcerpt}${transcript.length > 500 ? "..." : ""}`,
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n\n");

    return { summary, tasks, actions: taskActions, seedMessage };
  }

  const answers = draft.chatAnswers;
  const projectName = draft.projectName ?? answers[0] ?? "New Project";
  const outcome = answers[1] ?? "";
  const milestone = answers[2] ?? "";
  const deliverables = answers[3] ?? "";
  const risks = answers[4] ?? "";

  // --- AI-powered task generation ---
  let tasks: IntakeBootstrapTask[];
  let summary: string;

  if (aiConfig && aiConfig.provider !== "mock") {
    try {
      const aiResult = await generateBootstrapTasks(aiConfig, {
        projectName,
        outcome,
        milestone,
        deliverables,
        risks,
      });

      tasks = aiResult.tasks.map((t) => ({
        title: t.title.slice(0, 200),
        description: t.description ?? null,
        dueDate: t.dueDate ?? draft.projectTargetDate,
        assigneeName: null,
        priority: t.priority ?? "medium",
      }));

      summary = aiResult.summary || `Larry prepared ${tasks.length} starter task${tasks.length === 1 ? "" : "s"} for ${projectName}.`;
    } catch (err) {
      // AI call failed — fall back to tokenizer
      console.error("[bootstrap] AI task generation failed, falling back to tokenizer:", err);
      const result = fallbackTokenizeBootstrap(draft, projectName, outcome, milestone, deliverables, risks);
      tasks = result.tasks;
      summary = result.summary;
    }
  } else {
    const result = fallbackTokenizeBootstrap(draft, projectName, outcome, milestone, deliverables, risks);
    tasks = result.tasks;
    summary = result.summary;
  }

  const taskActions: LarryAction[] = tasks.map((task) => ({
    type: "task_create",
    displayText: `Create task "${task.title}"`,
    reasoning: task.description ?? "Generated during project intake bootstrap",
    payload: {
      title: task.title,
      description: task.description ?? null,
      dueDate: task.dueDate ?? null,
      assigneeName: task.assigneeName ?? null,
      priority: task.priority ?? "medium",
    },
  }));

  const actions: LarryAction[] = [...taskActions];
  const scopeDetails = [draft.projectDescription, outcome, milestone, risks]
    .filter((entry): entry is string => Boolean(entry && entry.trim().length > 0))
    .join("\n\n")
    .trim();
  if (scopeDetails.length > 0) {
    actions.push({
      type: "scope_change",
      displayText: "Refine project scope from intake context",
      reasoning: "Intake responses include scope and risk details worth preserving as editable scope text",
      payload: {
        entityId: "__PROJECT_ID__",
        entityType: "project",
        newDescription: scopeDetails.slice(0, 4_000),
      },
    });
  }

  return {
    summary,
    tasks,
    actions,
    seedMessage: buildIntakeSeedMessage({ answers, summary, projectName }),
  };
}

/** Fallback: regex-based meeting transcript task extraction (no AI). */
function fallbackMeetingBootstrap(
  draft: IntakeDraftModel,
  projectName: string,
  transcript: string,
): { tasks: IntakeBootstrapTask[]; summary: string } {
  const actionLines: string[] = [];
  for (const line of transcript.split(/\n/)) {
    const trimmed = line.trim();
    const m = /^(?:action(?:\s+item)?s?:?\s*|todo:?\s*|follow[\s-]up:?\s*|-\s*\[\s*\]\s*)/i.exec(trimmed);
    if (m) {
      const content = trimmed.slice(m[0].length).trim();
      if (content.length > 3) actionLines.push(content);
    }
  }

  const candidateTitles =
    actionLines.length > 0
      ? actionLines.flatMap((line) => tokenizeTaskTitles(line)).slice(0, 6)
      : tokenizeTaskTitles(transcript.slice(0, 2_000)).slice(0, 6);

  const fallbackTitles = [
    "Review meeting decisions and outcomes",
    "Follow up on action items",
    "Share meeting summary with stakeholders",
  ];
  const taskTitles = candidateTitles.length > 0 ? candidateTitles : fallbackTitles;

  const tasks: IntakeBootstrapTask[] = taskTitles.map((title) => ({
    title: title.slice(0, 200),
    description: null,
    dueDate: draft.projectTargetDate,
    assigneeName: null,
    priority: "medium" as const,
  }));

  const summary = `Larry identified ${tasks.length} action item${tasks.length === 1 ? "" : "s"} from "${draft.meetingTitle ?? "the meeting transcript"}".`;
  return { tasks, summary };
}

/** Fallback: tokenize deliverables string into task titles (no AI). */
function fallbackTokenizeBootstrap(
  draft: IntakeDraftModel,
  projectName: string,
  outcome: string,
  milestone: string,
  deliverables: string,
  risks: string,
): { tasks: IntakeBootstrapTask[]; summary: string } {
  const candidateTitles = tokenizeTaskTitles(deliverables);
  const fallbackTitles = [
    "Define project scope and success metrics",
    "Build delivery plan and owners",
    "Prepare first stakeholder update",
  ];
  const taskTitles = (candidateTitles.length > 0 ? candidateTitles : fallbackTitles).slice(0, 6);

  const tasks: IntakeBootstrapTask[] = taskTitles.map((title) => ({
    title: title.slice(0, 200),
    description: null,
    dueDate: draft.projectTargetDate,
    assigneeName: null,
    priority: "medium",
  }));

  const summary = [
    `Larry prepared ${tasks.length} starter task${tasks.length === 1 ? "" : "s"} for ${projectName}.`,
    outcome ? `Outcome focus: ${outcome}` : null,
    milestone ? `Milestone: ${milestone}` : null,
    risks ? `Watchouts: ${risks}` : null,
  ]
    .filter((line): line is string => Boolean(line))
    .join(" ");

  return { tasks, summary };
}

function mapIntakeMemorySourceKind(mode: IntakeMode): string {
  if (mode === "chat") return "direct_chat";
  if (mode === "meeting") return "meeting";
  return "manual";
}

function normalizeFinalizeActions(projectId: string, actions: LarryAction[]): LarryAction[] {
  return actions.map((action) => {
    if (action.type !== "scope_change") return action;

    const payload = { ...action.payload };
    if (payload.entityType === "project" && payload.entityId === "__PROJECT_ID__") {
      payload.entityId = projectId;
    }

    return {
      ...action,
      payload,
    };
  });
}

export const projectIntakeRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/intake/drafts",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request) => {
      const parseResult = UpsertDraftSchema.safeParse(request.body ?? {});
      if (!parseResult.success) {
        throw fastify.httpErrors.badRequest(parseResult.error.issues[0]?.message ?? "Invalid draft payload.");
      }

      const tenantId = request.user.tenantId;
      const actorUserId = request.user.userId;
      const payload = parseResult.data;

      let existing: IntakeDraftModel | null = null;
      if (payload.draftId) {
        existing = await getDraftById(fastify, tenantId, payload.draftId);
        if (!existing) {
          throw fastify.httpErrors.notFound("Draft not found.");
        }
        if (existing.status === "finalized") {
          return buildDraftResponse(existing);
        }
      }

      const mergedMode = payload.mode;
      const mergedProject = {
        name:
          payload.project?.name !== undefined
            ? (payload.project.name?.trim() || null)
            : existing?.projectName ?? null,
        description:
          payload.project?.description !== undefined
            ? (payload.project.description?.trim() || null)
            : existing?.projectDescription ?? null,
        startDate:
          payload.project?.startDate !== undefined
            ? payload.project.startDate ?? null
            : existing?.projectStartDate ?? null,
        targetDate:
          payload.project?.targetDate !== undefined
            ? payload.project.targetDate ?? null
            : existing?.projectTargetDate ?? null,
        attachToProjectId:
          payload.project?.attachToProjectId !== undefined
            ? payload.project.attachToProjectId ?? null
            : existing?.attachToProjectId ?? null,
      };

      const mergedChatAnswers =
        payload.chat?.answers !== undefined
          ? payload.chat.answers.map((entry) => entry.trim()).filter((entry) => entry.length > 0)
          : (existing?.chatAnswers ?? []);

      const mergedMeeting = {
        title:
          payload.meeting?.meetingTitle !== undefined
            ? (payload.meeting.meetingTitle?.trim() || null)
            : existing?.meetingTitle ?? null,
        transcript:
          payload.meeting?.transcript !== undefined
            ? (payload.meeting.transcript?.trim() || null)
            : existing?.meetingTranscript ?? null,
      };

      let draftId = existing?.id ?? null;
      if (!draftId) {
        const rows = await fastify.db.queryTenant<{ id: string }>(
          tenantId,
          `INSERT INTO project_intake_drafts
             (tenant_id, mode, status,
              project_name, project_description, project_start_date, project_target_date, attach_to_project_id,
              chat_answers, meeting_title, meeting_transcript, created_by_user_id)
           VALUES
             ($1, $2, 'draft',
              $3, $4, $5, $6, $7,
              $8::jsonb, $9, $10, $11)
           RETURNING id`,
          [
            tenantId,
            mergedMode,
            mergedProject.name,
            mergedProject.description,
            mergedProject.startDate,
            mergedProject.targetDate,
            mergedProject.attachToProjectId,
            JSON.stringify(mergedChatAnswers),
            mergedMeeting.title,
            mergedMeeting.transcript,
            actorUserId,
          ]
        );
        draftId = rows[0]?.id ?? null;
      } else {
        await fastify.db.queryTenant(
          tenantId,
          `UPDATE project_intake_drafts
              SET mode = $3,
                  status = 'draft',
                  project_name = $4,
                  project_description = $5,
                  project_start_date = $6,
                  project_target_date = $7,
                  attach_to_project_id = $8,
                  chat_answers = $9::jsonb,
                  meeting_title = $10,
                  meeting_transcript = $11,
                  updated_at = NOW()
            WHERE tenant_id = $1
              AND id = $2`,
          [
            tenantId,
            draftId,
            mergedMode,
            mergedProject.name,
            mergedProject.description,
            mergedProject.startDate,
            mergedProject.targetDate,
            mergedProject.attachToProjectId,
            JSON.stringify(mergedChatAnswers),
            mergedMeeting.title,
            mergedMeeting.transcript,
          ]
        );
      }

      const persisted = await getDraftById(fastify, tenantId, draftId as string);
      if (!persisted) {
        throw fastify.httpErrors.internalServerError("Failed to persist intake draft.");
      }

      return buildDraftResponse(persisted);
    }
  );

  fastify.post(
    "/intake/drafts/:id/bootstrap",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request) => {
      const params = DraftIdParamSchema.parse(request.params);
      const tenantId = request.user.tenantId;

      const draft = await getDraftById(fastify, tenantId, params.id);
      if (!draft) {
        throw fastify.httpErrors.notFound("Draft not found.");
      }
      if (draft.status === "finalized") {
        return buildDraftResponse(draft);
      }

      const aiConfig = buildIntelligenceConfig(fastify.config);
      const bootstrap = await buildBootstrapFromDraft(draft, aiConfig);
      await fastify.db.queryTenant(
        tenantId,
        `UPDATE project_intake_drafts
            SET status = 'bootstrapped',
                bootstrap_summary = $3,
                bootstrap_tasks = $4::jsonb,
                bootstrap_actions = $5::jsonb,
                bootstrap_seed_message = $6,
                updated_at = NOW()
          WHERE tenant_id = $1
            AND id = $2`,
        [
          tenantId,
          params.id,
          bootstrap.summary,
          JSON.stringify(bootstrap.tasks),
          JSON.stringify(bootstrap.actions),
          bootstrap.seedMessage,
        ]
      );

      const persisted = await getDraftById(fastify, tenantId, params.id);
      if (!persisted) {
        throw fastify.httpErrors.internalServerError("Failed to persist bootstrap state.");
      }

      return buildDraftResponse(persisted);
    }
  );

  fastify.post(
    "/intake/drafts/:id/finalize",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request) => {
      const params = DraftIdParamSchema.parse(request.params);
      const tenantId = request.user.tenantId;
      const actorUserId = request.user.userId;

      const draft = await getDraftById(fastify, tenantId, params.id);
      if (!draft) {
        throw fastify.httpErrors.notFound("Draft not found.");
      }

      if (draft.status === "finalized") {
        return buildDraftResponse(draft);
      }

      let finalizedProjectId: string | null = null;
      let finalizedMeetingNoteId: string | null = null;
      let finalizedCanonicalEventId: string | null = null;

      if (draft.mode === "meeting") {
        const transcript = draft.meetingTranscript?.trim();
        if (!transcript || transcript.length < 20) {
          throw fastify.httpErrors.badRequest("Meeting transcript is required to finalize meeting intake.");
        }

        if (draft.attachToProjectId) {
          const attachProject = await loadProjectWriteState(
            fastify.db,
            tenantId,
            draft.attachToProjectId
          );
          if (!attachProject) {
            throw fastify.httpErrors.notFound("Attach target project was not found.");
          }
          if (isProjectWriteLocked(attachProject.status)) {
            throw fastify.httpErrors.conflict(ARCHIVED_PROJECT_WRITE_LOCK_MESSAGE);
          }
          finalizedProjectId = attachProject.projectId;
        } else {
          const projectName =
            draft.projectName?.trim() || draft.meetingTitle?.trim() || "New Project";
          const projectRows = await fastify.db.queryTenant<{ id: string }>(
            tenantId,
            `INSERT INTO projects (tenant_id, name, description, owner_user_id, start_date, target_date)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id`,
            [
              tenantId,
              projectName,
              draft.projectDescription ?? null,
              actorUserId,
              draft.projectStartDate ?? null,
              draft.projectTargetDate ?? null,
            ]
          );
          finalizedProjectId = projectRows[0]?.id ?? null;
          if (!finalizedProjectId) {
            throw fastify.httpErrors.internalServerError("Failed to create project from meeting intake.");
          }

          await createProjectOwnerMembership(
            fastify.db,
            tenantId,
            finalizedProjectId,
            actorUserId
          );

          await writeAuditLog(fastify.db, {
            tenantId,
            actorUserId,
            actionType: "project.create",
            objectType: "project",
            objectId: finalizedProjectId,
            details: { source: "project_intake", draftId: draft.id, mode: draft.mode },
          });
        }

        const sourceEventId = `intake-draft-${draft.id}-${Date.now()}`;
        const ingestResult = await fastify.db.tx(async (client) => {
          await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);

          const inserted = await insertCanonicalEventRecords(client, tenantId, {
            source: "transcript",
            sourceEventId,
            actor: request.user.email ?? actorUserId,
            payload: {
              transcript,
              meetingTitle: draft.meetingTitle ?? null,
              projectId: finalizedProjectId,
              intakeDraftId: draft.id,
              intakeMode: "meeting",
            },
          });

          const meetingNoteResult = await client.query<{ id: string }>(
            `INSERT INTO meeting_notes
              (tenant_id, project_id, title, transcript, created_by_user_id)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id`,
            [tenantId, finalizedProjectId, draft.meetingTitle ?? null, transcript, actorUserId]
          );
          const meetingNoteId = meetingNoteResult.rows[0]?.id ?? null;

          const payloadPatch = {
            projectId: finalizedProjectId,
            meetingTitle: draft.meetingTitle ?? null,
            meetingNoteId: meetingNoteId ?? undefined,
            submittedByUserId: actorUserId,
            intakeDraftId: draft.id,
            intakeMode: "meeting",
          };

          await client.query(
            `UPDATE canonical_events
                SET payload = payload || $3::jsonb
              WHERE tenant_id = $1
                AND id = $2`,
            [tenantId, inserted.canonicalEventId, JSON.stringify(payloadPatch)]
          );

          return {
            canonicalEventId: inserted.canonicalEventId,
            idempotencyKey: inserted.idempotencyKey,
            source: inserted.source,
            eventType: inserted.eventType,
            meetingNoteId,
          };
        });

        await publishCanonicalEventCreated(fastify, tenantId, ingestResult);

        finalizedCanonicalEventId = ingestResult.canonicalEventId;
        finalizedMeetingNoteId = ingestResult.meetingNoteId;

        // Bootstrap tasks and suggestions (same contract as chat/manual)
        if (finalizedProjectId) {
          let meetingBootstrapTasks = draft.bootstrapTasks;
          let meetingBootstrapActions = draft.bootstrapActions;
          let meetingBootstrapSummary = draft.bootstrapSummary;
          let meetingBootstrapSeedMessage = draft.bootstrapSeedMessage;

          if (meetingBootstrapTasks.length === 0) {
            const aiConfig = buildIntelligenceConfig(fastify.config);
            const bootstrap = await buildBootstrapFromDraft(draft, aiConfig);
            meetingBootstrapTasks = bootstrap.tasks;
            meetingBootstrapActions = bootstrap.actions;
            meetingBootstrapSummary = bootstrap.summary;
            meetingBootstrapSeedMessage = bootstrap.seedMessage;

            await fastify.db.queryTenant(
              tenantId,
              `UPDATE project_intake_drafts
                  SET status = 'bootstrapped',
                      bootstrap_summary = $3,
                      bootstrap_tasks = $4::jsonb,
                      bootstrap_actions = $5::jsonb,
                      bootstrap_seed_message = $6,
                      updated_at = NOW()
                WHERE tenant_id = $1
                  AND id = $2`,
              [
                tenantId,
                draft.id,
                meetingBootstrapSummary,
                JSON.stringify(meetingBootstrapTasks),
                JSON.stringify(meetingBootstrapActions),
                meetingBootstrapSeedMessage,
              ]
            );
          }

          for (const task of meetingBootstrapTasks) {
            await executeTaskCreate(fastify.db, tenantId, finalizedProjectId, {
              title: task.title,
              description: task.description ?? null,
              dueDate: task.dueDate ?? null,
              assigneeName: task.assigneeName ?? null,
              priority: task.priority ?? "medium",
            });
          }

          const meetingNonTaskActions = normalizeFinalizeActions(
            finalizedProjectId,
            meetingBootstrapActions.filter((action) => action.type !== "task_create")
          );
          if (meetingNonTaskActions.length > 0) {
            await storeSuggestions(
              fastify.db,
              tenantId,
              finalizedProjectId,
              "chat",
              meetingNonTaskActions,
              meetingBootstrapSeedMessage ?? undefined
            );
          }

          await Promise.resolve(
            insertProjectMemoryEntry(fastify.db, tenantId, finalizedProjectId, {
              source: "Meeting intake",
              sourceKind: "meeting",
              sourceRecordId: draft.id,
              content: (
                meetingBootstrapSummary ??
                draft.projectDescription ??
                `Meeting intake finalized: ${draft.meetingTitle ?? draft.projectName ?? "New Project"}.`
              ).slice(0, 4_000),
            })
          ).catch((error) => {
            request.log.warn(
              { err: error, tenantId, projectId: finalizedProjectId, draftId: draft.id },
              "project memory write failed for meeting intake finalize"
            );
          });
        }
      } else {
        const projectName = draft.projectName?.trim();
        if (!projectName) {
          throw fastify.httpErrors.badRequest("Project name is required to finalize this intake draft.");
        }

        let bootstrapTasks = draft.bootstrapTasks;
        let bootstrapActions = draft.bootstrapActions;
        let bootstrapSummary = draft.bootstrapSummary;
        let bootstrapSeedMessage = draft.bootstrapSeedMessage;
        if (draft.mode === "chat" && bootstrapTasks.length === 0) {
          const aiConfig = buildIntelligenceConfig(fastify.config);
          const bootstrap = await buildBootstrapFromDraft(draft, aiConfig);
          bootstrapTasks = bootstrap.tasks;
          bootstrapActions = bootstrap.actions;
          bootstrapSummary = bootstrap.summary;
          bootstrapSeedMessage = bootstrap.seedMessage;

          await fastify.db.queryTenant(
            tenantId,
            `UPDATE project_intake_drafts
                SET status = 'bootstrapped',
                    bootstrap_summary = $3,
                    bootstrap_tasks = $4::jsonb,
                    bootstrap_actions = $5::jsonb,
                    bootstrap_seed_message = $6,
                    updated_at = NOW()
              WHERE tenant_id = $1
                AND id = $2`,
            [
              tenantId,
              draft.id,
              bootstrapSummary,
              JSON.stringify(bootstrapTasks),
              JSON.stringify(bootstrapActions),
              bootstrapSeedMessage,
            ]
          );
        }

        const projectRows = await fastify.db.queryTenant<{ id: string }>(
          tenantId,
          `INSERT INTO projects (tenant_id, name, description, owner_user_id, start_date, target_date)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [
            tenantId,
            projectName,
            draft.projectDescription ?? null,
            actorUserId,
            draft.projectStartDate ?? null,
            draft.projectTargetDate ?? null,
          ]
        );
        finalizedProjectId = projectRows[0]?.id ?? null;
        if (!finalizedProjectId) {
          throw fastify.httpErrors.internalServerError("Failed to create project from intake draft.");
        }

        await createProjectOwnerMembership(
          fastify.db,
          tenantId,
          finalizedProjectId,
          actorUserId
        );

        await writeAuditLog(fastify.db, {
          tenantId,
          actorUserId,
          actionType: "project.create",
          objectType: "project",
          objectId: finalizedProjectId,
          details: { source: "project_intake", draftId: draft.id, mode: draft.mode },
        });

        for (const task of bootstrapTasks) {
          await executeTaskCreate(fastify.db, tenantId, finalizedProjectId, {
            title: task.title,
            description: task.description ?? null,
            dueDate: task.dueDate ?? null,
            assigneeName: task.assigneeName ?? null,
            priority: task.priority ?? "medium",
          });
        }

        const nonTaskActions = normalizeFinalizeActions(
          finalizedProjectId,
          bootstrapActions.filter((action) => action.type !== "task_create")
        );
        if (nonTaskActions.length > 0) {
          await storeSuggestions(
            fastify.db,
            tenantId,
            finalizedProjectId,
            "chat",
            nonTaskActions,
            bootstrapSeedMessage ?? undefined,
            {
              requesterUserId: actorUserId,
              sourceKind: "recommendation_review",
              sourceRecordId: draft.id,
            }
          );
        }

        await Promise.resolve(
          insertProjectMemoryEntry(fastify.db, tenantId, finalizedProjectId, {
            source: "Project intake",
            sourceKind: mapIntakeMemorySourceKind(draft.mode),
            sourceRecordId: draft.id,
            content: (
              bootstrapSummary ??
              draft.projectDescription ??
              `Project intake finalized for ${projectName}.`
            ).slice(0, 4_000),
          })
        ).catch((error) => {
          request.log.warn(
            { err: error, tenantId, projectId: finalizedProjectId, draftId: draft.id },
            "project memory write failed for intake finalize"
          );
        });
      }

      await fastify.db.queryTenant(
        tenantId,
        `UPDATE project_intake_drafts
            SET status = 'finalized',
                finalized_project_id = $3,
                finalized_meeting_note_id = $4,
                finalized_canonical_event_id = $5,
                finalized_at = NOW(),
                updated_at = NOW()
          WHERE tenant_id = $1
            AND id = $2`,
        [
          tenantId,
          draft.id,
          finalizedProjectId,
          finalizedMeetingNoteId,
          finalizedCanonicalEventId,
        ]
      );

      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId,
        actionType: "project.intake.finalized",
        objectType: "project_intake_draft",
        objectId: draft.id,
        details: {
          mode: draft.mode,
          projectId: finalizedProjectId,
          meetingNoteId: finalizedMeetingNoteId,
          canonicalEventId: finalizedCanonicalEventId,
        },
      });

      const persisted = await getDraftById(fastify, tenantId, draft.id);
      if (!persisted) {
        throw fastify.httpErrors.internalServerError("Failed to load finalized intake draft.");
      }

      return buildDraftResponse(persisted);
    }
  );
};
