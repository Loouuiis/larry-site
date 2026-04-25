import { describe, it, expect } from "vitest";
import { NOTIFICATION_REGISTRY } from "./registry.js";
import type { NotificationType } from "./types.js";

const ALL_TYPES: NotificationType[] = [
  "task.created",
  "task.updated",
  "task.deleted",
  "email.drafted",
  "email.sent",
  "email.failed",
  "invite.sent",
  "invite.accepted",
  "scan.completed",
  "scan.failed",
  "action.executed",
  "action.failed",
];

describe("NOTIFICATION_REGISTRY", () => {
  it("has a spec for every NotificationType", () => {
    for (const t of ALL_TYPES) {
      expect(NOTIFICATION_REGISTRY[t], `missing: ${t}`).toBeTruthy();
    }
  });

  it("email.drafted deep-links to the draft", () => {
    const spec = NOTIFICATION_REGISTRY["email.drafted"];
    expect(spec.deepLink({ draftId: "abc" })).toBe("/workspace/mail/drafts/abc");
  });

  it("task.created deep-links to the task in its project", () => {
    const spec = NOTIFICATION_REGISTRY["task.created"];
    expect(spec.deepLink({ taskId: "t1", projectId: "p1" })).toBe(
      "/workspace/projects/p1/tasks/t1"
    );
  });

  it("renderTitle uses payload", () => {
    const spec = NOTIFICATION_REGISTRY["task.created"];
    expect(spec.renderTitle({ title: "Finalise deck" })).toBe(
      "Task created: Finalise deck"
    );
  });
});
