import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { ingestCanonicalEvent } from "../../services/ingest/pipeline.js";
import { writeAuditLog } from "../../lib/audit.js";

const BaseIngestSchema = z.object({
  sourceEventId: z.string().min(1),
  actor: z.string().optional(),
  occurredAt: z.string().datetime().optional(),
  payload: z.record(z.string(), z.unknown()),
});

const TranscriptIngestSchema = BaseIngestSchema.extend({
  projectId: z.string().uuid().optional(),
  transcript: z.string().min(20),
  meetingTitle: z.string().optional(),
});

export const ingestRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/slack",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request, reply) => {
      const body = BaseIngestSchema.parse(request.body);
      const result = await ingestCanonicalEvent(fastify, request.user.tenantId, {
        source: "slack",
        sourceEventId: body.sourceEventId,
        actor: body.actor,
        occurredAt: body.occurredAt,
        payload: body.payload,
      });
      await writeAuditLog(fastify.db, {
        tenantId: request.user.tenantId,
        actorUserId: request.user.userId,
        actionType: "ingest.slack",
        objectType: "canonical_event",
        objectId: result.canonicalEventId,
      });
      return reply.code(202).send({ accepted: true, ...result });
    }
  );

  fastify.post(
    "/email",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request, reply) => {
      const body = BaseIngestSchema.parse(request.body);
      const result = await ingestCanonicalEvent(fastify, request.user.tenantId, {
        source: "email",
        sourceEventId: body.sourceEventId,
        actor: body.actor,
        occurredAt: body.occurredAt,
        payload: body.payload,
      });
      await writeAuditLog(fastify.db, {
        tenantId: request.user.tenantId,
        actorUserId: request.user.userId,
        actionType: "ingest.email",
        objectType: "canonical_event",
        objectId: result.canonicalEventId,
      });
      return reply.code(202).send({ accepted: true, ...result });
    }
  );

  fastify.post(
    "/calendar",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request, reply) => {
      const body = BaseIngestSchema.parse(request.body);
      const result = await ingestCanonicalEvent(fastify, request.user.tenantId, {
        source: "calendar",
        sourceEventId: body.sourceEventId,
        actor: body.actor,
        occurredAt: body.occurredAt,
        payload: body.payload,
      });
      await writeAuditLog(fastify.db, {
        tenantId: request.user.tenantId,
        actorUserId: request.user.userId,
        actionType: "ingest.calendar",
        objectType: "canonical_event",
        objectId: result.canonicalEventId,
      });
      return reply.code(202).send({ accepted: true, ...result });
    }
  );

  fastify.post(
    "/transcript",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm"])] },
    async (request, reply) => {
      const body = TranscriptIngestSchema.parse(request.body);
      const tenantId = request.user.tenantId;

      const result = await ingestCanonicalEvent(fastify, tenantId, {
        source: "transcript",
        sourceEventId: body.sourceEventId,
        actor: body.actor,
        occurredAt: body.occurredAt,
        payload: {
          ...body.payload,
          transcript: body.transcript,
          meetingTitle: body.meetingTitle,
        },
      });

      const agentRunRows = await fastify.db.queryTenant<{ id: string }>(
        tenantId,
        `INSERT INTO agent_runs (tenant_id, project_id, source, source_ref_id, state, status_message, correlation_id, created_by_user_id)
         VALUES ($1, $2, $3, $4, 'INGESTED', $5, $6, $7)
         RETURNING id`,
        [
          tenantId,
          body.projectId ?? null,
          "transcript",
          result.canonicalEventId,
          "Transcript accepted for extraction pipeline",
          result.idempotencyKey,
          request.user.userId,
        ]
      );

      const runId = agentRunRows[0].id;

      await fastify.db.queryTenant(
        tenantId,
        `INSERT INTO agent_run_transitions
         (tenant_id, agent_run_id, previous_state, next_state, reason)
         VALUES ($1, $2, NULL, 'INGESTED', $3)`,
        [tenantId, runId, "Initial transcript ingestion"]
      );

      await fastify.queue.publish({
        type: "agent_run.ingested",
        tenantId,
        payload: {
          runId,
          canonicalEventId: result.canonicalEventId,
          transcript: body.transcript,
          projectId: body.projectId,
        },
        dedupeKey: `${tenantId}:${runId}:INGESTED`,
      });

      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId: request.user.userId,
        actionType: "ingest.transcript",
        objectType: "agent_run",
        objectId: runId,
      });

      return reply.code(202).send({ accepted: true, runId, ...result });
    }
  );
};
