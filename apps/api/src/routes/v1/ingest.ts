import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { ingestCanonicalEvent } from "../../services/ingest/pipeline.js";
import { writeAuditLog } from "../../lib/audit.js";
import { runIntelligence, createLlmProvider } from "@larry/ai";
import { getProjectSnapshot, runAutoActions, storeSuggestions } from "@larry/db";
import { getApiEnv } from "@larry/config";
import type { IntelligenceConfig } from "@larry/shared";

function buildIntelligenceConfig(config: ReturnType<typeof getApiEnv>): IntelligenceConfig {
  if (config.MODEL_PROVIDER === "openai") {
    return { provider: "openai", apiKey: config.OPENAI_API_KEY, model: config.OPENAI_MODEL };
  }
  if (config.MODEL_PROVIDER === "anthropic") {
    return { provider: "anthropic", apiKey: config.ANTHROPIC_API_KEY, model: config.ANTHROPIC_MODEL };
  }
  return { provider: "mock", model: "mock" };
}

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

      // 1. Create canonical event record
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

      // 2. Store meeting notes (agent_run_id is nullable — old pipeline removed)
      const meetingNoteRows = await fastify.db.queryTenant<{ id: string }>(
        tenantId,
        `INSERT INTO meeting_notes
          (tenant_id, project_id, agent_run_id, title, transcript, created_by_user_id)
         VALUES ($1, $2, NULL, $3, $4, $5)
         RETURNING id`,
        [tenantId, body.projectId ?? null, body.meetingTitle ?? null, body.transcript, request.user.userId]
      );
      const meetingNoteId = meetingNoteRows[0]?.id;

      // 3. Generate summary and write to documents — best-effort
      if (meetingNoteId) {
        try {
          const llm = createLlmProvider({
            provider: fastify.config.MODEL_PROVIDER === "anthropic" ? "anthropic"
              : fastify.config.MODEL_PROVIDER === "gemini" ? "gemini"
              : "openai",
            openAiApiKey: fastify.config.OPENAI_API_KEY,
            openAiModel: fastify.config.OPENAI_MODEL,
            anthropicApiKey: fastify.config.ANTHROPIC_API_KEY,
            anthropicModel: fastify.config.ANTHROPIC_MODEL,
            geminiApiKey: fastify.config.GEMINI_API_KEY,
            geminiModel: fastify.config.GEMINI_MODEL,
          });
          const { title: aiTitle, summary } = await llm.summarizeTranscript({ transcript: body.transcript });
          const resolvedTitle = body.meetingTitle ?? aiTitle;

          await fastify.db.queryTenant(
            tenantId,
            `UPDATE meeting_notes SET title = $1, summary = $2 WHERE tenant_id = $3 AND id = $4`,
            [resolvedTitle, summary, tenantId, meetingNoteId]
          );

          await fastify.db.queryTenant(
            tenantId,
            `INSERT INTO documents (tenant_id, project_id, title, content, doc_type, created_by_user_id)
             VALUES ($1, $2, $3, $4, 'meeting_summary', $5)`,
            [tenantId, body.projectId ?? null, resolvedTitle, summary, request.user.userId]
          );
        } catch (err) {
          request.log.warn({ err, tenantId, meetingNoteId }, "transcript summarization failed");
        }
      }

      // 4. Run intelligence on the transcript if a project is provided — best-effort
      if (body.projectId) {
        try {
          const config = buildIntelligenceConfig(fastify.config);
          const snapshot = await getProjectSnapshot(fastify.db, tenantId, body.projectId);
          const intelligenceResult = await runIntelligence(
            config,
            snapshot,
            `transcript: "${body.transcript.slice(0, 500)}"`
          );
          await Promise.all([
            runAutoActions(fastify.db, tenantId, body.projectId, "signal", intelligenceResult.autoActions),
            storeSuggestions(fastify.db, tenantId, body.projectId, "signal", intelligenceResult.suggestedActions),
          ]);
        } catch (err) {
          // Don't fail the ingest — transcript is stored, intelligence is best-effort
          request.log.warn({ err, tenantId, projectId: body.projectId }, "transcript intelligence failed");
        }
      }

      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId: request.user.userId,
        actionType: "ingest.transcript",
        objectType: "meeting_note",
        objectId: meetingNoteId ?? result.canonicalEventId,
      });

      return reply.code(202).send({ accepted: true, ...result });
    }
  );
};
