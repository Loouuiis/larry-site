import type { NotificationType, Severity } from "./types.js";

export interface NotificationSpec {
  defaultSeverity: Severity;
  deepLink: (payload: any) => string;
  renderTitle: (payload: any) => string;
}

export const NOTIFICATION_REGISTRY: Record<NotificationType, NotificationSpec> = {
  "task.created": {
    defaultSeverity: "success",
    deepLink: (p: { taskId: string; projectId: string }) =>
      `/workspace/projects/${p.projectId}/tasks/${p.taskId}`,
    renderTitle: (p: { title: string }) => `Task created: ${p.title}`,
  },
  "task.updated": {
    defaultSeverity: "info",
    deepLink: (p: { taskId: string; projectId: string }) =>
      `/workspace/projects/${p.projectId}/tasks/${p.taskId}`,
    renderTitle: (p: { title: string }) => `Task updated: ${p.title}`,
  },
  "task.deleted": {
    defaultSeverity: "warning",
    deepLink: (p: { projectId: string }) => `/workspace/projects/${p.projectId}`,
    renderTitle: (p: { title: string }) => `Task deleted: ${p.title}`,
  },
  "email.drafted": {
    defaultSeverity: "success",
    deepLink: (p: { draftId: string }) => `/workspace/mail/drafts/${p.draftId}`,
    renderTitle: (p: { recipient: string }) => `Email drafted for ${p.recipient}`,
  },
  "email.sent": {
    defaultSeverity: "success",
    deepLink: (p: { messageId: string }) => `/workspace/mail/sent/${p.messageId}`,
    renderTitle: (p: { recipient: string }) => `Email sent to ${p.recipient}`,
  },
  "email.failed": {
    defaultSeverity: "error",
    deepLink: (p: { draftId: string }) => `/workspace/mail/drafts/${p.draftId}`,
    renderTitle: (p: { recipient: string }) =>
      `Email failed to send to ${p.recipient}`,
  },
  "invite.sent": {
    defaultSeverity: "success",
    deepLink: () => `/workspace/members`,
    renderTitle: (p: { email: string }) => `Invite sent to ${p.email}`,
  },
  "invite.accepted": {
    defaultSeverity: "success",
    deepLink: () => `/workspace/members`,
    renderTitle: (p: { email: string }) => `${p.email} joined the workspace`,
  },
  "scan.completed": {
    defaultSeverity: "info",
    deepLink: () => `/workspace/actions`,
    renderTitle: (p: { changeCount: number }) =>
      `Larry scan complete — ${p.changeCount} change${p.changeCount === 1 ? "" : "s"}`,
  },
  "scan.failed": {
    defaultSeverity: "error",
    deepLink: () => `/workspace/actions`,
    renderTitle: () => `Larry scan failed`,
  },
  "action.executed": {
    defaultSeverity: "success",
    deepLink: (p: { actionId: string }) => `/workspace/actions?focus=${p.actionId}`,
    renderTitle: (p: { label: string }) => `Executed: ${p.label}`,
  },
  "action.failed": {
    defaultSeverity: "error",
    deepLink: (p: { actionId: string }) => `/workspace/actions?focus=${p.actionId}`,
    renderTitle: (p: { label: string }) => `Action failed: ${p.label}`,
  },
};
