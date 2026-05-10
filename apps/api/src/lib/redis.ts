import { Redis } from "ioredis";
import { getApiEnv } from "@larry/config";
import { createLogger } from "./logger.js";

let client: Redis | null = null;
const logger = createLogger("redis");

export function getRedis(): Redis {
  if (client) return client;
  const env = getApiEnv();
  const instance = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
  });
  instance.on("error", (err: Error) => {
    logger.error("connection error", { err });
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
