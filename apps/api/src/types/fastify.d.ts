import type { FastifyRequest } from "fastify";
import { getApiEnv } from "@larry/config";
import { Db } from "@larry/db";
import { LlmProvider } from "@larry/ai";
import { AuthUser, RequestContext } from "@larry/shared";
import { QueuePublisher } from "../services/queue.js";

declare module "fastify" {
  interface FastifyRequest {
    context: RequestContext;
  }

  interface FastifyInstance {
    db: Db;
    queue: QueuePublisher;
    llmProvider: LlmProvider;
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
    };
  }
}
