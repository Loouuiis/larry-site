import { describe, expect, it } from "vitest";
import {
  applyPatch,
  assertPatchIsAllowed,
  editableFieldsForActionType,
} from "./larry-event-modifications.js";

describe("editableFieldsForActionType", () => {
  it("returns task fields for task_create", () => {
    expect(editableFieldsForActionType("task_create")).toEqual([
      "title",
      "description",
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
