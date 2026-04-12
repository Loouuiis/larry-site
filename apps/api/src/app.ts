import Fastify from "fastify";
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

export async function createApp() {
  const env = getApiEnv();

  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
    },
    bodyLimit: 10 * 1024 * 1024, // 10 MB — needed for base64-encoded binary file uploads
  });

  app.decorate("db", new Db(env.DATABASE_URL));
  app.decorate("queue", createQueuePublisher(env.REDIS_URL));

  await app.register(sensible);
  await app.register(helmet, {
    contentSecurityPolicy: false,
  });
  await app.register(rateLimit, {
    global: false, // opt-in per route
    redis: undefined, // in-memory store is fine for MVP demo
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
  });

  return app;
}
