import { describe, expect, it } from "vitest";
import type { Timeline2Node } from "@larry/shared";
import { projectedWbs, relationPreview } from "./taskcenter2-helpers";

function makeNode(id: string, title: string, overrides: Partial<Timeline2Node> = {}): Timeline2Node {
  return {
    id,
    planId: "plan-1",
    parentId: null,
    kind: "task",
    title,
    description: null,
    status: "not_started",
    priority: "medium",
    startDate: null,
    dueDate: null,
    sortOrder: 0,
    progress: 0,
    isCriticalPath: false,
    actionRequired: { required: false, note: null },
    assignees: [],
    rollup: {
      healthStatus: "not_started",
      priority: "medium",
      startDate: null,
      dueDate: null,
      assignees: [],
      actionRequiredCount: 0,
      dependencyWarningCount: 0,
      descendantCount: 0,
    },
    children: [],
    createdAt: "2026-05-06T00:00:00.000Z",
    updatedAt: "2026-05-06T00:00:00.000Z",
    ...overrides,
  };
}

describe("taskcenter2 helpers", () => {
  it("predicts the future WBS when moving a node under a new parent", () => {
    const movedTask = makeNode("task-1", "Moved task", { parentId: "group-1" });
    const groupOne = makeNode("group-1", "Group one", {
      kind: "group",
      children: [movedTask],
    });
    const groupTwo = makeNode("group-2", "Group two", {
      kind: "group",
      children: [],
    });

    expect(projectedWbs([groupOne, groupTwo], "task-1", "group-2")).toBe("2.1");
  });

  it("explains dependency direction from the source node perspective", () => {
    expect(relationPreview("finish_to_start", "QA", "Rollout", "unblocks")).toBe(
      "QA finishes before Rollout starts.",
    );
    expect(relationPreview("finish_to_start", "QA", "Rollout", "blocked_by")).toBe(
      "Rollout finishes before QA starts.",
    );
  });
});
