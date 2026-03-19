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
