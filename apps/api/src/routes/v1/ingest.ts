import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  ingestCanonicalEvent,
  insertCanonicalEventRecords,
  publishCanonicalEventCreated,
} from "../../services/ingest/pipeline.js";
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
    {
      config: { rateLimit: { max: 10, timeWindow: "1 minute", keyGenerator: (req: import("fastify").FastifyRequest) => (req.user as { tenantId?: string } | undefined)?.tenantId ?? req.ip } },
      preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm"])],
    },
    async (request, reply) => {
      const body = TranscriptIngestSchema.parse(request.body);
      const tenantId = request.user.tenantId;
      const userId = request.user.userId;

      const result = await fastify.db.tx(async (client) => {
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);

        const meetingNoteResult = await client.query<{ id: string }>(
          `INSERT INTO meeting_notes
            (tenant_id, project_id, agent_run_id, title, transcript, created_by_user_id)
           VALUES ($1, $2, NULL, $3, $4, $5)
           RETURNING id`,
          [tenantId, body.projectId ?? null, body.meetingTitle ?? null, body.transcript, userId]
        );
        const meetingNoteId = meetingNoteResult.rows[0]?.id ?? null;

        const canonicalResult = await insertCanonicalEventRecords(client, tenantId, {
          source: "transcript",
          sourceEventId: body.sourceEventId,
          actor: body.actor,
          occurredAt: body.occurredAt,
          payload: {
            ...body.payload,
            transcript: body.transcript,
            meetingTitle: body.meetingTitle,
            projectId: body.projectId,
            meetingNoteId,
            submittedByUserId: userId,
          },
        });

        return { ...canonicalResult, meetingNoteId };
      });

      await publishCanonicalEventCreated(fastify, tenantId, result);

      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId: userId,
        actionType: "ingest.transcript",
        objectType: "meeting_note",
        objectId: result.meetingNoteId ?? result.canonicalEventId,
      });

      return reply.code(202).send({
        accepted: true,
        canonicalEventId: result.canonicalEventId,
        idempotencyKey: result.idempotencyKey,
        meetingNoteId: result.meetingNoteId,
      });
    }
  );
};
