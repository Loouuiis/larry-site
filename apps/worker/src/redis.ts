import { Redis } from "ioredis";
import { getWorkerEnv } from "@larry/config";

let client: Redis | null = null;

export function getRedis(): Redis {
  if (client) return client;
  const env = getWorkerEnv();
  const instance = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
  });
  instance.on("error", (err: Error) => {
    console.error("[worker-redis] connection error:", err.message);
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
