import { Job } from "bullmq";
import {
  finalizeCanonicalEventProcessingAttempt,
  reapStalledProcessingAttempts,
  startCanonicalEventProcessingAttempt,
  type CanonicalEventRuntimeStatus,
} from "@larry/db";
import { QueueMessage } from "@larry/shared";
import { runEscalationScan } from "./escalation.js";
import { runCalendarWebhookRenewal } from "./calendar-renewal.js";
import { runLarryScan } from "./larry-scan.js";
import { handleCanonicalEventCreated } from "./canonical-event.js";
import { db } from "./context.js";
import { sanitizeErrorMessageForUser } from "./error-sanitizer.js";

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

    const rawMessage = error instanceof Error ? error.message : String(error);
    // The sanitized message is what the UI sees; the raw message still lives
    // in error_stack + error_payload for engineering diagnosis.
    await finalizeCanonicalEventProcessingAttempt(db, job.data.tenantId, {
      attemptId: attempt.id,
      status,
      errorMessage: sanitizeErrorMessageForUser(rawMessage),
      errorStack: error instanceof Error ? (error.stack ?? null) : null,
      errorPayload: { ...toErrorPayload(error), rawMessage },
    }).catch((finalizeError) => {
      const reason = finalizeError instanceof Error ? finalizeError.message : String(finalizeError);
      console.warn(
        `[worker] failed to finalize canonical_event attempt as ${status} (attemptId=${attempt.id}): ${reason}`
      );
    });

    throw error;
  }
}

async function runStalledAttemptReaper(): Promise<void> {
  // QA-2026-04-12 I-3/I-4: sweep any attempt stuck in "running" older than
  // 15 minutes. Typical transcript job completes well inside that window;
  // anything longer is almost certainly a dead worker, not slow progress.
  const reaped = await reapStalledProcessingAttempts(db, { staleAfterMinutes: 15 });
  if (reaped.length > 0) {
    console.warn(
      `[worker] stalled-attempt reaper marked ${reaped.length} attempt(s) as dead_lettered`,
      { ids: reaped.map((r) => r.id), sources: reaped.map((r) => r.source) }
    );
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
    case "runtime.reap":
      await runStalledAttemptReaper();
      break;
    default:
      break;
  }
}
