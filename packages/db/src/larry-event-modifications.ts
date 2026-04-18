// Pure helpers for the Modify Action flow (spec 2026-04-15-modify-action-design.md).
// No DB access; this module is safe to import from the API package and from tests.

// Action type identifiers match the canonical LarryActionType values stored in
// larry_events.action_type — NOT the chat tool names (which are different —
// e.g. the chat tool `create_task` maps to DB action_type `task_create`).
export type ModifiableActionType =
  | "task_create"
  | "status_update"
  | "risk_flag"
  | "deadline_change"
  | "owner_change"
  | "email_draft"
  | "scope_change"
  | "project_create"
  | "collaborator_add"
  | "collaborator_role_update"
  | "collaborator_remove"
  | "project_note_send"
  | "calendar_event_create"
  | "calendar_event_update"
  | "slack_message_draft";

const FIELDS_BY_ACTION_TYPE: Record<string, readonly string[]> = {
  task_create:              ["title", "description", "startDate", "dueDate", "assigneeName", "priority"],
  status_update:            ["newStatus", "newRiskLevel"],
  risk_flag:                ["riskLevel"],
  deadline_change:          ["newDeadline"],
  owner_change:             ["newOwnerName"],
  email_draft:              ["to", "subject", "body"],
  scope_change:             ["newDescription"],
  project_create:           ["name", "description"],
  collaborator_add:         ["role"],
  collaborator_role_update: ["role"],
  collaborator_remove:      [], // no editable fields — frontend renders no-op panel
  project_note_send:        ["visibility", "content"],
  calendar_event_create:    ["summary", "startDateTime", "endDateTime"],
  calendar_event_update:    ["summary", "startDateTime", "endDateTime"],
  slack_message_draft:      ["channelName", "message"],
  // reminder_send auto-executes and never appears as a suggestion; intentionally omitted.
};

export function editableFieldsForActionType(actionType: string): string[] {
  return [...(FIELDS_BY_ACTION_TYPE[actionType] ?? [])];
}

/**
 * Whether the given action type is registered as modifiable (even if its
 * editable-field list is empty). Used by the API guard so types like
 * `collaborator_remove` (no editable fields, but valid as a Modify target)
 * are not 422'd.
 */
export function isModifiableActionType(actionType: string): boolean {
  return Object.prototype.hasOwnProperty.call(FIELDS_BY_ACTION_TYPE, actionType);
}

export function applyPatch(
  payload: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  return { ...payload, ...patch };
}

export function assertPatchIsAllowed(
  actionType: string,
  patch: Record<string, unknown>,
): void {
  const allowed = FIELDS_BY_ACTION_TYPE[actionType];
  if (!allowed) {
    throw new Error(`Unknown action type '${actionType}' — cannot modify.`);
  }
  for (const key of Object.keys(patch)) {
    if (!allowed.includes(key)) {
      throw new Error(
        `Field '${key}' is not editable for action type '${actionType}'. Allowed: ${allowed.join(", ")}.`,
      );
    }
  }
}
