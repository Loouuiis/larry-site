import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { runIntelligence } from "@larry/ai";
import { getProjectSnapshot } from "@larry/db";
import { getApiEnv } from "@larry/config";
import { writeAuditLog } from "../../lib/audit.js";
import { runAutoActions, storeSuggestions, executeAction } from "@larry/db";
import { getOrGenerateBriefing } from "../../services/larry-briefing.js";
import type { IntelligenceConfig } from "@larry/shared";
import type { FastifyRequest } from "fastify";

// ── Config helper ─────────────────────────────────────────────────────────────

function buildIntelligenceConfig(config: ReturnType<typeof getApiEnv>): IntelligenceConfig {
  if (config.MODEL_PROVIDER === "openai") {
    return { provider: "openai", apiKey: config.OPENAI_API_KEY, model: config.OPENAI_MODEL };
  }
  if (config.MODEL_PROVIDER === "anthropic") {
    return { provider: "anthropic", apiKey: config.ANTHROPIC_API_KEY, model: config.ANTHROPIC_MODEL };
  }
  // "gemini" and other providers not yet wired into intelligence — use mock for local dev
  return { provider: "mock", model: "mock" };
}

// ── Route plugin ──────────────────────────────────────────────────────────────

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
           ${projectId ? "AND project_id = $3" : ""}
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

      await fastify.db.queryTenant(
        tenantId,
        `UPDATE larry_conversations SET updated_at = NOW() WHERE tenant_id = $1 AND id = $2`,
        [tenantId, id]
      );

      return reply.code(201).send(rows[0]);
    }
  );

  // ── Events ───────────────────────────────────────────────────────────────

  fastify.get(
    "/events",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request) => {
      const tenantId = request.user.tenantId;
      const parseResult = z.object({
        projectId: z.string().uuid(),
        eventType: z.enum(["auto_executed", "suggested", "accepted", "dismissed"]).optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      }).safeParse(request.query);
      if (!parseResult.success) {
        throw fastify.httpErrors.badRequest(parseResult.error.issues[0]?.message ?? "Invalid query params");
      }
      const query = parseResult.data;

      const params: unknown[] = [tenantId, query.projectId];
      const eventTypeFilter = query.eventType ? `AND event_type = $3` : "";
      if (query.eventType) params.push(query.eventType);
      params.push(query.limit);
      const limitParam = `$${params.length}`;

      const rows = await fastify.db.queryTenant(
        tenantId,
        `SELECT id, project_id AS "projectId", event_type AS "eventType",
                action_type AS "actionType", display_text AS "displayText",
                reasoning, payload, executed_at AS "executedAt",
                triggered_by AS "triggeredBy", chat_message AS "chatMessage",
                created_at AS "createdAt"
         FROM larry_events
         WHERE tenant_id = $1
           AND project_id = $2
           ${eventTypeFilter}
         ORDER BY created_at DESC
         LIMIT ${limitParam}`,
        params
      );

      return { events: rows };
    }
  );

  fastify.post(
    "/events/:id/accept",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm"])] },
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const { id } = request.params as { id: string };

      const events = await fastify.db.queryTenant<{
        id: string;
        projectId: string;
        eventType: string;
        actionType: string;
        payload: Record<string, unknown>;
      }>(
        tenantId,
        `SELECT id, project_id AS "projectId", event_type AS "eventType",
                action_type AS "actionType", payload
         FROM larry_events
         WHERE tenant_id = $1 AND id = $2
         LIMIT 1`,
        [tenantId, id]
      );

      if (!events[0]) throw fastify.httpErrors.notFound("Event not found.");
      const event = events[0];

      if (event.eventType !== "suggested") {
        throw fastify.httpErrors.conflict("Only suggested events can be accepted.");
      }

      let entity: unknown;
      try {
        entity = await executeAction(
          fastify.db,
          tenantId,
          event.projectId,
          event.actionType as import("@larry/shared").LarryActionType,
          event.payload
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw fastify.httpErrors.unprocessableEntity(msg);
      }

      await fastify.db.queryTenant(
        tenantId,
        `UPDATE larry_events
         SET event_type = 'accepted', executed_at = NOW()
         WHERE tenant_id = $1 AND id = $2`,
        [tenantId, id]
      );

      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId: request.user.userId,
        actionType: "larry.event.accepted",
        objectType: "larry_event",
        objectId: id,
        details: { actionType: event.actionType },
      });

      return reply.code(200).send({ accepted: true, entity });
    }
  );

  fastify.post(
    "/events/:id/dismiss",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const { id } = request.params as { id: string };
      const body = (request.body ?? {}) as { reason?: string };

      const events = await fastify.db.queryTenant<{ id: string; eventType: string }>(
        tenantId,
        `SELECT id, event_type AS "eventType" FROM larry_events WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
        [tenantId, id]
      );

      if (!events[0]) throw fastify.httpErrors.notFound("Event not found.");
      if (events[0].eventType !== "suggested") {
        throw fastify.httpErrors.conflict("Only suggested events can be dismissed.");
      }

      await fastify.db.queryTenant(
        tenantId,
        `UPDATE larry_events
         SET event_type = 'dismissed',
             payload = payload || $3::jsonb
         WHERE tenant_id = $1 AND id = $2`,
        [tenantId, id, JSON.stringify({ dismissReason: body.reason ?? null })]
      );

      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId: request.user.userId,
        actionType: "larry.event.dismissed",
        objectType: "larry_event",
        objectId: id,
        details: { reason: body.reason ?? null },
      });

      return reply.code(200).send({ dismissed: true });
    }
  );

  // ── Briefing ─────────────────────────────────────────────────────────────

  fastify.get(
    "/briefing",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const userId = request.user.userId;

      // Fetch display name for the greeting
      const userRows = await fastify.db.queryTenant<{ display_name: string | null; email: string }>(
        tenantId,
        `SELECT u.display_name, u.email
         FROM users u
         WHERE u.id = $2 AND u.tenant_id = $1
         LIMIT 1`,
        [tenantId, userId]
      );
      const user = userRows[0];
      if (!user) throw fastify.httpErrors.notFound("User not found.");

      const displayName = user.display_name?.trim() || user.email.split("@")[0] || "there";

      const config = buildIntelligenceConfig(fastify.config);

      let briefingResult;
      try {
        briefingResult = await getOrGenerateBriefing(
          fastify.db,
          config,
          userId,
          tenantId,
          displayName
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        request.log.error({ err, tenantId, userId }, "generateBriefing failed");
        throw fastify.httpErrors.serviceUnavailable(`Larry briefing error: ${msg}`);
      }

      // Mark as seen if this is the first read
      if (briefingResult.briefingId) {
        await fastify.db.queryTenant(
          tenantId,
          `UPDATE larry_briefings SET seen_at = NOW()
           WHERE tenant_id = $1 AND id = $2 AND seen_at IS NULL`,
          [tenantId, briefingResult.briefingId]
        );
      }

      return reply.code(200).send({
        briefing: briefingResult.content,
        cached: !briefingResult.fresh,
      });
    }
  );

  // ── Chat ─────────────────────────────────────────────────────────────────

  const ChatSchema = z.object({
    projectId: z.string().uuid(),
    message: z.string().min(1).max(8_000),
  });

  fastify.post(
    "/chat",
    {
      config: {
        rateLimit: {
          max: 20,
          timeWindow: "1 minute",
          keyGenerator: (req: FastifyRequest) =>
            (req.user as { tenantId?: string } | undefined)?.tenantId ?? req.ip,
        },
      },
      preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])],
    },
    async (request, reply) => {
      const chatParse = ChatSchema.safeParse(request.body);
      if (!chatParse.success) {
        throw fastify.httpErrors.badRequest(chatParse.error.issues[0]?.message ?? "Invalid request body");
      }
      const { projectId, message } = chatParse.data;
      const tenantId = request.user.tenantId;

      // Assemble project context
      let snapshot;
      try {
        snapshot = await getProjectSnapshot(fastify.db, tenantId, projectId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw fastify.httpErrors.notFound(msg);
      }

      // Run intelligence
      const config = buildIntelligenceConfig(fastify.config);
      let result;
      try {
        result = await runIntelligence(config, snapshot, `user said: "${message}"`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        request.log.error({ err, tenantId, projectId }, "runIntelligence failed");
        throw fastify.httpErrors.serviceUnavailable(`Larry intelligence error: ${msg}`);
      }

      // Execute auto-actions and store suggestions in parallel
      const [autoResult, suggestResult] = await Promise.all([
        runAutoActions(fastify.db, tenantId, projectId, "chat", result.autoActions, message),
        storeSuggestions(fastify.db, tenantId, projectId, "chat", result.suggestedActions, message),
      ]);

      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId: request.user.userId,
        actionType: "larry.chat",
        objectType: "project",
        objectId: projectId,
        details: {
          actionsExecuted: autoResult.executedCount,
          suggestionCount: suggestResult.suggestedCount,
        },
      });

      return reply.code(200).send({
        message: result.briefing,
        actionsExecuted: autoResult.executedCount,
        suggestionCount: suggestResult.suggestedCount,
      });
    }
  );
};
