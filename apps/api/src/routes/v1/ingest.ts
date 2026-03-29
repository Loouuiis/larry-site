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

function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return { error: raw };
  }
}

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
      const upstream = await fastify.inject({
        method: "POST",
        url: "/v1/larry/transcript",
        headers: {
          ...(request.headers.authorization
            ? { authorization: request.headers.authorization }
            : {}),
        },
        payload: body,
      });

      const upstreamBody = tryParseJson(upstream.body);
      const responseBody =
        upstreamBody && typeof upstreamBody === "object"
          ? {
              ...(upstreamBody as Record<string, unknown>),
              deprecatedEndpoint: "/v1/ingest/transcript",
              replacementEndpoint: "/v1/larry/transcript",
            }
          : upstreamBody;

      return reply
        .header("x-larry-deprecated-endpoint", "/v1/ingest/transcript")
        .code(upstream.statusCode)
        .send(responseBody);
    }
  );
};
