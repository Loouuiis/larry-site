import { classifyRiskLevel, computeRiskScore } from "@larry/ai";
import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { writeAuditLog } from "../../lib/audit.js";
import { postSlackMessage } from "../../services/connectors/slack.js";

const DecisionBodySchema = z.object({
  note: z.string().max(1_000).optional(),
  overridePayload: z.record(z.string(), z.unknown()).optional(),
});

async function loadActionOrThrow(
  fastify: Parameters<FastifyPluginAsync>[0],
  tenantId: string,
  actionId: string
): Promise<{
  id: string;
  agentRunId: string | null;
  projectId: string | null;
  state: "pending" | "approved" | "rejected" | "overridden" | "executed";
  actionType: string;
  impact: "low" | "medium" | "high";
  payload: Record<string, unknown>;
}> {
  const rows = await fastify.db.queryTenant<{
    id: string;
    agentRunId: string | null;
    projectId: string | null;
    state: "pending" | "approved" | "rejected" | "overridden" | "executed";
    actionType: string;
    impact: "low" | "medium" | "high";
    payload: Record<string, unknown>;
  }>(
    tenantId,
    `SELECT id,
            agent_run_id as "agentRunId",
            project_id as "projectId",
            state,
            action_type as "actionType",
            impact,
            payload
     FROM extracted_actions
     WHERE tenant_id = $1 AND id = $2
     LIMIT 1`,
    [tenantId, actionId]
  );

  if (!rows[0]) {
    throw fastify.httpErrors.notFound("Action not found.");
  }

  return rows[0];
}

async function finalizeAgentRunIfResolved(
  fastify: Parameters<FastifyPluginAsync>[0],
  options: { tenantId: string; runId: string | null; actorUserId: string }
): Promise<void> {
  if (!options.runId) return;

  const runRows = await fastify.db.queryTenant<{ state: "APPROVAL_PENDING" | "EXECUTED" | "VERIFIED" | "FAILED" }>(
    options.tenantId,
    `SELECT state
     FROM agent_runs
     WHERE tenant_id = $1 AND id = $2
     LIMIT 1`,
    [options.tenantId, options.runId]
  );

  const run = runRows[0];
  if (!run || run.state !== "APPROVAL_PENDING") {
    return;
  }

  const pendingRows = await fastify.db.queryTenant<{ count: number }>(
    options.tenantId,
    `SELECT COUNT(*)::int as count
     FROM extracted_actions
     WHERE tenant_id = $1
       AND agent_run_id = $2
       AND state = 'pending'`,
    [options.tenantId, options.runId]
  );

  if ((pendingRows[0]?.count ?? 0) > 0) {
    return;
  }

  await fastify.db.queryTenant(
    options.tenantId,
    `UPDATE agent_runs
     SET state = 'EXECUTED',
         status_message = $3,
         updated_at = NOW()
     WHERE tenant_id = $1 AND id = $2`,
    [options.tenantId, options.runId, "All approval-required actions resolved"]
  );

  await fastify.db.queryTenant(
    options.tenantId,
    `INSERT INTO agent_run_transitions
     (tenant_id, agent_run_id, previous_state, next_state, reason, metadata)
     VALUES ($1, $2, 'APPROVAL_PENDING', 'EXECUTED', $3, $4::jsonb)`,
    [
      options.tenantId,
      options.runId,
      "All pending actions reviewed",
      JSON.stringify({ resolution: "approvals_resolved" }),
    ]
  );

  await fastify.db.queryTenant(
    options.tenantId,
    `UPDATE agent_runs
     SET state = 'VERIFIED',
         status_message = $3,
         updated_at = NOW()
     WHERE tenant_id = $1 AND id = $2`,
    [options.tenantId, options.runId, "Run verified after approval decisions"]
  );

  await fastify.db.queryTenant(
    options.tenantId,
    `INSERT INTO agent_run_transitions
     (tenant_id, agent_run_id, previous_state, next_state, reason, metadata)
     VALUES ($1, $2, 'EXECUTED', 'VERIFIED', $3, $4::jsonb)`,
    [
      options.tenantId,
      options.runId,
      "Approval loop completed",
      JSON.stringify({ resolution: "approvals_resolved" }),
    ]
  );

  await writeAuditLog(fastify.db, {
    tenantId: options.tenantId,
    actorUserId: options.actorUserId,
    actionType: "agent.run.auto-verify",
    objectType: "agent_run",
    objectId: options.runId,
    details: { reason: "no_pending_actions_remaining" },
  });
}

async function recordDecision(
  fastify: Parameters<FastifyPluginAsync>[0],
  options: {
    tenantId: string;
    actionId: string;
    userId: string;
    decision: "approved" | "rejected" | "overridden";
    note?: string;
  }
): Promise<void> {
  await fastify.db.queryTenant(
    options.tenantId,
    `INSERT INTO approval_decisions (tenant_id, action_id, decision, decided_by_user_id, note)
     VALUES ($1, $2, $3, $4, $5)`,
    [options.tenantId, options.actionId, options.decision, options.userId, options.note ?? null]
  );
}

async function updateInterventionStatus(
  fastify: Parameters<FastifyPluginAsync>[0],
  tenantId: string,
  actionId: string,
  status: string
): Promise<void> {
  await fastify.db.queryTenant(
    tenantId,
    `UPDATE interventions
     SET status = $3,
         updated_at = NOW()
     WHERE tenant_id = $1 AND action_id = $2`,
    [tenantId, actionId, status]
  );
}

function mergeActionPayload(
  payload: Record<string, unknown>,
  overridePayload?: Record<string, unknown>
): Record<string, unknown> {
  if (!overridePayload) return payload;
  return { ...payload, ...overridePayload };
}

function readPayloadString(
  payload: Record<string, unknown>,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function readPayloadDate(
  payload: Record<string, unknown>,
  ...keys: string[]
): string | null {
  const value = readPayloadString(payload, ...keys);
  if (!value) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function readPayloadNumber(
  payload: Record<string, unknown>,
  ...keys: string[]
): number | undefined {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
}

type TaskStatus = "backlog" | "not_started" | "in_progress" | "waiting" | "completed" | "blocked";

function isTaskStatus(value: string): value is TaskStatus {
  return (
    value === "backlog" ||
    value === "not_started" ||
    value === "in_progress" ||
    value === "waiting" ||
    value === "completed" ||
    value === "blocked"
  );
}

function parseStatusUpdatePayload(payload: Record<string, unknown>): {
  taskId: string;
  status: TaskStatus;
  progressPercent?: number;
} {
  const taskId = readPayloadString(payload, "taskId", "task_id", "id");
  const statusValue = readPayloadString(payload, "status", "state");
  const progressPercent = readPayloadNumber(payload, "progressPercent", "progress", "percentComplete");

  if (!taskId) {
    throw new Error("Status update action is missing taskId.");
  }
  if (!statusValue || !isTaskStatus(statusValue)) {
    throw new Error("Status update action is missing a valid status.");
  }
  if (
    progressPercent !== undefined &&
    (!Number.isInteger(progressPercent) || progressPercent < 0 || progressPercent > 100)
  ) {
    throw new Error("Status update action has an invalid progressPercent.");
  }

  return { taskId, status: statusValue, progressPercent };
}

function parseProjectCreatePayload(payload: Record<string, unknown>): {
  name: string;
  description: string | null;
  startDate: string | null;
  targetDate: string | null;
  tasks: Array<{
    title: string;
    description: string | null;
    dueDate: string | null;
  }>;
} {
  const name = readPayloadString(payload, "name", "title");
  if (!name) {
    throw new Error("Project create action is missing a project name.");
  }

  const tasks = Array.isArray(payload.tasks)
    ? payload.tasks.flatMap((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          return [];
        }
        const record = item as Record<string, unknown>;
        const title = readPayloadString(record, "title", "name");
        if (!title) {
          return [];
        }
        return [{
          title,
          description: readPayloadString(record, "description"),
          dueDate: readPayloadDate(record, "dueDate", "targetDate"),
        }];
      })
    : [];

  return {
    name,
    description: readPayloadString(payload, "description", "summary"),
    startDate: readPayloadDate(payload, "startDate"),
    targetDate: readPayloadDate(payload, "targetDate", "dueDate"),
    tasks,
  };
}

function parseEmailDraftPayload(payload: Record<string, unknown>): {
  recipient: string;
  subject: string;
  body: string;
} {
  const recipient = readPayloadString(payload, "to", "recipient", "email");
  const subject = readPayloadString(payload, "subject", "title");
  const body = readPayloadString(payload, "body", "message", "slackMessage");

  if (!recipient || !subject || !body) {
    throw new Error("Email draft action is missing recipient, subject, or body.");
  }

  return { recipient, subject, body };
}

async function executeApprovedEmailDraft(
  fastify: Parameters<FastifyPluginAsync>[0],
  options: {
    tenantId: string;
    actionId: string;
    projectId: string | null;
    userId: string;
    payload: Record<string, unknown>;
  }
): Promise<string> {
  const draft = parseEmailDraftPayload(options.payload);
  const resendKey = fastify.config.RESEND_API_KEY;

  const rows = await fastify.db.queryTenant<{ id: string }>(
    options.tenantId,
    `INSERT INTO email_outbound_drafts
      (tenant_id, project_id, action_id, created_by_user_id, recipient, subject, body, state, sent_at, metadata)
     VALUES
      ($1, $2, $3, $4, $5, $6, $7, 'sent', NOW(), $8::jsonb)
     RETURNING id`,
    [
      options.tenantId,
      options.projectId,
      options.actionId,
      options.userId,
      draft.recipient,
      draft.subject,
      draft.body,
      JSON.stringify({ source: "action_approval" }),
    ]
  );

  if (resendKey) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Larry <noreply@larry.app>",
          to: [draft.recipient],
          subject: draft.subject,
          text: draft.body,
        }),
      });
    } catch (err) {
      fastify.log.warn({ err, actionId: options.actionId }, "Resend email delivery failed after action approval");
    }
  }

  await fastify.db.queryTenant(
    options.tenantId,
    `INSERT INTO notifications (tenant_id, user_id, channel, subject, body, sent_at, metadata)
     VALUES ($1, NULL, 'email', $2, $3, NOW(), $4::jsonb)`,
    [
      options.tenantId,
      draft.subject,
      draft.body,
      JSON.stringify({
        recipient: draft.recipient,
        draftId: rows[0].id,
        resendUsed: Boolean(resendKey),
      }),
    ]
  );

  return rows[0].id;
}

export const actionRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/:id/approve",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm"])] },
    async (request) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const body = DecisionBodySchema.parse(request.body);
      const tenantId = request.user.tenantId;

      const action = await loadActionOrThrow(fastify, tenantId, params.id);
      if (action.state !== "pending") {
        throw fastify.httpErrors.conflict(`Action is already in state ${action.state}.`);
      }

      const resolvedActionType = action.actionType === "task_update"
        ? "status_update"
        : action.actionType;
      const effectivePayload = mergeActionPayload(action.payload, body.overridePayload);
      let statusUpdateExecution:
        | {
            taskId: string;
            status: TaskStatus;
            progressPercent?: number;
            dueDate: string | null;
            currentProgressPercent: number;
          }
        | null = null;

      if (action.actionType === "email_draft") {
        try {
          parseEmailDraftPayload(effectivePayload);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Invalid email draft payload.";
          throw fastify.httpErrors.badRequest(message);
        }
      }
      if (resolvedActionType === "status_update") {
        try {
          const parsed = parseStatusUpdatePayload(effectivePayload);
          const taskRows = await fastify.db.queryTenant<{
            dueDate: string | null;
            progressPercent: number;
          }>(
            tenantId,
            `SELECT due_date as "dueDate", progress_percent as "progressPercent"
             FROM tasks
             WHERE tenant_id = $1 AND id = $2
             LIMIT 1`,
            [tenantId, parsed.taskId]
          );

          if (!taskRows[0]) {
            throw fastify.httpErrors.notFound("Task not found for status update.");
          }

          statusUpdateExecution = {
            taskId: parsed.taskId,
            status: parsed.status,
            progressPercent: parsed.progressPercent,
            dueDate: taskRows[0].dueDate,
            currentProgressPercent: taskRows[0].progressPercent,
          };
        } catch (error) {
          if (typeof error === "object" && error !== null && "statusCode" in error) {
            throw error;
          }
          const message = error instanceof Error ? error.message : "Invalid status update payload.";
          throw fastify.httpErrors.badRequest(message);
        }
      }
      if (resolvedActionType === "project_create") {
        try {
          parseProjectCreatePayload(effectivePayload);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Invalid project create payload.";
          throw fastify.httpErrors.badRequest(message);
        }
      }

      await fastify.db.queryTenant(
        tenantId,
        `UPDATE extracted_actions
         SET state = 'approved',
             payload = $3::jsonb,
             updated_at = NOW()
         WHERE tenant_id = $1 AND id = $2`,
        [tenantId, params.id, JSON.stringify(effectivePayload)]
      );

      await recordDecision(fastify, {
        tenantId,
        actionId: params.id,
        userId: request.user.userId,
        decision: "approved",
        note: body.note,
      });
      await updateInterventionStatus(fastify, tenantId, params.id, "approved");

      // Execute supported actions immediately on approval
      let createdTaskId: string | null = null;
      let updatedTaskId: string | null = null;
      let createdProjectId: string | null = null;
      let sentDraftId: string | null = null;

      if (resolvedActionType === "task_create" && action.projectId) {
        const title = typeof effectivePayload.title === "string" && effectivePayload.title.trim()
          ? effectivePayload.title.trim()
          : "Untitled task";
        const description = typeof effectivePayload.description === "string" ? effectivePayload.description : null;
        const dueDate = typeof effectivePayload.dueDate === "string" ? effectivePayload.dueDate : null;
        const priority = action.impact === "high" ? "high"
          : action.impact === "low" ? "low"
          : "medium";

        const taskRows = await fastify.db.queryTenant<{ id: string }>(
          tenantId,
          `INSERT INTO tasks (tenant_id, project_id, title, description, status, priority, due_date, created_by_user_id)
           VALUES ($1, $2, $3, $4, 'not_started', $5, $6, $7)
           RETURNING id`,
          [tenantId, action.projectId, title, description, priority, dueDate, request.user.userId]
        );
        createdTaskId = taskRows[0].id;

        await fastify.db.queryTenant(
          tenantId,
          `UPDATE extracted_actions
           SET state = 'executed', task_id = $3, executed_at = NOW(), updated_at = NOW()
           WHERE tenant_id = $1 AND id = $2`,
          [tenantId, params.id, createdTaskId]
        );
        await updateInterventionStatus(fastify, tenantId, params.id, "executed");
      }

      if (resolvedActionType === "project_create") {
        const projectDraft = parseProjectCreatePayload(effectivePayload);

        const projectRows = await fastify.db.queryTenant<{ id: string }>(
          tenantId,
          `INSERT INTO projects (tenant_id, name, description, owner_user_id, start_date, target_date)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [
            tenantId,
            projectDraft.name,
            projectDraft.description,
            request.user.userId,
            projectDraft.startDate,
            projectDraft.targetDate,
          ]
        );
        createdProjectId = projectRows[0].id;

        for (const task of projectDraft.tasks) {
          const dueDate = task.dueDate ? new Date(task.dueDate) : null;
          const daysToDeadline = dueDate ? Math.ceil((dueDate.getTime() - Date.now()) / 86_400_000) : 30;
          const riskScore = computeRiskScore({
            daysToDeadline,
            progressPercent: 0,
            inactivityDays: 0,
            dependencyBlockedCount: 0,
          });
          const riskLevel = classifyRiskLevel(riskScore);

          await fastify.db.queryTenant(
            tenantId,
            `INSERT INTO tasks
              (tenant_id, project_id, title, description, status, priority, due_date, created_by_user_id, risk_score, risk_level)
             VALUES
              ($1, $2, $3, $4, 'not_started', 'medium', $5, $6, $7, $8)`,
            [
              tenantId,
              createdProjectId,
              task.title,
              task.description,
              task.dueDate,
              request.user.userId,
              riskScore,
              riskLevel,
            ]
          );
        }

        await fastify.db.queryTenant(
          tenantId,
          `UPDATE extracted_actions
           SET state = 'executed', project_id = $3, executed_at = NOW(), updated_at = NOW()
           WHERE tenant_id = $1 AND id = $2`,
          [tenantId, params.id, createdProjectId]
        );
        await updateInterventionStatus(fastify, tenantId, params.id, "executed");
      }

      if (resolvedActionType === "status_update" && statusUpdateExecution) {
        const dueDate = statusUpdateExecution.dueDate ? new Date(statusUpdateExecution.dueDate) : null;
        const progressPercent =
          statusUpdateExecution.progressPercent ??
          (statusUpdateExecution.status === "completed" ? 100 : statusUpdateExecution.currentProgressPercent);
        const daysToDeadline = dueDate ? Math.ceil((dueDate.getTime() - Date.now()) / 86_400_000) : 30;
        const riskScore = computeRiskScore({
          daysToDeadline,
          progressPercent,
          inactivityDays: statusUpdateExecution.status === "in_progress" ? 0 : 2,
          dependencyBlockedCount: statusUpdateExecution.status === "blocked" ? 1 : 0,
        });
        const riskLevel = classifyRiskLevel(riskScore);

        await fastify.db.queryTenant(
          tenantId,
          `UPDATE tasks
           SET status = $3,
               progress_percent = $4,
               risk_score = $5,
               risk_level = $6,
               started_at = CASE WHEN $3 = 'in_progress' THEN COALESCE(started_at, NOW()) ELSE started_at END,
               completed_at = CASE WHEN $3 = 'completed' THEN NOW() ELSE completed_at END,
               updated_at = NOW()
           WHERE tenant_id = $1 AND id = $2`,
          [
            tenantId,
            statusUpdateExecution.taskId,
            statusUpdateExecution.status,
            progressPercent,
            riskScore,
            riskLevel,
          ]
        );

        updatedTaskId = statusUpdateExecution.taskId;
        await fastify.db.queryTenant(
          tenantId,
          `UPDATE extracted_actions
           SET state = 'executed', task_id = $3, executed_at = NOW(), updated_at = NOW()
           WHERE tenant_id = $1 AND id = $2`,
          [tenantId, params.id, updatedTaskId]
        );
        await updateInterventionStatus(fastify, tenantId, params.id, "executed");
      }

      if (resolvedActionType === "email_draft") {
        sentDraftId = await executeApprovedEmailDraft(fastify, {
          tenantId,
          actionId: params.id,
          projectId: action.projectId,
          userId: request.user.userId,
          payload: effectivePayload,
        });

        await fastify.db.queryTenant(
          tenantId,
          `UPDATE extracted_actions
           SET state = 'executed', executed_at = NOW(), updated_at = NOW()
           WHERE tenant_id = $1 AND id = $2`,
          [tenantId, params.id]
        );
        await updateInterventionStatus(fastify, tenantId, params.id, "executed");
      }

      // Phase 7.2 — Slack outbound: post message when a follow_up or email_draft action
      // with a slackChannelId in its payload is approved.
      if (
        (resolvedActionType === "follow_up" || resolvedActionType === "email_draft") &&
        typeof effectivePayload.slackChannelId === "string" &&
        effectivePayload.slackChannelId
      ) {
        const slackRows = await fastify.db.queryTenant<{ bot_access_token: string }>(
          tenantId,
          `SELECT bot_access_token FROM slack_installations WHERE tenant_id = $1 LIMIT 1`,
          [tenantId]
        );
        if (slackRows[0]) {
          const text =
            typeof effectivePayload.slackMessage === "string"
              ? effectivePayload.slackMessage
              : typeof effectivePayload.body === "string"
              ? effectivePayload.body
              : `Action approved: ${action.actionType}`;
          const result = await postSlackMessage(
            slackRows[0].bot_access_token,
            effectivePayload.slackChannelId,
            text
          );
          if (!result.ok) {
            fastify.log.warn({ slackError: result.error, actionId: params.id }, "Slack postMessage failed after action approval");
          }
        }
      }

      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId: request.user.userId,
        actionType: "action.approve",
        objectType: "extracted_action",
        objectId: params.id,
        details: { note: body.note ?? null, overridePayload: body.overridePayload ?? null },
      });

      await finalizeAgentRunIfResolved(fastify, {
        tenantId,
        runId: action.agentRunId,
        actorUserId: request.user.userId,
      });

      return {
        success: true,
        state: createdTaskId || updatedTaskId || createdProjectId || sentDraftId ? "executed" : "approved",
        taskId: createdTaskId ?? updatedTaskId ?? undefined,
        projectId: createdProjectId ?? undefined,
        draftId: sentDraftId ?? undefined,
      };
    }
  );

  fastify.post(
    "/:id/reject",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm"])] },
    async (request) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const body = DecisionBodySchema.parse(request.body);
      const tenantId = request.user.tenantId;

      const action = await loadActionOrThrow(fastify, tenantId, params.id);
      if (action.state !== "pending") {
        throw fastify.httpErrors.conflict(`Action is already in state ${action.state}.`);
      }

      await fastify.db.queryTenant(
        tenantId,
        "UPDATE extracted_actions SET state = 'rejected', updated_at = NOW() WHERE tenant_id = $1 AND id = $2",
        [tenantId, params.id]
      );

      await recordDecision(fastify, {
        tenantId,
        actionId: params.id,
        userId: request.user.userId,
        decision: "rejected",
        note: body.note,
      });
      await updateInterventionStatus(fastify, tenantId, params.id, "rejected");

      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId: request.user.userId,
        actionType: "action.reject",
        objectType: "extracted_action",
        objectId: params.id,
        details: { note: body.note ?? null },
      });

      await finalizeAgentRunIfResolved(fastify, {
        tenantId,
        runId: action.agentRunId,
        actorUserId: request.user.userId,
      });

      return { success: true, state: "rejected" };
    }
  );

  fastify.post(
    "/:id/override",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm"])] },
    async (request) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const body = DecisionBodySchema.parse(request.body);
      const tenantId = request.user.tenantId;

      const action = await loadActionOrThrow(fastify, tenantId, params.id);
      if (action.state !== "pending") {
        throw fastify.httpErrors.conflict(`Action is already in state ${action.state}.`);
      }

      await fastify.db.queryTenant(
        tenantId,
        `UPDATE extracted_actions
         SET state = 'overridden',
             payload = COALESCE($3::jsonb, payload),
             updated_at = NOW()
         WHERE tenant_id = $1 AND id = $2`,
        [tenantId, params.id, body.overridePayload ? JSON.stringify(body.overridePayload) : null]
      );

      await recordDecision(fastify, {
        tenantId,
        actionId: params.id,
        userId: request.user.userId,
        decision: "overridden",
        note: body.note,
      });
      await updateInterventionStatus(fastify, tenantId, params.id, "overridden");

      await fastify.db.queryTenant(
        tenantId,
        `INSERT INTO correction_feedback
         (tenant_id, action_id, corrected_by_user_id, correction_type, correction_payload)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [
          tenantId,
          params.id,
          request.user.userId,
          "manual_override",
          JSON.stringify({ overridePayload: body.overridePayload ?? {}, note: body.note ?? null }),
        ]
      );

      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId: request.user.userId,
        actionType: "action.override",
        objectType: "extracted_action",
        objectId: params.id,
        details: { overridePayload: body.overridePayload ?? null, note: body.note ?? null },
      });

      await finalizeAgentRunIfResolved(fastify, {
        tenantId,
        runId: action.agentRunId,
        actorUserId: request.user.userId,
      });

      return { success: true, state: "overridden" };
    }
  );
};
