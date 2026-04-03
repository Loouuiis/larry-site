export interface ActionTypeTag {
  key: string;
  label: string;
  color: string;
}

const ACTION_TYPE_MAP: Record<string, ActionTypeTag> = {
  create_task:       { key: "create_task",       label: "Creates Task",         color: "#6c44f6" },
  update_task:       { key: "update_task",       label: "Updates Task",         color: "#8b6cf6" },
  draft_email:       { key: "draft_email",       label: "Drafts Email",         color: "#4f46e5" },
  draft_document:    { key: "draft_document",    label: "Drafts Document",      color: "#7c3aed" },
  schedule_meeting:  { key: "schedule_meeting",  label: "Schedules Meeting",    color: "#2563eb" },
  update_status:     { key: "update_status",     label: "Updates Status",       color: "#0891b2" },
  send_notification: { key: "send_notification", label: "Sends Notification",   color: "#0d9488" },
  other:             { key: "other",             label: "Other",                color: "#64748b" },
};

export function getActionTypeTag(actionType: string): ActionTypeTag {
  return ACTION_TYPE_MAP[actionType] ?? ACTION_TYPE_MAP.other;
}

export function getAllActionTypes(): ActionTypeTag[] {
  return Object.values(ACTION_TYPE_MAP);
}
