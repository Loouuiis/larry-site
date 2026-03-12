import fp from "fastify-plugin";
import { FastifyReply, FastifyRequest } from "fastify";
import { getEnv } from "../config/env.js";
import { AuthUser } from "../types/domain.js";

function resolveTenantId(request: FastifyRequest): string | null {
  const user = request.user as AuthUser | undefined;
  if (user?.tenantId) return user.tenantId;

  const tenantHeader = request.headers["x-tenant-id"];
  if (typeof tenantHeader === "string" && tenantHeader.length > 0) {
    return tenantHeader;
  }

  return null;
}

export const requestContextPlugin = fp(async (fastify) => {
  const env = getEnv();

  fastify.addHook("preHandler", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as AuthUser | undefined;
    const tenantId = resolveTenantId(request);

    if (env.REQUIRE_TENANT_HEADER && !tenantId && !request.url.startsWith("/health")) {
      throw fastify.httpErrors.badRequest("Missing tenant context. Provide x-tenant-id or authenticated token.");
    }

    request.context = {
      tenantId: tenantId ?? "",
      user: user ?? {
        userId: "anonymous",
        tenantId: tenantId ?? "",
        role: "member",
      },
      requestId: reply.request.id,
    };
  });
});
