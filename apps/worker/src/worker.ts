import { Queue, QueueEvents, Worker } from "bullmq";
import { EVENT_QUEUE_NAME } from "@larry/shared";
import { db, env } from "./context.js";
import { processQueueJob } from "./handlers.js";

const connection = { url: env.REDIS_URL };

const worker = new Worker(EVENT_QUEUE_NAME, processQueueJob, {
  connection,
  concurrency: env.WORKER_CONCURRENCY,
});

const queueEvents = new QueueEvents(EVENT_QUEUE_NAME, { connection });

const queue = new Queue(EVENT_QUEUE_NAME, { connection });

// Run Larry's intelligence scan across all active projects every 30 minutes.
// Stable jobId prevents duplicate repeatable entries on restart.
//
// 2026-04-14: the cron can be paused via DISABLE_LARRY_SCAN=1 on the
// Worker service — useful when the Groq free-tier TPD is exhausted by
// test traffic and every scheduled tick is cannibalising the drip-feed
// replenishment. When paused, any already-scheduled repeatable entry
// is removed so it doesn't keep firing from Redis.
const scanDisabled = process.env.DISABLE_LARRY_SCAN === "1";
if (scanDisabled) {
  try {
    await queue.removeRepeatable("larry.scan", { every: 30 * 60 * 1000, jobId: "larry-scan" });
    console.log("[worker] larry.scan repeatable disabled via DISABLE_LARRY_SCAN=1");
  } catch (err) {
    console.warn("[worker] failed to remove larry.scan repeatable:", err);
  }
} else {
  await queue.add(
    "larry.scan",
    {},
    {
      repeat: { every: 30 * 60 * 1000 },
      jobId: "larry-scan",
      attempts: 3,
      backoff: { type: "exponential", delay: 10_000 },
    }
  );
}

// Register the escalation scan as a BullMQ repeatable job (hourly).
// Using a stable jobId ensures only one repeatable entry exists even on restart.
await queue.add(
  "escalation.scan",
  {},
  {
    repeat: { every: 60 * 60 * 1000 },
    jobId: "escalation-scan",
    attempts: 3,
    backoff: { type: "exponential", delay: 10_000 },
  }
);

// Renew Google Calendar watch channels every 5 days (channels expire ~7 days).
await queue.add(
  "calendar.webhook.renew",
  {},
  {
    repeat: { every: 5 * 24 * 60 * 60 * 1000 },
    jobId: "calendar-webhook-renew",
    attempts: 3,
    backoff: { type: "exponential", delay: 30_000 },
  }
);

// QA-2026-04-12 I-3/I-4: sweep stalled "running" attempts every 5 minutes so
// meeting notes can't sit in PROCESSING forever when the worker host dies.
await queue.add(
  "runtime.reap",
  {},
  {
    repeat: { every: 5 * 60 * 1000 },
    jobId: "runtime-reap",
    attempts: 1,
  }
);

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
  await queue.close();
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

console.log(`[worker] started queue=${EVENT_QUEUE_NAME} concurrency=${env.WORKER_CONCURRENCY}`);
