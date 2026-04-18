import { describe, expect, it } from "vitest";
import type { LarryActionType } from "@larry/shared";
import {
  applyPatch,
  assertPatchIsAllowed,
  editableFieldsForActionType,
  isModifiableActionType,
} from "./larry-event-modifications.js";

describe("editableFieldsForActionType", () => {
  it("returns task fields for task_create", () => {
    expect(editableFieldsForActionType("task_create")).toEqual([
      "title",
      "description",
      "startDate",
      "dueDate",
      "assigneeName",
      "priority",
    ]);
  });

  it("returns single-field sets for tweak-only actions", () => {
    expect(editableFieldsForActionType("deadline_change")).toEqual(["newDeadline"]);
    expect(editableFieldsForActionType("owner_change")).toEqual(["newOwnerName"]);
    expect(editableFieldsForActionType("risk_flag")).toEqual(["riskLevel"]);
  });

  it("returns status_update fields", () => {
    expect(editableFieldsForActionType("status_update")).toEqual([
      "newStatus",
      "newRiskLevel",
    ]);
  });

  it("returns email_draft fields", () => {
    expect(editableFieldsForActionType("email_draft")).toEqual(["to", "subject", "body"]);
  });

  it("returns empty for unknown types", () => {
    expect(editableFieldsForActionType("does_not_exist")).toEqual([]);
  });

  it("returns empty for reminder_send (never modifiable)", () => {
    expect(editableFieldsForActionType("reminder_send")).toEqual([]);
  });

  it("returns a fresh copy (caller can mutate safely)", () => {
    const a = editableFieldsForActionType("task_create");
    a.push("injected");
    const b = editableFieldsForActionType("task_create");
    expect(b).not.toContain("injected");
  });

  // ── New action types added 2026-04-18 (issue #109) ──
  it("exposes editable fields for scope_change", () => {
    expect(editableFieldsForActionType("scope_change")).toEqual(["newDescription"]);
  });

  it("exposes editable fields for project_create", () => {
    expect(editableFieldsForActionType("project_create")).toEqual(["name", "description"]);
  });

  it("exposes editable fields for collaborator_add", () => {
    expect(editableFieldsForActionType("collaborator_add")).toEqual(["role"]);
  });

  it("exposes editable fields for collaborator_role_update", () => {
    expect(editableFieldsForActionType("collaborator_role_update")).toEqual(["role"]);
  });

  it("returns empty array for collaborator_remove (no editable fields, but valid)", () => {
    // Modifiable but with no editable fields — frontend renders a no-op panel.
    expect(editableFieldsForActionType("collaborator_remove")).toEqual([]);
  });

  it("exposes editable fields for project_note_send", () => {
    expect(editableFieldsForActionType("project_note_send")).toEqual(["visibility", "content"]);
  });

  it("exposes editable fields for calendar_event_create", () => {
    expect(editableFieldsForActionType("calendar_event_create")).toEqual([
      "summary",
      "startDateTime",
      "endDateTime",
    ]);
  });

  it("exposes editable fields for calendar_event_update", () => {
    expect(editableFieldsForActionType("calendar_event_update")).toEqual([
      "summary",
      "startDateTime",
      "endDateTime",
    ]);
  });

  it("exposes editable fields for slack_message_draft", () => {
    expect(editableFieldsForActionType("slack_message_draft")).toEqual([
      "channelName",
      "message",
    ]);
  });
});

describe("isModifiableActionType", () => {
  it("is true for the original 6 supported types", () => {
    for (const t of [
      "task_create",
      "status_update",
      "risk_flag",
      "deadline_change",
      "owner_change",
      "email_draft",
    ]) {
      expect(isModifiableActionType(t)).toBe(true);
    }
  });

  it("is true for collaborator_remove even though it has no editable fields", () => {
    expect(isModifiableActionType("collaborator_remove")).toBe(true);
  });

  it("is true for the 9 newly-added types (issue #109)", () => {
    for (const t of [
      "scope_change",
      "project_create",
      "collaborator_add",
      "collaborator_role_update",
      "collaborator_remove",
      "project_note_send",
      "calendar_event_create",
      "calendar_event_update",
      "slack_message_draft",
    ]) {
      expect(isModifiableActionType(t)).toBe(true);
    }
  });

  it("is false for reminder_send (intentionally not modifiable)", () => {
    expect(isModifiableActionType("reminder_send")).toBe(false);
  });

  it("is false for unknown action types", () => {
    expect(isModifiableActionType("does_not_exist")).toBe(false);
  });
});

describe("LarryActionType exhaustiveness", () => {
  // Anything in INTENTIONALLY_NOT_MODIFIABLE is excluded by design.
  // Adding a new LarryActionType without registering it here OR in
  // FIELDS_BY_ACTION_TYPE will fail this test, surfacing the drift that
  // caused issue #109 in the first place.
  const INTENTIONALLY_NOT_MODIFIABLE: ReadonlySet<LarryActionType> = new Set([
    "reminder_send", // auto-executes; never appears as a suggestion
    "other",         // free-form catch-all; nothing meaningful to edit
  ]);

  const ALL_TYPES: readonly LarryActionType[] = [
    "task_create",
    "status_update",
    "risk_flag",
    "reminder_send",
    "deadline_change",
    "owner_change",
    "scope_change",
    "email_draft",
    "project_create",
    "collaborator_add",
    "collaborator_role_update",
    "collaborator_remove",
    "project_note_send",
    "calendar_event_create",
    "calendar_event_update",
    "slack_message_draft",
    "other",
  ];

  it("every LarryActionType is either modifiable or explicitly excluded", () => {
    for (const t of ALL_TYPES) {
      const modifiable = isModifiableActionType(t);
      const excluded = INTENTIONALLY_NOT_MODIFIABLE.has(t);
      expect(
        modifiable || excluded,
        `LarryActionType '${t}' is neither modifiable nor intentionally excluded — ` +
          `add it to FIELDS_BY_ACTION_TYPE in larry-event-modifications.ts ` +
          `or to INTENTIONALLY_NOT_MODIFIABLE in this test.`
      ).toBe(true);
    }
  });
});

describe("applyPatch", () => {
  it("merges patch over payload, preserving untouched keys", () => {
    const base = { title: "A", dueDate: "2026-04-20", priority: "medium" };
    const patch = { dueDate: "2026-04-30" };
    expect(applyPatch(base, patch)).toEqual({
      title: "A",
      dueDate: "2026-04-30",
      priority: "medium",
    });
  });

  it("does not mutate the original payload", () => {
    const base = { title: "A" };
    applyPatch(base, { title: "B" });
    expect(base).toEqual({ title: "A" });
  });

  it("handles empty patch as identity", () => {
    const base = { title: "A" };
    expect(applyPatch(base, {})).toEqual({ title: "A" });
  });

  it("adds new keys that weren't in the original payload", () => {
    const base = { title: "A" };
    expect(applyPatch(base, { description: "details" })).toEqual({
      title: "A",
      description: "details",
    });
  });
});

describe("assertPatchIsAllowed", () => {
  it("accepts a patch whose keys are all editable for the action type", () => {
    expect(() =>
      assertPatchIsAllowed("task_create", { title: "A", dueDate: "2026-05-01" })
    ).not.toThrow();
  });

  it("accepts an empty patch", () => {
    expect(() => assertPatchIsAllowed("task_create", {})).not.toThrow();
  });

  it("throws on a disallowed field", () => {
    expect(() =>
      assertPatchIsAllowed("task_create", { taskId: "abc" })
    ).toThrow(/not editable.*task_create/i);
  });

  it("throws on unknown action type", () => {
    expect(() =>
      assertPatchIsAllowed("mystery_action", { anything: "x" })
    ).toThrow(/unknown action type/i);
  });

  it("throws for reminder_send even though it's a real action type (not modifiable)", () => {
    expect(() =>
      assertPatchIsAllowed("reminder_send", { message: "x" })
    ).toThrow(/unknown action type/i);
  });
});
