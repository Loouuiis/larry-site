import { FastifyPluginAsync } from "fastify";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import {
  runIntelligence,
  ProviderError,
  classifyProviderError,
  streamLarryChat,
  streamModifyChat,
  detectInjectionAttempt,
  detectDestructiveSweep,
  TimelineRegroupArgsSchema,
} from "@larry/ai";
import type { ModifyChatStreamEvent } from "@larry/ai";
import type { ToolCallResult } from "@larry/ai";
import { executeTimelineSuggestion } from "../../lib/timeline-suggestion-executor.js";
import {
  applyPatch,
  assertPatchIsAllowed,
  editableFieldsForActionType,
  isModifiableActionType,
  getCanonicalEventRuntimeEntryById,
  getCanonicalEventRuntimeSummary,
  listCanonicalEventRetryCandidates,
  listCanonicalEventRuntimeEntries,
  executeAction,
  getPendingSuggestionTexts,
  getProjectSnapshot,
  insertProjectMemoryEntry,
  isUuidShape,
  listProjectMemoryEntries,
  runAutoActions,
  storeSuggestions,
  updateProjectLarryContext,
} from "@larry/db";
import { getApiEnv } from "@larry/config";
import type {
  CanonicalEvent,
  IntelligenceConfig,
  LarryAction,
  LarryActionType,
  LarryClarification,
  LarryChatResponse,
  LarryMessageRecord,
} from "@larry/shared";
import { writeAuditLog } from "../../lib/audit.js";
import { notifySafe } from "../../lib/notifications/safe.js";
import { buildPendingClause } from "../../lib/intelligence-hints.js";
import { reserveTokens, LLMQuotaError } from "../../lib/llm-budget.js";

// Conservative pre-call estimates. runIntelligence empirically lands around
// 9k tokens on our test tenant; streamLarryChat turns are typically 2-3k.
// Over-estimating slightly is intentional — a pre-reserved call that ends
// up cheaper is safer than the reverse. Reconciliation to actuals is a
// follow-up step (current AI SDK call paths don't surface usage yet).
const RUN_INTELLIGENCE_ESTIMATED_TOKENS = 9_500;
const STREAM_CHAT_ESTIMATED_TOKENS = 3_000;
import {
  ACTIVE_PROJECT_STATUS,
  ProjectStatusFilterSchema,
  projectStatusSql,
} from "../../lib/project-status.js";
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
import { deriveMeetingTitleFromTranscript } from "../../lib/meeting-title.js";
import {
  ARCHIVED_PROJECT_WRITE_LOCK_MESSAGE,
  isProjectWriteLocked,
  loadProjectWriteState,
} from "../../lib/project-write-lock.js";
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
import {
  createOutlookCalendarEvent,
  refreshOutlookAccessToken,
  updateOutlookCalendarEvent,
} from "../../services/connectors/outlook-calendar.js";
import { openSlackDmChannel, postSlackMessage } from "../../services/connectors/slack.js";

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
  if (config.MODEL_PROVIDER === "groq") {
    return { provider: "groq", apiKey: config.GROQ_API_KEY, model: config.GROQ_MODEL };
  }
  return { provider: "mock", model: "mock" };
}

function buildFallbackIntelligenceConfig(config: ReturnType<typeof getApiEnv>): IntelligenceConfig | undefined {
  if (config.MODEL_PROVIDER === "gemini" && config.GROQ_API_KEY) {
    return { provider: "groq", apiKey: config.GROQ_API_KEY, model: config.GROQ_MODEL };
  }
  if (config.MODEL_PROVIDER === "groq" && config.GEMINI_API_KEY) {
    return { provider: "gemini", apiKey: config.GEMINI_API_KEY, model: config.GEMINI_MODEL };
  }
  return undefined;
}

const ConversationQuerySchema = z.object({
  projectId: z.string().uuid().optional(),
  projectStatus: ProjectStatusFilterSchema.optional().default("all"),
});

const ActionCentreQuerySchema = z.object({
  projectId: z.string().uuid().optional(),
  projectStatus: ProjectStatusFilterSchema.optional().default("all"),
});

const MemoryQuerySchema = z.object({
  projectId: z.string().uuid(),
  sourceKind: z.string().trim().min(1).max(64).optional(),
  source: z.string().trim().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const RuntimeStatusSchema = z.enum(["running", "succeeded", "retryable_failed", "dead_lettered"]);
const RuntimeRetryableStatusSchema = z.enum(["retryable_failed", "dead_lettered"]);
const RuntimeSourceSchema = z.enum(["slack", "email", "calendar", "transcript"]);

const RuntimeCanonicalEventsQuerySchema = z.object({
  status: RuntimeStatusSchema.optional(),
  source: RuntimeSourceSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

const RuntimeCanonicalEventParamsSchema = z.object({
  id: z.string().uuid(),
});

const RuntimeRetryBodySchema = z.object({
  reason: z.string().trim().min(1).max(1_000).optional(),
});

const RuntimeRetryBulkBodySchema = z.object({
  status: z.enum(["retryable_failed", "dead_lettered", "all"]).default("all"),
  source: RuntimeSourceSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  execute: z.boolean().default(false),
  reason: z.string().trim().min(1).max(1_000).optional(),
});

const ChatSchema = z.object({
  projectId: z.string().uuid().optional(),
  message: z.string().trim().min(1).max(24_000),
  conversationId: z.string().uuid().optional(),
});

const CorrectionBodySchema = z.object({
  correctionType: z.string().trim().min(1).max(80),
  correctionPayload: z.record(z.string(), z.unknown()).default({}),
});

const GLOBAL_CHAT_PROJECT_LIMIT = 5;

const CalendarCreatePayloadSchema = z.object({
  provider: z.enum(["google", "outlook"]).nullable().optional(),
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
  provider: z.enum(["google", "outlook"]).nullable().optional(),
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

const CANONICAL_EVENT_SOURCE_SET = new Set<CanonicalEvent["source"]>([
  "slack",
  "email",
  "calendar",
  "transcript",
]);
const CANONICAL_EVENT_TYPE_SET = new Set<CanonicalEvent["eventType"]>([
  "commitment",
  "blocker",
  "progress",
  "decision",
  "question",
  "other",
]);

function isCanonicalEventSource(value: string): value is CanonicalEvent["source"] {
  return CANONICAL_EVENT_SOURCE_SET.has(value as CanonicalEvent["source"]);
}

function normalizeCanonicalEventType(value: string): CanonicalEvent["eventType"] {
  if (CANONICAL_EVENT_TYPE_SET.has(value as CanonicalEvent["eventType"])) {
    return value as CanonicalEvent["eventType"];
  }
  return "other";
}

function buildRuntimeRetryDedupeKey(canonicalEventId: string): string {
  const randomToken = Math.random().toString(16).slice(2, 10);
  return `runtime-retry:${canonicalEventId}:${Date.now()}:${randomToken}`;
}

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

/**
 * Thin pre-filter — only catches truly bare/empty requests.
 * All real intent classification is now handled by Larry's reasoning
 * framework in the system prompt (thinking field).
 */
function detectClarificationNeed(input: {
  message: string;
  tasks: Array<{ id: string; title: string }>;
}): { question: string; reason: string } | null {
  const trimmed = input.message.trim();

  if (trimmed.length < 3) {
    return {
      question: "I'm here. What would you like me to help with?",
      reason: "message_too_short",
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

interface OutlookCalendarInstallationRow {
  id: string;
  project_id: string | null;
  outlook_calendar_id: string;
  outlook_access_token: string;
  outlook_refresh_token: string | null;
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

interface GlobalChatRunResult {
  fullContent: string;
  results: GlobalProjectIntelligenceResult[];
  linkedActions: LarryMessageRecord["linkedActions"];
  actionsExecuted: number;
  suggestionCount: number;
}

interface LarryRulePromptRow {
  title: string;
  description: string;
  rule_type: string;
}

interface CorrectionPromptRow {
  correction_type: string;
  correction_payload: Record<string, unknown>;
  created_at: string | Date;
}

function buildGlobalNoProjectMessage(): string {
  return "I couldn't find any accessible projects to run this global chat request against. Select a project or ask an admin to grant project access.";
}

function buildGlobalGroupedSection(result: GlobalProjectIntelligenceResult): string {
  const header = `Project: ${result.projectName}`;
  if (result.error) {
    return `${header}\nI couldn't process this project right now: ${result.error}`;
  }

  const suffix =
    result.executedCount > 0 || result.suggestedCount > 0
      ? `\nActions: ${result.executedCount} executed, ${result.suggestedCount} pending approval.`
      : "";
  return `${header}\n${result.briefing}${suffix}`;
}

function buildGlobalGroupedMessage(results: GlobalProjectIntelligenceResult[]): string {
  const sections = results.map((result) => buildGlobalGroupedSection(result));

  return sections.join("\n\n").slice(0, 8_000);
}

function buildConversationHistoryHint(
  messages: Array<{ role: "user" | "larry"; content: string }>
): string {
  const relevantMessages = messages.slice(-10);
  if (relevantMessages.length === 0) {
    return "";
  }

  const historyLines = relevantMessages.map((message) => {
    const speaker = message.role === "user" ? "User" : "Larry";
    return `${speaker}: ${message.content.slice(0, 500)}`;
  });

  return `\n\nCONVERSATION HISTORY (most recent messages in this thread — use this to understand what the user is referring to):\n${historyLines.join("\n")}`;
}

function buildRulesAndCorrectionsHint(input: {
  rules: LarryRulePromptRow[];
  corrections: CorrectionPromptRow[];
}): string {
  const chunks: string[] = [];

  if (input.rules.length > 0) {
    const lines = input.rules.map(
      (rule, index) => `${index + 1}. [${rule.rule_type}] ${rule.title}: ${rule.description}`
    );
    chunks.push(`USER-DEFINED RULES Larry must follow:\n${lines.join("\n")}`);
  }

  if (input.corrections.length > 0) {
    const lines = input.corrections.map((item, index) => {
      const actionType = (item.correction_payload as Record<string, unknown>)?.actionType ?? "unknown";
      const reason = (item.correction_payload as Record<string, unknown>)?.reason ?? "";
      const reasonSuffix = typeof reason === "string" && reason.length > 0 ? ` — ${reason}` : "";
      const dateStr = item.created_at instanceof Date ? item.created_at.toISOString().slice(0, 10) : String(item.created_at).slice(0, 10);
      return `${index + 1}. ${item.correction_type.toUpperCase()}: ${actionType} (${dateStr})${reasonSuffix}`;
    });
    chunks.push(`PAST CORRECTIONS from the user — use these to calibrate your judgment:\n${lines.join("\n")}`);
  }

  return chunks.join("\n\n");
}

function isCalendarActionType(
  actionType: string
): actionType is "calendar_event_create" | "calendar_event_update" {
  return actionType === "calendar_event_create" || actionType === "calendar_event_update";
}

/**
 * Regenerate the short imperative that renders as the action card header when
 * a user modifies a pending suggestion (B-005). The shape mirrors the
 * `displayText` strings Larry emits at suggestion time in
 * `packages/ai/src/chat.ts` so completed cards read consistently regardless
 * of whether the user accepted as-is or modified first.
 *
 * Falls back to the prior displayText for action types we don't synthesise
 * here — losing accuracy on those is less harmful than a blank header.
 */
function rebuildDisplayText(
  actionType: string,
  payload: Record<string, unknown>,
  fallback: string,
): string {
  const str = (key: string): string | null => {
    const v = payload[key];
    return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
  };
  switch (actionType) {
    case "task_create": {
      const title = str("title");
      return title ? `Create task: ${title}` : fallback;
    }
    case "email_draft": {
      const subject = str("subject");
      const to = str("to");
      if (subject && to) return `Email ${to}: ${subject}`;
      if (subject) return `Email: ${subject}`;
      if (to) return `Email ${to}`;
      return fallback;
    }
    case "slack_message_draft": {
      const channel = str("channelName");
      return channel ? `Slack ${channel}` : fallback;
    }
    case "deadline_change": {
      const task = str("taskTitle");
      const when = str("newDeadline");
      if (task && when) return `Move "${task}" deadline to ${when}`;
      return fallback;
    }
    case "owner_change": {
      const task = str("taskTitle");
      const owner = str("newOwnerName");
      if (task && owner) return `Reassign "${task}" to ${owner}`;
      if (task) return `Unassign "${task}"`;
      return fallback;
    }
    case "status_update": {
      const task = str("taskTitle");
      const status = str("newStatus");
      if (task && status) return `Set "${task}" to ${status}`;
      return fallback;
    }
    case "risk_flag": {
      const task = str("taskTitle");
      const level = str("riskLevel");
      if (task && level) return `Flag "${task}" risk as ${level}`;
      return fallback;
    }
    case "scope_change": {
      const task = str("taskTitle");
      return task ? `Update scope of "${task}"` : fallback;
    }
    case "project_create": {
      const name = str("name");
      return name ? `Create project: ${name}` : fallback;
    }
    case "project_note_send": {
      return "Send project note";
    }
    default:
      return fallback;
  }
}

export const larryRoutes: FastifyPluginAsync = async (fastify) => {
  async function assertProjectAccessOrThrow(input: {
    tenantId: string;
    userId: string;
    tenantRole: string;
    projectId: string;
    mode: "read" | "manage";
    requireWritable?: boolean;
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

    if (input.requireWritable && isProjectWriteLocked(access.projectStatus)) {
      throw fastify.httpErrors.conflict(ARCHIVED_PROJECT_WRITE_LOCK_MESSAGE);
    }

    return access;
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
           AND ${projectStatusSql("p.status")} = '${ACTIVE_PROJECT_STATUS}'
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
         AND ${projectStatusSql("p.status")} = '${ACTIVE_PROJECT_STATUS}'
       ORDER BY p.updated_at DESC, p.created_at DESC
       LIMIT $3`,
      [input.tenantId, input.userId, input.limit]
    );
  }

  async function loadGlobalConversationHistoryHint(input: {
    tenantId: string;
    conversationId: string | null;
    currentMessage?: string | null;
  }): Promise<string> {
    if (!input.conversationId) {
      return "";
    }

    try {
      const priorMessages = await listLarryMessagesForConversation(
        fastify.db,
        input.tenantId,
        input.conversationId
      );
      const trimmedMessages =
        input.currentMessage &&
        priorMessages[priorMessages.length - 1]?.role === "user" &&
        priorMessages[priorMessages.length - 1]?.content === input.currentMessage
          ? priorMessages.slice(0, -1)
          : priorMessages;
      return buildConversationHistoryHint(trimmedMessages);
    } catch (err) {
      fastify.log.warn(
        { err, tenantId: input.tenantId, conversationId: input.conversationId },
        "Failed to load conversation history for global chat intelligence"
      );
      return "";
    }
  }

  async function runGlobalChatFlow(input: {
    tenantId: string;
    actorUserId: string;
    tenantRole: string;
    message: string;
    conversation: { id: string };
    userMessageInsert: { id: string; createdAt: string };
    assistantMessageId: string;
    existingConversationId: string | null;
    onChunk?: (text: string) => void | Promise<void>;
  }): Promise<GlobalChatRunResult> {
    const globalProjects = await listAccessibleProjectsForGlobalChat({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      tenantRole: input.tenantRole,
      limit: GLOBAL_CHAT_PROJECT_LIMIT,
    });

    if (globalProjects.length === 0) {
      const fallback = buildGlobalNoProjectMessage();

      await fastify.db.queryTenant<Record<string, unknown>>(
        input.tenantId,
        `UPDATE larry_messages SET content = $3 WHERE tenant_id = $1 AND id = $2`,
        [input.tenantId, input.assistantMessageId, fallback]
      );
      await touchLarryConversation(
        fastify.db,
        input.tenantId,
        input.conversation.id,
        input.message.slice(0, 80)
      );

      await writeAuditLog(fastify.db, {
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        actionType: "larry.chat.global",
        objectType: "workspace",
        objectId: input.tenantId,
        details: {
          conversationId: input.conversation.id,
          projectCount: 0,
          fanoutLimit: GLOBAL_CHAT_PROJECT_LIMIT,
          linkedActionCount: 0,
        },
      });

      if (input.onChunk) {
        await input.onChunk(fallback);
      }

      return {
        fullContent: fallback,
        results: [],
        linkedActions: [],
        actionsExecuted: 0,
        suggestionCount: 0,
      };
    }

    const config = buildIntelligenceConfig(fastify.config);
    const [activeRules, recentCorrections, conversationHistoryHint] = await Promise.all([
      listActiveLarryRules(input.tenantId).catch(() => [] as LarryRulePromptRow[]),
      listRecentCorrectionFeedback(input.tenantId).catch(() => [] as CorrectionPromptRow[]),
      loadGlobalConversationHistoryHint({
        tenantId: input.tenantId,
        conversationId: input.existingConversationId,
        currentMessage: input.message,
      }),
    ]);
    const guidanceHint = buildRulesAndCorrectionsHint({
      rules: activeRules,
      corrections: recentCorrections,
    });

    const actionContext = {
      conversationId: input.conversation.id,
      requestMessageId: input.userMessageInsert.id,
      responseMessageId: input.assistantMessageId,
      requesterUserId: input.actorUserId,
      sourceKind: "direct_chat",
      sourceRecordId: input.userMessageInsert.id,
    } as const;

    // N-11 (derivative of N-9): run project fan-out SEQUENTIALLY, not in
    // parallel. Each runIntelligence call is ~9k tokens on our test
    // tenant; with GLOBAL_CHAT_PROJECT_LIMIT=5 the parallel burst
    // cumulatively exceeds the Groq free-tier 12k/minute TPM bucket
    // even though every individual request fits. Serial execution
    // keeps within-minute usage linear and removes the burst.
    const runProjectIntelligenceFlow = async (
      project: (typeof globalProjects)[number]
    ): Promise<GlobalProjectIntelligenceResult> => {
      try {
        await reserveTokens({
          tenantId: input.tenantId,
          provider: config.provider,
          estimatedTokens: RUN_INTELLIGENCE_ESTIMATED_TOKENS,
        });
        const snapshot = await getProjectSnapshot(fastify.db, input.tenantId, project.id);
        const pendingTexts = await getPendingSuggestionTexts(fastify.db, input.tenantId, project.id).catch(
          () => [] as string[]
        );
        const pendingClause = buildPendingClause(pendingTexts);
        const result = await runIntelligence(
          config,
          snapshot,
          `user said: "${input.message}"${conversationHistoryHint}${pendingClause}${guidanceHint ? `\n\n${guidanceHint}` : ""}`
        );

        if (result.contextUpdate) {
          await updateProjectLarryContext(fastify.db, input.tenantId, project.id, result.contextUpdate);
        }

        try {
          const [autoResult, suggestResult] = await Promise.all([
            runAutoActions(
              fastify.db,
              input.tenantId,
              project.id,
              "chat",
              result.autoActions,
              input.message,
              actionContext
            ),
            storeSuggestions(
              fastify.db,
              input.tenantId,
              project.id,
              "chat",
              result.suggestedActions,
              input.message,
              actionContext
            ),
          ]);

          await Promise.resolve(
            insertProjectMemoryEntry(fastify.db, input.tenantId, project.id, {
              source: "Larry chat",
              sourceKind: "direct_chat",
              sourceRecordId: input.userMessageInsert.id,
              content: buildChatMemoryEntry(input.message, result.briefing),
            })
          ).catch((error) => {
            fastify.log.warn(
              { err: error, tenantId: input.tenantId, projectId: project.id, conversationId: input.conversation.id },
              "project memory write failed for global chat turn"
            );
          });

          return {
            projectId: project.id,
            projectName: project.name,
            briefing: result.briefing,
            executedCount: autoResult.executedCount,
            suggestedCount: suggestResult.suggestedCount + autoResult.suggestedCount,
            eventIds: [...autoResult.eventIds, ...suggestResult.eventIds],
          };
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          fastify.log.warn(
            { err: error, tenantId: input.tenantId, projectId: project.id, conversationId: input.conversation.id },
            "global chat action execution failed for project"
          );
          return {
            projectId: project.id,
            projectName: project.name,
            briefing: result.briefing,
            executedCount: 0,
            suggestedCount: 0,
            eventIds: [],
            error: reason,
          };
        }
      } catch (error) {
        const reason = error instanceof LLMQuotaError
          ? "Larry has reached its daily AI limit for this workspace. Suggestions will resume tomorrow."
          : (error instanceof Error ? error.message : String(error));
        fastify.log.warn(
          { err: error, tenantId: input.tenantId, projectId: project.id, userId: input.actorUserId },
          "global chat intelligence failed for project"
        );
        return {
          projectId: project.id,
          projectName: project.name,
          briefing: "",
          executedCount: 0,
          suggestedCount: 0,
          eventIds: [],
          error: reason,
        };
      }
    };

    const finalizedResults: GlobalProjectIntelligenceResult[] = [];
    let fullContent = "";
    let remainingChars = 8_000;

    for (const project of globalProjects) {
      const result = await runProjectIntelligenceFlow(project);
      finalizedResults.push(result);

      const section = buildGlobalGroupedSection(result);
      const chunk = fullContent.length > 0 ? `\n\n${section}` : section;
      if (remainingChars <= 0) {
        continue;
      }

      const nextChunk = chunk.slice(0, remainingChars);
      if (!nextChunk) {
        continue;
      }

      fullContent += nextChunk;
      remainingChars -= nextChunk.length;

      if (input.onChunk) {
        await input.onChunk(nextChunk);
      }
    }

    const linkedActionIds = finalizedResults.flatMap((result) => result.eventIds);
    const linkedActions =
      linkedActionIds.length === 0
        ? []
        : await listLarryEventSummaries(fastify.db, input.tenantId, {
            ids: linkedActionIds,
            sort: "chronological",
          });
    const actionsExecuted = finalizedResults.reduce((sum, result) => sum + result.executedCount, 0);
    const suggestionCount = finalizedResults.reduce((sum, result) => sum + result.suggestedCount, 0);

    // Never persist a literal "(no response)" — fall back to a neutral hint
    // so the user sees something instead of a silent failure (QA-2026-04-12 C-3).
    const globalMessageContent = fullContent.trim().length > 0
      ? fullContent
      : "I couldn't pull anything useful together for that. Ask me about a specific project and I'll dig in.";
    await fastify.db.queryTenant<Record<string, unknown>>(
      input.tenantId,
      `UPDATE larry_messages SET content = $3 WHERE tenant_id = $1 AND id = $2`,
      [input.tenantId, input.assistantMessageId, globalMessageContent]
    );
    await touchLarryConversation(
      fastify.db,
      input.tenantId,
      input.conversation.id,
      input.message.slice(0, 80)
    );

    await writeAuditLog(fastify.db, {
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      actionType: "larry.chat.global",
      objectType: "workspace",
      objectId: input.tenantId,
      details: {
        conversationId: input.conversation.id,
        fanoutLimit: GLOBAL_CHAT_PROJECT_LIMIT,
        touchedProjectIds: finalizedResults.map((result) => result.projectId),
        actionsExecuted,
        suggestionCount,
        linkedActionCount: linkedActions.length,
      },
    });

    return {
      fullContent,
      results: finalizedResults,
      linkedActions,
      actionsExecuted,
      suggestionCount,
    };
  }

  async function loadProjectLinkedCalendarInstallation(input: {
    tenantId: string;
    projectId: string;
  }): Promise<
    | { provider: "google"; installation: GoogleCalendarInstallationRow }
    | { provider: "outlook"; installation: OutlookCalendarInstallationRow }
  > {
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
      const outlookRows = await fastify.db.queryTenant<OutlookCalendarInstallationRow>(
        input.tenantId,
        `SELECT id,
                project_id,
                outlook_calendar_id,
                outlook_access_token,
                outlook_refresh_token,
                token_expires_at
         FROM outlook_calendar_installations
         WHERE tenant_id = $1
           AND project_id = $2
         ORDER BY updated_at DESC
         LIMIT 1`,
        [input.tenantId, input.projectId]
      );

      if (!outlookRows[0]) {
        throw new Error(
          "No calendar connector is linked to this project. Link Google or Outlook Calendar in Workspace Settings > Connectors and try again."
        );
      }

      return {
        provider: "outlook",
        installation: outlookRows[0],
      };
    }

    return {
      provider: "google",
      installation: rows[0],
    };
  }

  async function loadFallbackCalendarInstallation(input: {
    tenantId: string;
    provider?: "google" | "outlook" | null;
  }): Promise<
    | { provider: "google"; installation: GoogleCalendarInstallationRow }
    | { provider: "outlook"; installation: OutlookCalendarInstallationRow }
    | null
  > {
    if (input.provider !== "outlook") {
      const googleRows = await fastify.db.queryTenant<GoogleCalendarInstallationRow>(
        input.tenantId,
        `SELECT id,
                project_id,
                google_calendar_id,
                google_access_token,
                google_refresh_token,
                token_expires_at
         FROM google_calendar_installations
         WHERE tenant_id = $1
         ORDER BY updated_at DESC
         LIMIT 1`,
        [input.tenantId]
      );
      if (googleRows[0]) {
        return { provider: "google", installation: googleRows[0] };
      }
    }

    if (input.provider !== "google") {
      const outlookRows = await fastify.db.queryTenant<OutlookCalendarInstallationRow>(
        input.tenantId,
        `SELECT id,
                project_id,
                outlook_calendar_id,
                outlook_access_token,
                outlook_refresh_token,
                token_expires_at
         FROM outlook_calendar_installations
         WHERE tenant_id = $1
         ORDER BY updated_at DESC
         LIMIT 1`,
        [input.tenantId]
      );
      if (outlookRows[0]) {
        return { provider: "outlook", installation: outlookRows[0] };
      }
    }

    return null;
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

  async function ensureFreshOutlookAccessToken(input: {
    tenantId: string;
    installation: OutlookCalendarInstallationRow;
  }): Promise<string> {
    const expiresAt = input.installation.token_expires_at
      ? new Date(input.installation.token_expires_at).getTime()
      : null;
    const aboutToExpire = expiresAt !== null && expiresAt <= Date.now() + 60_000;

    if (!aboutToExpire) {
      return input.installation.outlook_access_token;
    }

    if (!input.installation.outlook_refresh_token) {
      throw new Error(
        "Outlook Calendar access token expired and no refresh token is available. Reconnect the connector and retry."
      );
    }

    if (!fastify.config.OUTLOOK_CLIENT_ID || !fastify.config.OUTLOOK_CLIENT_SECRET) {
      throw new Error(
        "Outlook Calendar OAuth credentials are not configured on the API. Set OUTLOOK_CLIENT_ID and OUTLOOK_CLIENT_SECRET."
      );
    }

    const refreshed = await refreshOutlookAccessToken({
      clientId: fastify.config.OUTLOOK_CLIENT_ID,
      clientSecret: fastify.config.OUTLOOK_CLIENT_SECRET,
      refreshToken: input.installation.outlook_refresh_token,
      scopes: fastify.config.OUTLOOK_CALENDAR_SCOPES,
    });

    await fastify.db.queryTenant(
      input.tenantId,
      `UPDATE outlook_calendar_installations
         SET outlook_access_token = $3,
             outlook_refresh_token = COALESCE($4, outlook_refresh_token),
             outlook_scope = COALESCE($5, outlook_scope),
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
    const providerHint =
      (typeof input.payload.provider === "string" &&
      (input.payload.provider === "google" || input.payload.provider === "outlook")
        ? input.payload.provider
        : null) as "google" | "outlook" | null;

    const linkedInstallation = await loadProjectLinkedCalendarInstallation({
      tenantId: input.tenantId,
      projectId: input.projectId,
    });
    const installation =
      providerHint && linkedInstallation.provider !== providerHint
        ? await loadFallbackCalendarInstallation({ tenantId: input.tenantId, provider: providerHint })
        : linkedInstallation;

    if (!installation) {
      throw new Error(
        "No active calendar connector found. Connect Google or Outlook Calendar in Workspace Settings > Connectors."
      );
    }

    const accessToken =
      installation.provider === "google"
        ? await ensureFreshGoogleAccessToken({
            tenantId: input.tenantId,
            installation: installation.installation,
          })
        : await ensureFreshOutlookAccessToken({
            tenantId: input.tenantId,
            installation: installation.installation,
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

      const calendarId =
        parsed.data.calendarId ??
        (installation.provider === "google"
          ? installation.installation.google_calendar_id
          : installation.installation.outlook_calendar_id);
      const created =
        installation.provider === "google"
          ? await createGoogleCalendarEvent({
              accessToken,
              calendarId,
              summary: parsed.data.summary,
              startDateTime: parsed.data.startDateTime,
              endDateTime: parsed.data.endDateTime,
              description: parsed.data.description ?? null,
              location: parsed.data.location ?? null,
              attendees: parsed.data.attendees ?? null,
              timeZone: parsed.data.timeZone ?? null,
            })
          : await createOutlookCalendarEvent({
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
        provider: installation.provider,
        calendarId,
        eventId: created.id,
        status: "status" in created ? created.status ?? null : null,
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

    const calendarId =
      parsed.data.calendarId ??
      (installation.provider === "google"
        ? installation.installation.google_calendar_id
        : installation.installation.outlook_calendar_id);
    const updated =
      installation.provider === "google"
        ? await updateGoogleCalendarEvent({
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
          })
        : await updateOutlookCalendarEvent({
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
      provider: installation.provider,
      calendarId,
      eventId: updated.id,
      status: "status" in updated ? updated.status ?? null : null,
      htmlLink: updated.htmlLink ?? null,
    };
  }

  async function listActiveLarryRules(tenantId: string): Promise<LarryRulePromptRow[]> {
    return fastify.db.queryTenant<LarryRulePromptRow>(
      tenantId,
      `SELECT title, description, rule_type
       FROM larry_rules
       WHERE tenant_id = $1
         AND is_active = true
       ORDER BY created_at DESC
       LIMIT 10`,
      [tenantId]
    );
  }

  async function listRecentCorrectionFeedback(tenantId: string): Promise<CorrectionPromptRow[]> {
    return fastify.db.queryTenant<CorrectionPromptRow>(
      tenantId,
      `SELECT correction_type,
              correction_payload,
              created_at
       FROM correction_feedback
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [tenantId]
    );
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
        {
          projectId: parseResult.data.projectId,
          projectStatus: parseResult.data.projectId ? "all" : parseResult.data.projectStatus,
        }
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
        parseResult.data.projectId,
        parseResult.data.projectId ? "all" : parseResult.data.projectStatus
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

  fastify.get(
    "/runtime/canonical-events",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm"])] },
    async (request) => {
      const parseResult = RuntimeCanonicalEventsQuerySchema.safeParse(request.query);
      if (!parseResult.success) {
        throw fastify.httpErrors.badRequest(parseResult.error.issues[0]?.message ?? "Invalid query params");
      }

      const query = parseResult.data;
      const [items, summary] = await Promise.all([
        listCanonicalEventRuntimeEntries(fastify.db, request.user.tenantId, {
          status: query.status,
          source: query.source,
          limit: query.limit,
        }),
        getCanonicalEventRuntimeSummary(fastify.db, request.user.tenantId, {
          source: query.source,
        }),
      ]);

      return {
        items,
        summary,
        filters: {
          status: query.status ?? null,
          source: query.source ?? null,
          limit: query.limit,
        },
      };
    }
  );

  fastify.get(
    "/runtime/canonical-events/:id",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm"])] },
    async (request) => {
      const params = RuntimeCanonicalEventParamsSchema.safeParse(request.params);
      if (!params.success) {
        throw fastify.httpErrors.badRequest(params.error.issues[0]?.message ?? "Invalid event id");
      }

      const item = await getCanonicalEventRuntimeEntryById(
        fastify.db,
        request.user.tenantId,
        params.data.id
      );
      if (!item) {
        throw fastify.httpErrors.notFound("Canonical event not found.");
      }

      return { item };
    }
  );

  fastify.post(
    "/runtime/canonical-events/:id/retry",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm"])] },
    async (request, reply) => {
      const params = RuntimeCanonicalEventParamsSchema.safeParse(request.params);
      if (!params.success) {
        throw fastify.httpErrors.badRequest(params.error.issues[0]?.message ?? "Invalid event id");
      }
      const body = RuntimeRetryBodySchema.safeParse(request.body ?? {});
      if (!body.success) {
        throw fastify.httpErrors.badRequest(body.error.issues[0]?.message ?? "Invalid retry payload");
      }

      const runtimeEntry = await getCanonicalEventRuntimeEntryById(
        fastify.db,
        request.user.tenantId,
        params.data.id
      );
      if (!runtimeEntry) {
        throw fastify.httpErrors.notFound("Canonical event not found.");
      }
      if (runtimeEntry.latestStatus === "running") {
        throw fastify.httpErrors.conflict(
          "Canonical event is currently running and cannot be retried yet."
        );
      }
      if (
        runtimeEntry.latestStatus !== "retryable_failed" &&
        runtimeEntry.latestStatus !== "dead_lettered"
      ) {
        throw fastify.httpErrors.conflict(
          "Only retryable_failed or dead_lettered canonical events can be retried."
        );
      }
      if (!isCanonicalEventSource(runtimeEntry.source)) {
        throw fastify.httpErrors.unprocessableEntity(
          `Unsupported canonical event source '${runtimeEntry.source}'.`
        );
      }

      const dedupeKey = buildRuntimeRetryDedupeKey(runtimeEntry.canonicalEventId);
      await fastify.queue.publish({
        type: "canonical_event.created",
        tenantId: request.user.tenantId,
        dedupeKey,
        payload: {
          canonicalEventId: runtimeEntry.canonicalEventId,
          source: runtimeEntry.source,
          eventType: normalizeCanonicalEventType(runtimeEntry.eventType),
        },
      });

      await writeAuditLog(fastify.db, {
        tenantId: request.user.tenantId,
        actorUserId: request.user.userId,
        actionType: "larry.runtime.canonical_event.retry",
        objectType: "canonical_event",
        objectId: runtimeEntry.canonicalEventId,
        details: {
          reason: body.data.reason ?? null,
          previousStatus: runtimeEntry.latestStatus,
          previousAttemptNumber: runtimeEntry.latestAttemptNumber,
          previousMaxAttempts: runtimeEntry.latestMaxAttempts,
          dedupeKey,
        },
      });

      return reply.code(202).send({
        queued: true,
        canonicalEventId: runtimeEntry.canonicalEventId,
        dedupeKey,
        previousStatus: runtimeEntry.latestStatus,
      });
    }
  );

  fastify.post(
    "/runtime/canonical-events/retry-bulk",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm"])] },
    async (request, reply) => {
      const parseResult = RuntimeRetryBulkBodySchema.safeParse(request.body ?? {});
      if (!parseResult.success) {
        throw fastify.httpErrors.badRequest(parseResult.error.issues[0]?.message ?? "Invalid bulk retry payload");
      }

      const body = parseResult.data;
      const statusFilter =
        body.status === "all"
          ? (["retryable_failed", "dead_lettered"] as Array<z.infer<typeof RuntimeRetryableStatusSchema>>)
          : [body.status];

      const candidates = await listCanonicalEventRetryCandidates(fastify.db, request.user.tenantId, {
        statuses: statusFilter,
        source: body.source,
        limit: body.limit,
      });

      if (!body.execute) {
        return reply.code(200).send({
          dryRun: true,
          candidateCount: candidates.length,
          candidates,
          filters: {
            status: body.status,
            source: body.source ?? null,
            limit: body.limit,
          },
        });
      }

      const queued: Array<{ canonicalEventId: string; dedupeKey: string }> = [];
      const skipped: Array<{ canonicalEventId: string; reason: string }> = [];

      for (const candidate of candidates) {
        if (!isCanonicalEventSource(candidate.source)) {
          skipped.push({
            canonicalEventId: candidate.canonicalEventId,
            reason: `Unsupported source '${candidate.source}'.`,
          });
          continue;
        }

        const dedupeKey = buildRuntimeRetryDedupeKey(candidate.canonicalEventId);
        await fastify.queue.publish({
          type: "canonical_event.created",
          tenantId: request.user.tenantId,
          dedupeKey,
          payload: {
            canonicalEventId: candidate.canonicalEventId,
            source: candidate.source,
            eventType: normalizeCanonicalEventType(candidate.eventType),
          },
        });

        queued.push({
          canonicalEventId: candidate.canonicalEventId,
          dedupeKey,
        });
      }

      await writeAuditLog(fastify.db, {
        tenantId: request.user.tenantId,
        actorUserId: request.user.userId,
        actionType: "larry.runtime.canonical_event.retry_bulk",
        objectType: "canonical_event",
        objectId: "bulk",
        details: {
          reason: body.reason ?? null,
          status: body.status,
          source: body.source ?? null,
          limit: body.limit,
          candidateCount: candidates.length,
          queuedCount: queued.length,
          skippedCount: skipped.length,
        },
      });

      return reply.code(202).send({
        dryRun: false,
        candidateCount: candidates.length,
        queuedCount: queued.length,
        skippedCount: skipped.length,
        queued,
        skipped,
        filters: {
          status: body.status,
          source: body.source ?? null,
          limit: body.limit,
        },
      });
    }
  );

  fastify.post(
    "/events/:id/accept",
    { preHandler: [fastify.authenticate, fastify.requireRole(["owner", "admin", "pm"])] },
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const actorUserId = request.user.userId;
      const { id } = request.params as { id: string };
      // N-10: short-circuit on malformed UUID before any DB call.
      // Previously pg threw "invalid input syntax for type uuid"
      // and surfaced as a generic 500.
      if (!isUuidShape(id)) {
        throw fastify.httpErrors.badRequest("Invalid event id.");
      }

      const event = await getLarryEventForMutation(fastify.db, tenantId, id);
      if (!event) {
        throw fastify.httpErrors.notFound("Event not found.");
      }

      // Timeline reorganisation suggestions have project_id = NULL because they
      // span the whole workspace. Gate on workspace role (already done by
      // preHandler) and skip the project-access check.
      if (typeof event.actionType === "string" && event.actionType.startsWith("timeline_")) {
        if (event.eventType !== "suggested") {
          throw fastify.httpErrors.conflict("Only suggested events can be accepted.");
        }
        const parsed = TimelineRegroupArgsSchema.parse(event.payload);
        const result = await executeTimelineSuggestion(
          fastify, tenantId, id, parsed, actorUserId,
        );
        return reply.code(200).send({ accepted: true, result });
      }

      await assertProjectAccessOrThrow({
        tenantId,
        userId: actorUserId,
        tenantRole: request.user.role,
        projectId: event.projectId,
        mode: "manage",
        requireWritable: true,
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
        } else if (event.actionType === "slack_message_draft") {
          entity = await executeAction(
            fastify.db,
            tenantId,
            event.projectId,
            event.actionType as LarryActionType,
            { ...event.payload, displayText: event.displayText },
            actorUserId
          );

          const channelName = typeof event.payload.channelName === "string" ? event.payload.channelName : null;
          const messageText = typeof event.payload.message === "string" ? event.payload.message : null;
          const threadTs = typeof event.payload.threadTs === "string" ? event.payload.threadTs : undefined;
          const isDm = event.payload.isDm === true;
          const slackUserId = typeof event.payload.slackUserId === "string" ? event.payload.slackUserId : null;

          if (messageText && (channelName || (isDm && slackUserId))) {
            try {
              const slackInstallation = await fastify.db.queryTenant<{ bot_access_token: string }>(
                tenantId,
                `SELECT bot_access_token
                 FROM slack_installations
                 WHERE tenant_id = $1
                 ORDER BY updated_at DESC
                 LIMIT 1`,
                [tenantId]
              );

              if (slackInstallation[0]?.bot_access_token) {
                const botToken = slackInstallation[0].bot_access_token;

                // Resolve DM channel if needed
                let targetChannel = channelName ?? "";
                if (isDm && slackUserId) {
                  const dmChannel = await openSlackDmChannel(botToken, slackUserId);
                  if (dmChannel) {
                    targetChannel = dmChannel;
                  } else {
                    (entity as Record<string, unknown>).slackSent = false;
                    (entity as Record<string, unknown>).slackError = "Could not open DM channel with user.";
                    return;
                  }
                }

                const slackResult = await postSlackMessage(botToken, targetChannel, messageText, threadTs);

                if (slackResult.ok) {
                  (entity as Record<string, unknown>).slackSent = true;
                } else {
                  request.log.warn(
                    { tenantId, eventId: id, error: slackResult.error },
                    "Slack message send failed after approval"
                  );
                  (entity as Record<string, unknown>).slackSent = false;
                  (entity as Record<string, unknown>).slackError = slackResult.error ?? "Unknown Slack API error";
                }
              } else {
                request.log.warn({ tenantId, eventId: id }, "No Slack installation found for tenant — draft stored but not sent");
                (entity as Record<string, unknown>).slackSent = false;
                (entity as Record<string, unknown>).slackError = "No Slack connector installed. Connect Slack in Settings > Connectors.";
              }
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : String(err);
              request.log.warn({ err, tenantId, eventId: id }, "Slack message delivery failed");
              (entity as Record<string, unknown>).slackSent = false;
              (entity as Record<string, unknown>).slackError = errMsg;
            }
          }
        } else {
          const actionPayload =
            event.actionType === "project_note_send"
              ? {
                  ...event.payload,
                  displayText: event.displayText,
                  sourceKind: "action",
                  sourceRecordId: id,
                }
              : { ...event.payload, displayText: event.displayText };

          entity = await executeAction(
            fastify.db,
            tenantId,
            event.projectId,
            event.actionType as LarryActionType,
            actionPayload,
            actorUserId
          );
        }
      } catch (firstError) {
        // ── Retry with resolution ──────────────────────────────────────
        // When the first attempt fails (e.g. hallucinated taskId, unresolvable
        // title, unresolvable user), try to repair the payload and execute
        // again before giving up with a 422.
        const firstMsg = firstError instanceof Error ? firstError.message : String(firstError);
        const isTaskResolution =
          firstMsg.includes("taskId could not be resolved") ||
          firstMsg.includes("not found for tenant");
        const isUserResolution =
          firstMsg.includes("user") && firstMsg.includes("not found in tenant");
        const isMissingField =
          firstMsg.includes("missing required field");
        const isNullConstraint =
          firstMsg.includes("violates not-null constraint") ||
          firstMsg.includes("null value in column");

        if (isTaskResolution || isUserResolution) {
          try {
            // Build a clean payload — strip the bad taskId so ensureTaskId
            // forces a fresh title-based resolution on the retry
            const retryPayload: Record<string, unknown> = {
              ...event.payload,
              displayText: event.displayText,
            };
            if (isTaskResolution) {
              delete retryPayload.taskId;
            }
            if (event.actionType === "project_note_send") {
              retryPayload.sourceKind = "action";
              retryPayload.sourceRecordId = id;
            }

            entity = await executeAction(
              fastify.db,
              tenantId,
              event.projectId,
              event.actionType as LarryActionType,
              retryPayload,
              actorUserId
            );
            request.log.info(
              { tenantId, eventId: id, originalError: firstMsg },
              "Accept succeeded on retry after payload repair"
            );
          } catch (retryError) {
            // Both attempts failed — return a structured error with candidate tasks
            const retryMsg = retryError instanceof Error ? retryError.message : String(retryError);
            let candidates: Array<{ id: string; title: string }> = [];
            try {
              candidates = await fastify.db.queryTenant<{ id: string; title: string }>(
                tenantId,
                `SELECT id, title
                 FROM tasks
                 WHERE tenant_id = $1 AND project_id = $2
                 ORDER BY updated_at DESC
                 LIMIT 10`,
                [tenantId, event.projectId]
              );
            } catch { /* best-effort */ }

            return reply.code(422).send({
              statusCode: 422,
              error: "Unprocessable Entity",
              message: candidates.length > 0
                ? "Could not match the task. Edit the action to pick the correct task."
                : "No tasks found in this project. The referenced task may have been deleted.",
              originalError: retryMsg,
              resolvable: candidates.length > 0,
              candidates,
            });
          }
        } else if (isMissingField || isNullConstraint) {
          // ── Missing required field / null constraint ─────────────────
          // The action payload is incomplete (e.g., null recipient on email_draft,
          // null status on status_update). These cannot be retried — the payload
          // itself needs editing. Return a clear, user-facing error.
          request.log.warn(
            { tenantId, eventId: id, actionType: event.actionType, error: firstMsg },
            "Accept failed: action payload has missing or null required fields"
          );

          // Extract the missing field names from the error message for a clear UI message
          const friendlyType: Record<string, string> = {
            task_create: "Create Task",
            status_update: "Status Update",
            risk_flag: "Risk Flag",
            reminder_send: "Reminder",
            deadline_change: "Deadline Change",
            owner_change: "Owner Change",
            scope_change: "Scope Change",
            email_draft: "Email Draft",
            project_create: "Create Project",
            collaborator_add: "Add Collaborator",
            collaborator_role_update: "Update Collaborator Role",
            collaborator_remove: "Remove Collaborator",
            project_note_send: "Project Note",
            calendar_event_create: "Create Calendar Event",
            calendar_event_update: "Update Calendar Event",
            slack_message_draft: "Slack Message",
          };
          const actionLabel = friendlyType[event.actionType] ?? event.actionType;

          return reply.code(422).send({
            statusCode: 422,
            error: "Unprocessable Entity",
            message: `This ${actionLabel} action is missing required information and cannot be executed. Use "Modify" to edit the action, or dismiss it and ask Larry to regenerate it with complete details.`,
            originalError: firstMsg,
            resolvable: true,
            candidates: [],
          });
        } else {
          // ── Other errors ────────────────────────────────────────────
          // These already have clear, user-facing messages (e.g. "No calendar
          // connector is linked to this project") — preserve the original message.
          throw fastify.httpErrors.unprocessableEntity(firstMsg);
        }
      }

      await markLarryEventAccepted(fastify.db, tenantId, id, actorUserId);

      await fastify.db.queryTenant(
        tenantId,
        `INSERT INTO correction_feedback
           (tenant_id, action_id, corrected_by_user_id, correction_type, correction_payload)
         VALUES
           ($1, $2, $3, 'accepted', $4::jsonb)`,
        [tenantId, id, actorUserId, JSON.stringify({ actionType: event.actionType })]
      );

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

      await notifySafe({
        db: fastify.db,
        tenantId,
        userId: actorUserId,
        type: "action.executed",
        payload: { actionId: id, label: event.actionType ?? "action" },
        logger: fastify.log,
      });

      return reply.code(200).send({ accepted: true, entity, event: updatedEvent ?? null });
    }
  );

  fastify.post(
    "/events/:id/dismiss",
    { preHandler: [fastify.authenticate, fastify.requireRole(["owner", "admin", "pm", "member"])] },
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const actorUserId = request.user.userId;
      const { id } = request.params as { id: string };
      if (!isUuidShape(id)) {
        throw fastify.httpErrors.badRequest("Invalid event id.");
      }
      const body = z.object({ reason: z.string().max(1000).optional() }).parse(request.body ?? {});

      const event = await getLarryEventForMutation(fastify.db, tenantId, id);
      if (!event) {
        throw fastify.httpErrors.notFound("Event not found.");
      }

      // Timeline reorganisation suggestions have project_id = NULL — skip the
      // project-access check. Still use the standard dismiss path (just without
      // the project gate).
      if (typeof event.actionType === "string" && event.actionType.startsWith("timeline_")) {
        if (event.eventType !== "suggested") {
          throw fastify.httpErrors.conflict("Only suggested events can be dismissed.");
        }
        await markLarryEventDismissed(fastify.db, tenantId, id, actorUserId, body.reason ?? null);
        return reply.code(200).send({ dismissed: true });
      }

      await assertProjectAccessOrThrow({
        tenantId,
        userId: actorUserId,
        tenantRole: request.user.role,
        projectId: event.projectId,
        mode: "manage",
        requireWritable: true,
      });
      if (event.eventType !== "suggested") {
        throw fastify.httpErrors.conflict("Only suggested events can be dismissed.");
      }

      await markLarryEventDismissed(fastify.db, tenantId, id, actorUserId, body.reason ?? null);

      await fastify.db.queryTenant(
        tenantId,
        `INSERT INTO correction_feedback
           (tenant_id, action_id, corrected_by_user_id, correction_type, correction_payload)
         VALUES
           ($1, $2, $3, 'dismissed', $4::jsonb)`,
        [tenantId, id, actorUserId, JSON.stringify({ reason: body.reason ?? null })]
      );

      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId,
        actionType: "larry.event.dismissed",
        objectType: "larry_event",
        objectId: id,
        details: { reason: body.reason ?? null },
      });

      const [updatedEvent] = await listLarryEventSummaries(fastify.db, tenantId, { ids: [id] });

      // Record dismissal in project memory for future intelligence context
      Promise.resolve(
        insertProjectMemoryEntry(fastify.db, tenantId, event.projectId, {
          source: "Action Centre",
          sourceKind: "action",
          sourceRecordId: id,
          content: `DISMISSED: ${updatedEvent?.displayText ?? "Larry suggestion"}. ${updatedEvent?.reasoning ?? ""}${body.reason ? ` User reason: ${body.reason}` : ""}`.trim().slice(0, 4_000),
        })
      ).catch((error) => {
        request.log.warn(
          { err: error, tenantId, eventId: id, projectId: event.projectId },
          "project memory write failed for dismissed event"
        );
      });

      return reply.code(200).send({ dismissed: true, event: updatedEvent ?? null });
    }
  );

  // POST /events/:id/modify — returns an editable snapshot of a pending suggestion.
  // Per spec 2026-04-15-modify-action-design.md: no DB write, no dismissal. The
  // frontend opens the Modify panel with this snapshot, lets the user edit fields
  // or chat via /modify-chat, and commits via /modify/save.
  fastify.post(
    "/events/:id/modify",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm"])] },
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const actorUserId = request.user.userId;
      const { id } = request.params as { id: string };
      if (!isUuidShape(id)) {
        throw fastify.httpErrors.badRequest("Invalid event id.");
      }

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
        requireWritable: true,
      });
      if (event.eventType !== "suggested") {
        throw fastify.httpErrors.conflict("Only suggested events can be modified.");
      }

      if (!isModifiableActionType(event.actionType)) {
        throw fastify.httpErrors.unprocessableEntity(
          `Action type '${event.actionType}' is not modifiable.`
        );
      }
      const editableFields = editableFieldsForActionType(event.actionType);

      const teamMembers = await fastify.db.queryTenant<{
        userId: string;
        displayName: string;
        email: string;
      }>(
        tenantId,
        `SELECT u.id AS "userId",
                COALESCE(u.display_name, u.email) AS "displayName",
                u.email
           FROM users u
           JOIN project_memberships pm ON pm.user_id = u.id
          WHERE pm.tenant_id = $1 AND pm.project_id = $2
          ORDER BY "displayName" ASC`,
        [tenantId, event.projectId]
      );

      return reply.code(200).send({
        eventId: id,
        actionType: event.actionType,
        displayText: event.displayText,
        reasoning: event.reasoning,
        payload: event.payload ?? {},
        editableFields,
        teamMembers,
      });
    }
  );

  // POST /events/:id/modify/save — applies an edit patch to a pending suggestion
  // and (optionally) executes it atomically. Spec: 2026-04-15-modify-action-design.md.
  const ModifySaveBodySchema = z.object({
    payloadPatch: z.record(z.string(), z.unknown()),
    executeImmediately: z.boolean(),
    conversationId: z.string().uuid().optional(),
  });

  fastify.post(
    "/events/:id/modify/save",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm"])] },
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const actorUserId = request.user.userId;
      const { id } = request.params as { id: string };
      if (!isUuidShape(id)) {
        throw fastify.httpErrors.badRequest("Invalid event id.");
      }

      const parsed = ModifySaveBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        throw fastify.httpErrors.badRequest(
          parsed.error.issues[0]?.message ?? "Invalid body."
        );
      }
      const { payloadPatch, executeImmediately } = parsed.data;

      // Re-fetch under the suggested guard — race-safe against concurrent accept.
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
        requireWritable: true,
      });
      if (event.eventType !== "suggested") {
        throw fastify.httpErrors.conflict(
          "This suggestion was already resolved elsewhere."
        );
      }

      try {
        assertPatchIsAllowed(event.actionType, payloadPatch);
      } catch (err) {
        throw fastify.httpErrors.unprocessableEntity(
          err instanceof Error ? err.message : String(err)
        );
      }

      const nextPayload = applyPatch(
        (event.payload ?? {}) as Record<string, unknown>,
        payloadPatch
      );

      // B-005: regenerate displayText from the modified payload so completed
      // cards reflect what was actually executed, not Larry's pre-modify
      // "Create task: <old title>" line. Falls back to the original displayText
      // when the payload doesn't drive a synthesisable header.
      const nextDisplayText = rebuildDisplayText(
        event.actionType,
        nextPayload,
        event.displayText,
      );

      // Persist the edit first. If the user is only saving (not executing), we're done.
      // If they're also executing, we run the executor; on executor failure we intentionally
      // leave the edited payload in place so the user can retry Accept without re-editing.
      const updatedRows = await fastify.db.queryTenant<{ id: string }>(
        tenantId,
        `UPDATE larry_events
            SET previous_payload    = COALESCE(previous_payload, payload),
                payload             = $3::jsonb,
                display_text        = $5,
                modified_by_user_id = $4,
                modified_at         = NOW()
          WHERE tenant_id = $1
            AND id        = $2
            AND event_type = 'suggested'
        RETURNING id`,
        [tenantId, id, JSON.stringify(nextPayload), actorUserId, nextDisplayText]
      );
      if (updatedRows.length === 0) {
        // Lost the race — another tab resolved the event between our fetch and UPDATE.
        throw fastify.httpErrors.conflict(
          "This suggestion was already resolved elsewhere."
        );
      }

      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId,
        actionType: "larry.event.modified",
        objectType: "larry_event",
        objectId: id,
        details: {
          actionType: event.actionType,
          changedKeys: Object.keys(payloadPatch),
        },
      });

      if (!executeImmediately) {
        const [persisted] = await listLarryEventSummaries(fastify.db, tenantId, { ids: [id] });
        return reply.code(200).send({ event: persisted ?? null, executed: false, entity: null });
      }

      // Execute the edited action. Retry-with-resolution mirrors the /accept handler
      // for the common hallucinated/stale taskId case; calendar and slack actions
      // are not modifiable per the spec, so this simpler path is sufficient.
      const executePayload = { ...nextPayload, displayText: nextDisplayText };
      let entity: unknown;
      try {
        entity = await executeAction(
          fastify.db,
          tenantId,
          event.projectId,
          event.actionType as LarryActionType,
          executePayload,
          actorUserId
        );
      } catch (firstError) {
        const firstMsg = firstError instanceof Error ? firstError.message : String(firstError);
        const canRetry =
          firstMsg.includes("taskId could not be resolved") ||
          firstMsg.includes("not found for tenant") ||
          (firstMsg.includes("user") && firstMsg.includes("not found in tenant"));

        if (canRetry) {
          try {
            const retryPayload: Record<string, unknown> = { ...executePayload };
            if (firstMsg.includes("taskId")) delete retryPayload.taskId;
            entity = await executeAction(
              fastify.db,
              tenantId,
              event.projectId,
              event.actionType as LarryActionType,
              retryPayload,
              actorUserId
            );
            request.log.info(
              { tenantId, eventId: id, originalError: firstMsg },
              "Modify/save succeeded on retry after payload repair"
            );
          } catch (retryError) {
            const retryMsg = retryError instanceof Error ? retryError.message : String(retryError);
            throw fastify.httpErrors.unprocessableEntity(retryMsg);
          }
        } else {
          throw fastify.httpErrors.unprocessableEntity(firstMsg);
        }
      }

      await markLarryEventAccepted(fastify.db, tenantId, id, actorUserId);

      await fastify.db.queryTenant(
        tenantId,
        `INSERT INTO correction_feedback
           (tenant_id, action_id, corrected_by_user_id, correction_type, correction_payload)
         VALUES
           ($1, $2, $3, 'modified_and_accepted', $4::jsonb)`,
        [
          tenantId,
          id,
          actorUserId,
          JSON.stringify({
            actionType: event.actionType,
            changedKeys: Object.keys(payloadPatch),
          }),
        ]
      );

      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId,
        actionType: "larry.event.accepted",
        objectType: "larry_event",
        objectId: id,
        details: { actionType: event.actionType, viaModify: true },
      });

      const [persisted] = await listLarryEventSummaries(fastify.db, tenantId, { ids: [id] });
      return reply.code(200).send({ event: persisted ?? null, executed: true, entity });
    }
  );

  // POST /events/:id/modify/stop — user cancelled a modify panel without saving.
  // Writes an audit-log breadcrumb so we can measure abandonment; the event itself
  // remains in its current state (unchanged pending suggestion).
  fastify.post(
    "/events/:id/modify/stop",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm"])] },
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const actorUserId = request.user.userId;
      const { id } = request.params as { id: string };
      if (!isUuidShape(id)) {
        throw fastify.httpErrors.badRequest("Invalid event id.");
      }

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
        requireWritable: true,
      });

      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId,
        actionType: "larry.event.modify_cancelled",
        objectType: "larry_event",
        objectId: id,
        details: { actionType: event.actionType },
      });

      return reply.code(200).send({ ok: true });
    }
  );

  // POST /events/:id/modify-chat — dedicated chat endpoint for the Modify panel.
  // Runs streamModifyChat (single tool: apply_modification) and returns a
  // payloadPatch the frontend can merge into its working draft without
  // touching the database. Spec: 2026-04-15-modify-action-design.md.
  const ModifyChatBodySchema = z.object({
    message: z.string().trim().min(1).max(4_000),
    currentPayload: z.record(z.string(), z.unknown()),
    conversationId: z.string().uuid().optional(),
  });

  fastify.post(
    "/events/:id/modify-chat",
    {
      config: {
        rateLimit: {
          max: 20,
          timeWindow: "1 minute",
          keyGenerator: (req: FastifyRequest) =>
            (req.user as { tenantId?: string } | undefined)?.tenantId ?? req.ip,
        },
      },
      preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm"])],
    },
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const actorUserId = request.user.userId;
      const { id } = request.params as { id: string };
      if (!isUuidShape(id)) {
        throw fastify.httpErrors.badRequest("Invalid event id.");
      }

      const parsed = ModifyChatBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        throw fastify.httpErrors.badRequest(
          parsed.error.issues[0]?.message ?? "Invalid body."
        );
      }
      const { message, currentPayload, conversationId: providedConvId } = parsed.data;

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
        requireWritable: true,
      });
      if (event.eventType !== "suggested") {
        throw fastify.httpErrors.conflict(
          "This suggestion was already resolved elsewhere."
        );
      }

      if (!isModifiableActionType(event.actionType)) {
        throw fastify.httpErrors.unprocessableEntity(
          `Action type '${event.actionType}' is not modifiable.`
        );
      }
      const editableFields = editableFieldsForActionType(event.actionType);

      // Resolve or create the conversation for this modify session.
      let conversationId = providedConvId ?? null;
      if (conversationId) {
        const existing = await getLarryConversationForUser(
          fastify.db,
          tenantId,
          actorUserId,
          conversationId
        );
        if (!existing || existing.projectId !== event.projectId) {
          throw fastify.httpErrors.notFound("Conversation not found.");
        }
      } else {
        const created = await createLarryConversation(
          fastify.db,
          tenantId,
          actorUserId,
          {
            projectId: event.projectId,
            title: `Modify: ${event.displayText.slice(0, 120)}`,
          }
        );
        conversationId = created.id;
      }

      const teamMembers = await fastify.db.queryTenant<{ displayName: string }>(
        tenantId,
        `SELECT COALESCE(u.display_name, u.email) AS "displayName"
           FROM users u
           JOIN project_memberships pm ON pm.user_id = u.id
          WHERE pm.tenant_id = $1 AND pm.project_id = $2
          ORDER BY "displayName" ASC`,
        [tenantId, event.projectId]
      );

      const userMessageInsert = await insertLarryMessage(
        fastify.db,
        tenantId,
        conversationId,
        { role: "user", content: message, actorUserId }
      );

      const modifyConfig = buildIntelligenceConfig(fastify.config);

      // History is just this turn's user message — the modify panel is a
      // stateless one-shot per send. If we later add multi-turn refinement,
      // load prior messages via listLarryMessagesForConversation.
      const generator = streamModifyChat({
        config: modifyConfig,
        messages: [{ role: "user", content: message }],
        context: {
          actionType: event.actionType,
          displayText: event.displayText,
          reasoning: event.reasoning,
          currentPayload,
          editableFields,
          teamMembers,
        },
      });

      let fullText = "";
      let payloadPatch: Record<string, unknown> | null = null;
      let summary = "";
      let streamError: string | null = null;

      for await (const evt of generator as AsyncIterable<ModifyChatStreamEvent>) {
        if (evt.type === "token") fullText += evt.delta;
        else if (evt.type === "tool_done" && evt.name === "apply_modification") {
          payloadPatch = evt.payloadPatch;
          summary = evt.summary;
        } else if (evt.type === "error") {
          streamError = evt.message;
        }
      }

      const assistantText =
        fullText.trim().length > 0
          ? fullText.trim()
          : summary ||
            (streamError
              ? "I couldn't process that request — please try again."
              : "I didn't catch that. Can you rephrase the change you want?");

      const assistantInsert = await insertLarryMessage(
        fastify.db,
        tenantId,
        conversationId,
        { role: "larry", content: assistantText }
      );
      await touchLarryConversation(fastify.db, tenantId, conversationId, message.slice(0, 80));

      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId,
        actionType: "larry.event.modify_chat",
        objectType: "larry_event",
        objectId: id,
        details: {
          conversationId,
          producedPatch: payloadPatch !== null,
          patchKeys: payloadPatch ? Object.keys(payloadPatch) : [],
        },
      });

      return reply.code(200).send({
        conversationId,
        userMessageId: userMessageInsert.id,
        assistantMessageId: assistantInsert.id,
        message: assistantText,
        payloadPatch: payloadPatch ?? {},
        summary,
        streamError,
      });
    }
  );

  fastify.post(
    "/events/:id/let-larry-execute",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm"])] },
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const actorUserId = request.user.userId;
      const { id } = request.params as { id: string };
      if (!isUuidShape(id)) {
        throw fastify.httpErrors.badRequest("Invalid event id.");
      }

      const event = await getLarryEventForMutation(fastify.db, tenantId, id);
      if (!event) {
        throw fastify.httpErrors.notFound("Event not found.");
      }
      if (event.eventType !== "suggested") {
        throw fastify.httpErrors.conflict("Only suggested events can be executed by Larry.");
      }

      // Check that this event has execution output in its payload
      const execOutput = event.payload?._executionOutput as {
        docType: string;
        title: string;
        content: string;
        emailRecipient?: string;
        emailSubject?: string;
      } | null;

      if (!execOutput) {
        throw fastify.httpErrors.unprocessableEntity("This event has no execution output for Larry to complete.");
      }

      // Execute the underlying action first (e.g., create the task)
      let entity: unknown;
      try {
        entity = await executeAction(
          fastify.db,
          tenantId,
          event.projectId,
          event.actionType as LarryActionType,
          event.payload,
          actorUserId,
        );
      } catch (firstError) {
        const firstMsg = firstError instanceof Error ? firstError.message : String(firstError);
        const isResolvable =
          firstMsg.includes("taskId could not be resolved") ||
          firstMsg.includes("not found for tenant") ||
          (firstMsg.includes("user") && firstMsg.includes("not found in tenant"));

        if (isResolvable) {
          try {
            const retryPayload: Record<string, unknown> = { ...event.payload };
            if (firstMsg.includes("taskId")) delete retryPayload.taskId;
            entity = await executeAction(
              fastify.db, tenantId, event.projectId,
              event.actionType as LarryActionType, retryPayload, actorUserId,
            );
            request.log.info({ tenantId, eventId: id, originalError: firstMsg }, "Execute succeeded on retry");
          } catch (retryError) {
            const retryMsg = retryError instanceof Error ? retryError.message : String(retryError);
            throw fastify.httpErrors.unprocessableEntity(retryMsg);
          }
        } else {
          throw fastify.httpErrors.unprocessableEntity(firstMsg);
        }
      }

      // Create the larry_document
      const [doc] = await fastify.db.queryTenant<{ id: string }>(
        tenantId,
        `INSERT INTO larry_documents (tenant_id, project_id, larry_event_id, title, doc_type, content, email_recipient, email_subject, state)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft')
         RETURNING id`,
        [
          tenantId,
          event.projectId,
          id,
          execOutput.title,
          execOutput.docType,
          execOutput.content,
          execOutput.emailRecipient ?? null,
          execOutput.emailSubject ?? null,
        ],
      );

      // If a task was created, link document and mark completed by Larry
      if (event.actionType === "task_create" && entity && typeof entity === "object" && "id" in entity) {
        const taskId = (entity as { id: string }).id;
        await fastify.db.queryTenant(
          tenantId,
          `UPDATE tasks
           SET completed_by_larry = TRUE,
               larry_document_id = $2,
               assigned_to_larry = TRUE,
               status = 'completed',
               completed_at = NOW(),
               progress_percent = 100,
               updated_at = NOW()
           WHERE tenant_id = $1 AND id = $3`,
          [tenantId, doc.id, taskId],
        );
      }

      // Mark the event as accepted
      await markLarryEventAccepted(fastify.db, tenantId, id, actorUserId);

      return reply.code(200).send({ accepted: true, executedByLarry: true, documentId: doc.id, entity });
    }
  );

  fastify.post(
    "/actions/:id/correct",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const actorUserId = request.user.userId;
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params ?? {});
      const body = CorrectionBodySchema.parse(request.body ?? {});

      await fastify.db.queryTenant(
        tenantId,
        `INSERT INTO correction_feedback
           (tenant_id, action_id, corrected_by_user_id, correction_type, correction_payload)
         VALUES
           ($1, $2, $3, $4, $5::jsonb)`,
        [tenantId, id, actorUserId, body.correctionType, JSON.stringify(body.correctionPayload)]
      );

      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId,
        actionType: "larry.action.corrected",
        objectType: "larry_event",
        objectId: id,
        details: {
          correctionType: body.correctionType,
        },
      });

      return reply.code(201).send({ ok: true });
    }
  );

  fastify.get(
    "/briefing",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const userId = request.user.userId;
      const hour = new Date().getHours();
      const timeOfDay = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";

      // Always return 200 — briefing is a best-effort surface, never a login blocker.
      // Any failure below falls back to a neutral greeting with no projects.
      // `degraded` carries the failing stage so production failures are diagnosable
      // without Railway logs (which our current setup makes hard to read).
      let stage: "load-user" | "build-config" | "generate" | "post-seen" | "serialize" = "load-user";
      try {
        // NOTE: users has no tenant_id column; tenant binding lives on memberships.
        // The earlier `WHERE u.tenant_id = $1` caused a 500 at every login
        // (QA-2026-04-12 C-5). JWT already attested the user/tenant pair, but
        // we still JOIN memberships as a defense-in-depth tenant isolation check.
        const userRows = await fastify.db.queryTenant<{ display_name: string | null; email: string }>(
          tenantId,
          `SELECT u.display_name, u.email
             FROM users u
             JOIN memberships m ON m.user_id = u.id AND m.tenant_id = $1
            WHERE u.id = $2
            LIMIT 1`,
          [tenantId, userId]
        );

        const user = userRows[0];
        const displayName = user
          ? (user.display_name?.trim() || user.email.split("@")[0] || "there")
          : "there";

        stage = "build-config";
        const config = buildIntelligenceConfig(fastify.config);

        stage = "generate";
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
          request.log.error(
            { err: error instanceof Error ? { message: error.message, stack: error.stack } : error, tenantId, userId, stage: "generate" },
            "briefing generate failed"
          );
          return reply.code(200).send({
            briefing: {
              greeting: `Good ${timeOfDay}, ${displayName}.`,
              projects: [],
              totalNeedsYou: 0,
            },
            cached: false,
            degraded: "generate",
          });
        }

        stage = "post-seen";
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

        stage = "serialize";
        return reply.code(200).send({
          briefing: briefingResult.content,
          cached: !briefingResult.fresh,
        });
      } catch (outerError) {
        request.log.error(
          {
            err: outerError instanceof Error
              ? { message: outerError.message, stack: outerError.stack, name: outerError.name }
              : outerError,
            tenantId,
            userId,
            stage,
          },
          "briefing outer handler failed"
        );
        return reply.code(200).send({
          briefing: {
            greeting: `Good ${timeOfDay}, there.`,
            projects: [],
            totalNeedsYou: 0,
          },
          cached: false,
          degraded: stage,
        });
      }
    }
  );

  // ── Briefing email-me-this (#93) ─────────────────────────────────────────
  // Sends the user's current Larry briefing to their account email as an HTML
  // digest. Differentiator: no competitor mails a personalised daily digest
  // of your projects with per-project CTAs back into the app.
  fastify.post(
    "/briefing/email-me",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const userId = request.user.userId;

      const userRows = await fastify.db.queryTenant<{ display_name: string | null; email: string }>(
        tenantId,
        `SELECT u.display_name, u.email
           FROM users u
           JOIN memberships m ON m.user_id = u.id AND m.tenant_id = $1
          WHERE u.id = $2
          LIMIT 1`,
        [tenantId, userId]
      );
      const user = userRows[0];
      if (!user) {
        throw fastify.httpErrors.notFound("User not found.");
      }
      const displayName = user.display_name?.trim() || user.email.split("@")[0] || "there";

      // Reuse getOrGenerateBriefing so the digest reflects the same briefing
      // the user sees on their workspace home. A cached one is fine — the
      // briefing is a best-effort snapshot, not a live query.
      const config = buildIntelligenceConfig(fastify.config);
      let briefingContent;
      try {
        const result = await getOrGenerateBriefing(
          fastify.db,
          config,
          userId,
          tenantId,
          displayName
        );
        briefingContent = result.content;
      } catch (error) {
        request.log.error(
          { err: error instanceof Error ? error.message : error, tenantId, userId },
          "briefing/email-me: getOrGenerateBriefing failed"
        );
        return reply.code(502).send({
          success: false,
          errorCode: "briefing_unavailable",
          error: "Larry couldn't assemble a briefing right now. Try again in a few minutes.",
        });
      }

      try {
        const { sendBriefingDigestEmail, EmailQuotaError } = await import("../../lib/email.js");
        try {
          await sendBriefingDigestEmail(user.email, {
            greeting: briefingContent.greeting,
            projects: briefingContent.projects.map((p) => ({
              projectId: p.projectId,
              name: p.name,
              statusLabel: p.statusLabel,
              summary: p.summary,
              needsYou: p.needsYou,
              suggestionCount: p.suggestionCount,
            })),
            totalNeedsYou: briefingContent.totalNeedsYou,
            userId,
            tenantId,
          });
        } catch (sendErr) {
          if (sendErr instanceof EmailQuotaError) {
            return reply.code(429).send({
              success: false,
              errorCode: "quota_exceeded",
              error: "You've already emailed yourself a briefing recently. Try again later.",
            });
          }
          throw sendErr;
        }
      } catch (error) {
        request.log.error(
          { err: error instanceof Error ? error.message : error, tenantId, userId },
          "briefing/email-me: send failed"
        );
        return reply.code(502).send({
          success: false,
          errorCode: "send_failed",
          error: "We couldn't deliver the briefing email. Try again in a moment.",
        });
      }

      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId: userId,
        actionType: "briefing.email_me",
        objectType: "briefing",
        objectId: userId,
        details: { recipient: user.email, projectCount: briefingContent.projects.length },
      });

      return { success: true, recipient: user.email };
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
      if (body.projectId) {
        const projectWriteState = await loadProjectWriteState(fastify.db, tenantId, body.projectId);
        if (projectWriteState && isProjectWriteLocked(projectWriteState.status)) {
          throw fastify.httpErrors.conflict(ARCHIVED_PROJECT_WRITE_LOCK_MESSAGE);
        }
      }
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

        // QA-2026-04-12 polish: when the caller didn't supply a title,
        // try to derive one from the transcript so the meetings list
        // doesn't show a generic "Meeting transcript" label everywhere.
        const derivedMeetingTitle =
          body.meetingTitle ?? deriveMeetingTitleFromTranscript(body.transcript);

        const meetingNoteResult = await client.query<{ id: string }>(
          `INSERT INTO meeting_notes
            (tenant_id, project_id, title, transcript, created_by_user_id)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [tenantId, body.projectId ?? null, derivedMeetingTitle, body.transcript, request.user.userId]
        );
        const meetingNoteId = meetingNoteResult.rows[0]?.id ?? null;

        const payloadPatch = {
          transcript: body.transcript,
          meetingTitle: derivedMeetingTitle,
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
          requireWritable: true,
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

      // ── N-7 client-side refusal short-circuit ─────────────────────────────
      // Live testing on llama-3.3-70b and llama-4-scout showed that the
      // REFUSING DESTRUCTIVE REQUESTS section of the system prompt cannot
      // reliably coerce an "I can't ..." opener — both models pivot to
      // generic PM advice on jailbreak-style destructive prompts even when
      // the safety (actionsExecuted:0) layer holds. The deterministic fix:
      // detect the AND of (injection attempt + destructive sweep) in the
      // user message before any model call, and short-circuit with a
      // canned refusal. The INJECTION GUARD in the system prompt stays in
      // place as defence-in-depth for messages that bypass the regex.
      const refuseClientSide =
        detectInjectionAttempt(message) && detectDestructiveSweep(message);
      if (refuseClientSide) {
        const cannedRefusal =
          "I can't run a sweeping destructive operation like that — " +
          "deleting every task / wiping the backlog is a one-way action " +
          "I don't take from a chat prompt. If you want to reset this " +
          "project, I can queue an archive for your approval. If you want " +
          "to clear a specific set of tasks, list them by name and I'll " +
          "mark them cancelled one by one.";

        const conversation =
          existingConversation ??
          await createLarryConversation(fastify.db, tenantId, actorUserId, {
            projectId: projectId ?? null,
            title: message.slice(0, 80),
          });

        const userMessageInsert = await insertLarryMessage(fastify.db, tenantId, conversation.id, {
          role: "user",
          content: message,
          actorUserId,
        });
        const assistantMessageInsert = await insertLarryMessage(fastify.db, tenantId, conversation.id, {
          role: "larry",
          content: cannedRefusal,
        });
        await touchLarryConversation(fastify.db, tenantId, conversation.id, message.slice(0, 80));

        await writeAuditLog(fastify.db, {
          tenantId,
          actorUserId,
          actionType: projectId ? "larry.chat.stream" : "larry.chat.global",
          objectType: projectId ? "project" : "workspace",
          objectId: projectId ?? tenantId,
          details: {
            conversationId: conversation.id,
            refusedClientSide: true,
            reason: "injection+destructive-sweep regex",
            tokensSaved: "full runIntelligence call bypassed",
          },
        });

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
            content: cannedRefusal,
            createdAt: assistantMessageInsert.createdAt,
          });

        const responsePayload: LarryChatResponse = {
          conversationId: conversation.id,
          message: cannedRefusal,
          userMessage,
          assistantMessage,
          linkedActions: [],
          actionsExecuted: 0,
          suggestionCount: 0,
        };
        return reply.code(200).send(responsePayload);
      }

      if (!projectId) {
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

        const assistantMessageInsert = await insertLarryMessage(fastify.db, tenantId, conversation.id, {
          role: "larry",
          content: "",
        });

        const globalResult = await runGlobalChatFlow({
          tenantId,
          actorUserId,
          tenantRole: request.user.role,
          message,
          conversation,
          userMessageInsert,
          assistantMessageId: assistantMessageInsert.id,
          existingConversationId: existingConversation?.id ?? null,
        });

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
            content: globalResult.fullContent,
            createdAt: assistantMessageInsert.createdAt,
          });

        const linkedActions = assistantMessage.linkedActions.length > 0
          ? assistantMessage.linkedActions
          : globalResult.linkedActions;

        const responsePayload: LarryChatResponse = {
          conversationId: conversation.id,
          message: globalResult.fullContent,
          userMessage,
          assistantMessage: {
            ...assistantMessage,
            linkedActions,
          },
          linkedActions,
          actionsExecuted: globalResult.actionsExecuted,
          suggestionCount: globalResult.suggestionCount,
        };

        return reply.code(200).send(responsePayload);
      }

      let snapshot;
      try {
        snapshot = await getProjectSnapshot(fastify.db, tenantId, projectId);
      } catch (error) {
        const messageText = error instanceof Error ? error.message : String(error);
        if (messageText.includes("not found")) {
          throw fastify.httpErrors.notFound(messageText);
        }
        throw fastify.httpErrors.internalServerError(`Failed to load project snapshot: ${messageText}`);
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
              sourceKind: "direct_chat",
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

        const clarifications: LarryClarification[] = [
          {
            field: clarificationNeed.reason,
            question: clarificationNeed.question,
          },
        ];

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
          clarifications,
        });
      }

      const pendingTexts = await getPendingSuggestionTexts(fastify.db, tenantId, projectId).catch(
        () => [] as string[]
      );
      const pendingClause = buildPendingClause(pendingTexts);
      const [activeRules, recentCorrections] = await Promise.all([
        listActiveLarryRules(tenantId).catch(() => [] as LarryRulePromptRow[]),
        listRecentCorrectionFeedback(tenantId).catch(() => [] as CorrectionPromptRow[]),
      ]);
      const guidanceHint = buildRulesAndCorrectionsHint({
        rules: activeRules,
        corrections: recentCorrections,
      });

      // Load conversation history for multi-turn context (project-scoped chat)
      let conversationHistoryHint = "";
      const resolvedConversationId = existingConversation?.id ?? conversationId;
      if (resolvedConversationId) {
        try {
          const priorMessages = await listLarryMessagesForConversation(
            fastify.db,
            tenantId,
            resolvedConversationId
          );
          // Take last 10 messages (5 turns), skip the most recent if it matches the current message
          const relevantMessages = priorMessages.slice(-10);
          if (relevantMessages.length > 0) {
            const historyLines = relevantMessages.map((m) => {
              const speaker = m.role === "user" ? "User" : "Larry";
              return `${speaker}: ${m.content.slice(0, 500)}`;
            });
            conversationHistoryHint = `\n\nCONVERSATION HISTORY (most recent messages in this thread — use this to understand what the user is referring to):\n${historyLines.join("\n")}`;
          }
        } catch (err) {
          // Non-fatal — proceed without history if loading fails
          request.log.warn({ err, tenantId, conversationId: resolvedConversationId }, "Failed to load conversation history for chat intelligence");
        }
      }

      const config = buildIntelligenceConfig(fastify.config);
      const fallbackConfig = buildFallbackIntelligenceConfig(fastify.config);
      await reserveTokens({
        tenantId,
        provider: config.provider,
        estimatedTokens: RUN_INTELLIGENCE_ESTIMATED_TOKENS,
      });
      let result;
      try {
        result = await runIntelligence(
          config,
          snapshot,
          `user said: "${message}"${conversationHistoryHint}${pendingClause}${guidanceHint ? `\n\n${guidanceHint}` : ""}`,
          fallbackConfig,
        );
      } catch (error) {
        request.log.error({ err: error, tenantId, projectId }, "runIntelligence failed");
        if (error instanceof ProviderError) {
          return reply.code(503).send({
            error: "Larry is temporarily unavailable",
            errorCode: error.code,
            ...(error.retryAfter != null ? { retryAfter: error.retryAfter } : {}),
          });
        }
        throw fastify.httpErrors.serviceUnavailable("Larry intelligence error");
      }

      if (result.contextUpdate && projectId) {
        await updateProjectLarryContext(fastify.db, tenantId, projectId, result.contextUpdate);
      }

      // LLM-driven clarification — takes priority over action execution
      if (result.followUpQuestions && result.followUpQuestions.length > 0) {
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

        const clarificationText = result.briefing || result.followUpQuestions.map((q) => q.question).join("\n");
        const assistantMessageInsert = await insertLarryMessage(fastify.db, tenantId, conversation.id, {
          role: "larry",
          content: clarificationText,
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
            content: clarificationText,
            createdAt: assistantMessageInsert.createdAt,
          });

        await Promise.all([
          writeAuditLog(fastify.db, {
            tenantId,
            actorUserId,
            actionType: "larry.chat.llm_clarification_requested",
            objectType: "project",
            objectId: projectId,
            details: {
              conversationId: conversation.id,
              followUpCount: result.followUpQuestions.length,
              fields: result.followUpQuestions.map((q) => q.field),
            },
          }),
          Promise.resolve(
            insertProjectMemoryEntry(fastify.db, tenantId, projectId, {
              source: "Larry chat",
              sourceKind: "chat",
              sourceRecordId: userMessageInsert.id,
              content: buildChatMemoryEntry(message, clarificationText),
            })
          ).catch((error) => {
            request.log.warn(
              { err: error, tenantId, projectId, conversationId: conversation.id },
              "project memory write failed for LLM clarification chat turn"
            );
          }),
        ]);

        const clarifications: LarryClarification[] = result.followUpQuestions.map((q) => ({
          field: q.field,
          question: q.question,
        }));

        return reply.code(200).send({
          conversationId: conversation.id,
          message: clarificationText,
          userMessage,
          assistantMessage: {
            ...assistantMessage,
            linkedActions: [],
          },
          linkedActions: [],
          actionsExecuted: 0,
          suggestionCount: 0,
          requiresClarification: true,
          clarifications,
        } satisfies LarryChatResponse);
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
        sourceKind: "direct_chat",
        sourceRecordId: userMessageInsert.id,
      };

      let autoResult = { executedCount: 0, suggestedCount: 0, eventIds: [] as string[] };
      let suggestResult = { executedCount: 0, suggestedCount: 0, eventIds: [] as string[] };

      try {
        [autoResult, suggestResult] = await Promise.all([
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
        ]);
      } catch (error) {
        request.log.warn(
          { err: error, tenantId, projectId, conversationId: conversation.id },
          "project chat action execution failed"
        );
      }

      const persistedMessages = await listLarryMessagesByIds(
        fastify.db,
        tenantId,
        [userMessageInsert.id, assistantMessageInsert.id]
      ).catch(() => [] as Awaited<ReturnType<typeof listLarryMessagesByIds>>);

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
            sourceKind: "direct_chat",
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

  // ── POST /chat/stream — streaming chat with real-time tool execution ────────

  const ChatStreamSchema = z.object({
    projectId: z.string().uuid().optional(),
    message: z.string().trim().min(1).max(24_000),
    conversationId: z.string().uuid().optional(),
  });

  function sseData(obj: object): string {
    return `data: ${JSON.stringify(obj)}\n\n`;
  }

  // Build a natural-language recap from tool outcomes for cases where the model
  // emits only tool calls and no prose. Previously this case saved the literal
  // string "(no response)" as the assistant message body, which looked like a
  // silent failure to the user (QA-2026-04-12 C-3).
  function buildToolRecap(
    outcomes: Array<{ toolName: string; displayText: string; eventType: "auto_executed" | "suggested" | "error" }>
  ): string {
    if (outcomes.length === 0) {
      return "I don't have anything to add here — ask me something specific and I'll dig in.";
    }
    const executed = outcomes.filter((o) => o.eventType === "auto_executed");
    const suggested = outcomes.filter((o) => o.eventType === "suggested");
    const errored = outcomes.filter((o) => o.eventType === "error");
    const parts: string[] = [];
    if (executed.length > 0) {
      parts.push(
        `Done — ${executed.map((o) => o.displayText.charAt(0).toLowerCase() + o.displayText.slice(1)).join("; ")}.`
      );
    }
    if (suggested.length > 0) {
      const items = suggested.map((o) => o.displayText).join("; ");
      parts.push(
        suggested.length === 1
          ? `I queued "${items}" in the Action Centre for you to review.`
          : `I queued ${suggested.length} suggestions in the Action Centre for you to review: ${items}.`
      );
    }
    if (errored.length > 0) {
      parts.push(
        `${errored.length} action${errored.length === 1 ? "" : "s"} couldn't be completed — check the Action Centre for details.`
      );
    }
    return parts.join(" ");
  }

  const CHAT_STREAM_ACTION_TYPE_MAP: Record<string, string> = {
    create_task:        "task_create",
    update_task_status: "status_update",
    flag_task_risk:     "risk_flag",
    send_reminder:      "reminder_send",
    change_deadline:    "deadline_change",
    change_task_owner:  "owner_change",
    draft_email:        "email_draft",
    draft_slack:        "slack_message_draft",
  };

  fastify.post(
    "/chat/stream",
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
      const parseResult = ChatStreamSchema.safeParse(request.body ?? {});
      if (!parseResult.success) {
        throw fastify.httpErrors.badRequest(
          parseResult.error.issues[0]?.message ?? "Invalid request body"
        );
      }

      const { message, conversationId: incomingConversationId } = parseResult.data;
      const projectId = parseResult.data.projectId ?? null;
      const tenantId = request.user.tenantId;
      const actorUserId = request.user.userId;

      // ── Access check ─────────────────────────────────────────────────────
      if (projectId) {
        await assertProjectAccessOrThrow({
          tenantId,
          userId: actorUserId,
          tenantRole: request.user.role,
          projectId,
          mode: "read",
          requireWritable: true,
        });
      }

      // ── Resolve existing conversation ─────────────────────────────────────
      let existingConversation = null;
      if (incomingConversationId) {
        existingConversation = await getLarryConversationForUser(
          fastify.db,
          tenantId,
          actorUserId,
          incomingConversationId
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

      // ── Create/get conversation and insert user message ───────────────────
      const conversation =
        existingConversation ??
        (await createLarryConversation(fastify.db, tenantId, actorUserId, {
          projectId,
          title: message.slice(0, 80),
        }));

      const userMessageInsert = await insertLarryMessage(fastify.db, tenantId, conversation.id, {
        role: "user",
        content: message,
        actorUserId,
      });

      // Insert placeholder Larry message now so tool events can reference its ID
      const larryMessageInsert = await insertLarryMessage(fastify.db, tenantId, conversation.id, {
        role: "larry",
        content: "",
      });
      const larryMessageId = larryMessageInsert.id;

      // Reserve LLM budget BEFORE writing SSE headers. If reserveTokens throws
      // LLMQuotaError after headers are flushed, the global 429 JSON error
      // handler collides with the already-set text/event-stream response and
      // Fastify raises FST_ERR_REP_INVALID_PAYLOAD_TYPE → headers-already-sent
      // → uncaught exception, crashing the Api process.
      const streamConfig = buildIntelligenceConfig(fastify.config);
      await reserveTokens({
        tenantId,
        provider: streamConfig.provider,
        estimatedTokens: STREAM_CHAT_ESTIMATED_TOKENS,
      });

      // ── SSE headers — must be set before any body writes ─────────────────
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        "Transfer-Encoding": "chunked",
      });

      // ── N-7 client-side refusal short-circuit (streaming variant) ────────
      // Same gate as /chat — (injection + destructive sweep) -> canned
      // refusal, no model call. Must fire AFTER the SSE headers are
      // written so the client sees a valid stream, and must emit at least
      // one token event + a done event so the UI reconciles state cleanly.
      const refuseClientSide =
        detectInjectionAttempt(message) && detectDestructiveSweep(message);
      if (refuseClientSide) {
        const cannedRefusal =
          "I can't run a sweeping destructive operation like that — " +
          "deleting every task / wiping the backlog is a one-way action " +
          "I don't take from a chat prompt. If you want to reset this " +
          "project, I can queue an archive for your approval. If you want " +
          "to clear a specific set of tasks, list them by name and I'll " +
          "mark them cancelled one by one.";

        const writeEvent = (payload: unknown) => {
          reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
        };
        writeEvent({ type: "token", delta: cannedRefusal });
        writeEvent({
          type: "done",
          conversationId: conversation.id,
          messageId: larryMessageId,
          actionsExecuted: 0,
          suggestionCount: 0,
          linkedActions: [],
        });

        // Persist the canned refusal as Larry's final message + audit.
        await fastify.db.queryTenant<Record<string, unknown>>(
          tenantId,
          `UPDATE larry_messages SET content = $3 WHERE tenant_id = $1 AND id = $2`,
          [tenantId, larryMessageId, cannedRefusal]
        );
        await touchLarryConversation(fastify.db, tenantId, conversation.id, message.slice(0, 80));
        await writeAuditLog(fastify.db, {
          tenantId,
          actorUserId,
          actionType: projectId ? "larry.chat.stream" : "larry.chat.global",
          objectType: projectId ? "project" : "workspace",
          objectId: projectId ?? tenantId,
          details: {
            conversationId: conversation.id,
            refusedClientSide: true,
            reason: "injection+destructive-sweep regex",
          },
        });

        if (!reply.raw.destroyed) reply.raw.end();
        return reply;
      }

      const write = (obj: object): void => {
        if (!reply.raw.destroyed) {
          reply.raw.write(sseData(obj));
        }
      };

      if (!projectId) {
        try {
          const globalResult = await runGlobalChatFlow({
            tenantId,
            actorUserId,
            tenantRole: request.user.role,
            message,
            conversation,
            userMessageInsert,
            assistantMessageId: larryMessageId,
            existingConversationId: existingConversation?.id ?? null,
            onChunk: async (text) => {
              write({ type: "token", delta: text });
            },
          });

          write({
            type: "done",
            conversationId: conversation.id,
            messageId: larryMessageId,
            actionsExecuted: globalResult.actionsExecuted,
            suggestionCount: globalResult.suggestionCount,
            linkedActions: globalResult.linkedActions,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Streaming error";
          request.log.error({ err, tenantId, projectId }, "global stream chat flow failed");
          write({ type: "error", message: msg });
        } finally {
          if (!reply.raw.destroyed) {
            reply.raw.end();
          }
        }
        return reply;
      }

      // ── Load project snapshot ─────────────────────────────────────────────
      let snapshot: Awaited<ReturnType<typeof getProjectSnapshot>>;
      try {
        snapshot = await getProjectSnapshot(fastify.db, tenantId, projectId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.toLowerCase().includes("not found")) {
          throw fastify.httpErrors.notFound(msg);
        }
        throw fastify.httpErrors.internalServerError(`Failed to load project snapshot: ${msg}`);
      }

      // ── Load conversation history ──────────────────────────────────────────
      let priorMessages: Array<{ role: "user" | "larry"; content: string }> = [];
      const resolvedConversationId = existingConversation?.id ?? incomingConversationId ?? null;
      if (resolvedConversationId) {
        try {
          priorMessages = await listLarryMessagesForConversation(
            fastify.db,
            tenantId,
            resolvedConversationId
          );
        } catch {
          // non-fatal — continue without history
        }
      }

      // ── Build messages array from conversation history ────────────────────
      const sdkMessages: Array<{ role: "user" | "assistant"; content: string }> = [
        ...priorMessages.slice(-10).map((m) => ({
          role: (m.role === "user" ? "user" : "assistant") as "user" | "assistant",
          content: m.content,
        })),
        { role: "user", content: message },
      ];

      // ── Intelligence config ───────────────────────────────────────────────
      // Reuse the config already built before the SSE headers were written.
      const config = streamConfig;
      const taskLines = snapshot.tasks
        .map(t => `  id:"${t.id}" title:"${t.title}" status:${t.status} risk:${t.riskLevel}${t.dueDate ? ` due:${t.dueDate}` : ""}${t.assigneeName ? ` assignee:${t.assigneeName}` : ""}`)
        .join("\n");
      const projectContext = [
        snapshot.larryContext ?? null,
        snapshot.tasks.length > 0 ? `TASKS (${snapshot.tasks.length} total):\n${taskLines}` : null,
      ].filter(Boolean).join("\n\n") || null;

      // ── Accumulated state for post-stream writes ──────────────────────────
      let fullContent = "";
      let actionsExecuted = 0;
      let suggestionCount = 0;
      // Track every tool outcome so we can synthesise a recap when the model
      // emits tool calls but no prose (previously saved as literal "(no response)").
      const toolOutcomes: Array<{
        toolName: string;
        displayText: string;
        eventType: "auto_executed" | "suggested" | "error";
      }> = [];

      // ── Action context for executor functions ─────────────────────────────
      const actionContext = {
        conversationId: conversation.id,
        requestMessageId: userMessageInsert.id,
        responseMessageId: larryMessageId,
        requesterUserId: actorUserId,
        sourceKind: "chat",
        sourceRecordId: userMessageInsert.id,
      };

      // ── onTool callback — handles governance + DB writes ──────────────────
      const onTool = async (
        toolName: string,
        params: Record<string, unknown>
      ): Promise<ToolCallResult> => {
        // Read-only lookup — return task list from snapshot, no DB write
        if (toolName === "get_task_list") {
          const filter = typeof params.filter === "string" ? params.filter : "all";
          const tasks = snapshot.tasks
            .filter((t) => {
              if (filter === "overdue")
                return t.dueDate && new Date(t.dueDate) < new Date() && t.status !== "completed";
              if (filter === "at_risk") return t.riskLevel === "high";
              if (filter === "blocked") return t.status === "blocked";
              return true;
            })
            .slice(0, 30)
            .map((t) => `${t.id}: ${t.title} [${t.status}] [risk:${t.riskLevel ?? "low"}] [due:${t.dueDate ?? "none"}]`)
            .join("\n");
          return {
            actionId: null,
            eventType: "auto_executed",
            displayText: "Retrieved task list",
            data: tasks || "(no tasks match filter)",
          };
        }

        const actionType = CHAT_STREAM_ACTION_TYPE_MAP[toolName];
        if (!actionType) {
          return {
            actionId: null,
            eventType: "error",
            displayText: String(params.displayText ?? toolName),
            error: `Unknown tool: ${toolName}`,
          };
        }

        const displayText = typeof params.displayText === "string" ? params.displayText : toolName;
        const reasoning = typeof params.reasoning === "string" ? params.reasoning : `Called via streaming chat`;

        // Preserve the user-supplied description when present; fall back to
        // reasoning only when the tool call omitted it. Previously this line
        // was `description: reasoning` which clobbered any user description,
        // so accepted task_create actions stored the reasoning string in the
        // description column (see PR #70 sibling bug report).
        const userDescription =
          typeof params.description === "string" && params.description.trim() !== ""
            ? params.description
            : null;

        const action: LarryAction = {
          type: actionType as LarryActionType,
          displayText,
          reasoning,
          payload: {
            ...params,
            description: userDescription ?? reasoning,
          },
          selfExecutable: false,
          offerExecution: false,
        };

        try {
          const result = await runAutoActions(
            fastify.db,
            tenantId,
            projectId,
            "chat",
            [action],
            message,
            actionContext
          );

          actionsExecuted += result.executedCount;
          suggestionCount += result.suggestedCount;

          const wasExecuted = result.executedCount > 0;
          const eventId = result.eventIds[0] ?? null;
          const eventType = wasExecuted ? ("auto_executed" as const) : ("suggested" as const);

          toolOutcomes.push({ toolName, displayText, eventType });

          return {
            actionId: eventId,
            eventType,
            displayText,
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          request.log.warn(
            { err, tenantId, projectId, toolName },
            "Streaming chat tool execution failed"
          );
          toolOutcomes.push({ toolName, displayText, eventType: "error" });
          return {
            actionId: null,
            eventType: "error",
            displayText,
            error: msg,
          };
        }
      };

      // ── Stream ────────────────────────────────────────────────────────────
      // reserveTokens was already called above, before SSE headers were written.
      // Track whether the SDK emitted an error event mid-stream. When it does
      // the client sets the bubble to event.message, and a subsequent recap
      // token would get concatenated onto the error text with no separator
      // (e.g. ".../billingI don't have anything to add here..."). Suppress
      // the recap entirely in that case — the error message is the response.
      let hadStreamError = false;
      try {
        for await (const event of streamLarryChat({
          config,
          messages: sdkMessages,
          projectContext,
          onTool,
        })) {
          if (event.type === "token") {
            fullContent += event.delta;
            write({ type: "token", delta: event.delta });
          } else if (event.type === "tool_start") {
            write(event);
          } else if (event.type === "tool_done") {
            write(event);
          } else if (event.type === "error") {
            hadStreamError = true;
            write(event);
            // Don't abort — let the stream finish naturally
          }
        }

        // ── Post-stream DB writes ─────────────────────────────────────────
        // When the model emits only tool calls and no prose, synthesize a
        // recap. Stream it as tokens so the live UI shows the recap too,
        // then persist it so refreshes render the same text. Skipped on
        // stream errors so it doesn't concatenate onto the error text.
        if (!hadStreamError && fullContent.trim().length === 0) {
          const recap = buildToolRecap(toolOutcomes);
          if (recap.length > 0) {
            write({ type: "token", delta: recap });
            fullContent = recap;
          }
        }
        // Strip any inline function-call markup emitted as plain text by
        // models that don't use the AI SDK's structured tool-calling interface.
        // Handles both <function=name{...}</function> and <function=name>...</function>.
        fullContent = fullContent
          .replace(/<function=[^>]*>(?:[\s\S]*?<\/function>)?/g, "")
          .replace(/<\/function>/g, "");
        await fastify.db.queryTenant<Record<string, unknown>>(
          tenantId,
          `UPDATE larry_messages SET content = $3 WHERE tenant_id = $1 AND id = $2`,
          [tenantId, larryMessageId, fullContent]
        );

        await touchLarryConversation(fastify.db, tenantId, conversation.id, message.slice(0, 80));

        // Best-effort memory entry
        insertProjectMemoryEntry(fastify.db, tenantId, projectId, {
          source: "Larry chat",
          sourceKind: "direct_chat",
          sourceRecordId: userMessageInsert.id,
          content: buildChatMemoryEntry(message, fullContent.slice(0, 500)),
        }).catch((err: unknown) => {
          request.log.warn({ err, tenantId, projectId }, "Stream chat memory write failed");
        });

        // Best-effort audit log
        writeAuditLog(fastify.db, {
          tenantId,
          actorUserId,
          actionType: "larry.chat.stream",
          objectType: "project",
          objectId: projectId,
          details: {
            conversationId: conversation.id,
            actionsExecuted,
            suggestionCount,
          },
        }).catch((err: unknown) => {
          request.log.warn({ err, tenantId }, "Stream chat audit log failed");
        });

        write({
          type: "done",
          conversationId: conversation.id,
          messageId: larryMessageId,
          actionsExecuted,
          suggestionCount,
          linkedActions: [],
        });
      } catch (err) {
        const { code } = classifyProviderError(err);
        request.log.error({ err, code, tenantId, projectId }, "streamLarryChat generator failed");
        write({ type: "error", message: "Larry is temporarily unavailable", code });
      } finally {
        if (!reply.raw.destroyed) {
          reply.raw.end();
        }
      }
    }
  );
};
