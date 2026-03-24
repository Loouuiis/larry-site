import fp from "fastify-plugin";
import { FastifyReply, FastifyRequest } from "fastify";
import { getApiEnv } from "@larry/config";
import { AuthUser } from "@larry/shared";

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
  const env = getApiEnv();

  fastify.addHook("preHandler", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as AuthUser | undefined;
    const tenantId = resolveTenantId(request);

    const isProtected = !request.url.startsWith("/health");

    // Always reject missing tenant context on protected routes — REQUIRE_TENANT_HEADER=false
    // is only a dev escape hatch and must not allow empty-string tenant IDs to reach RLS queries.
    if (isProtected && !tenantId && env.REQUIRE_TENANT_HEADER) {
      throw fastify.httpErrors.badRequest("Missing tenant context. Provide x-tenant-id or authenticated token.");
    }

    if (isProtected && !tenantId && !env.REQUIRE_TENANT_HEADER) {
      // Dev mode without a tenant header: use a recognisable sentinel so RLS never
      // matches real rows, rather than silently passing an empty string.
      request.context = {
        tenantId: "__dev_no_tenant__",
        user: user ?? { userId: "anonymous", tenantId: "__dev_no_tenant__", role: "member" },
        requestId: reply.request.id,
      };
      return;
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
