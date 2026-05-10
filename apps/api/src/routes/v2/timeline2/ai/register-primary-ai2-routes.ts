import type { FastifyRequest } from "fastify";
import {
  TIMELINE2_AI2_ERROR_USER_MESSAGES,
  Timeline2Ai2Error,
} from "@larry/shared";
import { getOrCreateAi2ReqId } from "../../../../lib/ai2-req-id.js";
import {
  createAi2DebugTraceCollector,
  TIMELINE2_AI2_STREAM_ROUTE,
  writeAi2DebugTraceFile,
} from "../../../../lib/timeline2-ai2-trace.js";
import type { Timeline2RouteContext } from "../shared/route-context.js";

export function registerTimeline2PrimaryAi2Routes(ctx: Timeline2RouteContext) {
  const {
    fastify,
    parseOrBadRequest,
    ProjectParamSchema,
    Ai2ChatBodySchema,
    assertProjectAccess,
    ensurePlan,
    createPrimaryAi2BranchFromChat,
    configuredTimeline2ModelConfig,
    sanitizeBaseUrl,
    timeline2ProviderLogMeta,
  } = ctx;

  fastify.post(
    "/projects/:projectId/ai2/chat/stream",
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
      const params = parseOrBadRequest(ProjectParamSchema, request.params);
      const body = parseOrBadRequest(Ai2ChatBodySchema, request.body);
      const tenantId = request.user.tenantId;
      const reqId = getOrCreateAi2ReqId(request);
      const streamStarted = Date.now();

      await assertProjectAccess({
        tenantId,
        userId: request.user.userId,
        tenantRole: request.user.role,
        projectId: params.projectId,
        mode: "write",
      });
      const plan = await ensurePlan(tenantId, params.projectId, request.user.userId);

      let provider: string | null = null;
      let model: string | null = null;
      try {
        const cfg = configuredTimeline2ModelConfig();
        provider = cfg.provider;
        model = cfg.model;
      } catch {
        provider = null;
        model = null;
      }
      const debugTrace = createAi2DebugTraceCollector({
        reqId,
        projectId: params.projectId,
        userMessage: body.message,
        answer: body.answer,
        provider,
        model,
        openaiBaseUrlSanitized: sanitizeBaseUrl(process.env.OPENAI_BASE_URL),
      });

      request.log.info(
        {
          reqId,
          route: TIMELINE2_AI2_STREAM_ROUTE,
          projectId: params.projectId,
          msg: "timeline2-ai2-chat-stream-open",
        },
        "Timeline 2 AI 2 chat stream opened",
      );

      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        "Transfer-Encoding": "chunked",
        "X-Request-Id": reqId,
      });
      const write = (obj: object) => {
        const payload = {
          ...(obj as Record<string, unknown>),
          reqId,
          route: TIMELINE2_AI2_STREAM_ROUTE,
        };
        if (!reply.raw.destroyed) reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
      };
      const keepalive = setInterval(() => {
        write({ type: "keepalive" });
      }, 15_000);

      try {
        const branch = await createPrimaryAi2BranchFromChat({
          tenantId,
          projectId: params.projectId,
          planId: plan.id,
          actorUserId: request.user.userId,
          message: body.message,
          answer: body.answer,
          conversationId: body.conversationId,
          onEvent: write,
          log: request.log,
          reqId,
          debugTrace,
        });
        if (branch) {
          write({ type: "branch_created", branch });
        }
      } catch (error) {
        if (Timeline2Ai2Error.isInstance(error)) {
          debugTrace.errorCategory = error.category;
          debugTrace.errorMessage = error.userMessage;
          write({
            type: "error",
            message: error.userMessage,
            errorCategory: error.category,
          });
          request.log.warn(
            {
              reqId,
              route: TIMELINE2_AI2_STREAM_ROUTE,
              err: error,
              errorCategory: error.category,
              userMessage: error.userMessage,
              tenantId,
              projectId: params.projectId,
              ...timeline2ProviderLogMeta(),
            },
            "Timeline 2 AI 2 stream failed (categorized)",
          );
        } else {
          const message =
            error instanceof Error
              ? error.message
              : TIMELINE2_AI2_ERROR_USER_MESSAGES.unknown_failure;
          debugTrace.errorCategory = "unknown_failure";
          debugTrace.errorMessage = message;
          write({
            type: "error",
            message: TIMELINE2_AI2_ERROR_USER_MESSAGES.unknown_failure,
            errorCategory: "unknown_failure",
          });
          request.log.warn(
            {
              reqId,
              route: TIMELINE2_AI2_STREAM_ROUTE,
              err: error,
              tenantId,
              projectId: params.projectId,
              ...timeline2ProviderLogMeta(),
            },
            "Timeline 2 AI 2 stream failed",
          );
        }
      } finally {
        clearInterval(keepalive);
        debugTrace.durationMs = Date.now() - streamStarted;
        void writeAi2DebugTraceFile(debugTrace, request.log);
        if (!reply.raw.destroyed) reply.raw.end();
      }
      return reply;
    },
  );
}
