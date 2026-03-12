import { createHash } from "node:crypto";
import { CanonicalEvent } from "../../types/domain.js";

export interface RawIngestPayload {
  source: "slack" | "email" | "calendar" | "transcript";
  sourceEventId: string;
  actor?: string;
  occurredAt?: string;
  payload: Record<string, unknown>;
}

export function computeIdempotencyKey(
  tenantId: string,
  source: RawIngestPayload["source"],
  sourceEventId: string,
  payload: Record<string, unknown>
): string {
  const hash = createHash("sha256");
  hash.update(`${tenantId}:${source}:${sourceEventId}:${JSON.stringify(payload)}`);
  return hash.digest("hex");
}

export function normalizeRawEvent(tenantId: string, raw: RawIngestPayload): CanonicalEvent {
  const bodyText = JSON.stringify(raw.payload).toLowerCase();

  let eventType: CanonicalEvent["eventType"] = "other";
  if (/blocked|issue|stuck|delay/.test(bodyText)) eventType = "blocker";
  else if (/done|completed|shipped|closed/.test(bodyText)) eventType = "progress";
  else if (/decide|approved|decision/.test(bodyText)) eventType = "decision";
  else if (/will|todo|action|follow up|deadline/.test(bodyText)) eventType = "commitment";
  else if (/\?/.test(bodyText)) eventType = "question";

  return {
    id: crypto.randomUUID(),
    tenantId,
    source: raw.source,
    sourceEventId: raw.sourceEventId,
    eventType,
    actor: raw.actor ?? "unknown",
    occurredAt: raw.occurredAt ?? new Date().toISOString(),
    payload: raw.payload,
    confidence: eventType === "other" ? 0.55 : 0.8,
  };
}
