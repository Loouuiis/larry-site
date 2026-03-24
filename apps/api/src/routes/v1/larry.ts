import { randomUUID } from "node:crypto";
import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { ingestCanonicalEvent } from "../../services/ingest/pipeline.js";
import { writeAuditLog } from "../../lib/audit.js";

const LarryIntentSchema = z.enum([
  "create_plan",
  "update_scope",
  "request_summary",
  "draft_follow_up",
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

export const larryRoutes: FastifyPluginAsync = async (fastify) => {
  // ── Conversation CRUD ────────────────────────────────────────────────────

  fastify.get(
    "/conversations",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const tenantId = request.user.tenantId;
      const rows = await fastify.db.queryTenant(
        tenantId,
        `SELECT id, project_id as "projectId", title,
                created_at as "createdAt", updated_at as "updatedAt"
         FROM larry_conversations
         WHERE tenant_id = $1 AND user_id = $2
         ORDER BY updated_at DESC LIMIT 50`,
        [tenantId, request.user.userId]
      );
      return { items: rows };
    }
  );

  fastify.post(
    "/conversations",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const body = z.object({
        projectId: z.string().uuid().optional(),
        title: z.string().max(200).optional(),
      }).parse(request.body);
      const tenantId = request.user.tenantId;
      const rows = await fastify.db.queryTenant<{ id: string }>(
        tenantId,
        `INSERT INTO larry_conversations (tenant_id, project_id, user_id, title)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [tenantId, body.projectId ?? null, request.user.userId, body.title ?? "New conversation"]
      );
      return reply.code(201).send({ id: rows[0].id });
    }
  );

  fastify.get(
    "/conversations/:id/messages",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      const tenantId = request.user.tenantId;
      const conv = await fastify.db.queryTenant(
        tenantId,
        `SELECT id FROM larry_conversations
         WHERE tenant_id = $1 AND id = $2 AND user_id = $3 LIMIT 1`,
        [tenantId, id, request.user.userId]
      );
      if (!conv[0]) throw fastify.httpErrors.notFound("Conversation not found.");
      const rows = await fastify.db.queryTenant(
        tenantId,
        `SELECT id, role, content, reasoning, created_at as "createdAt"
         FROM larry_messages
         WHERE tenant_id = $1 AND conversation_id = $2
         ORDER BY created_at ASC`,
        [tenantId, id]
      );
      return { items: rows };
    }
  );

  fastify.post(
    "/conversations/:id/messages",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      const body = z.object({
        role: z.enum(["user", "larry"]),
        content: z.string().min(1).max(20_000),
        reasoning: z.record(z.unknown()).optional(),
      }).parse(request.body);
      const tenantId = request.user.tenantId;
      const conv = await fastify.db.queryTenant(
        tenantId,
        `SELECT id FROM larry_conversations
         WHERE tenant_id = $1 AND id = $2 AND user_id = $3 LIMIT 1`,
        [tenantId, id, request.user.userId]
      );
      if (!conv[0]) throw fastify.httpErrors.notFound("Conversation not found.");
      const rows = await fastify.db.queryTenant<{ id: string }>(
        tenantId,
        `INSERT INTO larry_messages (tenant_id, conversation_id, role, content, reasoning)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         RETURNING id`,
        [tenantId, id, body.role, body.content, body.reasoning ? JSON.stringify(body.reasoning) : null]
      );
      await fastify.db.queryTenant(
        tenantId,
        `UPDATE larry_conversations SET updated_at = NOW() WHERE tenant_id = $1 AND id = $2`,
        [tenantId, id]
      );
      return reply.code(201).send({ id: rows[0].id });
    }
  );

  // ── Larry commands ───────────────────────────────────────────────────────

  fastify.post(
    "/commands",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request, reply) => {
      const body = LarryCommandSchema.parse(request.body);
      const tenantId = request.user.tenantId;

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

      return reply.code(202).send({
        commandAccepted: true,
        commandMode: body.mode,
        intent: body.intent,
        runId,
        canonicalEventId: canonical.canonicalEventId,
        message: "Larry accepted command. Review Action Center for approval-required actions.",
      });
    }
  );
};
