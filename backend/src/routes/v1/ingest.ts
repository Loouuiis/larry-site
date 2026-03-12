import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { normalizeRawEvent, computeIdempotencyKey } from "../../services/ingest/normalizer.js";
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

async function handleIngest(
  fastify: Parameters<FastifyPluginAsync>[0],
  tenantId: string,
  source: "slack" | "email" | "calendar" | "transcript",
  body: z.infer<typeof BaseIngestSchema>
) {
  const idempotencyKey = computeIdempotencyKey(tenantId, source, body.sourceEventId, body.payload);

  const rawRows = await fastify.db.queryTenant<{ id: string }>(
    tenantId,
    `INSERT INTO raw_events (tenant_id, source, source_event_id, payload, idempotency_key)
     VALUES ($1, $2, $3, $4::jsonb, $5)
     ON CONFLICT (tenant_id, idempotency_key) DO UPDATE SET source_event_id = EXCLUDED.source_event_id
     RETURNING id`,
    [tenantId, source, body.sourceEventId, JSON.stringify(body.payload), idempotencyKey]
  );

  const canonical = normalizeRawEvent(tenantId, {
    source,
    sourceEventId: body.sourceEventId,
    actor: body.actor,
    occurredAt: body.occurredAt,
    payload: body.payload,
  });

  await fastify.db.queryTenant(
    tenantId,
    `INSERT INTO canonical_events
      (id, tenant_id, raw_event_id, source, source_event_id, event_type, actor, confidence, occurred_at, payload)
     VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
    [
      canonical.id,
      canonical.tenantId,
      rawRows[0].id,
      canonical.source,
      canonical.sourceEventId,
      canonical.eventType,
      canonical.actor,
      canonical.confidence,
      canonical.occurredAt,
      JSON.stringify(canonical.payload),
    ]
  );

  await fastify.queue.publish({
    type: "canonical_event.created",
    tenantId,
    dedupeKey: idempotencyKey,
    payload: {
      canonicalEventId: canonical.id,
      source: canonical.source,
      eventType: canonical.eventType,
    },
  });

  return { canonicalEventId: canonical.id, idempotencyKey };
}

export const ingestRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/slack",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request, reply) => {
      const body = BaseIngestSchema.parse(request.body);
      const result = await handleIngest(fastify, request.user.tenantId, "slack", body);
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
      const result = await handleIngest(fastify, request.user.tenantId, "email", body);
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
      const result = await handleIngest(fastify, request.user.tenantId, "calendar", body);
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

      const result = await handleIngest(fastify, tenantId, "transcript", {
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
