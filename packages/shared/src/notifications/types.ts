export type Severity = "info" | "success" | "warning" | "error";

export type NotificationType =
  | "task.created"
  | "task.updated"
  | "task.deleted"
  | "email.drafted"
  | "email.sent"
  | "email.failed"
  | "invite.sent"
  | "invite.accepted"
  | "scan.completed"
  | "scan.failed"
  | "action.executed"
  | "action.failed";

export interface Notification {
  id: string;
  tenantId: string;
  userId: string | null;
  type: NotificationType;
  severity: Severity;
  title: string;
  body: string | null;
  deepLink: string;
  batchId: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
  readAt: string | null;
  dismissedAt: string | null;
}

export interface NotificationBatch {
  batchId: string;
  headline: string;
  count: number;
  createdAt: string;
  items: Notification[];
}

export type FeedRow =
  | { kind: "single"; notification: Notification }
  | { kind: "batch"; batch: NotificationBatch };
