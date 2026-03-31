import { FastifyPluginAsync } from "fastify";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { runIntelligence } from "@larry/ai";
import {
  executeAction,
  getPendingSuggestionTexts,
  getProjectSnapshot,
  insertProjectMemoryEntry,
  listProjectMemoryEntries,
  runAutoActions,
  storeSuggestions,
} from "@larry/db";
import { getApiEnv } from "@larry/config";
import type {
  IntelligenceConfig,
  LarryActionType,
  LarryChatResponse,
  LarryMessageRecord,
} from "@larry/shared";
import { writeAuditLog } from "../../lib/audit.js";
import { buildPendingClause } from "../../lib/intelligence-hints.js";
import {
  createLarryConversation,
  getLarryActionCentreData,
  getLarryConversationForUser,
  getLarryEventForMutation,
  insertLarryMessage,
  listLarryConversationPreviews,
  listLarryEventSummaries,
  listLarryMessagesByIds,
  listLarryMessagesForConversation,
  markLarryEventAccepted,
  markLarryEventDismissed,
  touchLarryConversation,
} from "../../lib/larry-ledger.js";
import { getProjectMembershipAccess } from "../../lib/project-memberships.js";
import { getOrGenerateBriefing } from "../../services/larry-briefing.js";
import {
  insertCanonicalEventRecords,
  publishCanonicalEventCreated,
} from "../../services/ingest/pipeline.js";
import {
  createGoogleCalendarEvent,
  refreshGoogleAccessToken,
  updateGoogleCalendarEvent,
} from "../../services/connectors/google-calendar.js";

function buildIntelligenceConfig(config: ReturnType<typeof getApiEnv>): IntelligenceConfig {
  if (config.MODEL_PROVIDER === "openai") {
    return { provider: "openai", apiKey: config.OPENAI_API_KEY, model: config.OPENAI_MODEL };
  }
  if (config.MODEL_PROVIDER === "anthropic") {
    return { provider: "anthropic", apiKey: config.ANTHROPIC_API_KEY, model: config.ANTHROPIC_MODEL };
  }
  return { provider: "mock", model: "mock" };
}

const ConversationQuerySchema = z.object({
  projectId: z.string().uuid().optional(),
});

const ActionCentreQuerySchema = z.object({
  projectId: z.string().uuid().optional(),
});

const MemoryQuerySchema = z.object({
  projectId: z.string().uuid(),
  sourceKind: z.string().trim().min(1).max(64).optional(),
  source: z.string().trim().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const ChatSchema = z.object({
  projectId: z.string().uuid().optional(),
  message: z.string().trim().min(1).max(8_000),
  conversationId: z.string().uuid().optional(),
});

const GLOBAL_CHAT_PROJECT_LIMIT = 5;

const CalendarCreatePayloadSchema = z.object({
  summary: z.string().trim().min(1),
  startDateTime: z.string().trim().min(1),
  endDateTime: z.string().trim().min(1),
  description: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  attendees: z.array(z.string().trim().email()).nullable().optional(),
  calendarId: z.string().trim().min(1).nullable().optional(),
  timeZone: z.string().trim().min(1).nullable().optional(),
});

const CalendarUpdatePayloadSchema = z.object({
  eventId: z.string().trim().min(1),
  summary: z.string().trim().min(1).nullable().optional(),
  startDateTime: z.string().trim().min(1).nullable().optional(),
  endDateTime: z.string().trim().min(1).nullable().optional(),
  description: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  attendees: z.array(z.string().trim().email()).nullable().optional(),
  calendarId: z.string().trim().min(1).nullable().optional(),
  timeZone: z.string().trim().min(1).nullable().optional(),
});

function fallbackMessage(input: {
  id: string;
  role: "user" | "larry";
  content: string;
  createdAt: string;
  actorUserId?: string | null;
  actorDisplayName?: string | null;
  linkedActions?: LarryMessageRecord["linkedActions"];
}): LarryMessageRecord {
  return {
    id: input.id,
    role: input.role,
    content: input.content,
    reasoning: null,
    createdAt: input.createdAt,
    actorUserId: input.actorUserId ?? null,
    actorDisplayName: input.actorDisplayName ?? null,
    linkedActions: input.linkedActions ?? [],
  };
}

function buildChatMemoryEntry(message: string, briefing: string): string {
  const userLine = message.replace(/\s+/g, " ").trim();
  const larryLine = briefing.replace(/\s+/g, " ").trim();
  return `User asked: ${userLine}\nLarry replied: ${larryLine}`.slice(0, 4_000);
}

function buildAcceptedActionMemoryEntry(input: {
  displayText?: string | null;
  reasoning?: string | null;
  approvedByName?: string | null;
}): string {
  const displayText = input.displayText?.trim() || "Accepted Larry action";
  const reasoning = input.reasoning?.trim();
  const approvedByName = input.approvedByName?.trim();

  const parts = [displayText];
  if (reasoning) parts.push(`Reasoning: ${reasoning}`);
  if (approvedByName) parts.push(`Accepted by ${approvedByName}`);

  return parts.join(" ").slice(0, 4_000);
}

const MUTATING_VERB_PATTERN =
  /\b(mark|set|change|move|assign|reassign|create|add|delete|remove|send|draft|close|complete|extend|flag)\b/i;
const DIRECT_UPDATE_PATTERN = /\bupdate\b.{0,40}\b(task|deadline|owner|assignee|risk|status)\b/i;
const DATE_HINT_PATTERN =
  /\b\d{4}-\d{2}-\d{2}\b|\b(today|tomorrow|next week|monday|tuesday|wednesday|thursday|friday|saturday|sunday|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i;

function hasMutationIntent(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) return false;

  const lower = trimmed.toLowerCase();
  const readOnlyQuestion =
    (trimmed.endsWith("?") || /\b(what|which|how|any|show|list|summary|summarize)\b/i.test(trimmed)) &&
    !MUTATING_VERB_PATTERN.test(trimmed) &&
    !DIRECT_UPDATE_PATTERN.test(trimmed);

  if (readOnlyQuestion) return false;
  if (MUTATING_VERB_PATTERN.test(trimmed)) return true;
  return DIRECT_UPDATE_PATTERN.test(trimmed);
}

function isCollaboratorMutationIntent(message: string): boolean {
  return (
    /\b(collaborator|member|members|teammate|team member)\b/i.test(message) ||
    (/\b(owner|editor|viewer)\b/i.test(message) &&
      /\b(role|access|permission|collaborator|member|teammate)\b/i.test(message))
  );
}

function isNoteMutationIntent(message: string): boolean {
  return /\b(note|notes)\b/i.test(message);
}

function requiresTaskTargetClarification(message: string): boolean {
  if (isCollaboratorMutationIntent(message) || isNoteMutationIntent(message)) {
    return false;
  }

  return /\b(task|tasks|deadline|due date|due|assignee|owner|ownership|risk|status|complete|blocked|backlog)\b/i.test(
    message
  );
}

function findMentionedTaskIds(message: string, tasks: Array<{ id: string; title: string }>): string[] {
  const lowerMessage = message.toLowerCase();
  const matched = new Set<string>();

  for (const task of tasks) {
    const taskId = task.id.toLowerCase();
    const taskTitle = task.title.toLowerCase();

    if (lowerMessage.includes(taskId) || lowerMessage.includes(taskTitle)) {
      matched.add(task.id);
      continue;
    }

    const titleTokens = taskTitle.split(/[^a-z0-9]+/).filter((token) => token.length > 3);
    const matchedTokenCount = titleTokens.filter((token) => lowerMessage.includes(token)).length;
    if (matchedTokenCount >= 2) {
      matched.add(task.id);
    }
  }

  return Array.from(matched);
}

function detectClarificationNeed(input: {
  message: string;
  tasks: Array<{ id: string; title: string }>;
}): { question: string; reason: string } | null {
  if (!hasMutationIntent(input.message)) return null;

  const message = input.message.trim();
  const lower = message.toLowerCase();
  const mentionedTaskIds = findMentionedTaskIds(message, input.tasks);
  const taskTargetIntent = requiresTaskTargetClarification(message);

  if (/\b(create|add)\b/.test(lower) && /\btask\b/.test(lower)) {
    const detailMatch = lower.match(/(?:create|add)\s+(?:a\s+)?task(?:\s+(?:for|to)\s+)?(.+)/);
    const detailText = detailMatch?.[1]?.trim() ?? "";
    if (detailText.length < 4) {
      return {
        question:
          "I can do that. What task should I create? Reply with a task title and, if you have them, an owner or due date.",
        reason: "task_create_missing_details",
      };
    }
  }

  if (taskTargetIntent && /\b(deadline|due date|due)\b/i.test(message) && !DATE_HINT_PATTERN.test(message)) {
    return {
      question: "I can prepare that deadline change. What new date should I use?",
      reason: "deadline_change_missing_date",
    };
  }

  if (
    taskTargetIntent &&
    /\b(assign|reassign|owner|ownership)\b/i.test(message) &&
    !/\bto\s+[a-z][a-z .'-]{1,80}\b/i.test(message)
  ) {
    return {
      question: "I can make that ownership update. Who should this be assigned to?",
      reason: "owner_change_missing_assignee",
    };
  }

  if (taskTargetIntent && input.tasks.length > 1 && mentionedTaskIds.length === 0) {
    return {
      question:
        "I can apply that update, but I need the target task first. Reply with the task name or task ID you want me to change.",
      reason: "missing_task_target",
    };
  }

  if (taskTargetIntent && mentionedTaskIds.length > 1) {
    return {
      question:
        "I found multiple matching tasks for that request. Which exact task should I use? Please reply with one task name or ID.",
      reason: "ambiguous_task_target",
    };
  }

  return null;
}

interface AccessibleProjectRow {
  id: string;
  name: string;
}

interface GoogleCalendarInstallationRow {
  id: string;
  project_id: string | null;
  google_calendar_id: string;
  google_access_token: string;
  google_refresh_token: string | null;
  token_expires_at: string | null;
}

interface GlobalProjectIntelligenceResult {
  projectId: string;
  projectName: string;
  briefing: string;
  executedCount: number;
  suggestedCount: number;
  eventIds: string[];
  error?: string;
}

function buildGlobalNoProjectMessage(): string {
  return "I couldn't find any accessible projects to run this global chat request against. Select a project or ask an admin to grant project access.";
}

function buildGlobalGroupedMessage(results: GlobalProjectIntelligenceResult[]): string {
  const sections = results.map((result) => {
    const header = `Project: ${result.projectName}`;
    if (result.error) {
      return `${header}\nI couldn't process this project right now: ${result.error}`;
    }

    const suffix =
      result.executedCount > 0 || result.suggestedCount > 0
        ? `\nActions: ${result.executedCount} executed, ${result.suggestedCount} pending approval.`
        : "";
    return `${header}\n${result.briefing}${suffix}`;
  });

  return sections.join("\n\n").slice(0, 8_000);
}

function isCalendarActionType(
  actionType: string
): actionType is "calendar_event_create" | "calendar_event_update" {
  return actionType === "calendar_event_create" || actionType === "calendar_event_update";
}

export const larryRoutes: FastifyPluginAsync = async (fastify) => {
  async function assertProjectAccessOrThrow(input: {
    tenantId: string;
    userId: string;
    tenantRole: string;
    projectId: string;
    mode: "read" | "manage";
  }) {
    const access = await getProjectMembershipAccess({
      db: fastify.db,
      tenantId: input.tenantId,
      projectId: input.projectId,
      userId: input.userId,
      tenantRole: input.tenantRole,
    });

    if (!access.projectExists) {
      throw fastify.httpErrors.notFound("Project not found.");
    }

    if (input.mode === "read" && !access.canRead) {
      throw fastify.httpErrors.forbidden("Project access denied.");
    }

    if (input.mode === "manage" && !access.canManage) {
      throw fastify.httpErrors.forbidden(
        "Project action updates require owner or editor access."
      );
    }
  }

  async function listAccessibleProjectsForGlobalChat(input: {
    tenantId: string;
    userId: string;
    tenantRole: string;
    limit: number;
  }): Promise<AccessibleProjectRow[]> {
    if (input.tenantRole === "admin") {
      return fastify.db.queryTenant<AccessibleProjectRow>(
        input.tenantId,
        `SELECT p.id, p.name
         FROM projects p
         WHERE p.tenant_id = $1
         ORDER BY p.updated_at DESC, p.created_at DESC
         LIMIT $2`,
        [input.tenantId, input.limit]
      );
    }

    return fastify.db.queryTenant<AccessibleProjectRow>(
      input.tenantId,
      `SELECT p.id, p.name
       FROM project_memberships pm
       JOIN projects p
         ON p.tenant_id = pm.tenant_id
        AND p.id = pm.project_id
       WHERE pm.tenant_id = $1
         AND pm.user_id = $2
       ORDER BY p.updated_at DESC, p.created_at DESC
       LIMIT $3`,
      [input.tenantId, input.userId, input.limit]
    );
  }

  async function loadProjectLinkedCalendarInstallation(input: {
    tenantId: string;
    projectId: string;
  }): Promise<GoogleCalendarInstallationRow> {
    const rows = await fastify.db.queryTenant<GoogleCalendarInstallationRow>(
      input.tenantId,
      `SELECT id,
              project_id,
              google_calendar_id,
              google_access_token,
              google_refresh_token,
              token_expires_at
       FROM google_calendar_installations
       WHERE tenant_id = $1
         AND project_id = $2
       ORDER BY updated_at DESC
       LIMIT 1`,
      [input.tenantId, input.projectId]
    );

    if (!rows[0]) {
      throw new Error(
        "Google Calendar is not linked to this project. Link it in Workspace Settings > Connectors and try again."
      );
    }

    return rows[0];
  }

  async function ensureFreshGoogleAccessToken(input: {
    tenantId: string;
    installation: GoogleCalendarInstallationRow;
  }): Promise<string> {
    const expiresAt = input.installation.token_expires_at
      ? new Date(input.installation.token_expires_at).getTime()
      : null;
    const aboutToExpire = expiresAt !== null && expiresAt <= Date.now() + 60_000;

    if (!aboutToExpire) {
      return input.installation.google_access_token;
    }

    if (!input.installation.google_refresh_token) {
      throw new Error(
        "Google Calendar access token expired and no refresh token is available. Reconnect the connector and retry."
      );
    }

    if (!fastify.config.GOOGLE_CLIENT_ID || !fastify.config.GOOGLE_CLIENT_SECRET) {
      throw new Error(
        "Google Calendar OAuth credentials are not configured on the API. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET."
      );
    }

    const refreshed = await refreshGoogleAccessToken({
      clientId: fastify.config.GOOGLE_CLIENT_ID,
      clientSecret: fastify.config.GOOGLE_CLIENT_SECRET,
      refreshToken: input.installation.google_refresh_token,
    });

    await fastify.db.queryTenant(
      input.tenantId,
      `UPDATE google_calendar_installations
         SET google_access_token = $3,
             google_refresh_token = COALESCE($4, google_refresh_token),
             google_scope = COALESCE($5, google_scope),
             token_expires_at = $6,
             updated_at = NOW()
       WHERE tenant_id = $1
         AND id = $2`,
      [
        input.tenantId,
        input.installation.id,
        refreshed.accessToken,
        refreshed.refreshToken ?? null,
        refreshed.scope ?? null,
        refreshed.expiresAt ?? null,
      ]
    );

    return refreshed.accessToken;
  }

  async function executeCalendarAction(input: {
    tenantId: string;
    projectId: string;
    actionType: "calendar_event_create" | "calendar_event_update";
    payload: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    const installation = await loadProjectLinkedCalendarInstallation({
      tenantId: input.tenantId,
      projectId: input.projectId,
    });
    const accessToken = await ensureFreshGoogleAccessToken({
      tenantId: input.tenantId,
      installation,
    });

    if (input.actionType === "calendar_event_create") {
      const parsed = CalendarCreatePayloadSchema.safeParse(input.payload);
      if (!parsed.success) {
        throw new Error(
          `Invalid calendar_event_create payload: ${
            parsed.error.issues[0]?.message ?? "failed payload validation"
          }`
        );
      }

      const calendarId = parsed.data.calendarId ?? installation.google_calendar_id;
      const created = await createGoogleCalendarEvent({
        accessToken,
        calendarId,
        summary: parsed.data.summary,
        startDateTime: parsed.data.startDateTime,
        endDateTime: parsed.data.endDateTime,
        description: parsed.data.description ?? null,
        location: parsed.data.location ?? null,
        attendees: parsed.data.attendees ?? null,
        timeZone: parsed.data.timeZone ?? null,
      });

      return {
        operation: "calendar_event_create",
        calendarId,
        eventId: created.id,
        status: created.status ?? null,
        htmlLink: created.htmlLink ?? null,
      };
    }

    const parsed = CalendarUpdatePayloadSchema.safeParse(input.payload);
    if (!parsed.success) {
      throw new Error(
        `Invalid calendar_event_update payload: ${
          parsed.error.issues[0]?.message ?? "failed payload validation"
        }`
      );
    }

    const hasMutation =
      parsed.data.summary !== undefined ||
      parsed.data.startDateTime !== undefined ||
      parsed.data.endDateTime !== undefined ||
      parsed.data.description !== undefined ||
      parsed.data.location !== undefined ||
      parsed.data.attendees !== undefined;
    if (!hasMutation) {
      throw new Error(
        "calendar_event_update requires at least one field to update (summary, date, description, location, or attendees)."
      );
    }

    const calendarId = parsed.data.calendarId ?? installation.google_calendar_id;
    const updated = await updateGoogleCalendarEvent({
      accessToken,
      calendarId,
      eventId: parsed.data.eventId,
      summary: parsed.data.summary,
      startDateTime: parsed.data.startDateTime,
      endDateTime: parsed.data.endDateTime,
      description: parsed.data.description,
      location: parsed.data.location,
      attendees: parsed.data.attendees,
      timeZone: parsed.data.timeZone ?? null,
    });

    return {
      operation: "calendar_event_update",
      calendarId,
      eventId: updated.id,
      status: updated.status ?? null,
      htmlLink: updated.htmlLink ?? null,
    };
  }

  fastify.get(
    "/conversations",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request) => {
      const parseResult = ConversationQuerySchema.safeParse(request.query);
      if (!parseResult.success) {
        throw fastify.httpErrors.badRequest(parseResult.error.issues[0]?.message ?? "Invalid query params");
      }

      const conversations = await listLarryConversationPreviews(
        fastify.db,
        request.user.tenantId,
        request.user.userId,
        parseResult.data
      );

      return { conversations };
    }
  );

  fastify.post(
    "/conversations",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (_request, reply) => {
      return reply.code(410).send({
        error:
          "Legacy conversation creation has been retired. Use POST /v1/larry/chat for canonical chat persistence.",
      });
    }
  );

  fastify.get(
    "/conversations/:id/messages",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request) => {
      const tenantId = request.user.tenantId;
      const userId = request.user.userId;
      const { id } = request.params as { id: string };

      const conversation = await getLarryConversationForUser(fastify.db, tenantId, userId, id);
      if (!conversation) {
        throw fastify.httpErrors.notFound("Conversation not found.");
      }

      const messages = await listLarryMessagesForConversation(fastify.db, tenantId, id);
      return { messages };
    }
  );

  fastify.post(
    "/conversations/:id/messages",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (_request, reply) => {
      return reply.code(410).send({
        error:
          "Legacy conversation message writes have been retired. Use POST /v1/larry/chat for canonical chat persistence.",
      });
    }
  );

  fastify.get(
    "/events",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (_request, reply) => {
      return reply.code(410).send({
        error:
          "Legacy event-list reads have been retired. Use GET /v1/larry/action-centre?projectId=... (project) or GET /v1/larry/action-centre (global).",
      });
    }
  );

  fastify.get(
    "/action-centre",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request) => {
      const parseResult = ActionCentreQuerySchema.safeParse(request.query);
      if (!parseResult.success) {
        throw fastify.httpErrors.badRequest(parseResult.error.issues[0]?.message ?? "Invalid query params");
      }

      if (parseResult.data.projectId) {
        await assertProjectAccessOrThrow({
          tenantId: request.user.tenantId,
          userId: request.user.userId,
          tenantRole: request.user.role,
          projectId: parseResult.data.projectId,
          mode: "read",
        });
      }

      return getLarryActionCentreData(
        fastify.db,
        request.user.tenantId,
        request.user.userId,
        parseResult.data.projectId
      );
    }
  );

  fastify.get(
    "/memory",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request) => {
      const parseResult = MemoryQuerySchema.safeParse(request.query);
      if (!parseResult.success) {
        throw fastify.httpErrors.badRequest(parseResult.error.issues[0]?.message ?? "Invalid query params");
      }

      const sourceKind = parseResult.data.sourceKind ?? parseResult.data.source;
      await assertProjectAccessOrThrow({
        tenantId: request.user.tenantId,
        userId: request.user.userId,
        tenantRole: request.user.role,
        projectId: parseResult.data.projectId,
        mode: "read",
      });

      const items = await listProjectMemoryEntries(
        fastify.db,
        request.user.tenantId,
        parseResult.data.projectId,
        {
          sourceKind,
          limit: parseResult.data.limit,
        }
      );
      return { items };
    }
  );

  fastify.post(
    "/events/:id/accept",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm"])] },
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const actorUserId = request.user.userId;
      const { id } = request.params as { id: string };

      const event = await getLarryEventForMutation(fastify.db, tenantId, id);
      if (!event) {
        throw fastify.httpErrors.notFound("Event not found.");
      }
      await assertProjectAccessOrThrow({
        tenantId,
        userId: actorUserId,
        tenantRole: request.user.role,
        projectId: event.projectId,
        mode: "manage",
      });
      if (event.eventType !== "suggested") {
        throw fastify.httpErrors.conflict("Only suggested events can be accepted.");
      }

      let entity: unknown;
      try {
        if (isCalendarActionType(event.actionType)) {
          entity = await executeCalendarAction({
            tenantId,
            projectId: event.projectId,
            actionType: event.actionType,
            payload: event.payload,
          });
        } else {
          const actionPayload =
            event.actionType === "project_note_send"
              ? {
                  ...event.payload,
                  sourceKind: "action",
                  sourceRecordId: id,
                }
              : event.payload;

          entity = await executeAction(
            fastify.db,
            tenantId,
            event.projectId,
            event.actionType as LarryActionType,
            actionPayload,
            actorUserId
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw fastify.httpErrors.unprocessableEntity(message);
      }

      await markLarryEventAccepted(fastify.db, tenantId, id, actorUserId);

      const [updatedEvent] = await listLarryEventSummaries(fastify.db, tenantId, { ids: [id] });

      await Promise.all([
        writeAuditLog(fastify.db, {
          tenantId,
          actorUserId,
          actionType: "larry.event.accepted",
          objectType: "larry_event",
          objectId: id,
          details: { actionType: event.actionType },
        }),
        updatedEvent
          ? Promise.resolve(
              insertProjectMemoryEntry(fastify.db, tenantId, event.projectId, {
                source: "Action Centre",
                sourceKind: "action",
                sourceRecordId: id,
                content: buildAcceptedActionMemoryEntry(updatedEvent),
              })
            ).catch((error) => {
              request.log.warn(
                { err: error, tenantId, eventId: id, projectId: event.projectId },
                "project memory write failed for accepted event"
              );
            })
          : Promise.resolve(),
      ]);

      return reply.code(200).send({ accepted: true, entity, event: updatedEvent ?? null });
    }
  );

  fastify.post(
    "/events/:id/dismiss",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const actorUserId = request.user.userId;
      const { id } = request.params as { id: string };
      const body = (request.body ?? {}) as { reason?: string };

      const event = await getLarryEventForMutation(fastify.db, tenantId, id);
      if (!event) {
        throw fastify.httpErrors.notFound("Event not found.");
      }
      await assertProjectAccessOrThrow({
        tenantId,
        userId: actorUserId,
        tenantRole: request.user.role,
        projectId: event.projectId,
        mode: "manage",
      });
      if (event.eventType !== "suggested") {
        throw fastify.httpErrors.conflict("Only suggested events can be dismissed.");
      }

      await markLarryEventDismissed(fastify.db, tenantId, id, actorUserId, body.reason ?? null);

      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId,
        actionType: "larry.event.dismissed",
        objectType: "larry_event",
        objectId: id,
        details: { reason: body.reason ?? null },
      });

      const [updatedEvent] = await listLarryEventSummaries(fastify.db, tenantId, { ids: [id] });

      return reply.code(200).send({ dismissed: true, event: updatedEvent ?? null });
    }
  );

  fastify.get(
    "/briefing",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const userId = request.user.userId;

      const userRows = await fastify.db.queryTenant<{ display_name: string | null; email: string }>(
        tenantId,
        `SELECT u.display_name, u.email
           FROM users u
          WHERE u.id = $2
            AND u.tenant_id = $1
          LIMIT 1`,
        [tenantId, userId]
      );

      const user = userRows[0];
      const displayName = user
        ? (user.display_name?.trim() || user.email.split("@")[0] || "there")
        : "there";

      const config = buildIntelligenceConfig(fastify.config);

      let briefingResult;
      try {
        briefingResult = await getOrGenerateBriefing(
          fastify.db,
          config,
          userId,
          tenantId,
          displayName
        );
      } catch (error) {
        request.log.error({ err: error, tenantId, userId }, "generateBriefing failed");
        const hour = new Date().getHours();
        const timeOfDay = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
        return reply.code(200).send({
          briefing: {
            greeting: `Good ${timeOfDay}, ${displayName}.`,
            projects: [],
            totalNeedsYou: 0,
          },
          cached: false,
          degraded: true,
        });
      }

      if (briefingResult.briefingId) {
        await fastify.db.queryTenant(
          tenantId,
          `UPDATE larry_briefings
              SET seen_at = NOW()
            WHERE tenant_id = $1
              AND id = $2
              AND seen_at IS NULL`,
          [tenantId, briefingResult.briefingId]
        ).catch(() => undefined);
      }

      return reply.code(200).send({
        briefing: briefingResult.content,
        cached: !briefingResult.fresh,
      });
    }
  );

  // ── Transcript ───────────────────────────────────────────────────────────

  const TranscriptSchema = z.object({
    sourceEventId: z.string().min(1),
    transcript: z.string().min(20),
    projectId: z.string().uuid().optional(),
    meetingTitle: z.string().optional(),
    actor: z.string().optional(),
    occurredAt: z.string().datetime().optional(),
    payload: z.record(z.string(), z.unknown()).optional(),
  });

  fastify.post(
    "/transcript",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 minute",
          keyGenerator: (req: FastifyRequest) =>
            (req.user as { tenantId?: string } | undefined)?.tenantId ?? req.ip,
        },
      },
      preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm"])],
    },
    async (request, reply) => {
      const parse = TranscriptSchema.safeParse(request.body);
      if (!parse.success) {
        throw fastify.httpErrors.badRequest(parse.error.issues[0]?.message ?? "Invalid transcript payload");
      }

      const body = parse.data;
      const tenantId = request.user.tenantId;
      const canonicalPayload = {
        ...(body.payload ?? {}),
        transcript: body.transcript,
        meetingTitle: body.meetingTitle,
      };

      const ingestResult = await fastify.db.tx(async (client) => {
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);

        const inserted = await insertCanonicalEventRecords(client, tenantId, {
          source: "transcript",
          sourceEventId: body.sourceEventId,
          actor: body.actor,
          occurredAt: body.occurredAt,
          payload: canonicalPayload,
        });

        const meetingNoteResult = await client.query<{ id: string }>(
          `INSERT INTO meeting_notes
            (tenant_id, project_id, agent_run_id, title, transcript, created_by_user_id)
           VALUES ($1, $2, NULL, $3, $4, $5)
           RETURNING id`,
          [tenantId, body.projectId ?? null, body.meetingTitle ?? null, body.transcript, request.user.userId]
        );
        const meetingNoteId = meetingNoteResult.rows[0]?.id ?? null;

        const payloadPatch = {
          transcript: body.transcript,
          meetingTitle: body.meetingTitle,
          projectId: body.projectId,
          meetingNoteId: meetingNoteId ?? undefined,
          submittedByUserId: request.user.userId,
        };

        await client.query(
          `UPDATE canonical_events
              SET payload = payload || $3::jsonb
            WHERE tenant_id = $1
              AND id = $2`,
          [tenantId, inserted.canonicalEventId, JSON.stringify(payloadPatch)]
        );

        return {
          ...inserted,
          meetingNoteId,
        };
      });

      await publishCanonicalEventCreated(fastify, tenantId, ingestResult);

      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId: request.user.userId,
        actionType: "larry.transcript",
        objectType: "meeting_note",
        objectId: ingestResult.meetingNoteId ?? ingestResult.canonicalEventId,
      });

      return reply.code(202).send({
        accepted: true,
        canonicalEventId: ingestResult.canonicalEventId,
        idempotencyKey: ingestResult.idempotencyKey,
        meetingNoteId: ingestResult.meetingNoteId,
      });
    }
  );
  fastify.post(
    "/chat",
    {
      config: {
        rateLimit: {
          max: 20,
          timeWindow: "1 minute",
          keyGenerator: (req: FastifyRequest) =>
            (req.user as { tenantId?: string } | undefined)?.tenantId ?? req.ip,
        },
      },
      preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])],
    },
    async (request, reply) => {
      const parseResult = ChatSchema.safeParse(request.body ?? {});
      if (!parseResult.success) {
        throw fastify.httpErrors.badRequest(parseResult.error.issues[0]?.message ?? "Invalid request body");
      }

      const { message, conversationId } = parseResult.data;
      const projectId = parseResult.data.projectId ?? null;
      const tenantId = request.user.tenantId;
      const actorUserId = request.user.userId;
      let existingConversation = null;

      if (projectId) {
        await assertProjectAccessOrThrow({
          tenantId,
          userId: actorUserId,
          tenantRole: request.user.role,
          projectId,
          mode: "read",
        });
      }

      if (conversationId) {
        existingConversation = await getLarryConversationForUser(
          fastify.db,
          tenantId,
          actorUserId,
          conversationId
        );
        if (!existingConversation) {
          throw fastify.httpErrors.notFound("Conversation not found.");
        }
        if (existingConversation.projectId !== projectId) {
          if (!projectId) {
            throw fastify.httpErrors.conflict("Global chat cannot reuse a project conversation.");
          }
          if (!existingConversation.projectId) {
            throw fastify.httpErrors.conflict("Project chat cannot reuse a global conversation.");
          }
          throw fastify.httpErrors.conflict("Conversation does not belong to this project.");
        }
      }

      if (!projectId) {
        const globalProjects = await listAccessibleProjectsForGlobalChat({
          tenantId,
          userId: actorUserId,
          tenantRole: request.user.role,
          limit: GLOBAL_CHAT_PROJECT_LIMIT,
        });

        const conversation =
          existingConversation ??
          await createLarryConversation(fastify.db, tenantId, actorUserId, {
            projectId: null,
            title: message.slice(0, 80),
          });

        const userMessageInsert = await insertLarryMessage(fastify.db, tenantId, conversation.id, {
          role: "user",
          content: message,
          actorUserId,
        });

        if (globalProjects.length === 0) {
          const fallback = buildGlobalNoProjectMessage();
          const assistantMessageInsert = await insertLarryMessage(fastify.db, tenantId, conversation.id, {
            role: "larry",
            content: fallback,
          });
          await touchLarryConversation(fastify.db, tenantId, conversation.id, message.slice(0, 80));

          const persistedMessages = await listLarryMessagesByIds(fastify.db, tenantId, [
            userMessageInsert.id,
            assistantMessageInsert.id,
          ]);
          const userMessage =
            persistedMessages.find((entry) => entry.id === userMessageInsert.id) ??
            fallbackMessage({
              id: userMessageInsert.id,
              role: "user",
              content: message,
              createdAt: userMessageInsert.createdAt,
              actorUserId,
            });
          const assistantMessage =
            persistedMessages.find((entry) => entry.id === assistantMessageInsert.id) ??
            fallbackMessage({
              id: assistantMessageInsert.id,
              role: "larry",
              content: fallback,
              createdAt: assistantMessageInsert.createdAt,
            });

          await writeAuditLog(fastify.db, {
            tenantId,
            actorUserId,
            actionType: "larry.chat.global",
            objectType: "workspace",
            objectId: tenantId,
            details: {
              conversationId: conversation.id,
              projectCount: 0,
              fanoutLimit: GLOBAL_CHAT_PROJECT_LIMIT,
              linkedActionCount: 0,
            },
          });

          const responsePayload: LarryChatResponse = {
            conversationId: conversation.id,
            message: fallback,
            userMessage,
            assistantMessage: {
              ...assistantMessage,
              linkedActions: [],
            },
            linkedActions: [],
            actionsExecuted: 0,
            suggestionCount: 0,
          };

          return reply.code(200).send(responsePayload);
        }

        const config = buildIntelligenceConfig(fastify.config);
        const draftRuns: Array<{
          projectId: string;
          projectName: string;
          result: Awaited<ReturnType<typeof runIntelligence>> | null;
          error?: string;
        }> = [];

        for (const project of globalProjects) {
          try {
            const snapshot = await getProjectSnapshot(fastify.db, tenantId, project.id);
            const pendingTexts = await getPendingSuggestionTexts(fastify.db, tenantId, project.id).catch(
              () => [] as string[]
            );
            const pendingClause = buildPendingClause(pendingTexts);
            const result = await runIntelligence(config, snapshot, `user said: "${message}"${pendingClause}`);
            draftRuns.push({
              projectId: project.id,
              projectName: project.name,
              result,
            });
          } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            request.log.warn(
              { err: error, tenantId, projectId: project.id, userId: actorUserId },
              "global chat intelligence failed for project"
            );
            draftRuns.push({
              projectId: project.id,
              projectName: project.name,
              result: null,
              error: reason,
            });
          }
        }

        const assistantText = buildGlobalGroupedMessage(
          draftRuns.map((entry) => ({
            projectId: entry.projectId,
            projectName: entry.projectName,
            briefing: entry.result?.briefing ?? "",
            executedCount: 0,
            suggestedCount: 0,
            eventIds: [],
            error: entry.error,
          }))
        );
        const assistantMessageInsert = await insertLarryMessage(fastify.db, tenantId, conversation.id, {
          role: "larry",
          content: assistantText,
        });

        await touchLarryConversation(fastify.db, tenantId, conversation.id, message.slice(0, 80));

        const actionContext = {
          conversationId: conversation.id,
          requestMessageId: userMessageInsert.id,
          responseMessageId: assistantMessageInsert.id,
          requesterUserId: actorUserId,
          sourceKind: "chat",
          sourceRecordId: userMessageInsert.id,
        };

        const finalizedResults: GlobalProjectIntelligenceResult[] = [];
        for (const draft of draftRuns) {
          if (draft.error || !draft.result) {
            finalizedResults.push({
              projectId: draft.projectId,
              projectName: draft.projectName,
              briefing: "",
              executedCount: 0,
              suggestedCount: 0,
              eventIds: [],
              error: draft.error ?? "No intelligence result was produced for this project.",
            });
            continue;
          }
          try {
            const [autoResult, suggestResult] = await Promise.all([
              runAutoActions(
                fastify.db,
                tenantId,
                draft.projectId,
                "chat",
                draft.result.autoActions,
                message,
                actionContext
              ),
              storeSuggestions(
                fastify.db,
                tenantId,
                draft.projectId,
                "chat",
                draft.result.suggestedActions,
                message,
                actionContext
              ),
            ]);

            finalizedResults.push({
              projectId: draft.projectId,
              projectName: draft.projectName,
              briefing: draft.result.briefing,
              executedCount: autoResult.executedCount,
              suggestedCount: suggestResult.suggestedCount + autoResult.suggestedCount,
              eventIds: [...autoResult.eventIds, ...suggestResult.eventIds],
            });

            await Promise.resolve(
              insertProjectMemoryEntry(fastify.db, tenantId, draft.projectId, {
                source: "Larry chat",
                sourceKind: "chat",
                sourceRecordId: userMessageInsert.id,
                content: buildChatMemoryEntry(message, draft.result.briefing),
              })
            ).catch((error) => {
              request.log.warn(
                { err: error, tenantId, projectId: draft.projectId, conversationId: conversation.id },
                "project memory write failed for global chat turn"
              );
            });
          } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            request.log.warn(
              { err: error, tenantId, projectId: draft.projectId, conversationId: conversation.id },
              "global chat action execution failed for project"
            );
            finalizedResults.push({
              projectId: draft.projectId,
              projectName: draft.projectName,
              briefing: draft.result.briefing,
              executedCount: 0,
              suggestedCount: 0,
              eventIds: [],
              error: reason,
            });
          }
        }

        const linkedActionIds = finalizedResults.flatMap((result) => result.eventIds);
        const persistedMessages = await listLarryMessagesByIds(fastify.db, tenantId, [
          userMessageInsert.id,
          assistantMessageInsert.id,
        ]);
        const userMessage =
          persistedMessages.find((entry) => entry.id === userMessageInsert.id) ??
          fallbackMessage({
            id: userMessageInsert.id,
            role: "user",
            content: message,
            createdAt: userMessageInsert.createdAt,
            actorUserId,
          });
        const assistantMessage =
          persistedMessages.find((entry) => entry.id === assistantMessageInsert.id) ??
          fallbackMessage({
            id: assistantMessageInsert.id,
            role: "larry",
            content: assistantText,
            createdAt: assistantMessageInsert.createdAt,
          });

        const linkedActions =
          assistantMessage.linkedActions.length > 0 || linkedActionIds.length === 0
            ? assistantMessage.linkedActions
            : await listLarryEventSummaries(fastify.db, tenantId, {
                ids: linkedActionIds,
                sort: "chronological",
              });
        const actionsExecuted = finalizedResults.reduce((sum, result) => sum + result.executedCount, 0);
        const suggestionCount = finalizedResults.reduce((sum, result) => sum + result.suggestedCount, 0);

        await writeAuditLog(fastify.db, {
          tenantId,
          actorUserId,
          actionType: "larry.chat.global",
          objectType: "workspace",
          objectId: tenantId,
          details: {
            conversationId: conversation.id,
            fanoutLimit: GLOBAL_CHAT_PROJECT_LIMIT,
            touchedProjectIds: finalizedResults.map((result) => result.projectId),
            actionsExecuted,
            suggestionCount,
            linkedActionCount: linkedActions.length,
          },
        });

        const responsePayload: LarryChatResponse = {
          conversationId: conversation.id,
          message: assistantText,
          userMessage,
          assistantMessage: {
            ...assistantMessage,
            linkedActions,
          },
          linkedActions,
          actionsExecuted,
          suggestionCount,
        };

        return reply.code(200).send(responsePayload);
      }

      let snapshot;
      try {
        snapshot = await getProjectSnapshot(fastify.db, tenantId, projectId);
      } catch (error) {
        const messageText = error instanceof Error ? error.message : String(error);
        throw fastify.httpErrors.notFound(messageText);
      }

      const clarificationNeed = detectClarificationNeed({
        message,
        tasks: snapshot.tasks.map((task) => ({ id: task.id, title: task.title })),
      });

      if (clarificationNeed) {
        const conversation =
          existingConversation ??
          await createLarryConversation(fastify.db, tenantId, actorUserId, {
            projectId,
            title: message.slice(0, 80),
          });

        const userMessageInsert = await insertLarryMessage(fastify.db, tenantId, conversation.id, {
          role: "user",
          content: message,
          actorUserId,
        });

        const assistantMessageInsert = await insertLarryMessage(fastify.db, tenantId, conversation.id, {
          role: "larry",
          content: clarificationNeed.question,
        });

        await touchLarryConversation(fastify.db, tenantId, conversation.id, message.slice(0, 80));

        const persistedMessages = await listLarryMessagesByIds(fastify.db, tenantId, [
          userMessageInsert.id,
          assistantMessageInsert.id,
        ]);

        const userMessage =
          persistedMessages.find((entry) => entry.id === userMessageInsert.id) ??
          fallbackMessage({
            id: userMessageInsert.id,
            role: "user",
            content: message,
            createdAt: userMessageInsert.createdAt,
            actorUserId,
          });

        const assistantMessage =
          persistedMessages.find((entry) => entry.id === assistantMessageInsert.id) ??
          fallbackMessage({
            id: assistantMessageInsert.id,
            role: "larry",
            content: clarificationNeed.question,
            createdAt: assistantMessageInsert.createdAt,
          });

        await Promise.all([
          writeAuditLog(fastify.db, {
            tenantId,
            actorUserId,
            actionType: "larry.chat.clarification_requested",
            objectType: "project",
            objectId: projectId,
            details: {
              conversationId: conversation.id,
              clarificationReason: clarificationNeed.reason,
            },
          }),
          Promise.resolve(
            insertProjectMemoryEntry(fastify.db, tenantId, projectId, {
              source: "Larry chat",
              sourceKind: "chat",
              sourceRecordId: userMessageInsert.id,
              content: buildChatMemoryEntry(message, clarificationNeed.question),
            })
          ).catch((error) => {
            request.log.warn(
              { err: error, tenantId, projectId, conversationId: conversation.id },
              "project memory write failed for clarification chat turn"
            );
          }),
        ]);

        return reply.code(200).send({
          conversationId: conversation.id,
          message: clarificationNeed.question,
          userMessage,
          assistantMessage: {
            ...assistantMessage,
            linkedActions: [],
          },
          linkedActions: [],
          actionsExecuted: 0,
          suggestionCount: 0,
          requiresClarification: true,
          clarificationQuestions: [clarificationNeed.question],
        });
      }

      const pendingTexts = await getPendingSuggestionTexts(fastify.db, tenantId, projectId).catch(
        () => [] as string[]
      );
      const pendingClause = buildPendingClause(pendingTexts);

      const config = buildIntelligenceConfig(fastify.config);
      let result;
      try {
        result = await runIntelligence(config, snapshot, `user said: "${message}"${pendingClause}`);
      } catch (error) {
        const messageText = error instanceof Error ? error.message : String(error);
        request.log.error({ err: error, tenantId, projectId }, "runIntelligence failed");
        throw fastify.httpErrors.serviceUnavailable(`Larry intelligence error: ${messageText}`);
      }

      const conversation =
        existingConversation ??
        await createLarryConversation(fastify.db, tenantId, actorUserId, {
          projectId,
          title: message.slice(0, 80),
        });

      const userMessageInsert = await insertLarryMessage(fastify.db, tenantId, conversation.id, {
        role: "user",
        content: message,
        actorUserId,
      });

      const assistantMessageInsert = await insertLarryMessage(fastify.db, tenantId, conversation.id, {
        role: "larry",
        content: result.briefing,
      });

      await touchLarryConversation(fastify.db, tenantId, conversation.id, message.slice(0, 80));

      const actionContext = {
        conversationId: conversation.id,
        requestMessageId: userMessageInsert.id,
        responseMessageId: assistantMessageInsert.id,
        requesterUserId: actorUserId,
        sourceKind: "chat",
        sourceRecordId: userMessageInsert.id,
      };

      const [autoResult, suggestResult, persistedMessages] = await Promise.all([
        runAutoActions(
          fastify.db,
          tenantId,
          projectId,
          "chat",
          result.autoActions,
          message,
          actionContext
        ),
        storeSuggestions(
          fastify.db,
          tenantId,
          projectId,
          "chat",
          result.suggestedActions,
          message,
          actionContext
        ),
        listLarryMessagesByIds(fastify.db, tenantId, [userMessageInsert.id, assistantMessageInsert.id]),
      ]);

      const userMessage =
        persistedMessages.find((entry) => entry.id === userMessageInsert.id) ??
        fallbackMessage({
          id: userMessageInsert.id,
          role: "user",
          content: message,
          createdAt: userMessageInsert.createdAt,
          actorUserId,
        });

      const assistantMessage =
        persistedMessages.find((entry) => entry.id === assistantMessageInsert.id) ??
        fallbackMessage({
          id: assistantMessageInsert.id,
          role: "larry",
          content: result.briefing,
          createdAt: assistantMessageInsert.createdAt,
        });

      const linkedActionIds = [...autoResult.eventIds, ...suggestResult.eventIds];
      const linkedActions =
        assistantMessage.linkedActions.length > 0 || linkedActionIds.length === 0
          ? assistantMessage.linkedActions
          : await listLarryEventSummaries(fastify.db, tenantId, {
              ids: linkedActionIds,
              sort: "chronological",
            });

      const responsePayload: LarryChatResponse = {
        conversationId: conversation.id,
        message: result.briefing,
        userMessage,
        assistantMessage: {
          ...assistantMessage,
          linkedActions,
        },
        linkedActions,
        actionsExecuted: autoResult.executedCount,
        suggestionCount: suggestResult.suggestedCount + autoResult.suggestedCount,
      };

      await Promise.all([
        writeAuditLog(fastify.db, {
          tenantId,
          actorUserId,
          actionType: "larry.chat",
          objectType: "project",
          objectId: projectId,
          details: {
            conversationId: conversation.id,
            actionsExecuted: autoResult.executedCount,
            suggestionCount: suggestResult.suggestedCount + autoResult.suggestedCount,
            linkedActionCount: linkedActions.length,
          },
        }),
        Promise.resolve(
          insertProjectMemoryEntry(fastify.db, tenantId, projectId, {
            source: "Larry chat",
            sourceKind: "chat",
            sourceRecordId: userMessageInsert.id,
            content: buildChatMemoryEntry(message, result.briefing),
          })
        ).catch((error) => {
          request.log.warn(
            { err: error, tenantId, projectId, conversationId: conversation.id },
            "project memory write failed for chat turn"
          );
        }),
      ]);

      return reply.code(200).send(responsePayload);
    }
  );
};
