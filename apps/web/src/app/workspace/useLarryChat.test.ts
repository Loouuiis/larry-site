import { describe, it, expect } from "vitest";
import {
  pickLatestConversationForScope,
  isScopeMismatchConflict,
} from "./useLarryChat";

describe("pickLatestConversationForScope", () => {
  type Convo = { id: string; projectId: string | null };

  const global1: Convo = { id: "g1", projectId: null };
  const global2: Convo = { id: "g2", projectId: null };
  const projA1: Convo = { id: "a1", projectId: "project-a" };
  const projA2: Convo = { id: "a2", projectId: "project-a" };
  const projB1: Convo = { id: "b1", projectId: "project-b" };

  it("returns null when list is empty", () => {
    expect(pickLatestConversationForScope<Convo>([])).toBeNull();
    expect(pickLatestConversationForScope<Convo>([], "project-a")).toBeNull();
  });

  it("picks the first global conversation when projectId is undefined", () => {
    // Regression test for B-001: when the FAB opens on the workspace root we
    // must NOT pick a project conversation even if it is the most recent one.
    expect(pickLatestConversationForScope([projA1, global1, global2])).toBe(global1);
  });

  it("ignores project conversations when requesting global scope", () => {
    expect(pickLatestConversationForScope([projA1, projB1])).toBeNull();
  });

  it("picks the first matching project conversation when projectId is provided", () => {
    expect(pickLatestConversationForScope([global1, projA1, projA2], "project-a")).toBe(projA1);
  });

  it("ignores conversations for other projects", () => {
    expect(pickLatestConversationForScope([projA1, projB1], "project-b")).toBe(projB1);
    expect(pickLatestConversationForScope([global1, projA1], "project-b")).toBeNull();
  });
});

describe("isScopeMismatchConflict", () => {
  it("returns false for non-409 statuses", () => {
    expect(isScopeMismatchConflict(200, "anything")).toBe(false);
    expect(isScopeMismatchConflict(400, "cannot reuse a project conversation")).toBe(false);
    expect(isScopeMismatchConflict(500, "cannot reuse a project conversation")).toBe(false);
  });

  it("returns false for 409 without scope-mismatch text", () => {
    expect(isScopeMismatchConflict(409, "Something else")).toBe(false);
    expect(isScopeMismatchConflict(409, null)).toBe(false);
    expect(isScopeMismatchConflict(409, "")).toBe(false);
    expect(isScopeMismatchConflict(409, undefined)).toBe(false);
  });

  it("detects the global-side 409 wording", () => {
    expect(
      isScopeMismatchConflict(409, "Global chat cannot reuse a project conversation.")
    ).toBe(true);
  });

  it("detects the project-side 409 wording", () => {
    expect(
      isScopeMismatchConflict(409, "Project chat cannot reuse a global conversation.")
    ).toBe(true);
  });

  it("is case-insensitive and substring-tolerant", () => {
    expect(
      isScopeMismatchConflict(409, '{"message":"CANNOT REUSE A PROJECT CONVERSATION"}')
    ).toBe(true);
  });
});
