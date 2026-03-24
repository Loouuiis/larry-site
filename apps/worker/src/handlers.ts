import { Job } from "bullmq";
import { QueueMessage } from "@larry/shared";
import {
  ensureRunForCanonicalEvent,
  extractActionableText,
  loadAgentRun,
  loadCanonicalEvent,
  processAgentRunLifecycle,
} from "./lifecycle.js";

export async function handleAgentRunIngested(job: Job<QueueMessage>): Promise<void> {
  const runId = job.data.payload.runId;
  const tenantId = job.data.tenantId;
  if (typeof runId !== "string") return;

  let transcript = typeof job.data.payload.transcript === "string" ? job.data.payload.transcript : "";

  if (transcript.trim().length === 0) {
    const fallbackCanonicalEventId =
      typeof job.data.payload.canonicalEventId === "string" ? job.data.payload.canonicalEventId : null;
    if (fallbackCanonicalEventId) {
      const canonical = await loadCanonicalEvent(tenantId, fallbackCanonicalEventId);
      if (canonical) {
        transcript = extractActionableText(canonical.source, canonical.payload) ?? "";
      }
    }
  }

  const run = await loadAgentRun(tenantId, runId);
  if (!run) return;

  await processAgentRunLifecycle(tenantId, runId, transcript, run.source);
}

export async function handleCanonicalEventCreated(job: Job<QueueMessage>): Promise<void> {
  const tenantId = job.data.tenantId;
  const canonicalEventId = job.data.payload.canonicalEventId;
  if (typeof canonicalEventId !== "string") return;

  const canonical = await loadCanonicalEvent(tenantId, canonicalEventId);
  if (!canonical) return;

  // Transcript uploads have a dedicated ingest route and job flow.
  if (canonical.source === "transcript") return;

  const transcript = extractActionableText(canonical.source, canonical.payload);
  if (!transcript) return;

  const run = await ensureRunForCanonicalEvent(tenantId, canonical.source, canonical.id);
  await processAgentRunLifecycle(tenantId, run.id, transcript, canonical.source);
}

export async function processQueueJob(job: Job<QueueMessage>): Promise<void> {
  switch (job.name) {
    case "agent_run.ingested":
      await handleAgentRunIngested(job);
      break;
    case "canonical_event.created":
      await handleCanonicalEventCreated(job);
      break;
    case "agent_run.processed":
    default:
      // Keep Stage 1 simple; additional handlers added iteratively.
      break;
  }
}
