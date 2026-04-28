import {
  NOTIFICATION_REGISTRY,
  type NotificationType,
  type Severity,
} from "@larry/shared";
import { db } from "./context.js";

interface SafeArgs {
  tenantId: string;
  userId: string | null;
  type: NotificationType;
  payload: Record<string, unknown>;
  body?: string | null;
  severityOverride?: Severity;
  batchId?: string | null;
}

export async function notifySafe(args: SafeArgs): Promise<void> {
  try {
    const spec = NOTIFICATION_REGISTRY[args.type];
    if (!spec) return;
    const severity = args.severityOverride ?? spec.defaultSeverity;
    const title = spec.renderTitle(args.payload);
    const deepLink = spec.deepLink(args.payload);
    await db.queryTenant(
      args.tenantId,
      `INSERT INTO notifications (
         tenant_id, user_id, channel, subject, body, metadata,
         type, severity, deep_link, batch_id,
         dedupe_scope, dedupe_user_key, dedupe_date
       )
       VALUES ($1, $2, 'ui', $3, $4, $5::jsonb, $6, $7, $8, $9,
               'ui-feed', gen_random_uuid()::text, CURRENT_DATE)`,
      [
        args.tenantId,
        args.userId,
        title,
        // notifications.body is TEXT NOT NULL — coerce to "" so callers
        // that only provide a title (scan.completed, scan.failed, etc.)
        // don't trip the constraint and get silently dropped.
        args.body ?? "",
        JSON.stringify({ payload: args.payload }),
        args.type,
        severity,
        deepLink,
        args.batchId ?? null,
      ]
    );
  } catch (err) {
    console.warn(
      `[worker:notifySafe] failed to write ${args.type}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
