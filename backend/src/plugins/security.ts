import fp from "fastify-plugin";
import jwt from "@fastify/jwt";
import { FastifyRequest } from "fastify";
import { getEnv } from "../config/env.js";
import { AuthUser, Role } from "../types/domain.js";

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest) => Promise<void>;
    config: ReturnType<typeof getEnv>;
  }
}

export const securityPlugin = fp(async (fastify) => {
  const env = getEnv();
  fastify.decorate("config", env);

  await fastify.register(jwt, {
    secret: env.JWT_ACCESS_SECRET,
    namespace: "jwt",
  });

  fastify.decorate("authenticate", async (request: FastifyRequest) => {
    await request.jwtVerify();
  });

  fastify.decorate("requireRole", (roles: Role[]) => {
    return async (request: FastifyRequest) => {
      const user = request.user as AuthUser | undefined;
      if (!user || !roles.includes(user.role)) {
        throw fastify.httpErrors.forbidden("Insufficient role permissions for this action.");
      }
    };
  });
});
