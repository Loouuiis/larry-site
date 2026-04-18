import fp from "fastify-plugin";
import jwt from "@fastify/jwt";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { getApiEnv } from "@larry/config";
import { AuthUser, Role } from "@larry/shared";

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest) => Promise<void>;
    requireRole: (roles: Role[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    config: ReturnType<typeof getApiEnv>;
  }
}

export const securityPlugin = fp(async (fastify: FastifyInstance) => {
  const env = getApiEnv();
  fastify.decorate("config", env);

  await fastify.register(jwt, {
    secret: env.JWT_ACCESS_SECRET,
  });

  fastify.decorate("authenticate", async (request: FastifyRequest) => {
    await request.jwtVerify();
  });

  fastify.decorate("requireRole", (roles: Role[]) => {
    // Owner is a strict superset of admin (RBAC v2 design: owners can do
    // anything admins can). Route call-sites written before RBAC v2 still
    // pass ["admin", ...] without listing "owner", so admit owners implicitly
    // wherever admin is allowed. Same treatment for legacy "executive" ==
    // "member" (matches effective() in lib/permissions.ts).
    const effectiveRoles = new Set<Role>(roles);
    if (effectiveRoles.has("admin")) effectiveRoles.add("owner");
    if (effectiveRoles.has("member")) effectiveRoles.add("executive");
    return async (request: FastifyRequest, _reply: FastifyReply) => {
      const user = request.user as AuthUser | undefined;
      if (!user || !effectiveRoles.has(user.role)) {
        throw fastify.httpErrors.forbidden(
          "You don't have permission to perform this action.",
        );
      }
    };
  });
});
