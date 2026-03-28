import type { LarryAction, LarryActionType, LarryEventType } from "@larry/shared";
import { Db } from "./client.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type TriggeredBy = "schedule" | "login" | "chat" | "signal";

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

// ── Helpers ───────────────────────────────────────────────────────────────────

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
  executed: boolean
): Promise<string> {
  const rows = await db.queryTenant<{ id: string }>(
    tenantId,
    `INSERT INTO larry_events
       (tenant_id, project_id, event_type, action_type, display_text, reasoning, payload, executed_at, triggered_by, chat_message)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10)
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
  payload: ProjectCreatePayload
): Promise<{ project: Record<string, unknown>; tasks: Array<Record<string, unknown>> }> {
  const projectRows = await db.queryTenant<Record<string, unknown>>(
    tenantId,
    `INSERT INTO projects (tenant_id, name, description, status)
     VALUES ($1, $2, $3, 'active')
     RETURNING id, tenant_id, name, description, status, created_at`,
    [tenantId, payload.name, payload.description ?? null]
  );
  const project = projectRows[0];
  const projectId = project.id as string;

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
export async function executeAction(
  db: Db,
  tenantId: string,
  projectId: string,
  actionType: LarryActionType,
  payload: Record<string, unknown>
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
      return executeProjectCreate(db, tenantId, payload as unknown as ProjectCreatePayload);

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
  chatMessage?: string
): Promise<ExecutorResult> {
  const eventIds: string[] = [];
  let executedCount = 0;

  for (const action of actions) {
    // Insert the event record FIRST (executed_at = null) so that if the action
    // throws, we can delete it and avoid leaving an invisible mutation with no audit trail.
    let eventId: string;
    try {
      eventId = await insertLarryEvent(db, tenantId, projectId, action, "auto_executed", triggeredBy, chatMessage, false);
    } catch (err) {
      console.error(`runAutoActions: failed to create event record for "${action.type}"`, {
        actionType: action.type,
        tenantId,
        projectId,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    try {
      await executeAction(db, tenantId, projectId, action.type, action.payload);
      await db.queryTenant(
        tenantId,
        `UPDATE larry_events SET executed_at = NOW() WHERE tenant_id = $1 AND id = $2`,
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

  return { executedCount, suggestedCount: 0, eventIds };
}

/**
 * Store suggested actions from an IntelligenceResult without executing them.
 * Writes a larry_event with event_type='suggested' for each action.
 */
export async function storeSuggestions(
  db: Db,
  tenantId: string,
  projectId: string,
  triggeredBy: TriggeredBy,
  actions: LarryAction[],
  chatMessage?: string
): Promise<ExecutorResult> {
  const eventIds: string[] = [];

  for (const action of actions) {
    const eventId = await insertLarryEvent(db, tenantId, projectId, action, "suggested", triggeredBy, chatMessage, false);
    eventIds.push(eventId);
  }

  return { executedCount: 0, suggestedCount: actions.length, eventIds };
}
