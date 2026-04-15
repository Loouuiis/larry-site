import { describe, expect, it } from "vitest";
import {
  applyPatch,
  assertPatchIsAllowed,
  editableFieldsForActionType,
} from "./larry-event-modifications.js";

describe("editableFieldsForActionType", () => {
  it("returns task fields for create_task", () => {
    expect(editableFieldsForActionType("create_task")).toEqual([
      "title",
      "description",
      "dueDate",
      "assigneeName",
      "priority",
    ]);
  });

  it("returns single-field sets for tweak-only actions", () => {
    expect(editableFieldsForActionType("change_deadline")).toEqual(["newDeadline"]);
    expect(editableFieldsForActionType("change_task_owner")).toEqual(["newOwnerName"]);
    expect(editableFieldsForActionType("flag_task_risk")).toEqual(["riskLevel"]);
  });

  it("returns update_task_status fields", () => {
    expect(editableFieldsForActionType("update_task_status")).toEqual([
      "newStatus",
      "newRiskLevel",
    ]);
  });

  it("returns draft_email fields", () => {
    expect(editableFieldsForActionType("draft_email")).toEqual(["to", "subject", "body"]);
  });

  it("returns empty for unknown types", () => {
    expect(editableFieldsForActionType("does_not_exist")).toEqual([]);
  });

  it("returns empty for send_reminder (never modifiable)", () => {
    expect(editableFieldsForActionType("send_reminder")).toEqual([]);
  });

  it("returns a fresh copy (caller can mutate safely)", () => {
    const a = editableFieldsForActionType("create_task");
    a.push("injected");
    const b = editableFieldsForActionType("create_task");
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
      assertPatchIsAllowed("create_task", { title: "A", dueDate: "2026-05-01" })
    ).not.toThrow();
  });

  it("accepts an empty patch", () => {
    expect(() => assertPatchIsAllowed("create_task", {})).not.toThrow();
  });

  it("throws on a disallowed field", () => {
    expect(() =>
      assertPatchIsAllowed("create_task", { taskId: "abc" })
    ).toThrow(/not editable.*create_task/i);
  });

  it("throws on unknown action type", () => {
    expect(() =>
      assertPatchIsAllowed("mystery_action", { anything: "x" })
    ).toThrow(/unknown action type/i);
  });

  it("throws for send_reminder even though it's a real action type (not modifiable)", () => {
    expect(() =>
      assertPatchIsAllowed("send_reminder", { message: "x" })
    ).toThrow(/unknown action type/i);
  });
});
