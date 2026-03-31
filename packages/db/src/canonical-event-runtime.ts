import { Db } from "./client.js";

export const CANONICAL_EVENT_RUNTIME_STATUSES = [
  "running",
  "succeeded",
  "retryable_failed",
  "dead_lettered",
] as const;

export type CanonicalEventRuntimeStatus = (typeof CANONICAL_EVENT_RUNTIME_STATUSES)[number];
export type CanonicalEventSource = "slack" | "email" | "calendar" | "transcript";
export type CanonicalEventRetryableStatus = "retryable_failed" | "dead_lettered";

export interface StartCanonicalEventProcessingAttemptInput {
  canonicalEventId: string;
  source: string;
  attemptNumber: number;
  maxAttempts: number;
  queueJobId?: string | null;
  queueJobName?: string | null;
  startedAt?: string | null;
}

export interface CanonicalEventProcessingAttemptRecord {
  id: string;
  canonicalEventId: string;
  source: string;
  status: CanonicalEventRuntimeStatus;
  attemptNumber: number;
  maxAttempts: number;
  queueJobId: string | null;
  queueJobName: string;
  startedAt: string;
}

export interface FinalizeCanonicalEventProcessingAttemptInput {
  attemptId: string;
  status: CanonicalEventRuntimeStatus;
  finishedAt?: string | null;
  errorMessage?: string | null;
  errorStack?: string | null;
  errorPayload?: Record<string, unknown> | null;
}

interface CanonicalEventRuntimeListRow {
  canonicalEventId: string;
  source: string;
  eventType: string;
  actor: string;
  occurredAt: string;
  canonicalCreatedAt: string;
  rawEventId: string | null;
  idempotencyKey: string | null;
  canonicalSiblingCount: number;
  latestAttemptId: string | null;
  latestStatus: CanonicalEventRuntimeStatus | null;
  latestAttemptNumber: number | null;
  latestMaxAttempts: number | null;
  latestQueueJobId: string | null;
  latestQueueJobName: string | null;
  latestErrorMessage: string | null;
  latestStartedAt: string | null;
  latestFinishedAt: string | null;
  latestDurationMs: number | null;
  latestUpdatedAt: string | null;
}

export interface CanonicalEventRuntimeEntry {
  canonicalEventId: string;
  source: string;
  eventType: string;
  actor: string;
  occurredAt: string;
  canonicalCreatedAt: string;
  rawEventId: string | null;
  idempotencyKey: string | null;
  canonicalSiblingCount: number;
  latestAttemptId: string | null;
  latestStatus: CanonicalEventRuntimeStatus | null;
  latestAttemptNumber: number | null;
  latestMaxAttempts: number | null;
  latestQueueJobId: string | null;
  latestQueueJobName: string | null;
  latestErrorMessage: string | null;
  latestStartedAt: string | null;
  latestFinishedAt: string | null;
  latestDurationMs: number | null;
  latestUpdatedAt: string | null;
}

export interface ListCanonicalEventRuntimeEntriesOptions {
  status?: CanonicalEventRuntimeStatus;
  source?: CanonicalEventSource;
  limit?: number;
}

interface CanonicalEventRuntimeSummaryRow {
  runningCount: number;
  succeededCount: number;
  retryableFailedCount: number;
  deadLetteredCount: number;
  unprocessedCount: number;
}

export interface CanonicalEventRuntimeSummary {
  runningCount: number;
  succeededCount: number;
  retryableFailedCount: number;
  deadLetteredCount: number;
  unprocessedCount: number;
}

interface CanonicalEventRetryCandidateRow {
  canonicalEventId: string;
  source: string;
  eventType: string;
  latestStatus: CanonicalEventRetryableStatus;
  latestAttemptNumber: number;
  latestMaxAttempts: number;
}

export interface CanonicalEventRetryCandidate {
  canonicalEventId: string;
  source: string;
  eventType: string;
  latestStatus: CanonicalEventRetryableStatus;
  latestAttemptNumber: number;
  latestMaxAttempts: number;
}

export interface ListCanonicalEventRetryCandidatesOptions {
  statuses?: CanonicalEventRetryableStatus[];
  source?: CanonicalEventSource;
  limit?: number;
}

function clampLimit(value: number | undefined, fallback: number): number {
  if (!value || Number.isNaN(value)) return fallback;
  if (value < 1) return 1;
  if (value > 100) return 100;
  return Math.floor(value);
}

export async function startCanonicalEventProcessingAttempt(
  db: Db,
  tenantId: string,
  input: StartCanonicalEventProcessingAttemptInput
): Promise<CanonicalEventProcessingAttemptRecord> {
  const rows = await db.queryTenant<{
    id: string;
    canonicalEventId: string;
    source: string;
    status: CanonicalEventRuntimeStatus;
    attemptNumber: number;
    maxAttempts: number;
    queueJobId: string | null;
    queueJobName: string;
    startedAt: string;
  }>(
    tenantId,
    `INSERT INTO canonical_event_processing_attempts
      (
        tenant_id,
        canonical_event_id,
        queue_job_id,
        queue_job_name,
        source,
        status,
        attempt_number,
        max_attempts,
        started_at
      )
     VALUES ($1, $2, $3, $4, $5, 'running', $6, $7, COALESCE($8::timestamptz, NOW()))
     RETURNING
       id,
       canonical_event_id AS "canonicalEventId",
       source,
       status,
       attempt_number AS "attemptNumber",
       max_attempts AS "maxAttempts",
       queue_job_id AS "queueJobId",
       queue_job_name AS "queueJobName",
       started_at::text AS "startedAt"`,
    [
      tenantId,
      input.canonicalEventId,
      input.queueJobId ?? null,
      input.queueJobName ?? "canonical_event.created",
      input.source,
      input.attemptNumber,
      input.maxAttempts,
      input.startedAt ?? null,
    ]
  );

  const row = rows[0];
  if (!row) {
    throw new Error("Failed to create canonical event processing attempt.");
  }

  return row;
}

export async function finalizeCanonicalEventProcessingAttempt(
  db: Db,
  tenantId: string,
  input: FinalizeCanonicalEventProcessingAttemptInput
): Promise<void> {
  await db.queryTenant(
    tenantId,
    `UPDATE canonical_event_processing_attempts
        SET status = $3,
            finished_at = COALESCE($4::timestamptz, NOW()),
            duration_ms = GREATEST(
              0,
              FLOOR(
                EXTRACT(
                  EPOCH
                  FROM (
                    COALESCE($4::timestamptz, NOW()) - started_at
                  )
                ) * 1000
              )::int
            ),
            error_message = $5,
            error_stack = $6,
            error_payload = COALESCE($7::jsonb, '{}'::jsonb),
            updated_at = NOW()
      WHERE tenant_id = $1
        AND id = $2`,
    [
      tenantId,
      input.attemptId,
      input.status,
      input.finishedAt ?? null,
      input.errorMessage ?? null,
      input.errorStack ?? null,
      input.errorPayload ? JSON.stringify(input.errorPayload) : null,
    ]
  );
}

function mapRuntimeListRow(row: CanonicalEventRuntimeListRow): CanonicalEventRuntimeEntry {
  return {
    canonicalEventId: row.canonicalEventId,
    source: row.source,
    eventType: row.eventType,
    actor: row.actor,
    occurredAt: row.occurredAt,
    canonicalCreatedAt: row.canonicalCreatedAt,
    rawEventId: row.rawEventId,
    idempotencyKey: row.idempotencyKey,
    canonicalSiblingCount: row.canonicalSiblingCount,
    latestAttemptId: row.latestAttemptId,
    latestStatus: row.latestStatus,
    latestAttemptNumber: row.latestAttemptNumber,
    latestMaxAttempts: row.latestMaxAttempts,
    latestQueueJobId: row.latestQueueJobId,
    latestQueueJobName: row.latestQueueJobName,
    latestErrorMessage: row.latestErrorMessage,
    latestStartedAt: row.latestStartedAt,
    latestFinishedAt: row.latestFinishedAt,
    latestDurationMs: row.latestDurationMs,
    latestUpdatedAt: row.latestUpdatedAt,
  };
}

export async function listCanonicalEventRuntimeEntries(
  db: Db,
  tenantId: string,
  options: ListCanonicalEventRuntimeEntriesOptions = {}
): Promise<CanonicalEventRuntimeEntry[]> {
  const limit = clampLimit(options.limit, 25);
  const values: unknown[] = [tenantId];
  const filters = ["ce.tenant_id = $1"];

  if (options.source) {
    values.push(options.source);
    filters.push(`ce.source = $${values.length}`);
  }
  if (options.status) {
    values.push(options.status);
    filters.push(`la.status = $${values.length}`);
  }
  values.push(limit);

  const rows = await db.queryTenant<CanonicalEventRuntimeListRow>(
    tenantId,
    `WITH latest_attempts AS (
       SELECT DISTINCT ON (tenant_id, canonical_event_id)
         id,
         tenant_id,
         canonical_event_id,
         status,
         attempt_number,
         max_attempts,
         queue_job_id,
         queue_job_name,
         error_message,
         started_at,
         finished_at,
         duration_ms,
         updated_at
       FROM canonical_event_processing_attempts
       WHERE tenant_id = $1
       ORDER BY tenant_id, canonical_event_id, attempt_number DESC, created_at DESC
     ),
     sibling_counts AS (
       SELECT raw_event_id, COUNT(*)::int AS canonical_sibling_count
       FROM canonical_events
       WHERE tenant_id = $1
       GROUP BY raw_event_id
     )
     SELECT
       ce.id AS "canonicalEventId",
       ce.source AS source,
       ce.event_type AS "eventType",
       ce.actor AS actor,
       ce.occurred_at::text AS "occurredAt",
       ce.created_at::text AS "canonicalCreatedAt",
       ce.raw_event_id AS "rawEventId",
       re.idempotency_key AS "idempotencyKey",
       COALESCE(sc.canonical_sibling_count, 1) AS "canonicalSiblingCount",
       la.id AS "latestAttemptId",
       la.status AS "latestStatus",
       la.attempt_number AS "latestAttemptNumber",
       la.max_attempts AS "latestMaxAttempts",
       la.queue_job_id AS "latestQueueJobId",
       la.queue_job_name AS "latestQueueJobName",
       la.error_message AS "latestErrorMessage",
       la.started_at::text AS "latestStartedAt",
       la.finished_at::text AS "latestFinishedAt",
       la.duration_ms AS "latestDurationMs",
       la.updated_at::text AS "latestUpdatedAt"
     FROM canonical_events ce
     LEFT JOIN raw_events re
       ON re.id = ce.raw_event_id
      AND re.tenant_id = ce.tenant_id
     LEFT JOIN sibling_counts sc
       ON sc.raw_event_id = ce.raw_event_id
     LEFT JOIN latest_attempts la
       ON la.canonical_event_id = ce.id
      AND la.tenant_id = ce.tenant_id
     WHERE ${filters.join(" AND ")}
     ORDER BY COALESCE(la.updated_at, ce.created_at) DESC
     LIMIT $${values.length}`,
    values
  );

  return rows.map(mapRuntimeListRow);
}

export async function getCanonicalEventRuntimeEntryById(
  db: Db,
  tenantId: string,
  canonicalEventId: string
): Promise<CanonicalEventRuntimeEntry | null> {
  const rows = await db.queryTenant<CanonicalEventRuntimeListRow>(
    tenantId,
    `WITH latest_attempts AS (
       SELECT DISTINCT ON (tenant_id, canonical_event_id)
         id,
         tenant_id,
         canonical_event_id,
         status,
         attempt_number,
         max_attempts,
         queue_job_id,
         queue_job_name,
         error_message,
         started_at,
         finished_at,
         duration_ms,
         updated_at
       FROM canonical_event_processing_attempts
       WHERE tenant_id = $1
       ORDER BY tenant_id, canonical_event_id, attempt_number DESC, created_at DESC
     ),
     sibling_counts AS (
       SELECT raw_event_id, COUNT(*)::int AS canonical_sibling_count
       FROM canonical_events
       WHERE tenant_id = $1
       GROUP BY raw_event_id
     )
     SELECT
       ce.id AS "canonicalEventId",
       ce.source AS source,
       ce.event_type AS "eventType",
       ce.actor AS actor,
       ce.occurred_at::text AS "occurredAt",
       ce.created_at::text AS "canonicalCreatedAt",
       ce.raw_event_id AS "rawEventId",
       re.idempotency_key AS "idempotencyKey",
       COALESCE(sc.canonical_sibling_count, 1) AS "canonicalSiblingCount",
       la.id AS "latestAttemptId",
       la.status AS "latestStatus",
       la.attempt_number AS "latestAttemptNumber",
       la.max_attempts AS "latestMaxAttempts",
       la.queue_job_id AS "latestQueueJobId",
       la.queue_job_name AS "latestQueueJobName",
       la.error_message AS "latestErrorMessage",
       la.started_at::text AS "latestStartedAt",
       la.finished_at::text AS "latestFinishedAt",
       la.duration_ms AS "latestDurationMs",
       la.updated_at::text AS "latestUpdatedAt"
     FROM canonical_events ce
     LEFT JOIN raw_events re
       ON re.id = ce.raw_event_id
      AND re.tenant_id = ce.tenant_id
     LEFT JOIN sibling_counts sc
       ON sc.raw_event_id = ce.raw_event_id
     LEFT JOIN latest_attempts la
       ON la.canonical_event_id = ce.id
      AND la.tenant_id = ce.tenant_id
     WHERE ce.tenant_id = $1
       AND ce.id = $2
     LIMIT 1`,
    [tenantId, canonicalEventId]
  );

  const row = rows[0];
  if (!row) return null;
  return mapRuntimeListRow(row);
}

export async function getCanonicalEventRuntimeSummary(
  db: Db,
  tenantId: string,
  options: { source?: CanonicalEventSource } = {}
): Promise<CanonicalEventRuntimeSummary> {
  const values: unknown[] = [tenantId];
  const filters = ["ce.tenant_id = $1"];

  if (options.source) {
    values.push(options.source);
    filters.push(`ce.source = $${values.length}`);
  }

  const rows = await db.queryTenant<CanonicalEventRuntimeSummaryRow>(
    tenantId,
    `WITH latest_attempts AS (
       SELECT DISTINCT ON (tenant_id, canonical_event_id)
         tenant_id,
         canonical_event_id,
         status
       FROM canonical_event_processing_attempts
       WHERE tenant_id = $1
       ORDER BY tenant_id, canonical_event_id, attempt_number DESC, created_at DESC
     )
     SELECT
       COUNT(*) FILTER (WHERE la.status = 'running')::int AS "runningCount",
       COUNT(*) FILTER (WHERE la.status = 'succeeded')::int AS "succeededCount",
       COUNT(*) FILTER (WHERE la.status = 'retryable_failed')::int AS "retryableFailedCount",
       COUNT(*) FILTER (WHERE la.status = 'dead_lettered')::int AS "deadLetteredCount",
       COUNT(*) FILTER (WHERE la.status IS NULL)::int AS "unprocessedCount"
     FROM canonical_events ce
     LEFT JOIN latest_attempts la
       ON la.canonical_event_id = ce.id
      AND la.tenant_id = ce.tenant_id
     WHERE ${filters.join(" AND ")}`,
    values
  );

  const row = rows[0];
  return {
    runningCount: row?.runningCount ?? 0,
    succeededCount: row?.succeededCount ?? 0,
    retryableFailedCount: row?.retryableFailedCount ?? 0,
    deadLetteredCount: row?.deadLetteredCount ?? 0,
    unprocessedCount: row?.unprocessedCount ?? 0,
  };
}

export async function listCanonicalEventRetryCandidates(
  db: Db,
  tenantId: string,
  options: ListCanonicalEventRetryCandidatesOptions = {}
): Promise<CanonicalEventRetryCandidate[]> {
  const limit = clampLimit(options.limit, 25);
  const statuses =
    options.statuses && options.statuses.length > 0
      ? options.statuses
      : (["retryable_failed", "dead_lettered"] as CanonicalEventRetryableStatus[]);

  const values: unknown[] = [tenantId];
  const filters = ["ce.tenant_id = $1"];

  if (options.source) {
    values.push(options.source);
    filters.push(`ce.source = $${values.length}`);
  }

  values.push(statuses);
  filters.push(`la.status = ANY($${values.length}::text[])`);

  values.push(limit);

  const rows = await db.queryTenant<CanonicalEventRetryCandidateRow>(
    tenantId,
    `WITH latest_attempts AS (
       SELECT DISTINCT ON (tenant_id, canonical_event_id)
         tenant_id,
         canonical_event_id,
         status,
         attempt_number,
         max_attempts,
         updated_at
       FROM canonical_event_processing_attempts
       WHERE tenant_id = $1
       ORDER BY tenant_id, canonical_event_id, attempt_number DESC, created_at DESC
     )
     SELECT
       ce.id AS "canonicalEventId",
       ce.source AS source,
       ce.event_type AS "eventType",
       la.status AS "latestStatus",
       la.attempt_number AS "latestAttemptNumber",
       la.max_attempts AS "latestMaxAttempts"
     FROM canonical_events ce
     JOIN latest_attempts la
       ON la.canonical_event_id = ce.id
      AND la.tenant_id = ce.tenant_id
     WHERE ${filters.join(" AND ")}
     ORDER BY la.updated_at DESC
     LIMIT $${values.length}`,
    values
  );

  return rows.map((row) => ({
    canonicalEventId: row.canonicalEventId,
    source: row.source,
    eventType: row.eventType,
    latestStatus: row.latestStatus,
    latestAttemptNumber: row.latestAttemptNumber,
    latestMaxAttempts: row.latestMaxAttempts,
  }));
}
