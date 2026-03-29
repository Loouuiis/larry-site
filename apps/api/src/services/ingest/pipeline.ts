import type { FastifyInstance } from "fastify";
import type { CanonicalEvent, CanonicalEventCreatedPayload } from "@larry/shared";
import { computeIdempotencyKey, normalizeRawEvent } from "./normalizer.js";

export type IngestSource = "slack" | "email" | "calendar" | "transcript";

export interface IngestEventInput {
  source: IngestSource;
  sourceEventId: string;
  actor?: string;
  occurredAt?: string;
  payload: Record<string, unknown>;
}

export interface IngestEventResult {
  canonicalEventId: string;
  idempotencyKey: string;
}

export interface IngestEventInsertResult extends IngestEventResult {
  source: IngestSource;
  eventType: CanonicalEvent["eventType"];
}

interface TenantSqlExecutor {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[]
  ): Promise<{ rows: T[] }>;
}

export async function insertCanonicalEventRecords(
  executor: TenantSqlExecutor,
  tenantId: string,
  input: IngestEventInput
): Promise<IngestEventInsertResult> {
  const idempotencyKey = computeIdempotencyKey(
    tenantId,
    input.source,
    input.sourceEventId,
    input.payload
  );

  const rawResult = await executor.query<{ id: string }>(
    `INSERT INTO raw_events (tenant_id, source, source_event_id, payload, idempotency_key)
     VALUES ($1, $2, $3, $4::jsonb, $5)
     ON CONFLICT (tenant_id, idempotency_key) DO UPDATE SET source_event_id = EXCLUDED.source_event_id
     RETURNING id`,
    [
      tenantId,
      input.source,
      input.sourceEventId,
      JSON.stringify(input.payload),
      idempotencyKey,
    ]
  );

  const canonical = normalizeRawEvent(tenantId, {
    source: input.source,
    sourceEventId: input.sourceEventId,
    actor: input.actor,
    occurredAt: input.occurredAt,
    payload: input.payload,
  });

  await executor.query(
    `INSERT INTO canonical_events
      (id, tenant_id, raw_event_id, source, source_event_id, event_type, actor, confidence, occurred_at, payload)
     VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
    [
      canonical.id,
      canonical.tenantId,
      rawResult.rows[0].id,
      canonical.source,
      canonical.sourceEventId,
      canonical.eventType,
      canonical.actor,
      canonical.confidence,
      canonical.occurredAt,
      JSON.stringify(canonical.payload),
    ]
  );

  return {
    canonicalEventId: canonical.id,
    idempotencyKey,
    source: canonical.source,
    eventType: canonical.eventType,
  };
}

export async function publishCanonicalEventCreated(
  app: FastifyInstance,
  tenantId: string,
  result: IngestEventInsertResult
): Promise<void> {
  const payload: CanonicalEventCreatedPayload = {
    canonicalEventId: result.canonicalEventId,
    source: result.source,
    eventType: result.eventType,
  };

  await app.queue.publish({
    type: "canonical_event.created",
    tenantId,
    dedupeKey: result.idempotencyKey,
    payload,
  });
}

export async function ingestCanonicalEvent(
  app: FastifyInstance,
  tenantId: string,
  input: IngestEventInput
): Promise<IngestEventResult> {
  const result = await app.db.tx(async (client) => {
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    return insertCanonicalEventRecords(client, tenantId, input);
  });

  await publishCanonicalEventCreated(app, tenantId, result);

  return {
    canonicalEventId: result.canonicalEventId,
    idempotencyKey: result.idempotencyKey,
  };
}
