import type { FastifyRequest } from "fastify";
import { AuthUser, RequestContext } from "./domain.js";
import { Db } from "../db/client.js";
import { QueuePublisher } from "../services/queue.js";
import { LlmProvider } from "../services/llm-provider.js";
import { getEnv } from "../config/env.js";

declare module "fastify" {
  interface FastifyRequest {
    context: RequestContext;
  }

  interface FastifyInstance {
    db: Db;
    queue: QueuePublisher;
    llmProvider: LlmProvider;
    authenticate: (request: FastifyRequest) => Promise<void>;
    config: ReturnType<typeof getEnv>;
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
