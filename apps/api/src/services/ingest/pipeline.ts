import type { FastifyInstance } from "fastify";
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

export async function ingestCanonicalEvent(
  app: FastifyInstance,
  tenantId: string,
  input: IngestEventInput
): Promise<IngestEventResult> {
  const idempotencyKey = computeIdempotencyKey(
    tenantId,
    input.source,
    input.sourceEventId,
    input.payload
  );

  const rawRows = await app.db.queryTenant<{ id: string }>(
    tenantId,
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

  await app.db.queryTenant(
    tenantId,
    `INSERT INTO canonical_events
      (id, tenant_id, raw_event_id, source, source_event_id, event_type, actor, confidence, occurred_at, payload)
     VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
    [
      canonical.id,
      canonical.tenantId,
      rawRows[0].id,
      canonical.source,
      canonical.sourceEventId,
      canonical.eventType,
      canonical.actor,
      canonical.confidence,
      canonical.occurredAt,
      JSON.stringify(canonical.payload),
    ]
  );

  await app.queue.publish({
    type: "canonical_event.created",
    tenantId,
    dedupeKey: idempotencyKey,
    payload: {
      canonicalEventId: canonical.id,
      source: canonical.source,
      eventType: canonical.eventType,
    },
  });

  return { canonicalEventId: canonical.id, idempotencyKey };
}
