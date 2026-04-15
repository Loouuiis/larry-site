// Pure helpers for the Modify Action flow (spec 2026-04-15-modify-action-design.md).
// No DB access; this module is safe to import from the API package and from tests.

export type ModifiableActionType =
  | "create_task"
  | "update_task_status"
  | "flag_task_risk"
  | "change_deadline"
  | "change_task_owner"
  | "draft_email";

const FIELDS_BY_ACTION_TYPE: Record<string, readonly string[]> = {
  create_task:        ["title", "description", "dueDate", "assigneeName", "priority"],
  update_task_status: ["newStatus", "newRiskLevel"],
  flag_task_risk:     ["riskLevel"],
  change_deadline:    ["newDeadline"],
  change_task_owner:  ["newOwnerName"],
  draft_email:        ["to", "subject", "body"],
  // send_reminder auto-executes and never appears as a suggestion; intentionally omitted.
};

export function editableFieldsForActionType(actionType: string): string[] {
  return [...(FIELDS_BY_ACTION_TYPE[actionType] ?? [])];
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
