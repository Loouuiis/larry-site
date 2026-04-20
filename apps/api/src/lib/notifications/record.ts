import {
  NOTIFICATION_REGISTRY,
  type Notification,
  type NotificationType,
  type Severity,
} from "@larry/shared";

interface RecordArgs {
  db: {
    queryTenant: <T = unknown>(
      tid: string,
      sql: string,
      params: unknown[]
    ) => Promise<T[]>;
  };
  tenantId: string;
  userId: string | null;
  type: NotificationType;
  payload: Record<string, unknown>;
  body?: string | null;
  severityOverride?: Severity;
  batchId?: string | null;
}

export async function recordNotification(
  args: RecordArgs
): Promise<Notification> {
  const spec = NOTIFICATION_REGISTRY[args.type];
  if (!spec) {
    throw new Error(`Unknown notification type: ${args.type}`);
  }
  const severity = args.severityOverride ?? spec.defaultSeverity;
  const title = spec.renderTitle(args.payload);
  const deepLink = spec.deepLink(args.payload);
  const body = args.body ?? null;

  const [row] = await args.db.queryTenant<{ id: string; created_at: string }>(
    args.tenantId,
    `INSERT INTO notifications (
       tenant_id, user_id, channel, subject, body, metadata,
       type, severity, deep_link, batch_id,
       dedupe_scope, dedupe_user_key, dedupe_date
     )
     VALUES ($1, $2, 'ui', $3, $4, $5::jsonb, $6, $7, $8, $9,
             'ui-feed', gen_random_uuid()::text, CURRENT_DATE)
     RETURNING id, created_at`,
    [
      args.tenantId,
      args.userId,
      title,
      body,
      JSON.stringify({ payload: args.payload }),
      args.type,
      severity,
      deepLink,
      args.batchId ?? null,
    ]
  );

  return {
    id: row.id,
    tenantId: args.tenantId,
    userId: args.userId,
    type: args.type,
    severity,
    title,
    body,
    deepLink,
    batchId: args.batchId ?? null,
    payload: args.payload,
    createdAt: row.created_at,
    readAt: null,
    dismissedAt: null,
  };
}
