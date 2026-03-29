import { FastifyPluginAsync } from "fastify";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { runIntelligence } from "@larry/ai";
import {
  executeAction,
  getPendingSuggestionTexts,
  getProjectSnapshot,
  runAutoActions,
  storeSuggestions,
} from "@larry/db";
import { getApiEnv } from "@larry/config";
import type {
  IntelligenceConfig,
  LarryActionType,
  LarryChatResponse,
  LarryEventType,
  LarryMessageRecord,
} from "@larry/shared";
import { writeAuditLog } from "../../lib/audit.js";
import { buildPendingClause } from "../../lib/intelligence-hints.js";
import {
  createLarryConversation,
  getLarryActionCentreData,
  getLarryConversationForUser,
  getLarryEventForMutation,
  insertLarryMessage,
  listLarryConversationPreviews,
  listLarryEventSummaries,
  listLarryMessagesByIds,
  listLarryMessagesForConversation,
  markLarryEventAccepted,
  markLarryEventDismissed,
  touchLarryConversation,
} from "../../lib/larry-ledger.js";
import { getOrGenerateBriefing } from "../../services/larry-briefing.js";

function buildIntelligenceConfig(config: ReturnType<typeof getApiEnv>): IntelligenceConfig {
  if (config.MODEL_PROVIDER === "openai") {
    return { provider: "openai", apiKey: config.OPENAI_API_KEY, model: config.OPENAI_MODEL };
  }
  if (config.MODEL_PROVIDER === "anthropic") {
    return { provider: "anthropic", apiKey: config.ANTHROPIC_API_KEY, model: config.ANTHROPIC_MODEL };
  }
  return { provider: "mock", model: "mock" };
}

const ConversationCreateSchema = z.object({
  projectId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(200).optional(),
});

const ConversationQuerySchema = z.object({
  projectId: z.string().uuid().optional(),
});

const ConversationMessageSchema = z.object({
  role: z.enum(["user", "larry"]),
  content: z.string().trim().min(1).max(8_000),
  reasoning: z.record(z.string(), z.unknown()).nullable().optional(),
});

const EventsQuerySchema = z.object({
  projectId: z.string().uuid().optional(),
  eventType: z.enum(["auto_executed", "suggested", "accepted", "dismissed"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const ActionCentreQuerySchema = z.object({
  projectId: z.string().uuid().optional(),
});

const ChatSchema = z.object({
  projectId: z.string().uuid(),
  message: z.string().trim().min(1).max(8_000),
  conversationId: z.string().uuid().optional(),
});

function toPendingType(eventType?: LarryEventType): LarryEventType[] | undefined {
  return eventType ? [eventType] : undefined;
}

function fallbackMessage(input: {
  id: string;
  role: "user" | "larry";
  content: string;
  createdAt: string;
  actorUserId?: string | null;
  actorDisplayName?: string | null;
  linkedActions?: LarryMessageRecord["linkedActions"];
}): LarryMessageRecord {
  return {
    id: input.id,
    role: input.role,
    content: input.content,
    reasoning: null,
    createdAt: input.createdAt,
    actorUserId: input.actorUserId ?? null,
    actorDisplayName: input.actorDisplayName ?? null,
    linkedActions: input.linkedActions ?? [],
  };
}

export const larryRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/conversations",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request) => {
      const parseResult = ConversationQuerySchema.safeParse(request.query);
      if (!parseResult.success) {
        throw fastify.httpErrors.badRequest(parseResult.error.issues[0]?.message ?? "Invalid query params");
      }

      const conversations = await listLarryConversationPreviews(
        fastify.db,
        request.user.tenantId,
        request.user.userId,
        parseResult.data
      );

      return { conversations };
    }
  );

  fastify.post(
    "/conversations",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request, reply) => {
      const parseResult = ConversationCreateSchema.safeParse(request.body ?? {});
      if (!parseResult.success) {
        throw fastify.httpErrors.badRequest(parseResult.error.issues[0]?.message ?? "Invalid request body");
      }

      const conversation = await createLarryConversation(
        fastify.db,
        request.user.tenantId,
        request.user.userId,
        parseResult.data
      );

      return reply.code(201).send(conversation);
    }
  );

  fastify.get(
    "/conversations/:id/messages",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request) => {
      const tenantId = request.user.tenantId;
      const userId = request.user.userId;
      const { id } = request.params as { id: string };

      const conversation = await getLarryConversationForUser(fastify.db, tenantId, userId, id);
      if (!conversation) {
        throw fastify.httpErrors.notFound("Conversation not found.");
      }

      const messages = await listLarryMessagesForConversation(fastify.db, tenantId, id);
      return { messages };
    }
  );

  fastify.post(
    "/conversations/:id/messages",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const userId = request.user.userId;
      const { id } = request.params as { id: string };
      const parseResult = ConversationMessageSchema.safeParse(request.body ?? {});

      if (!parseResult.success) {
        throw fastify.httpErrors.badRequest(parseResult.error.issues[0]?.message ?? "Invalid request body");
      }

      const conversation = await getLarryConversationForUser(fastify.db, tenantId, userId, id);
      if (!conversation) {
        throw fastify.httpErrors.notFound("Conversation not found.");
      }

      const body = parseResult.data;
      const inserted = await insertLarryMessage(fastify.db, tenantId, id, {
        role: body.role,
        content: body.content,
        reasoning: body.reasoning ?? null,
        actorUserId: body.role === "user" ? userId : null,
      });

      await touchLarryConversation(
        fastify.db,
        tenantId,
        id,
        body.role === "user" ? body.content.slice(0, 80) : undefined
      );

      const [message] = await listLarryMessagesByIds(fastify.db, tenantId, [inserted.id]);

      return reply.code(201).send(
        message ??
          fallbackMessage({
            id: inserted.id,
            role: body.role,
            content: body.content,
            createdAt: inserted.createdAt,
            actorUserId: body.role === "user" ? userId : null,
          })
      );
    }
  );

  fastify.get(
    "/events",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request) => {
      const parseResult = EventsQuerySchema.safeParse(request.query);
      if (!parseResult.success) {
        throw fastify.httpErrors.badRequest(parseResult.error.issues[0]?.message ?? "Invalid query params");
      }

      const events = await listLarryEventSummaries(fastify.db, request.user.tenantId, {
        projectId: parseResult.data.projectId,
        eventTypes: toPendingType(parseResult.data.eventType),
        limit: parseResult.data.limit,
      });

      return { events };
    }
  );

  fastify.get(
    "/action-centre",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request) => {
      const parseResult = ActionCentreQuerySchema.safeParse(request.query);
      if (!parseResult.success) {
        throw fastify.httpErrors.badRequest(parseResult.error.issues[0]?.message ?? "Invalid query params");
      }

      return getLarryActionCentreData(
        fastify.db,
        request.user.tenantId,
        request.user.userId,
        parseResult.data.projectId
      );
    }
  );

  fastify.post(
    "/events/:id/accept",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm"])] },
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const actorUserId = request.user.userId;
      const { id } = request.params as { id: string };

      const event = await getLarryEventForMutation(fastify.db, tenantId, id);
      if (!event) {
        throw fastify.httpErrors.notFound("Event not found.");
      }
      if (event.eventType !== "suggested") {
        throw fastify.httpErrors.conflict("Only suggested events can be accepted.");
      }

      let entity: unknown;
      try {
        entity = await executeAction(
          fastify.db,
          tenantId,
          event.projectId,
          event.actionType as LarryActionType,
          event.payload
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw fastify.httpErrors.unprocessableEntity(message);
      }

      await markLarryEventAccepted(fastify.db, tenantId, id, actorUserId);

      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId,
        actionType: "larry.event.accepted",
        objectType: "larry_event",
        objectId: id,
        details: { actionType: event.actionType },
      });

      const [updatedEvent] = await listLarryEventSummaries(fastify.db, tenantId, { ids: [id] });

      return reply.code(200).send({ accepted: true, entity, event: updatedEvent ?? null });
    }
  );

  fastify.post(
    "/events/:id/dismiss",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const actorUserId = request.user.userId;
      const { id } = request.params as { id: string };
      const body = (request.body ?? {}) as { reason?: string };

      const event = await getLarryEventForMutation(fastify.db, tenantId, id);
      if (!event) {
        throw fastify.httpErrors.notFound("Event not found.");
      }
      if (event.eventType !== "suggested") {
        throw fastify.httpErrors.conflict("Only suggested events can be dismissed.");
      }

      await markLarryEventDismissed(fastify.db, tenantId, id, actorUserId, body.reason ?? null);

      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId,
        actionType: "larry.event.dismissed",
        objectType: "larry_event",
        objectId: id,
        details: { reason: body.reason ?? null },
      });

      const [updatedEvent] = await listLarryEventSummaries(fastify.db, tenantId, { ids: [id] });

      return reply.code(200).send({ dismissed: true, event: updatedEvent ?? null });
    }
  );

  fastify.get(
    "/briefing",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const userId = request.user.userId;

      const userRows = await fastify.db.queryTenant<{ display_name: string | null; email: string }>(
        tenantId,
        `SELECT u.display_name, u.email
           FROM users u
          WHERE u.id = $2
            AND u.tenant_id = $1
          LIMIT 1`,
        [tenantId, userId]
      );

      const user = userRows[0];
      const displayName = user
        ? (user.display_name?.trim() || user.email.split("@")[0] || "there")
        : "there";

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
      } catch (error) {
        request.log.error({ err: error, tenantId, userId }, "generateBriefing failed");
        const hour = new Date().getHours();
        const timeOfDay = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
        return reply.code(200).send({
          briefing: {
            greeting: `Good ${timeOfDay}, ${displayName}.`,
            projects: [],
            totalNeedsYou: 0,
          },
          cached: false,
          degraded: true,
        });
      }

      if (briefingResult.briefingId) {
        await fastify.db.queryTenant(
          tenantId,
          `UPDATE larry_briefings
              SET seen_at = NOW()
            WHERE tenant_id = $1
              AND id = $2
              AND seen_at IS NULL`,
          [tenantId, briefingResult.briefingId]
        ).catch(() => undefined);
      }

      return reply.code(200).send({
        briefing: briefingResult.content,
        cached: !briefingResult.fresh,
      });
    }
  );

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
      const parseResult = ChatSchema.safeParse(request.body ?? {});
      if (!parseResult.success) {
        throw fastify.httpErrors.badRequest(parseResult.error.issues[0]?.message ?? "Invalid request body");
      }

      const { projectId, message, conversationId } = parseResult.data;
      const tenantId = request.user.tenantId;
      const actorUserId = request.user.userId;
      let existingConversation = null;

      if (conversationId) {
        existingConversation = await getLarryConversationForUser(
          fastify.db,
          tenantId,
          actorUserId,
          conversationId
        );
        if (!existingConversation) {
          throw fastify.httpErrors.notFound("Conversation not found.");
        }
        if (existingConversation.projectId !== projectId) {
          throw fastify.httpErrors.conflict("Conversation does not belong to this project.");
        }
      }

      let snapshot;
      try {
        snapshot = await getProjectSnapshot(fastify.db, tenantId, projectId);
      } catch (error) {
        const messageText = error instanceof Error ? error.message : String(error);
        throw fastify.httpErrors.notFound(messageText);
      }

      const pendingTexts = await getPendingSuggestionTexts(fastify.db, tenantId, projectId).catch(
        () => [] as string[]
      );
      const pendingClause = buildPendingClause(pendingTexts);

      const config = buildIntelligenceConfig(fastify.config);
      let result;
      try {
        result = await runIntelligence(config, snapshot, `user said: "${message}"${pendingClause}`);
      } catch (error) {
        const messageText = error instanceof Error ? error.message : String(error);
        request.log.error({ err: error, tenantId, projectId }, "runIntelligence failed");
        throw fastify.httpErrors.serviceUnavailable(`Larry intelligence error: ${messageText}`);
      }

      const conversation =
        existingConversation ??
        await createLarryConversation(fastify.db, tenantId, actorUserId, {
          projectId,
          title: message.slice(0, 80),
        });

      const userMessageInsert = await insertLarryMessage(fastify.db, tenantId, conversation.id, {
        role: "user",
        content: message,
        actorUserId,
      });

      const assistantMessageInsert = await insertLarryMessage(fastify.db, tenantId, conversation.id, {
        role: "larry",
        content: result.briefing,
      });

      await touchLarryConversation(fastify.db, tenantId, conversation.id, message.slice(0, 80));

      const actionContext = {
        conversationId: conversation.id,
        requestMessageId: userMessageInsert.id,
        responseMessageId: assistantMessageInsert.id,
        requesterUserId: actorUserId,
        sourceKind: "chat",
        sourceRecordId: userMessageInsert.id,
      };

      const [autoResult, suggestResult, persistedMessages] = await Promise.all([
        runAutoActions(
          fastify.db,
          tenantId,
          projectId,
          "chat",
          result.autoActions,
          message,
          actionContext
        ),
        storeSuggestions(
          fastify.db,
          tenantId,
          projectId,
          "chat",
          result.suggestedActions,
          message,
          actionContext
        ),
        listLarryMessagesByIds(fastify.db, tenantId, [userMessageInsert.id, assistantMessageInsert.id]),
      ]);

      const userMessage =
        persistedMessages.find((entry) => entry.id === userMessageInsert.id) ??
        fallbackMessage({
          id: userMessageInsert.id,
          role: "user",
          content: message,
          createdAt: userMessageInsert.createdAt,
          actorUserId,
        });

      const assistantMessage =
        persistedMessages.find((entry) => entry.id === assistantMessageInsert.id) ??
        fallbackMessage({
          id: assistantMessageInsert.id,
          role: "larry",
          content: result.briefing,
          createdAt: assistantMessageInsert.createdAt,
        });

      const linkedActionIds = [...autoResult.eventIds, ...suggestResult.eventIds];
      const linkedActions =
        assistantMessage.linkedActions.length > 0 || linkedActionIds.length === 0
          ? assistantMessage.linkedActions
          : await listLarryEventSummaries(fastify.db, tenantId, {
              ids: linkedActionIds,
              sort: "chronological",
            });

      const responsePayload: LarryChatResponse = {
        conversationId: conversation.id,
        message: result.briefing,
        userMessage,
        assistantMessage: {
          ...assistantMessage,
          linkedActions,
        },
        linkedActions,
        actionsExecuted: autoResult.executedCount,
        suggestionCount: suggestResult.suggestedCount,
      };

      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId,
        actionType: "larry.chat",
        objectType: "project",
        objectId: projectId,
        details: {
          conversationId: conversation.id,
          actionsExecuted: autoResult.executedCount,
          suggestionCount: suggestResult.suggestedCount,
          linkedActionCount: linkedActions.length,
        },
      });

      return reply.code(200).send(responsePayload);
    }
  );
};
