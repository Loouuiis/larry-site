import Fastify from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import { getEnv } from "./config/env.js";
import { Db } from "./db/client.js";
import { securityPlugin } from "./plugins/security.js";
import { requestContextPlugin } from "./plugins/request-context.js";
import { healthRoutes } from "./routes/health.js";
import { v1Routes } from "./routes/v1/index.js";
import { createQueuePublisher } from "./services/queue.js";
import { createLlmProvider } from "./services/llm-provider.js";

export async function createApp() {
  const env = getEnv();

  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
    },
  });

  app.decorate("db", new Db());
  app.decorate("queue", createQueuePublisher());
  app.decorate("llmProvider", createLlmProvider());

  await app.register(sensible);
  await app.register(cors, {
    origin: env.CORS_ORIGINS.split(",").map((origin) => origin.trim()),
    credentials: true,
  });

  await app.register(securityPlugin);
  await app.register(requestContextPlugin);

  await app.register(healthRoutes);
  await app.register(v1Routes, { prefix: "/v1" });

  app.addHook("onClose", async () => {
    await app.db.close();
  });

  return app;
}
