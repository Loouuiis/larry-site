import { randomUUID } from "node:crypto";
import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { detectInjectionAttempt, type ChatProjectContext } from "@larry/ai";
import { ingestCanonicalEvent } from "../../services/ingest/pipeline.js";
import { writeAuditLog } from "../../lib/audit.js";

const LarryIntentSchema = z.enum([
  "create_plan",
  "update_scope",
  "request_summary",
  "draft_follow_up",
  "create_project",
  "freeform",
]);

const LarryCommandSchema = z.object({
  intent: LarryIntentSchema.default("freeform"),
  projectId: z.string().uuid().optional(),
  input: z.string().min(3).max(8_000),
  context: z.record(z.string(), z.unknown()).optional(),
  mode: z.enum(["execute", "preview"]).default("execute"),
});

async function buildProjectSummary(
  fastify: Parameters<FastifyPluginAsync>[0],
  tenantId: string,
  projectId: string
) {
  const rows = await fastify.db.queryTenant<{
    status: "backlog" | "not_started" | "in_progress" | "waiting" | "completed" | "blocked";
    risk_level: "low" | "medium" | "high";
  }>(
    tenantId,
    `SELECT status, risk_level
     FROM tasks
     WHERE tenant_id = $1 AND project_id = $2`,
    [tenantId, projectId]
  );

  const total = rows.length;
  const completed = rows.filter((row) => row.status === "completed").length;
  const blocked = rows.filter((row) => row.status === "blocked").length;
  const highRisk = rows.filter((row) => row.risk_level === "high").length;
  const completionRate = total === 0 ? 0 : Number(((completed / total) * 100).toFixed(1));

  return {
    projectId,
    totals: {
      tasks: total,
      completed,
      blocked,
      highRisk,
      completionRate,
    },
    narrative: `Project has ${total} tasks, ${completed} completed (${completionRate}%), ${blocked} blocked, and ${highRisk} high-risk items.`,
  };
}

async function buildProjectTaskList(
  fastify: Parameters<FastifyPluginAsync>[0],
  tenantId: string,
  projectId: string
): Promise<Array<{ id: string; title: string; status: string; assignee: string | null }>> {
  return fastify.db.queryTenant<{ id: string; title: string; status: string; assignee: string | null }>(
    tenantId,
    `SELECT t.id, t.title, t.status,
            u.display_name AS assignee
     FROM tasks t
     LEFT JOIN users u ON u.id = t.assignee_user_id AND u.tenant_id = t.tenant_id
     WHERE t.tenant_id = $1
       AND t.project_id = $2
       AND t.status != 'completed'
     ORDER BY t.created_at ASC
     LIMIT 200`,
    [tenantId, projectId]
  );
}

export const larryRoutes: FastifyPluginAsync = async (fastify) => {
  // ── Conversations ────────────────────────────────────────────────────────

  fastify.get(
    "/conversations",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request) => {
      const tenantId = request.user.tenantId;
      const userId = request.user.userId;
      const { projectId } = request.query as { projectId?: string };

      const rows = await fastify.db.queryTenant<{
        id: string;
        projectId: string | null;
        title: string | null;
        createdAt: string;
        updatedAt: string;
        lastMessagePreview: string | null;
        lastMessageAt: string | null;
      }>(
        tenantId,
        `SELECT c.id,
                c.project_id as "projectId",
                c.title,
                c.created_at as "createdAt",
                c.updated_at as "updatedAt",
                last_message.preview as "lastMessagePreview",
                COALESCE(last_message.created_at, c.updated_at) as "lastMessageAt"
         FROM larry_conversations c
         LEFT JOIN LATERAL (
           SELECT LEFT(content, 160) as preview, created_at
           FROM larry_messages
           WHERE tenant_id = c.tenant_id
             AND conversation_id = c.id
           ORDER BY created_at DESC
           LIMIT 1
         ) last_message ON TRUE
         WHERE c.tenant_id = $1
           AND c.user_id = $2
           ${projectId ? 'AND project_id = $3' : ''}
         ORDER BY COALESCE(last_message.created_at, c.updated_at) DESC, c.created_at DESC
         LIMIT 50`,
        projectId ? [tenantId, userId, projectId] : [tenantId, userId]
      );

      return { conversations: rows };
    }
  );

  fastify.post(
    "/conversations",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const userId = request.user.userId;
      const body = request.body as { projectId?: string; title?: string };

      const rows = await fastify.db.queryTenant<{
        id: string;
        projectId: string | null;
        title: string | null;
        createdAt: string;
      }>(
        tenantId,
        `INSERT INTO larry_conversations (tenant_id, user_id, project_id, title)
         VALUES ($1, $2, $3, $4)
         RETURNING id, project_id as "projectId", title, created_at as "createdAt"`,
        [tenantId, userId, body.projectId ?? null, body.title ?? null]
      );

      return reply.code(201).send(rows[0]);
    }
  );

  fastify.get(
    "/conversations/:id/messages",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request) => {
      const tenantId = request.user.tenantId;
      const userId = request.user.userId;
      const { id } = request.params as { id: string };

      // Verify ownership
      const conv = await fastify.db.queryTenant<{ id: string }>(
        tenantId,
        `SELECT id FROM larry_conversations WHERE tenant_id = $1 AND id = $2 AND user_id = $3 LIMIT 1`,
        [tenantId, id, userId]
      );
      if (!conv[0]) throw fastify.httpErrors.notFound("Conversation not found.");

      const rows = await fastify.db.queryTenant<{
        id: string;
        role: string;
        content: string;
        reasoning: unknown;
        createdAt: string;
      }>(
        tenantId,
        `SELECT id, role, content, reasoning, created_at as "createdAt"
         FROM larry_messages
         WHERE tenant_id = $1 AND conversation_id = $2
         ORDER BY created_at ASC`,
        [tenantId, id]
      );

      return { messages: rows };
    }
  );

  fastify.post(
    "/conversations/:id/messages",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const userId = request.user.userId;
      const { id } = request.params as { id: string };
      const body = request.body as { role: "user" | "larry"; content: string; reasoning?: unknown };

      if (body.role !== "user" && body.role !== "larry") {
        throw fastify.httpErrors.badRequest("role must be 'user' or 'larry'.");
      }
      if (!body.content?.trim()) {
        throw fastify.httpErrors.badRequest("content is required.");
      }

      // Verify ownership
      const conv = await fastify.db.queryTenant<{ id: string }>(
        tenantId,
        `SELECT id FROM larry_conversations WHERE tenant_id = $1 AND id = $2 AND user_id = $3 LIMIT 1`,
        [tenantId, id, userId]
      );
      if (!conv[0]) throw fastify.httpErrors.notFound("Conversation not found.");

      const rows = await fastify.db.queryTenant<{ id: string; createdAt: string }>(
        tenantId,
        `INSERT INTO larry_messages (tenant_id, conversation_id, role, content, reasoning)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         RETURNING id, created_at as "createdAt"`,
        [tenantId, id, body.role, body.content.trim(), JSON.stringify(body.reasoning ?? null)]
      );

      // Bump conversation updated_at
      await fastify.db.queryTenant(
        tenantId,
        `UPDATE larry_conversations SET updated_at = NOW() WHERE tenant_id = $1 AND id = $2`,
        [tenantId, id]
      );

      return reply.code(201).send(rows[0]);
    }
  );

  // ── Commands ─────────────────────────────────────────────────────────────

  fastify.post(
    "/commands",
    {
      config: { rateLimit: { max: 20, timeWindow: "1 minute", keyGenerator: (req: import("fastify").FastifyRequest) => (req.user as { tenantId?: string } | undefined)?.tenantId ?? req.ip } },
      preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])],
    },
    async (request, reply) => {
      const body = LarryCommandSchema.parse(request.body);
      const tenantId = request.user.tenantId;

      // Detect and log prompt injection attempts at the API boundary
      if (detectInjectionAttempt(body.input)) {
        request.log.warn({ tenantId, userId: request.user.userId, intent: body.intent }, "Possible prompt injection attempt detected");
        await writeAuditLog(fastify.db, {
          tenantId,
          actorUserId: request.user.userId,
          actionType: "llm.injection_attempt",
          objectType: "larry_command",
          objectId: request.user.userId,
          details: { intent: body.intent, inputLength: body.input.length },
        });
      }

      if (body.intent === "request_summary") {
        if (!body.projectId) {
          throw fastify.httpErrors.badRequest("projectId is required for request_summary intent.");
        }
        const summary = await buildProjectSummary(fastify, tenantId, body.projectId);

        await writeAuditLog(fastify.db, {
          tenantId,
          actorUserId: request.user.userId,
          actionType: "larry.command.summary",
          objectType: "project",
          objectId: body.projectId,
          details: { input: body.input },
        });

        return {
          commandAccepted: true,
          commandMode: body.mode,
          intent: body.intent,
          summary,
        };
      }

      if (body.intent === "create_project") {
        const projectStructure = await fastify.llmProvider.extractProjectStructure({
          description: body.input,
        });

        const runRows = await fastify.db.queryTenant<{ id: string }>(
          tenantId,
          `INSERT INTO agent_runs (tenant_id, project_id, source, source_ref_id, state, status_message, correlation_id, created_by_user_id)
           VALUES ($1, $2, 'transcript', $3, 'APPROVAL_PENDING', $4, $5, $6)
           RETURNING id`,
          [
            tenantId,
            null,
            `larry-create-project:${randomUUID()}`,
            `Larry proposes new project: ${projectStructure.name}`,
            `${tenantId}:create_project:${randomUUID()}`,
            request.user.userId,
          ]
        );
        const runId = runRows[0].id;

        const actionRows = await fastify.db.queryTenant<{ id: string }>(
          tenantId,
          `INSERT INTO extracted_actions
            (tenant_id, agent_run_id, project_id, action_type, impact, confidence, reason, signals, payload, reasoning, state, requires_approval)
           VALUES ($1, $2, $3, 'project_create', 'high', 1.0, $4, $5::jsonb, $6::jsonb, $7::jsonb, 'pending', true)
           RETURNING id`,
          [
            tenantId,
            runId,
            null,
            `Larry proposes creating project: ${projectStructure.name}`,
            JSON.stringify([`User requested: ${body.input.slice(0, 120)}`]),
            JSON.stringify(projectStructure),
            JSON.stringify({
              what: projectStructure.name,
              why: "User asked Larry to create a new project",
              signals: [`${projectStructure.tasks.length} initial tasks proposed`],
              threshold: "project_create",
              decision: "approval_required",
              override: "Approve in the Action Centre to create the project and its initial tasks.",
            }),
          ]
        );
        const actionId = actionRows[0].id;

        await writeAuditLog(fastify.db, {
          tenantId,
          actorUserId: request.user.userId,
          actionType: "larry.command.create_project",
          objectType: "agent_run",
          objectId: runId,
          details: { projectName: projectStructure.name, taskCount: projectStructure.tasks.length },
        });

        return reply.code(202).send({
          commandAccepted: true,
          commandMode: body.mode,
          intent: body.intent,
          runId,
          actionId,
          projectName: projectStructure.name,
          taskCount: projectStructure.tasks.length,
          message: `Larry has drafted "${projectStructure.name}" with ${projectStructure.tasks.length} tasks. Review and approve it in the Action Centre.`,
        });
      }

      if (body.mode === "preview") {
        const proposed = await fastify.llmProvider.extractActionsFromTranscript({
          transcript: body.input,
          projectName: body.projectId,
        });
        return {
          commandAccepted: true,
          commandMode: body.mode,
          intent: body.intent,
          preview: proposed,
        };
      }

      // Task-command fast path: classify and create action directly if task intent detected
      if (body.projectId) {
        try {
          const tasks = await buildProjectTaskList(fastify, tenantId, body.projectId);
          const taskResult = await fastify.llmProvider.classifyTaskCommand({ message: body.input, tasks });

          if (taskResult.type !== "none") {
            const sourceRef = `larry-task-cmd:${randomUUID()}`;
            const correlationId = `${tenantId}:task-cmd:${randomUUID()}`;

            const runRows = await fastify.db.queryTenant<{ id: string }>(
              tenantId,
              `INSERT INTO agent_runs (tenant_id, project_id, source, source_ref_id, state, status_message, correlation_id, created_by_user_id)
               VALUES ($1, $2, 'transcript', $3, 'APPROVAL_PENDING', $4, $5, $6)
               RETURNING id`,
              [
                tenantId, body.projectId, sourceRef,
                taskResult.type === "task_create"
                  ? `Larry proposes task: ${taskResult.title}`
                  : `Larry proposes closing a task`,
                correlationId, request.user.userId,
              ]
            );
            const runId = runRows[0].id;

            if (taskResult.type === "task_create") {
              const payload = {
                title: taskResult.title,
                description: taskResult.description ?? null,
                dueDate: taskResult.dueDate ?? null,
                assignee: taskResult.assignee ?? null,
              };
              await fastify.db.queryTenant(
                tenantId,
                `INSERT INTO extracted_actions
                  (tenant_id, agent_run_id, project_id, action_type, impact, confidence, reason, signals, payload, reasoning, state, requires_approval)
                 VALUES ($1,$2,$3,'task_create','medium',0.9,$4,$5::jsonb,$6::jsonb,$7::jsonb,'pending',true)`,
                [
                  tenantId, runId, body.projectId,
                  `Larry proposes creating task: ${taskResult.title}`,
                  JSON.stringify([`User requested: ${body.input.slice(0, 120)}`]),
                  JSON.stringify(payload),
                  JSON.stringify({ what: taskResult.title, why: "User asked Larry to create a task", decision: "approval_required" }),
                ]
              );
              await writeAuditLog(fastify.db, {
                tenantId, actorUserId: request.user.userId,
                actionType: "larry.command.task_create",
                objectType: "agent_run", objectId: runId,
                details: { taskTitle: taskResult.title },
              });
              return reply.code(202).send({
                commandAccepted: true, commandMode: body.mode, intent: body.intent, runId,
                message: `I've drafted a task: "${taskResult.title}". Review it in the Action Centre.`,
              });
            }

            if (taskResult.type === "task_close") {
              const payload = { taskId: taskResult.taskId, taskTitle: taskResult.taskTitle, status: "completed" };
              await fastify.db.queryTenant(
                tenantId,
                `INSERT INTO extracted_actions
                  (tenant_id, agent_run_id, project_id, action_type, impact, confidence, reason, signals, payload, reasoning, state, requires_approval)
                 VALUES ($1,$2,$3,'status_update','low',$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,'pending',true)`,
                [
                  tenantId, runId, body.projectId,
                  taskResult.confidence,
                  `Larry proposes closing: ${taskResult.taskTitle}`,
                  JSON.stringify([`User requested: ${body.input.slice(0, 120)}`]),
                  JSON.stringify(payload),
                  JSON.stringify({ what: `Close "${taskResult.taskTitle}"`, decision: "approval_required" }),
                ]
              );
              await writeAuditLog(fastify.db, {
                tenantId, actorUserId: request.user.userId,
                actionType: "larry.command.task_close",
                objectType: "agent_run", objectId: runId,
                details: { taskId: taskResult.taskId, taskTitle: taskResult.taskTitle },
              });
              return reply.code(202).send({
                commandAccepted: true, commandMode: body.mode, intent: body.intent, runId,
                message: `Got it — I've drafted closing "${taskResult.taskTitle}". Approve it in the Action Centre.`,
              });
            }

            if (taskResult.type === "task_close_ambiguous") {
              const payload = { taskTitle: taskResult.query, status: "completed", ambiguous: true };
              await fastify.db.queryTenant(
                tenantId,
                `INSERT INTO extracted_actions
                  (tenant_id, agent_run_id, project_id, action_type, impact, confidence, reason, signals, payload, reasoning, state, requires_approval)
                 VALUES ($1,$2,$3,'status_update','low',0.3,$4,$5::jsonb,$6::jsonb,$7::jsonb,'pending',true)`,
                [
                  tenantId, runId, body.projectId,
                  `Larry could not uniquely identify which task to close`,
                  JSON.stringify([`User query: ${taskResult.query.slice(0, 120)}`]),
                  JSON.stringify(payload),
                  JSON.stringify({ what: "Close task (ambiguous)", decision: "approval_required", override: "Identify the correct task before approving." }),
                ]
              );
              await writeAuditLog(fastify.db, {
                tenantId, actorUserId: request.user.userId,
                actionType: "larry.command.task_close_ambiguous",
                objectType: "agent_run", objectId: runId,
                details: { query: taskResult.query },
              });
              return reply.code(202).send({
                commandAccepted: true, commandMode: body.mode, intent: body.intent, runId,
                message: `I wasn't sure which task you meant. A draft is in the Action Centre — please identify the right task before approving.`,
              });
            }
          }
        } catch (err) {
          request.log.warn({ err }, "classifyTaskCommand failed — falling through to queue pipeline");
        }
      }

      const sourceEventId = `larry-cmd:${randomUUID()}`;
      const canonical = await ingestCanonicalEvent(fastify, tenantId, {
        source: "transcript",
        sourceEventId,
        actor: request.user.email ?? request.user.userId,
        payload: {
          transcript: body.input,
          intent: body.intent,
          context: body.context ?? {},
        },
      });

      const runRows = await fastify.db.queryTenant<{ id: string }>(
        tenantId,
        `INSERT INTO agent_runs (tenant_id, project_id, source, source_ref_id, state, status_message, correlation_id, created_by_user_id)
         VALUES ($1, $2, 'transcript', $3, 'INGESTED', $4, $5, $6)
         RETURNING id`,
        [
          tenantId,
          body.projectId ?? null,
          canonical.canonicalEventId,
          `Larry command accepted (${body.intent})`,
          canonical.idempotencyKey,
          request.user.userId,
        ]
      );
      const runId = runRows[0].id;

      await fastify.db.queryTenant(
        tenantId,
        `INSERT INTO agent_run_transitions
         (tenant_id, agent_run_id, previous_state, next_state, reason, metadata)
         VALUES ($1, $2, NULL, 'INGESTED', $3, $4::jsonb)`,
        [
          tenantId,
          runId,
          "Command accepted by Larry command ingress",
          JSON.stringify({ intent: body.intent }),
        ]
      );

      await fastify.queue.publish({
        type: "agent_run.ingested",
        tenantId,
        payload: {
          runId,
          canonicalEventId: canonical.canonicalEventId,
          transcript: body.input,
          projectId: body.projectId ?? null,
          intent: body.intent,
        },
        dedupeKey: `${tenantId}:${runId}:larry-command`,
      });

      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId: request.user.userId,
        actionType: "larry.command.execute",
        objectType: "agent_run",
        objectId: runId,
        details: {
          intent: body.intent,
          projectId: body.projectId ?? null,
          sourceEventId,
        },
      });

      // Generate a real conversational response via the LLM
      let responseMessage = "I've received your message and queued it for processing. Check the Action Center for any proposed actions.";
      try {
        let projectContext: ChatProjectContext | undefined;
        if (body.projectId) {
          const summary = await buildProjectSummary(fastify, tenantId, body.projectId);
          projectContext = {
            totalTasks: summary.totals.tasks,
            completed: summary.totals.completed,
            blocked: summary.totals.blocked,
            highRisk: summary.totals.highRisk,
            completionRate: summary.totals.completionRate,
          };
        }
        responseMessage = await fastify.llmProvider.generateResponse({
          message: body.input,
          projectContext,
        });
      } catch (err) {
        request.log.warn({ err, runId }, "Failed to generate Larry chat response — using fallback");
      }

      return reply.code(202).send({
        commandAccepted: true,
        commandMode: body.mode,
        intent: body.intent,
        runId,
        canonicalEventId: canonical.canonicalEventId,
        message: responseMessage,
      });
    }
  );
};
