import { Redis } from "ioredis";
import { getApiEnv } from "@larry/config";

let client: Redis | null = null;

export function getRedis(): Redis {
  if (client) return client;
  const env = getApiEnv();
  const instance = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
  });
  instance.on("error", (err: Error) => {
    // Surface to stderr so Railway logs capture it — structured logging
    // happens at the consumer layer (Fastify logger).
    console.error("[redis] connection error:", err.message);
  });
  client = instance;
  return client;
}

export async function closeRedis(): Promise<void> {
  if (!client) return;
  try {
    await client.quit();
  } finally {
    client = null;
  }
}
