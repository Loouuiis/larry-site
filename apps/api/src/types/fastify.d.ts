import type { FastifyRequest } from "fastify";
import { getApiEnv } from "@larry/config";
import { Db } from "@larry/db";
import { AuthUser, RequestContext } from "@larry/shared";
import { QueuePublisher } from "../services/queue.js";

declare module "fastify" {
  interface FastifyRequest {
    context: RequestContext;
  }

  interface FastifyInstance {
    db: Db;
    queue: QueuePublisher;
    authenticate: (request: FastifyRequest) => Promise<void>;
    config: ReturnType<typeof getApiEnv>;
    requireRole: (roles: AuthUser["role"][]) => (request: FastifyRequest) => Promise<void>;
  }

}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    user: AuthUser;
    payload: {
      sub: string;
      userId: string;
      tenantId: string;
      role: AuthUser["role"];
      email?: string;
      // MFA (login audit P1-2): short-lived "mfa_verify" / "mfa_enrol"
      // pending tokens reuse the same JWT secret but carry a scope claim
      // so the MFA routes can distinguish them from real access tokens.
      scope?: "mfa_verify" | "mfa_enrol";
    };
  }
}
