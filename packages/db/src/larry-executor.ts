import type {
  LarryAction,
  LarryActionType,
  LarryExecutedByKind,
  LarryEventType,
  LarryExecutionMode,
  LarryTriggeredBy,
  Role,
} from "@larry/shared";
import { createHash } from "node:crypto";
import { Db } from "./client.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type TriggeredBy = LarryTriggeredBy;

export interface LarryEventContext {
  conversationId?: string | null;
  requestMessageId?: string | null;
  responseMessageId?: string | null;
  requesterUserId?: string | null;
  sourceKind?: string | null;
  sourceRecordId?: string | null;
}

interface NormalizedLarryEventContext {
  conversationId: string | null;
  requestMessageId: string | null;
  responseMessageId: string | null;
  requesterUserId: string | null;
  sourceKind: string;
  sourceRecordId: string | null;
}

export interface ExecutorResult {
  executedCount: number;
  suggestedCount: number;
  eventIds: string[];
}

// ── Payload shapes ────────────────────────────────────────────────────────────

interface TaskCreatePayload {
  title: string;
  description: string | null;
  dueDate: string | null;
  assigneeName: string | null;
  priority: "low" | "medium" | "high" | "critical";
}

interface StatusUpdatePayload {
  taskId: string;
  taskTitle: string;
  newStatus: string;
  newRiskLevel: string;
}

interface RiskFlagPayload {
  taskId: string;
  taskTitle: string;
  riskLevel: string;
}

interface ReminderSendPayload {
  assigneeName: string;
  taskId: string;
  taskTitle: string;
  message: string;
}

interface DeadlineChangePayload {
  taskId: string;
  taskTitle: string;
  newDeadline: string;
}

interface OwnerChangePayload {
  taskId: string;
  taskTitle: string;
  newOwnerName: string;
}

interface ScopeChangePayload {
  entityId: string;
  entityType: "project" | "task";
  newDescription: string;
}

interface EmailDraftPayload {
  to: string;
  subject: string;
  body: string;
  taskId: string | null;
}

interface ProjectCreatePayload {
  name: string;
  description: string;
  tasks: Array<{ title: string; assigneeName: string | null; dueDate: string | null }>;
}

type ProjectMembershipRole = "owner" | "editor" | "viewer";

interface CollaboratorAddPayload {
  userId: string;
  role: ProjectMembershipRole;
  displayName?: string | null;
}

interface CollaboratorRoleUpdatePayload {
  userId: string;
  role: ProjectMembershipRole;
  displayName?: string | null;
}

interface CollaboratorRemovePayload {
  userId: string;
  displayName?: string | null;
}

interface ProjectNoteSendPayload {
  visibility: "shared" | "personal";
  content: string;
  recipientUserId: string | null;
  recipientName?: string | null;
  sourceKind?: string | null;
  sourceRecordId?: string | null;
}

interface CalendarEventCreatePayload {
  summary: string;
  startDateTime: string;
  endDateTime: string;
  description?: string | null;
  location?: string | null;
  attendees?: string[] | null;
  calendarId?: string | null;
  timeZone?: string | null;
}

interface CalendarEventUpdatePayload {
  eventId: string;
  summary?: string | null;
  startDateTime?: string | null;
  endDateTime?: string | null;
  description?: string | null;
  location?: string | null;
  attendees?: string[] | null;
  calendarId?: string | null;
  timeZone?: string | null;
}

interface TenantPolicySettings {
  autoExecuteLowImpact: boolean;
}

interface AutoExecutionDecision {
  decision: "auto_execute" | "approval_required";
  reason: string;
  rule: string;
}

const APPROVAL_ONLY_ACTION_TYPES = new Set<LarryActionType>([
  "task_create",
  "deadline_change",
  "owner_change",
  "scope_change",
  "email_draft",
  "project_create",
  "collaborator_add",
  "collaborator_role_update",
  "collaborator_remove",
  "project_note_send",
  "calendar_event_create",
  "calendar_event_update",
]);

const DESTRUCTIVE_KEYWORD_PATTERN = /\b(delete|remove|drop|destroy|terminate|cancel)\b/i;

const SOURCE_KINDS_REQUIRING_RECORD_ID = new Set([
  "chat",
  "meeting",
  "email",
  "slack",
  "calendar",
  "briefing",
  "schedule",
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeContextValue(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function hasPayloadValue(payload: Record<string, unknown>, key: string): boolean {
  const value = payload[key];
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function missingPayloadFields(action: LarryAction): string[] {
  switch (action.type) {
    case "task_create":
      return ["title", "priority"].filter((field) => !hasPayloadValue(action.payload, field));
    case "status_update":
      return ["taskId", "newStatus", "newRiskLevel"].filter((field) => !hasPayloadValue(action.payload, field));
    case "risk_flag":
      return ["taskId", "riskLevel"].filter((field) => !hasPayloadValue(action.payload, field));
    case "reminder_send":
      return ["assigneeName", "taskId", "message"].filter((field) => !hasPayloadValue(action.payload, field));
    case "deadline_change":
      return ["taskId", "newDeadline"].filter((field) => !hasPayloadValue(action.payload, field));
    case "owner_change":
      return ["taskId", "newOwnerName"].filter((field) => !hasPayloadValue(action.payload, field));
    case "scope_change":
      return ["entityId", "entityType", "newDescription"].filter((field) => !hasPayloadValue(action.payload, field));
    case "email_draft":
      return ["to", "subject", "body"].filter((field) => !hasPayloadValue(action.payload, field));
    case "project_create":
      return ["name", "description"].filter((field) => !hasPayloadValue(action.payload, field));
    case "collaborator_add":
      return ["userId", "role"].filter((field) => !hasPayloadValue(action.payload, field));
    case "collaborator_role_update":
      return ["userId", "role"].filter((field) => !hasPayloadValue(action.payload, field));
    case "collaborator_remove":
      return ["userId"].filter((field) => !hasPayloadValue(action.payload, field));
    case "project_note_send":
      return ["visibility", "content"].filter((field) => !hasPayloadValue(action.payload, field));
    case "calendar_event_create":
      return ["summary", "startDateTime", "endDateTime"].filter(
        (field) => !hasPayloadValue(action.payload, field)
      );
    case "calendar_event_update": {
      const missing = ["eventId"].filter((field) => !hasPayloadValue(action.payload, field));
      const hasAnyMutationField = [
        "summary",
        "startDateTime",
        "endDateTime",
        "description",
        "location",
        "attendees",
      ].some((field) => hasPayloadValue(action.payload, field));
      if (!hasAnyMutationField) {
        missing.push("updateFields");
      }
      return missing;
    }
    default:
      return [];
  }
}

async function getTenantPolicySettings(db: Db, tenantId: string): Promise<TenantPolicySettings> {
  const rows = await db
    .queryTenant<{ auto_execute_low_impact: boolean }>(
      tenantId,
      `SELECT auto_execute_low_impact
       FROM tenant_policy_settings
       WHERE tenant_id = $1
       LIMIT 1`,
      [tenantId]
    )
    .catch(() => [] as Array<{ auto_execute_low_impact: boolean }>);

  return {
    autoExecuteLowImpact: rows[0]?.auto_execute_low_impact ?? true,
  };
}

async function getRequesterRole(
  db: Db,
  tenantId: string,
  requesterUserId: string | null
): Promise<Role | null> {
  if (!requesterUserId) return null;
  const rows = await db
    .queryTenant<{ role: Role }>(
      tenantId,
      `SELECT role
       FROM memberships
       WHERE tenant_id = $1
         AND user_id = $2
       LIMIT 1`,
      [tenantId, requesterUserId]
    )
    .catch(() => [] as Array<{ role: Role }>);

  return rows[0]?.role ?? null;
}

function decideAutoExecution(input: {
  action: LarryAction;
  policy: TenantPolicySettings;
  triggeredBy: TriggeredBy;
  requesterRole: Role | null;
}): AutoExecutionDecision {
  const { action, policy, triggeredBy, requesterRole } = input;

  if (!policy.autoExecuteLowImpact) {
    return {
      decision: "approval_required",
      reason: "Tenant policy disables low-impact auto execution.",
      rule: "tenant_policy:auto_execute_low_impact=false",
    };
  }

  if (triggeredBy === "chat" && requesterRole === "member") {
    return {
      decision: "approval_required",
      reason: "Members must route chat-initiated actions for PM or admin approval.",
      rule: "authority:member_requires_approval",
    };
  }

  if (APPROVAL_ONLY_ACTION_TYPES.has(action.type)) {
    return {
      decision: "approval_required",
      reason: `Action type "${action.type}" requires explicit approval.`,
      rule: `action_type:${action.type}`,
    };
  }

  const missingFields = missingPayloadFields(action);
  if (missingFields.length > 0) {
    return {
      decision: "approval_required",
      reason: `Action payload is missing required fields: ${missingFields.join(", ")}.`,
      rule: "payload:missing_required_fields",
    };
  }

  if (DESTRUCTIVE_KEYWORD_PATTERN.test(`${action.displayText} ${action.reasoning}`)) {
    return {
      decision: "approval_required",
      reason: "Potentially destructive language detected in action details.",
      rule: "keyword:destructive_language",
    };
  }

  return {
    decision: "auto_execute",
    reason: "Low-risk operational action eligible for automatic execution.",
    rule: "policy:auto_execute_allowed",
  };
}

function withPolicyMetadata(action: LarryAction, decision: AutoExecutionDecision): LarryAction {
  return {
    ...action,
    payload: {
      ...action.payload,
      governance: {
        decision: decision.decision,
        reason: decision.reason,
        rule: decision.rule,
        evaluatedAt: new Date().toISOString(),
      },
    },
  };
}

function normalizeLarryEventContext(
  triggeredBy: TriggeredBy,
  context?: LarryEventContext
): NormalizedLarryEventContext {
  const normalized: NormalizedLarryEventContext = {
    conversationId: normalizeContextValue(context?.conversationId),
    requestMessageId: normalizeContextValue(context?.requestMessageId),
    responseMessageId: normalizeContextValue(context?.responseMessageId),
    requesterUserId: normalizeContextValue(context?.requesterUserId),
    sourceKind: normalizeContextValue(context?.sourceKind) ?? triggeredBy,
    sourceRecordId: normalizeContextValue(context?.sourceRecordId),
  };

  if (!normalized.sourceKind) {
    throw new Error("insertLarryEvent: sourceKind is required for every Larry event");
  }

  if (SOURCE_KINDS_REQUIRING_RECORD_ID.has(normalized.sourceKind) && !normalized.sourceRecordId) {
    throw new Error(
      `insertLarryEvent: sourceRecordId is required when sourceKind='${normalized.sourceKind}'`
    );
  }

  if (normalized.sourceKind === "chat") {
    if (!normalized.conversationId) {
      throw new Error("insertLarryEvent: conversationId is required for chat-sourced events");
    }
    if (!normalized.requestMessageId) {
      throw new Error("insertLarryEvent: requestMessageId is required for chat-sourced events");
    }
    if (!normalized.responseMessageId) {
      throw new Error("insertLarryEvent: responseMessageId is required for chat-sourced events");
    }
    if (!normalized.requesterUserId) {
      throw new Error("insertLarryEvent: requesterUserId is required for chat-sourced events");
    }
  }

  if (triggeredBy === "login" && !normalized.requesterUserId) {
    throw new Error("insertLarryEvent: requesterUserId is required for login-triggered events");
  }

  return normalized;
}

async function resolveUserByName(
  db: Db,
  tenantId: string,
  displayName: string
): Promise<string | null> {
  const exact = await db.queryTenant<{ id: string }>(
    tenantId,
    `SELECT u.id
     FROM users u
     JOIN memberships m ON m.user_id = u.id
     WHERE m.tenant_id = $1
       AND LOWER(u.display_name) = LOWER($2)
     LIMIT 1`,
    [tenantId, displayName]
  );
  if (exact[0]) return exact[0].id;

  const fuzzy = await db.queryTenant<{ id: string }>(
    tenantId,
    `SELECT u.id
     FROM users u
     JOIN memberships m ON m.user_id = u.id
     WHERE m.tenant_id = $1
       AND u.display_name ILIKE '%' || $2 || '%'
     LIMIT 1`,
    [tenantId, displayName]
  );
  return fuzzy[0]?.id ?? null;
}

async function logActivity(
  db: Db,
  tenantId: string,
  projectId: string,
  taskId: string | null,
  payload: Record<string, unknown>
): Promise<void> {
  await db.queryTenant(
    tenantId,
    `INSERT INTO activity_log (tenant_id, project_id, task_id, actor_user_id, activity_type, payload)
     VALUES ($1, $2, $3, NULL, 'larry_action', $4::jsonb)`,
    [tenantId, projectId, taskId, JSON.stringify(payload)]
  );
}

async function insertLarryEvent(
  db: Db,
  tenantId: string,
  projectId: string,
  action: LarryAction,
  eventType: LarryEventType,
  triggeredBy: TriggeredBy,
  chatMessage: string | undefined,
  executed: boolean,
  context?: LarryEventContext
): Promise<string> {
  const executionMode: LarryExecutionMode = eventType === "auto_executed" ? "auto" : "approval";
  const executedByKind: LarryExecutedByKind | null = eventType === "auto_executed" ? "larry" : null;
  const normalizedContext = normalizeLarryEventContext(triggeredBy, context);
  const rows = await db.queryTenant<{ id: string }>(
    tenantId,
    `INSERT INTO larry_events
       (tenant_id, project_id, event_type, action_type, display_text, reasoning, payload, executed_at, triggered_by, chat_message,
         conversation_id, request_message_id, response_message_id, requested_by_user_id, executed_by_kind, execution_mode, source_kind, source_record_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10,
             $11, $12, $13, $14, $15, $16, $17, $18)
     RETURNING id`,
    [
      tenantId,
      projectId,
      eventType,
      action.type,
      action.displayText,
      action.reasoning,
      JSON.stringify(action.payload),
      executed ? new Date().toISOString() : null,
      triggeredBy,
      chatMessage ?? null,
      normalizedContext.conversationId,
      normalizedContext.requestMessageId,
      normalizedContext.responseMessageId,
      normalizedContext.requesterUserId,
      executedByKind,
      executionMode,
      normalizedContext.sourceKind,
      normalizedContext.sourceRecordId,
    ]
  );
  return rows[0].id;
}

// ── Individual executors ──────────────────────────────────────────────────────

export async function executeTaskCreate(
  db: Db,
  tenantId: string,
  projectId: string,
  payload: TaskCreatePayload
): Promise<Record<string, unknown>> {
  const assigneeId = payload.assigneeName
    ? await resolveUserByName(db, tenantId, payload.assigneeName)
    : null;

  const rows = await db.queryTenant<Record<string, unknown>>(
    tenantId,
    `INSERT INTO tasks
       (tenant_id, project_id, title, description, status, priority, assignee_user_id, due_date)
     VALUES ($1, $2, $3, $4, 'not_started', $5, $6, $7)
     RETURNING id, tenant_id, project_id, title, description, status, priority,
               assignee_user_id, progress_percent, risk_score, risk_level, due_date, created_at`,
    [tenantId, projectId, payload.title, payload.description ?? null, payload.priority, assigneeId, payload.dueDate ?? null]
  );
  const task = rows[0];
  const taskId = task.id as string;

  await logActivity(db, tenantId, projectId, taskId, {
    action: "task_create",
    title: payload.title,
    triggeredBy: "larry",
  });

  return task;
}

export async function executeStatusUpdate(
  db: Db,
  tenantId: string,
  payload: StatusUpdatePayload
): Promise<Record<string, unknown>> {
  const rows = await db.queryTenant<Record<string, unknown>>(
    tenantId,
    `UPDATE tasks
     SET status = $3, risk_level = $4, updated_at = NOW()
     WHERE tenant_id = $1 AND id = $2
     RETURNING id, tenant_id, project_id, title, status, risk_level, updated_at`,
    [tenantId, payload.taskId, payload.newStatus, payload.newRiskLevel]
  );
  if (rows.length === 0) {
    throw new Error(`executeStatusUpdate: task ${payload.taskId} not found for tenant ${tenantId}`);
  }
  const task = rows[0];
  await logActivity(db, tenantId, task.project_id as string, payload.taskId, {
    action: "status_update",
    newStatus: payload.newStatus,
    newRiskLevel: payload.newRiskLevel,
    triggeredBy: "larry",
  });
  return task;
}

export async function executeRiskFlag(
  db: Db,
  tenantId: string,
  payload: RiskFlagPayload
): Promise<Record<string, unknown>> {
  const rows = await db.queryTenant<Record<string, unknown>>(
    tenantId,
    `UPDATE tasks
     SET risk_level = $3, updated_at = NOW()
     WHERE tenant_id = $1 AND id = $2
     RETURNING id, tenant_id, project_id, title, status, risk_level, updated_at`,
    [tenantId, payload.taskId, payload.riskLevel]
  );
  if (rows.length === 0) {
    throw new Error(`executeRiskFlag: task ${payload.taskId} not found for tenant ${tenantId}`);
  }
  const task = rows[0];
  await logActivity(db, tenantId, task.project_id as string, payload.taskId, {
    action: "risk_flag",
    riskLevel: payload.riskLevel,
    triggeredBy: "larry",
  });
  return task;
}

export async function executeReminderSend(
  db: Db,
  tenantId: string,
  payload: ReminderSendPayload
): Promise<Record<string, unknown>> {
  const userId = await resolveUserByName(db, tenantId, payload.assigneeName);
  const dedupeUserKey = userId ?? "__broadcast__";

  const rows = await db.queryTenant<Record<string, unknown>>(
    tenantId,
    `INSERT INTO notifications
       (tenant_id, user_id, channel, subject, body, metadata, dedupe_scope, dedupe_user_key, dedupe_date)
     VALUES ($1, $2, 'in_app', 'Reminder from Larry', $3, $4::jsonb, 'larry_reminder', $5, CURRENT_DATE)
     ON CONFLICT ON CONSTRAINT uq_notifications_dedup DO NOTHING
     RETURNING id, tenant_id, user_id, channel, subject, body, created_at`,
    [tenantId, userId, payload.message, JSON.stringify({ taskId: payload.taskId, taskTitle: payload.taskTitle }), dedupeUserKey]
  );
  return rows[0] ?? { skipped: true, reason: "duplicate reminder suppressed" };
}

export async function executeDeadlineChange(
  db: Db,
  tenantId: string,
  payload: DeadlineChangePayload
): Promise<Record<string, unknown>> {
  const rows = await db.queryTenant<Record<string, unknown>>(
    tenantId,
    `UPDATE tasks
     SET due_date = $3, updated_at = NOW()
     WHERE tenant_id = $1 AND id = $2
     RETURNING id, tenant_id, project_id, title, status, risk_level, due_date, progress_percent, updated_at`,
    [tenantId, payload.taskId, payload.newDeadline]
  );
  if (rows.length === 0) {
    throw new Error(`executeDeadlineChange: task ${payload.taskId} not found for tenant ${tenantId}`);
  }
  const task = rows[0];
  await logActivity(db, tenantId, task.project_id as string, payload.taskId, {
    action: "deadline_change",
    newDeadline: payload.newDeadline,
    triggeredBy: "larry",
  });
  return task;
}

export async function executeOwnerChange(
  db: Db,
  tenantId: string,
  payload: OwnerChangePayload
): Promise<Record<string, unknown>> {
  const newOwnerId = await resolveUserByName(db, tenantId, payload.newOwnerName);
  if (!newOwnerId) {
    throw new Error(`executeOwnerChange: user "${payload.newOwnerName}" not found in tenant ${tenantId}`);
  }

  const rows = await db.queryTenant<Record<string, unknown>>(
    tenantId,
    `UPDATE tasks
     SET assignee_user_id = $3, updated_at = NOW()
     WHERE tenant_id = $1 AND id = $2
     RETURNING id, tenant_id, project_id, title, assignee_user_id, updated_at`,
    [tenantId, payload.taskId, newOwnerId]
  );
  if (rows.length === 0) {
    throw new Error(`executeOwnerChange: task ${payload.taskId} not found for tenant ${tenantId}`);
  }
  const task = rows[0];
  await logActivity(db, tenantId, task.project_id as string, payload.taskId, {
    action: "owner_change",
    newOwnerName: payload.newOwnerName,
    newOwnerId,
    triggeredBy: "larry",
  });
  return task;
}

export async function executeScopeChange(
  db: Db,
  tenantId: string,
  payload: ScopeChangePayload
): Promise<Record<string, unknown>> {
  if (payload.entityType === "task") {
    const rows = await db.queryTenant<Record<string, unknown>>(
      tenantId,
      `UPDATE tasks
       SET description = $3, updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2
       RETURNING id, tenant_id, project_id, title, description, updated_at`,
      [tenantId, payload.entityId, payload.newDescription]
    );
    if (rows.length === 0) {
      throw new Error(`executeScopeChange: task ${payload.entityId} not found for tenant ${tenantId}`);
    }
    const task = rows[0];
    await logActivity(db, tenantId, task.project_id as string, payload.entityId, {
      action: "scope_change",
      entityType: "task",
      triggeredBy: "larry",
    });
    return task;
  }

  // entityType === 'project'
  const rows = await db.queryTenant<Record<string, unknown>>(
    tenantId,
    `UPDATE projects
     SET description = $3, updated_at = NOW()
     WHERE tenant_id = $1 AND id = $2
     RETURNING id, tenant_id, name, description, updated_at`,
    [tenantId, payload.entityId, payload.newDescription]
  );
  if (rows.length === 0) {
    throw new Error(`executeScopeChange: project ${payload.entityId} not found for tenant ${tenantId}`);
  }
  const project = rows[0];
  await logActivity(db, tenantId, payload.entityId, null, {
    action: "scope_change",
    entityType: "project",
    triggeredBy: "larry",
  });
  return project;
}

export async function executeEmailDraft(
  db: Db,
  tenantId: string,
  projectId: string,
  payload: EmailDraftPayload
): Promise<Record<string, unknown>> {
  const rows = await db.queryTenant<Record<string, unknown>>(
    tenantId,
    `INSERT INTO email_outbound_drafts
       (tenant_id, project_id, action_id, recipient, subject, body, state, metadata)
     VALUES ($1, $2, NULL, $3, $4, $5, 'draft', $6::jsonb)
     RETURNING id, tenant_id, project_id, recipient, subject, body, state, created_at`,
    [tenantId, projectId, payload.to, payload.subject, payload.body, JSON.stringify({ taskId: payload.taskId })]
  );
  return rows[0];
}

export async function executeProjectCreate(
  db: Db,
  tenantId: string,
  payload: ProjectCreatePayload,
  actorUserId?: string | null
): Promise<{ project: Record<string, unknown>; tasks: Array<Record<string, unknown>> }> {
  const projectRows = await db.queryTenant<Record<string, unknown>>(
    tenantId,
    `INSERT INTO projects (tenant_id, name, description, owner_user_id, status)
     VALUES ($1, $2, $3, $4, 'active')
     RETURNING id, tenant_id, name, description, status, created_at`,
    [tenantId, payload.name, payload.description ?? null, actorUserId ?? null]
  );
  const project = projectRows[0];
  const projectId = project.id as string;

  if (actorUserId) {
    await db.queryTenant(
      tenantId,
      `INSERT INTO project_memberships (tenant_id, project_id, user_id, role)
       VALUES ($1, $2, $3, 'owner')
       ON CONFLICT (tenant_id, project_id, user_id)
       DO UPDATE SET role = 'owner', updated_at = NOW()`,
      [tenantId, projectId, actorUserId]
    );
  }

  await logActivity(db, tenantId, projectId, null, {
    action: "project_create",
    name: payload.name,
    triggeredBy: "larry",
  });

  const tasks: Array<Record<string, unknown>> = [];
  for (const taskSpec of payload.tasks) {
    try {
      const task = await executeTaskCreate(db, tenantId, projectId, {
        title: taskSpec.title,
        description: null,
        dueDate: taskSpec.dueDate ?? null,
        assigneeName: taskSpec.assigneeName ?? null,
        priority: "medium",
      });
      tasks.push(task);
    } catch (err) {
      console.error(`executeProjectCreate: failed to create seed task "${taskSpec.title}"`, err);
    }
  }

  return { project, tasks };
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

/**
 * Execute a single action by type. Used by runAutoActions and the accept endpoint.
 */
function normalizeProjectMembershipRole(value: unknown): ProjectMembershipRole {
  if (value === "owner" || value === "editor" || value === "viewer") {
    return value;
  }
  throw new Error(`Invalid collaborator role "${String(value)}".`);
}

async function assertTenantMembership(
  db: Db,
  tenantId: string,
  userId: string
): Promise<void> {
  const rows = await db.queryTenant<{ user_id: string }>(
    tenantId,
    `SELECT user_id
       FROM memberships
      WHERE tenant_id = $1
        AND user_id = $2
      LIMIT 1`,
    [tenantId, userId]
  );

  if (!rows[0]?.user_id) {
    throw new Error("Collaborator target is not a tenant member.");
  }
}

async function getProjectMembershipRoleForUser(
  db: Db,
  tenantId: string,
  projectId: string,
  userId: string
): Promise<ProjectMembershipRole | null> {
  const rows = await db.queryTenant<{ role: ProjectMembershipRole }>(
    tenantId,
    `SELECT role
       FROM project_memberships
      WHERE tenant_id = $1
        AND project_id = $2
        AND user_id = $3
      LIMIT 1`,
    [tenantId, projectId, userId]
  );
  return rows[0]?.role ?? null;
}

async function countProjectOwnerMemberships(
  db: Db,
  tenantId: string,
  projectId: string
): Promise<number> {
  const rows = await db.queryTenant<{ owner_count: string | number }>(
    tenantId,
    `SELECT COUNT(*)::int AS owner_count
       FROM project_memberships
      WHERE tenant_id = $1
        AND project_id = $2
        AND role = 'owner'`,
    [tenantId, projectId]
  );

  const value = rows[0]?.owner_count;
  if (typeof value === "number") return value;
  const parsed = Number.parseInt(String(value ?? "0"), 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

async function executeCollaboratorAdd(
  db: Db,
  tenantId: string,
  projectId: string,
  payload: CollaboratorAddPayload
): Promise<Record<string, unknown>> {
  const role = normalizeProjectMembershipRole(payload.role);
  const userId = normalizeContextValue(payload.userId);
  if (!userId) {
    throw new Error("Collaborator add requires userId.");
  }

  const existingRole = await getProjectMembershipRoleForUser(db, tenantId, projectId, userId);
  if (existingRole === "owner" && role !== "owner") {
    const ownerCount = await countProjectOwnerMemberships(db, tenantId, projectId);
    if (ownerCount <= 1) {
      throw new Error("Cannot demote the last project owner.");
    }
  }

  await assertTenantMembership(db, tenantId, userId);

  await db.queryTenant(
    tenantId,
    `INSERT INTO project_memberships (tenant_id, project_id, user_id, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (tenant_id, project_id, user_id)
     DO UPDATE SET role = EXCLUDED.role, updated_at = NOW()`,
    [tenantId, projectId, userId, role]
  );

  await logActivity(db, tenantId, projectId, null, {
    action: "collaborator_add",
    userId,
    previousRole: existingRole,
    role,
    triggeredBy: "larry",
  });

  return { projectId, userId, previousRole: existingRole, role };
}

async function executeCollaboratorRoleUpdate(
  db: Db,
  tenantId: string,
  projectId: string,
  payload: CollaboratorRoleUpdatePayload
): Promise<Record<string, unknown>> {
  const role = normalizeProjectMembershipRole(payload.role);
  const userId = normalizeContextValue(payload.userId);
  if (!userId) {
    throw new Error("Collaborator role update requires userId.");
  }

  const existingRole = await getProjectMembershipRoleForUser(db, tenantId, projectId, userId);
  if (!existingRole) {
    throw new Error("Project collaborator not found.");
  }

  if (existingRole === "owner" && role !== "owner") {
    const ownerCount = await countProjectOwnerMemberships(db, tenantId, projectId);
    if (ownerCount <= 1) {
      throw new Error("Cannot demote the last project owner.");
    }
  }

  await db.queryTenant(
    tenantId,
    `UPDATE project_memberships
        SET role = $4, updated_at = NOW()
      WHERE tenant_id = $1
        AND project_id = $2
        AND user_id = $3`,
    [tenantId, projectId, userId, role]
  );

  await logActivity(db, tenantId, projectId, null, {
    action: "collaborator_role_update",
    userId,
    previousRole: existingRole,
    role,
    triggeredBy: "larry",
  });

  return { projectId, userId, previousRole: existingRole, role };
}

async function executeCollaboratorRemove(
  db: Db,
  tenantId: string,
  projectId: string,
  payload: CollaboratorRemovePayload
): Promise<Record<string, unknown>> {
  const userId = normalizeContextValue(payload.userId);
  if (!userId) {
    throw new Error("Collaborator remove requires userId.");
  }

  const existingRole = await getProjectMembershipRoleForUser(db, tenantId, projectId, userId);
  if (!existingRole) {
    throw new Error("Project collaborator not found.");
  }

  if (existingRole === "owner") {
    const ownerCount = await countProjectOwnerMemberships(db, tenantId, projectId);
    if (ownerCount <= 1) {
      throw new Error("Cannot remove the last project owner.");
    }
  }

  await db.queryTenant(
    tenantId,
    `DELETE FROM project_memberships
      WHERE tenant_id = $1
        AND project_id = $2
        AND user_id = $3`,
    [tenantId, projectId, userId]
  );

  await logActivity(db, tenantId, projectId, null, {
    action: "collaborator_remove",
    userId,
    previousRole: existingRole,
    triggeredBy: "larry",
  });

  return { projectId, userId, previousRole: existingRole };
}

function normalizeNoteVisibility(value: unknown): "shared" | "personal" {
  if (value === "shared" || value === "personal") return value;
  throw new Error(`Invalid note visibility "${String(value)}".`);
}

async function executeProjectNoteSend(
  db: Db,
  tenantId: string,
  projectId: string,
  payload: ProjectNoteSendPayload,
  actorUserId?: string | null
): Promise<Record<string, unknown>> {
  const authorUserId = normalizeContextValue(actorUserId);
  if (!authorUserId) {
    throw new Error("project_note_send requires an acting user.");
  }

  const visibility = normalizeNoteVisibility(payload.visibility);
  const content = payload.content?.trim();
  if (!content) {
    throw new Error("project_note_send requires non-empty content.");
  }

  const recipientUserId = normalizeContextValue(payload.recipientUserId);
  if (visibility === "shared" && recipientUserId) {
    throw new Error("Shared notes cannot target a recipient.");
  }
  if (visibility === "personal" && !recipientUserId) {
    throw new Error("Personal notes require recipientUserId.");
  }

  if (recipientUserId) {
    const recipientRole = await getProjectMembershipRoleForUser(
      db,
      tenantId,
      projectId,
      recipientUserId
    );
    if (!recipientRole) {
      throw new Error("Personal note recipient is not a project collaborator.");
    }
  }

  const sourceKind = normalizeContextValue(payload.sourceKind) ?? "action";
  const sourceRecordId = normalizeContextValue(payload.sourceRecordId);
  const rows = await db.queryTenant<Record<string, unknown>>(
    tenantId,
    `INSERT INTO project_notes
       (tenant_id, project_id, author_user_id, visibility, recipient_user_id, content, source_kind, source_record_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id,
               tenant_id,
               project_id,
               author_user_id,
               visibility,
               recipient_user_id,
               content,
               source_kind,
               source_record_id,
               created_at,
               updated_at`,
    [
      tenantId,
      projectId,
      authorUserId,
      visibility,
      visibility === "personal" ? recipientUserId : null,
      content,
      sourceKind,
      sourceRecordId,
    ]
  );

  const note = rows[0];
  await logActivity(db, tenantId, projectId, null, {
    action: "project_note_send",
    noteId: note?.id,
    visibility,
    recipientUserId: visibility === "personal" ? recipientUserId : null,
    triggeredBy: "larry",
  });

  return note;
}

export async function executeAction(
  db: Db,
  tenantId: string,
  projectId: string,
  actionType: LarryActionType,
  payload: Record<string, unknown>,
  actorUserId?: string | null
): Promise<unknown> {
  switch (actionType) {
    case "task_create":
      return executeTaskCreate(db, tenantId, projectId, payload as unknown as TaskCreatePayload);

    case "status_update": {
      if (payload.taskId === null || payload.taskId === undefined) {
        throw new Error("Cannot execute status_update — taskId is ambiguous. Edit the event to specify a taskId before accepting.");
      }
      return executeStatusUpdate(db, tenantId, payload as unknown as StatusUpdatePayload);
    }

    case "risk_flag":
      return executeRiskFlag(db, tenantId, payload as unknown as RiskFlagPayload);

    case "reminder_send":
      return executeReminderSend(db, tenantId, payload as unknown as ReminderSendPayload);

    case "deadline_change":
      return executeDeadlineChange(db, tenantId, payload as unknown as DeadlineChangePayload);

    case "owner_change":
      return executeOwnerChange(db, tenantId, payload as unknown as OwnerChangePayload);

    case "scope_change":
      return executeScopeChange(db, tenantId, payload as unknown as ScopeChangePayload);

    case "email_draft":
      return executeEmailDraft(db, tenantId, projectId, payload as unknown as EmailDraftPayload);

    case "project_create":
      return executeProjectCreate(
        db,
        tenantId,
        payload as unknown as ProjectCreatePayload,
        actorUserId ?? null
      );

    case "collaborator_add":
      return executeCollaboratorAdd(
        db,
        tenantId,
        projectId,
        payload as unknown as CollaboratorAddPayload
      );

    case "collaborator_role_update":
      return executeCollaboratorRoleUpdate(
        db,
        tenantId,
        projectId,
        payload as unknown as CollaboratorRoleUpdatePayload
      );

    case "collaborator_remove":
      return executeCollaboratorRemove(
        db,
        tenantId,
        projectId,
        payload as unknown as CollaboratorRemovePayload
      );

    case "project_note_send":
      return executeProjectNoteSend(
        db,
        tenantId,
        projectId,
        payload as unknown as ProjectNoteSendPayload,
        actorUserId ?? null
      );

    case "calendar_event_create":
      throw new Error(
        "calendar_event_create is approval-governed and must execute via the API accept flow."
      );

    case "calendar_event_update":
      throw new Error(
        "calendar_event_update is approval-governed and must execute via the API accept flow."
      );

    default:
      throw new Error(`executeAction: unknown action type "${actionType as string}"`);
  }
}

// ── Orchestration ─────────────────────────────────────────────────────────────

/**
 * Execute all auto-actions from an IntelligenceResult.
 * Writes a larry_event with event_type='auto_executed' for each successful execution.
 * Errors in individual actions are logged and skipped — partial success is acceptable.
 */
export async function runAutoActions(
  db: Db,
  tenantId: string,
  projectId: string,
  triggeredBy: TriggeredBy,
  actions: LarryAction[],
  chatMessage?: string,
  context?: LarryEventContext
): Promise<ExecutorResult> {
  const requesterUserId = normalizeContextValue(context?.requesterUserId);
  const [policy, requesterRole] = await Promise.all([
    getTenantPolicySettings(db, tenantId),
    getRequesterRole(db, tenantId, requesterUserId),
  ]);

  const autoExecutableActions: LarryAction[] = [];
  const reroutedSuggestionActions: LarryAction[] = [];

  for (const action of actions) {
    const decision = decideAutoExecution({
      action,
      policy,
      triggeredBy,
      requesterRole,
    });

    if (decision.decision === "auto_execute") {
      autoExecutableActions.push(action);
      continue;
    }

    reroutedSuggestionActions.push(withPolicyMetadata(action, decision));
  }

  const reroutedSuggestionResult =
    reroutedSuggestionActions.length > 0
      ? await storeSuggestions(
          db,
          tenantId,
          projectId,
          triggeredBy,
          reroutedSuggestionActions,
          chatMessage,
          context
        )
      : { executedCount: 0, suggestedCount: 0, eventIds: [] };

  const eventIds: string[] = [];
  let executedCount = 0;

  for (const action of autoExecutableActions) {
    // Insert the event record FIRST (executed_at = null) so that if the action
    // throws, we can delete it and avoid leaving an invisible mutation with no audit trail.
    let eventId: string;
    try {
      eventId = await insertLarryEvent(
        db,
        tenantId,
        projectId,
        action,
        "auto_executed",
        triggeredBy,
        chatMessage,
        false,
        context
      );
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("insertLarryEvent:")) {
        throw err;
      }
      console.error(`runAutoActions: failed to create event record for "${action.type}"`, {
        actionType: action.type,
        tenantId,
        projectId,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    try {
      await executeAction(
        db,
        tenantId,
        projectId,
        action.type,
        action.payload,
        context?.requesterUserId ?? null
      );
      await db.queryTenant(
        tenantId,
        `UPDATE larry_events
         SET executed_at = NOW(),
             executed_by_kind = COALESCE(executed_by_kind, 'larry')
         WHERE tenant_id = $1 AND id = $2`,
        [tenantId, eventId]
      );
      eventIds.push(eventId);
      executedCount++;
    } catch (err) {
      // Remove the ghost event so the activity trail stays accurate
      await db.queryTenant(
        tenantId,
        `DELETE FROM larry_events WHERE tenant_id = $1 AND id = $2`,
        [tenantId, eventId]
      ).catch(() => {});
      console.error(`runAutoActions: failed to execute "${action.type}"`, {
        actionType: action.type,
        tenantId,
        projectId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    executedCount,
    suggestedCount: reroutedSuggestionResult.suggestedCount,
    eventIds: [...eventIds, ...reroutedSuggestionResult.eventIds],
  };
}

/**
 * Return all currently-pending suggestion display_text values for a project.
 * Used to inject into the intelligence prompt so Larry doesn't re-propose things
 * that are already waiting for approval.
 */
export async function getPendingSuggestionTexts(
  db: Db,
  tenantId: string,
  projectId: string
): Promise<string[]> {
  const rows = await db.queryTenant<{ action_type: string; display_text: string }>(
    tenantId,
    `SELECT action_type, display_text
     FROM larry_events
     WHERE tenant_id = $1
       AND project_id = $2
       AND event_type = 'suggested'
     ORDER BY created_at DESC`,
    [tenantId, projectId]
  );
  return rows.map((r) => `${r.action_type}: ${r.display_text}`);
}

export async function listLarryEventIdsBySource(
  db: Db,
  tenantId: string,
  sourceKind: string,
  sourceRecordId: string
): Promise<string[]> {
  if (!sourceRecordId) return [];

  const rows = await db.queryTenant<{ id: string }>(
    tenantId,
    `SELECT id
     FROM larry_events
     WHERE tenant_id = $1
       AND source_kind = $2
       AND source_record_id = $3
     ORDER BY created_at ASC`,
    [tenantId, sourceKind, sourceRecordId]
  );

  return rows.map((row) => row.id);
}

// ── Project memory ────────────────────────────────────────────────────────────

const PROJECT_MEMORY_SOURCE_KIND_ALIASES: Record<string, string[]> = {
  meeting: ["meeting", "meetings", "transcript", "meetingtranscript", "meetingsignal"],
  email: ["email", "emails", "emailsignal"],
  slack: ["slack", "slacksignal"],
  calendar: ["calendar", "calendarsignal", "googlecalendar"],
  chat: ["chat", "larrychat"],
  action: ["action", "acceptedaction", "actioncentre", "actioncenter"],
  briefing: ["briefing", "loginbriefing"],
  schedule: ["schedule", "scheduledscan"],
};

function normalizeProjectMemorySourceKind(value: string | null | undefined): string | null {
  const normalized = normalizeContextValue(value);
  if (!normalized) return null;

  const compact = normalized.toLowerCase().replace(/[\s_-]+/g, "");
  for (const [canonical, aliases] of Object.entries(PROJECT_MEMORY_SOURCE_KIND_ALIASES)) {
    if (aliases.includes(compact)) return canonical;
  }

  return normalized.toLowerCase();
}

function getProjectMemorySourceKindFilterVariants(value: string): string[] {
  const normalized = normalizeProjectMemorySourceKind(value);
  if (!normalized) return [];

  const aliases = PROJECT_MEMORY_SOURCE_KIND_ALIASES[normalized] ?? [];
  const variants = new Set<string>([normalized]);
  for (const alias of aliases) {
    variants.add(alias);
  }

  if (normalized === "meeting") {
    variants.add("meeting transcript");
    variants.add("meeting_transcript");
  }
  if (normalized === "email") {
    variants.add("email signal");
    variants.add("email_signal");
  }
  if (normalized === "slack") {
    variants.add("slack signal");
    variants.add("slack_signal");
  }
  if (normalized === "calendar") {
    variants.add("calendar signal");
    variants.add("calendar_signal");
    variants.add("google_calendar");
  }

  return Array.from(variants);
}

function hashProjectMemoryContent(content: string): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  return createHash("sha256").update(normalized).digest("hex");
}

export interface ProjectMemoryEntryInsert {
  source: string;
  sourceKind: string;
  sourceRecordId?: string | null;
  content: string;
}

export interface ProjectMemoryEntryRow {
  id: string;
  source: string;
  sourceKind: string;
  sourceRecordId: string | null;
  content: string;
  createdAt: string;
}

export async function insertProjectMemoryEntry(
  db: Db,
  tenantId: string,
  projectId: string,
  entry: ProjectMemoryEntryInsert
): Promise<string> {
  const normalizedSourceKind = normalizeProjectMemorySourceKind(entry.sourceKind) ?? "chat";
  const sourceRecordId = normalizeContextValue(entry.sourceRecordId);
  const contentHash = hashProjectMemoryContent(entry.content);

  if (sourceRecordId) {
    const existingRows = await db.queryTenant<{ id: string }>(
      tenantId,
      `SELECT id
       FROM project_memory_entries
       WHERE tenant_id = $1
         AND project_id = $2
         AND source_kind = $3
         AND source_record_id = $4
         AND content_hash = $5
       ORDER BY created_at DESC
       LIMIT 1`,
      [tenantId, projectId, normalizedSourceKind, sourceRecordId, contentHash]
    );
    if (existingRows[0]?.id) return existingRows[0].id;
  }

  const insertSql = `INSERT INTO project_memory_entries
      (tenant_id, project_id, source, source_kind, source_record_id, content, content_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`;

  try {
    const rows = await db.queryTenant<{ id: string }>(tenantId, insertSql, [
      tenantId,
      projectId,
      entry.source,
      normalizedSourceKind,
      sourceRecordId,
      entry.content,
      contentHash,
    ]);
    return rows[0].id;
  } catch (error) {
    if (
      sourceRecordId &&
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "23505"
    ) {
      const existingRows = await db.queryTenant<{ id: string }>(
        tenantId,
        `SELECT id
         FROM project_memory_entries
         WHERE tenant_id = $1
           AND project_id = $2
           AND source_kind = $3
           AND source_record_id = $4
           AND content_hash = $5
         ORDER BY created_at DESC
         LIMIT 1`,
        [tenantId, projectId, normalizedSourceKind, sourceRecordId, contentHash]
      );
      if (existingRows[0]?.id) return existingRows[0].id;
    }
    throw error;
  }
}

export async function listProjectMemoryEntries(
  db: Db,
  tenantId: string,
  projectId: string,
  opts?: { sourceKind?: string; limit?: number }
): Promise<ProjectMemoryEntryRow[]> {
  const limit = Math.min(opts?.limit ?? 20, 100);
  const sourceFilterVariants =
    typeof opts?.sourceKind === "string"
      ? getProjectMemorySourceKindFilterVariants(opts.sourceKind)
      : [];

  const rows = await db.queryTenant<{
    id: string;
    source: string;
    source_kind: string;
    source_record_id: string | null;
    content: string;
    created_at: string;
  }>(
    tenantId,
    sourceFilterVariants.length > 0
      ? `SELECT id, source, source_kind, source_record_id, content, created_at::text
         FROM project_memory_entries
         WHERE tenant_id = $1
           AND project_id = $2
           AND source_kind = ANY($3::text[])
         ORDER BY created_at DESC
         LIMIT $4`
      : `SELECT id, source, source_kind, source_record_id, content, created_at::text
         FROM project_memory_entries
         WHERE tenant_id = $1 AND project_id = $2
         ORDER BY created_at DESC
         LIMIT $3`,
    sourceFilterVariants.length > 0
      ? [tenantId, projectId, sourceFilterVariants, limit]
      : [tenantId, projectId, limit]
  );
  return rows.map((r) => ({
    id: r.id,
    source: r.source,
    sourceKind: normalizeProjectMemorySourceKind(r.source_kind) ?? r.source_kind,
    sourceRecordId: r.source_record_id,
    content: r.content,
    createdAt: r.created_at,
  }));
}

export async function backfillLarryEventSourceRecord(
  db: Db,
  tenantId: string,
  eventIds: string[],
  sourceKind: string,
  sourceRecordId: string
): Promise<void> {
  if (eventIds.length === 0) return;

  await db.queryTenant(
    tenantId,
    `UPDATE larry_events
     SET source_kind = COALESCE(source_kind, $3),
         source_record_id = $4
     WHERE tenant_id = $1
       AND id = ANY($2::uuid[])`,
    [tenantId, eventIds, sourceKind, sourceRecordId]
  );
}

/**
 * Store suggested actions from an IntelligenceResult without executing them.
 * Skips any action that is already pending (same action_type + display_text)
 * to prevent duplicate suggestions when Larry is prompted multiple times.
 */
export async function storeSuggestions(
  db: Db,
  tenantId: string,
  projectId: string,
  triggeredBy: TriggeredBy,
  actions: LarryAction[],
  chatMessage?: string,
  context?: LarryEventContext
): Promise<ExecutorResult> {
  // Fetch existing pending suggestions once for dedup comparison
  const existingRows = await db.queryTenant<{ action_type: string; display_text: string }>(
    tenantId,
    `SELECT action_type, display_text
     FROM larry_events
     WHERE tenant_id = $1
       AND project_id = $2
       AND event_type = 'suggested'`,
    [tenantId, projectId]
  );
  const existingKeys = new Set(
    existingRows.map((r) => `${r.action_type}||${r.display_text.toLowerCase()}`)
  );

  const eventIds: string[] = [];
  let suggestedCount = 0;

  for (const action of actions) {
    const key = `${action.type}||${action.displayText.toLowerCase()}`;
    if (existingKeys.has(key)) continue; // already pending — skip
    const eventId = await insertLarryEvent(
      db,
      tenantId,
      projectId,
      action,
      "suggested",
      triggeredBy,
      chatMessage,
      false,
      context
    );
    eventIds.push(eventId);
    existingKeys.add(key); // guard against duplicates within the same batch
    suggestedCount++;
  }

  return { executedCount: 0, suggestedCount, eventIds };
}
