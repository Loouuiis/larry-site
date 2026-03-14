import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Job, QueueEvents, Worker } from "bullmq";
import { getWorkerEnv } from "@larry/config";
import { Db } from "@larry/db";
import { EVENT_QUEUE_NAME, QueueMessage } from "@larry/shared";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);

const envCandidates = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../api/.env"),
  path.resolve(process.cwd(), "../../apps/api/.env"),
  path.resolve(process.cwd(), "apps/worker/.env"),
  path.resolve(process.cwd(), "apps/api/.env"),
  path.resolve(currentDir, "../.env"),
  path.resolve(currentDir, "../../api/.env"),
  path.resolve(currentDir, "../../../apps/api/.env"),
];

for (const candidate of envCandidates) {
  if (existsSync(candidate)) {
    loadEnv({ path: candidate, override: false });
    if (process.env.DATABASE_URL && process.env.REDIS_URL) {
      break;
    }
  }
}

const env = getWorkerEnv();
const db = new Db(env.DATABASE_URL);

async function handleAgentRunIngested(job: Job<QueueMessage>): Promise<void> {
  const runId = job.data.payload.runId;
  const tenantId = job.data.tenantId;
  if (typeof runId !== "string") return;

  await db.queryTenant(
    tenantId,
    `UPDATE agent_runs
     SET status_message = $3,
         updated_at = NOW()
     WHERE tenant_id = $1 AND id = $2`,
    [tenantId, runId, "Worker accepted ingestion job"]
  );
}

async function processQueueJob(job: Job<QueueMessage>): Promise<void> {
  switch (job.name) {
    case "agent_run.ingested":
      await handleAgentRunIngested(job);
      break;
    case "canonical_event.created":
    case "agent_run.processed":
    default:
      // Keep Stage 1 simple; additional handlers added iteratively.
      break;
  }
}

const worker = new Worker<QueueMessage>(EVENT_QUEUE_NAME, processQueueJob, {
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

console.log(`[worker] started queue=${EVENT_QUEUE_NAME} concurrency=${env.WORKER_CONCURRENCY}`);
