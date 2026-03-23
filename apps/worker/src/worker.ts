import { QueueEvents, Worker } from "bullmq";
import { EVENT_QUEUE_NAME } from "@larry/shared";
import { db, env } from "./context.js";
import { startEscalationScanner } from "./escalation.js";
import { processQueueJob } from "./handlers.js";

const worker = new Worker(EVENT_QUEUE_NAME, processQueueJob, {
  connection: { url: env.REDIS_URL },
  concurrency: env.WORKER_CONCURRENCY,
});

const queueEvents = new QueueEvents(EVENT_QUEUE_NAME, { connection: { url: env.REDIS_URL } });

worker.on("completed", (job) => {
  console.log(`[worker] completed job ${job?.id} (${job?.name})`);
});

worker.on("failed", (job, error) => {
  console.error(`[worker] failed job ${job?.id} (${job?.name})`, error);
});

queueEvents.on("waiting", ({ jobId }) => {
  console.log(`[worker] waiting job ${jobId}`);
});

async function shutdown(): Promise<void> {
  await worker.close();
  await queueEvents.close();
  await db.close();
}

process.on("SIGINT", async () => {
  await shutdown();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await shutdown();
  process.exit(0);
});

startEscalationScanner();

console.log(`[worker] started queue=${EVENT_QUEUE_NAME} concurrency=${env.WORKER_CONCURRENCY}`);
