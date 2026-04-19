export interface ActionTypeTag {
  key: string;
  label: string;
  color: string;
}

const ACTION_TYPE_MAP: Record<string, ActionTypeTag> = {
  task_create:              { key: "task_create",              label: "Create Task",          color: "#6c44f6" },
  status_update:            { key: "status_update",            label: "Status Update",        color: "#0891b2" },
  risk_flag:                { key: "risk_flag",                label: "Risk Flag",            color: "#dc2626" },
  reminder_send:            { key: "reminder_send",            label: "Reminder",             color: "#f59e0b" },
  deadline_change:          { key: "deadline_change",          label: "Deadline Change",      color: "#ea580c" },
  owner_change:             { key: "owner_change",             label: "Owner Change",         color: "#8b5cf6" },
  scope_change:             { key: "scope_change",             label: "Scope Change",         color: "#7c3aed" },
  email_draft:              { key: "email_draft",              label: "Email Draft",          color: "#4f46e5" },
  project_create:           { key: "project_create",           label: "Create Project",       color: "#6c44f6" },
  collaborator_add:         { key: "collaborator_add",         label: "Add Collaborator",     color: "#2563eb" },
  collaborator_role_update: { key: "collaborator_role_update", label: "Update Role",          color: "#2563eb" },
  collaborator_remove:      { key: "collaborator_remove",      label: "Remove Collaborator",  color: "#64748b" },
  project_note_send:        { key: "project_note_send",        label: "Project Note",         color: "#0d9488" },
  calendar_event_create:    { key: "calendar_event_create",    label: "Create Event",         color: "#2563eb" },
  calendar_event_update:    { key: "calendar_event_update",    label: "Update Event",         color: "#2563eb" },
  slack_message_draft:      { key: "slack_message_draft",      label: "Slack Draft",          color: "#e11d8f" },
  timeline_regroup:         { key: "timeline_regroup",         label: "Reorganise Timeline",  color: "#6c44f6" },
  timeline_categorise:      { key: "timeline_categorise",      label: "New Category",         color: "#6c44f6" },
  timeline_recolour:        { key: "timeline_recolour",        label: "Category Colour",      color: "#6c44f6" },
  other:                    { key: "other",                    label: "Other",                color: "#64748b" },
};

export function getActionTypeTag(actionType: string): ActionTypeTag {
  return ACTION_TYPE_MAP[actionType] ?? ACTION_TYPE_MAP.other;
}

export function getAllActionTypes(): ActionTypeTag[] {
  return Object.values(ACTION_TYPE_MAP);
}
