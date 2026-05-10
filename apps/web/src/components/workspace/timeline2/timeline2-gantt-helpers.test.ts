import { describe, expect, it } from "vitest";
import type { Timeline2Branch, Timeline2Node } from "@larry/shared";
import { changedNodeIds, reorderColumns, visibleRows } from "./timeline2-gantt-helpers";

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

describe("timeline2 gantt helpers", () => {
  it("hides descendants of collapsed rows", () => {
    const child = makeNode("child-1", "Child task", { parentId: "parent-1" });
    const parent = makeNode("parent-1", "Parent group", {
      kind: "group",
      children: [child],
    });

    const rows = visibleRows([parent, child], [parent], new Set(["parent-1"]));

    expect(rows.map((row) => row.node.id)).toEqual(["parent-1"]);
  });

  it("tracks only pending branch node changes", () => {
    const branches: Timeline2Branch[] = [
      {
        id: "branch-1",
        projectId: "project-1",
        planId: "plan-1",
        title: "Proposal",
        summary: "Summary",
        status: "open",
        baseRevisionId: null,
        baseSnapshot: {},
        proposedSnapshot: {},
        operations: [
          {
            id: "op-1",
            branchId: "branch-1",
            operationType: "update_node",
            targetNodeId: "node-a",
            dependencyId: null,
            before: null,
            after: null,
            rationale: "pending",
            status: "pending",
            sortOrder: 0,
            createdAt: "2026-05-06T00:00:00.000Z",
            updatedAt: "2026-05-06T00:00:00.000Z",
          },
          {
            id: "op-2",
            branchId: "branch-1",
            operationType: "update_node",
            targetNodeId: "node-b",
            dependencyId: null,
            before: null,
            after: null,
            rationale: "applied",
            status: "applied",
            sortOrder: 1,
            createdAt: "2026-05-06T00:00:00.000Z",
            updatedAt: "2026-05-06T00:00:00.000Z",
          },
        ],
        operationCounts: {
          total: 2,
          pending: 1,
          applied: 1,
          rejected: 0,
        },
        createdAt: "2026-05-06T00:00:00.000Z",
        updatedAt: "2026-05-06T00:00:00.000Z",
      },
    ];

    expect(Array.from(changedNodeIds(branches))).toEqual(["node-a"]);
  });

  it("reorders the target column ahead of the drag source", () => {
    expect(reorderColumns(["task_name", "status", "due_date", "assignee"], "assignee", "status")).toEqual([
      "task_name",
      "assignee",
      "status",
      "due_date",
    ]);
  });
});
