import { createHash } from "node:crypto";
import { Db } from "../db/client.js";

export interface AuditWriteInput {
  tenantId: string;
  actorUserId?: string;
  actionType: string;
  objectType: string;
  objectId: string;
  details?: Record<string, unknown>;
}

export async function writeAuditLog(db: Db, input: AuditWriteInput): Promise<void> {
  const previous = await db.queryTenant<{ entry_hash: string | null }>(
    input.tenantId,
    "SELECT entry_hash FROM audit_log WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1",
    [input.tenantId]
  );

  const previousHash = previous[0]?.entry_hash ?? null;
  const payload = JSON.stringify({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    actionType: input.actionType,
    objectType: input.objectType,
    objectId: input.objectId,
    details: input.details ?? {},
    previousHash,
  });

  const entryHash = createHash("sha256").update(payload).digest("hex");

  await db.queryTenant(
    input.tenantId,
    `INSERT INTO audit_log (tenant_id, actor_user_id, action_type, object_type, object_id, details, previous_hash, entry_hash)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
    [
      input.tenantId,
      input.actorUserId ?? null,
      input.actionType,
      input.objectType,
      input.objectId,
      JSON.stringify(input.details ?? {}),
      previousHash,
      entryHash,
    ]
  );
}
