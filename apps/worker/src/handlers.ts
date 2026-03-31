import { Job } from "bullmq";
import {
  finalizeCanonicalEventProcessingAttempt,
  startCanonicalEventProcessingAttempt,
  type CanonicalEventRuntimeStatus,
} from "@larry/db";
import { QueueMessage } from "@larry/shared";
import { runEscalationScan } from "./escalation.js";
import { runCalendarWebhookRenewal } from "./calendar-renewal.js";
import { runLarryScan } from "./larry-scan.js";
import { handleCanonicalEventCreated } from "./canonical-event.js";
import { db } from "./context.js";

function readCanonicalEventId(payload: Record<string, unknown>): string | null {
  const value = payload.canonicalEventId;
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readCanonicalEventSource(payload: Record<string, unknown>): string | null {
  const value = payload.source;
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function toErrorPayload(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? null,
    };
  }
  return {
    message: String(error),
  };
}

async function processCanonicalEventCreatedJob(job: Job<QueueMessage>): Promise<void> {
  const payload = job.data.payload;
  const canonicalEventId = readCanonicalEventId(payload);
  const source = readCanonicalEventSource(payload);

  if (!canonicalEventId || !source) {
    await handleCanonicalEventCreated(job.data.tenantId, payload);
    return;
  }

  const attemptNumber = (job.attemptsMade ?? 0) + 1;
  const maxAttempts =
    typeof job.opts.attempts === "number" && job.opts.attempts > 0 ? job.opts.attempts : 1;

  const attempt = await startCanonicalEventProcessingAttempt(db, job.data.tenantId, {
    canonicalEventId,
    source,
    attemptNumber,
    maxAttempts,
    queueJobId: job.id == null ? null : String(job.id),
    queueJobName: job.name,
  });

  try {
    await handleCanonicalEventCreated(job.data.tenantId, payload);

    await finalizeCanonicalEventProcessingAttempt(db, job.data.tenantId, {
      attemptId: attempt.id,
      status: "succeeded",
    }).catch((error) => {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(
        `[worker] failed to finalize canonical_event attempt as succeeded (attemptId=${attempt.id}): ${reason}`
      );
    });
  } catch (error) {
    const status: CanonicalEventRuntimeStatus =
      attemptNumber >= maxAttempts ? "dead_lettered" : "retryable_failed";

    await finalizeCanonicalEventProcessingAttempt(db, job.data.tenantId, {
      attemptId: attempt.id,
      status,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? (error.stack ?? null) : null,
      errorPayload: toErrorPayload(error),
    }).catch((finalizeError) => {
      const reason = finalizeError instanceof Error ? finalizeError.message : String(finalizeError);
      console.warn(
        `[worker] failed to finalize canonical_event attempt as ${status} (attemptId=${attempt.id}): ${reason}`
      );
    });

    throw error;
  }
}

export async function processQueueJob(job: Job<QueueMessage>): Promise<void> {
  switch (job.name) {
    case "canonical_event.created":
      await processCanonicalEventCreatedJob(job);
      break;
    case "larry.scan":
      await runLarryScan();
      break;
    case "escalation.scan":
      await runEscalationScan();
      break;
    case "calendar.webhook.renew":
      await runCalendarWebhookRenewal();
      break;
    default:
      break;
  }
}
