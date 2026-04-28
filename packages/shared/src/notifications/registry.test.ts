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

// Known good route prefixes that exist on the web app. If a deep link does not
// start with one of these, it will 404 in the browser. These prefixes are
// verified against the apps/web/src/app/workspace directory.
const KNOWN_ROUTE_PREFIXES = [
  "/workspace/projects/", // dynamic [projectId]
  "/workspace/email-drafts",
  "/workspace/settings/members",
  "/workspace/actions",
  "/workspace/notifications",
];

function deepLinkPrefix(url: string): string {
  // Strip query string and fragment so we can match against route prefixes.
  const path = url.split("?")[0]!.split("#")[0]!;
  return path;
}

describe("NOTIFICATION_REGISTRY", () => {
  it("has a spec for every NotificationType", () => {
    for (const t of ALL_TYPES) {
      expect(NOTIFICATION_REGISTRY[t], `missing: ${t}`).toBeTruthy();
    }
  });

  it("every deep link resolves to a known web route prefix", () => {
    // Sample payloads cover all parameterised deep-link shapes.
    const samplePayloads: Record<NotificationType, Record<string, unknown>> = {
      "task.created": { taskId: "t1", projectId: "p1", title: "x" },
      "task.updated": { taskId: "t1", projectId: "p1", title: "x" },
      "task.deleted": { projectId: "p1", title: "x" },
      "email.drafted": { draftId: "d1", recipient: "x@y.com" },
      "email.sent": { messageId: "m1", recipient: "x@y.com" },
      "email.failed": { draftId: "d1", recipient: "x@y.com" },
      "invite.sent": { email: "x@y.com" },
      "invite.accepted": { email: "x@y.com" },
      "scan.completed": { changeCount: 3 },
      "scan.failed": {},
      "action.executed": { actionId: "a1", label: "x" },
      "action.failed": { actionId: "a1", label: "x" },
    };

    for (const t of ALL_TYPES) {
      const url = NOTIFICATION_REGISTRY[t]!.deepLink(samplePayloads[t]);
      const path = deepLinkPrefix(url);
      const matched = KNOWN_ROUTE_PREFIXES.some((p) => path.startsWith(p));
      expect(matched, `${t} → ${url} does not match a known route prefix`).toBe(
        true
      );
    }
  });

  it("task.created deep-links via the project page with task query param", () => {
    const spec = NOTIFICATION_REGISTRY["task.created"];
    expect(spec.deepLink({ taskId: "t1", projectId: "p1" })).toBe(
      "/workspace/projects/p1?tab=tasks&task=t1"
    );
  });

  it("email.drafted deep-links to email-drafts list (with draft query when provided)", () => {
    const spec = NOTIFICATION_REGISTRY["email.drafted"];
    expect(spec.deepLink({ draftId: "abc" })).toBe(
      "/workspace/email-drafts?draft=abc"
    );
    // Still resolves when payload omits draftId.
    expect(spec.deepLink({})).toBe("/workspace/email-drafts");
  });

  it("invite.* deep-links to the settings members page", () => {
    expect(NOTIFICATION_REGISTRY["invite.sent"]!.deepLink({ email: "x" })).toBe(
      "/workspace/settings/members"
    );
    expect(
      NOTIFICATION_REGISTRY["invite.accepted"]!.deepLink({ email: "x" })
    ).toBe("/workspace/settings/members");
  });

  it("renderTitle uses payload", () => {
    const spec = NOTIFICATION_REGISTRY["task.created"];
    expect(spec.renderTitle({ title: "Finalise deck" })).toBe(
      "Task created: Finalise deck"
    );
  });
});
