import Fastify, { type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import { ZodError } from "zod";
import { getApiEnv } from "@larry/config";
import { Db } from "@larry/db";
import { securityPlugin } from "./plugins/security.js";
import { requestContextPlugin } from "./plugins/request-context.js";
import { healthRoutes } from "./routes/health.js";
import { v1Routes } from "./routes/v1/index.js";
import { createQueuePublisher } from "./services/queue.js";
import { getRedis, closeRedis } from "./lib/redis.js";
import { LLMQuotaError } from "./lib/llm-budget.js";
import { EmailQuotaError } from "./lib/email-quota.js";

export async function createApp() {
  const env = getApiEnv();

  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
    },
    bodyLimit: 10 * 1024 * 1024, // 10 MB — needed for base64-encoded binary file uploads
    // Railway sits behind a proxy; honor X-Forwarded-For so IP-based rate limits
    // target real clients instead of collapsing to the proxy's single IP.
    trustProxy: true,
  });

  app.decorate("db", new Db(env.DATABASE_URL));
  app.decorate("queue", createQueuePublisher(env.REDIS_URL));

  await app.register(sensible);
  await app.register(helmet, {
    contentSecurityPolicy: false,
  });
  await app.register(rateLimit, {
    global: false, // opt-in per route
    // Distributed store so limits hold across Railway instances. Redis is
    // already a hard dep (BullMQ); if it's down the API is broken anyway.
    // Flip RATE_LIMIT_REDIS_ENABLED=false to fall back to in-memory.
    redis: env.RATE_LIMIT_REDIS_ENABLED ? getRedis() : undefined,
    skipOnError: false,
    nameSpace: "rl:",
    // Test-only bypass: non-prod can pass a shared secret header to skip limits.
    skip: (req: FastifyRequest) => {
      if (env.NODE_ENV === "production") return false;
      const secret = env.RATE_LIMIT_BYPASS_SECRET;
      if (!secret) return false;
      return req.headers["x-ratelimit-bypass"] === secret;
    },
  });
  await app.register(cors, {
    origin: env.CORS_ORIGINS.split(",").map((origin) => origin.trim()),
    credentials: true,
  });

  await app.register(securityPlugin);
  await app.register(requestContextPlugin);

  // Return human-readable messages for Zod validation errors
  app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
    if (error instanceof ZodError) {
      const messages = error.issues.map((issue) => issue.message);
      return reply.status(400).send({
        statusCode: 400,
        error: "Validation Error",
        message: messages.join(". ") + ".",
      });
    }
    if (error instanceof LLMQuotaError) {
      request.log.warn(
        { scope: error.scope, limit: error.limit, url: request.url },
        "llm quota rejected",
      );
      return reply.status(429).send({
        statusCode: 429,
        error: "Too Many Requests",
        message:
          error.scope === "tenant"
            ? "Daily AI usage limit reached for this workspace. Please try again tomorrow."
            : "Daily AI usage limit reached. Please try again shortly.",
      });
    }
    if (error instanceof EmailQuotaError) {
      request.log.warn(
        { detail: error.detail, url: request.url },
        "email quota rejected",
      );
      return reply.status(429).send({
        statusCode: 429,
        error: "Too Many Requests",
        message: "Email send limit reached. Please try again later.",
      });
    }
    // Let Fastify handle everything else (including @fastify/sensible errors)
    if (error.statusCode) {
      return reply.status(error.statusCode).send({
        statusCode: error.statusCode,
        error: error.name,
        message: error.message,
      });
    }
    // Unhandled 500 — always log stack so production failures are diagnosable.
    request.log.error(
      {
        err: { message: error.message, name: error.name, stack: error.stack },
        url: request.url,
        method: request.method,
      },
      "unhandled 500"
    );
    reply.status(500).send({
      statusCode: 500,
      error: "Internal Server Error",
      message: "An unexpected error occurred.",
    });
  });

  await app.register(healthRoutes);
  await app.register(v1Routes, { prefix: "/v1" });

  app.addHook("onClose", async () => {
    await app.queue.close();
    await app.db.close();
    await closeRedis();
  });

  return app;
}
