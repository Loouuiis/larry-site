import type { FastifyRequest } from "fastify";
import type { Timeline2RouteContext } from "../shared/route-context.js";

export function registerTimeline2LegacyAiRoutes(ctx: Timeline2RouteContext) {
  const {
    fastify,
    parseOrBadRequest,
    ProjectParamSchema,
    AiChatSchema,
    assertProjectAccess,
    ensurePlan,
    createLegacyAiBranchFromChat,
  } = ctx;

  // Compatibility-only route while AI2 replaces the older planner path.
  fastify.post(
    "/projects/:projectId/ai/chat/stream",
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
      const body = parseOrBadRequest(AiChatSchema, request.body);
      const tenantId = request.user.tenantId;
      await assertProjectAccess({
        tenantId,
        userId: request.user.userId,
        tenantRole: request.user.role,
        projectId: params.projectId,
        mode: "write",
      });
      const plan = await ensurePlan(tenantId, params.projectId, request.user.userId);

      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        "Transfer-Encoding": "chunked",
      });
      const write = (obj: object) => {
        if (!reply.raw.destroyed) reply.raw.write(`data: ${JSON.stringify(obj)}\n\n`);
      };

      try {
        const branch = await createLegacyAiBranchFromChat({
          tenantId,
          projectId: params.projectId,
          planId: plan.id,
          actorUserId: request.user.userId,
          message: body.message,
          onEvent: write,
        });
        write({ type: "branch_created", branch });
        write({ type: "done", message: "Timeline 2 AI proposal created." });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Timeline 2 AI failed.";
        request.log.warn(
          { err: error, tenantId, projectId: params.projectId },
          "Timeline 2 legacy AI stream failed",
        );
        write({ type: "error", message });
      } finally {
        if (!reply.raw.destroyed) reply.raw.end();
      }
      return reply;
    },
  );
}
