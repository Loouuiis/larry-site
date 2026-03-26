import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import { getApiEnv } from "@larry/config";
import { Db } from "@larry/db";
import { createLlmProvider } from "@larry/ai";
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
  });

  app.decorate("db", new Db(env.DATABASE_URL));
  app.decorate("queue", createQueuePublisher(env.REDIS_URL));
  app.decorate(
    "llmProvider",
    createLlmProvider({
      provider: env.MODEL_PROVIDER,
      openAiApiKey: env.OPENAI_API_KEY,
      openAiModel: env.OPENAI_MODEL,
      anthropicApiKey: env.ANTHROPIC_API_KEY,
      anthropicModel: env.ANTHROPIC_MODEL,
      geminiApiKey: env.GEMINI_API_KEY,
      geminiModel: env.GEMINI_MODEL,
    })
  );

  await app.register(sensible);
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

  await app.register(healthRoutes);
  await app.register(v1Routes, { prefix: "/v1" });

  app.addHook("onClose", async () => {
    await app.queue.close();
    await app.db.close();
  });

  return app;
}
