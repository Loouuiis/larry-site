import type { NotificationType, Severity } from "@larry/shared";
import type { Db } from "@larry/db";
import { recordNotification } from "./record.js";

interface SafeArgs {
  db: Db;
  tenantId: string;
  userId: string | null;
  type: NotificationType;
  payload: Record<string, unknown>;
  body?: string | null;
  severityOverride?: Severity;
  batchId?: string | null;
  logger?: { error: (err: unknown, msg?: string) => void };
}

export async function notifySafe(args: SafeArgs): Promise<void> {
  try {
    await recordNotification({
      db: args.db,
      tenantId: args.tenantId,
      userId: args.userId,
      type: args.type,
      payload: args.payload,
      body: args.body ?? null,
      severityOverride: args.severityOverride,
      batchId: args.batchId ?? null,
    });
  } catch (err) {
    args.logger?.error(err, "notifySafe failed");
  }
}
