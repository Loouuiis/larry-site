import { describe, it, expect } from "vitest";
import { buildPortfolioTree, buildProjectTree, flattenVisible, normalizeGanttStatus, rollUpBar } from "./gantt-utils";
import type { PortfolioTimelineResponse, GanttTask, GanttNode } from "./gantt-types";

const baseTask = (over: Partial<GanttTask> = {}): GanttTask => ({
  id: "t", projectId: "p", parentTaskId: null, title: "T",
  status: "not_started", priority: "medium",
  assigneeUserId: null, assigneeName: null,
  startDate: null, endDate: null, dueDate: null, progressPercent: 0,
  ...over,
});

describe("normalizeGanttStatus", () => {
  it("maps DB enum values to Gantt status palette", () => {
    expect(normalizeGanttStatus("backlog")).toBe("not_started");
    expect(normalizeGanttStatus("in_progress")).toBe("on_track");
    expect(normalizeGanttStatus("blocked")).toBe("overdue");
    expect(normalizeGanttStatus("completed")).toBe("completed");
    expect(normalizeGanttStatus(null)).toBe("not_started");
    expect(normalizeGanttStatus("unknown")).toBe("not_started");
  });
});

describe("buildPortfolioTree", () => {
  it("nests tasks under parents and orphans remain top-level", () => {
    const resp: PortfolioTimelineResponse = {
      categories: [{
        id: "c1", name: "C", colour: null, sortOrder: 0,
        projects: [{
          id: "p1", name: "P", status: "active", startDate: null, targetDate: null,
          tasks: [
            baseTask({ id: "t1", projectId: "p1" }),
            baseTask({ id: "t2", projectId: "p1", parentTaskId: "t1" }),
            baseTask({ id: "t3", projectId: "p1" }),
          ],
        }],
      }],
      dependencies: [],
    };
    const tree = buildPortfolioTree(resp);
    expect(tree.kind).toBe("category"); // root is synthetic
    const cat = (tree as Extract<GanttNode, { kind: "category" }>).children[0] as Extract<GanttNode, { kind: "category" }>;
    expect(cat.kind).toBe("category");
    const proj = cat.children[0] as Extract<GanttNode, { kind: "project" }>;
    expect(proj.children).toHaveLength(2); // t1, t3 at top; t2 under t1
    const t1 = proj.children.find((n) => "task" in n && n.task.id === "t1") as Extract<GanttNode, { kind: "task" }>;
    expect(t1.children).toHaveLength(1);
    expect((t1.children[0] as Extract<GanttNode, { kind: "subtask" }>).task.id).toBe("t2");
  });
});

describe("buildProjectTree", () => {
  it("skips the category level", () => {
    const tasks: GanttTask[] = [
      baseTask({ id: "t1", projectId: "p1" }),
      baseTask({ id: "t2", projectId: "p1", parentTaskId: "t1" }),
    ];
    const tree = buildProjectTree({ id: "p1", name: "P", status: "active" }, tasks);
    expect(tree.kind).toBe("project");
    expect(tree.children).toHaveLength(1);
  });
});

describe("flattenVisible", () => {
  it("respects expandedSet", () => {
    const task1 = { kind: "task" as const, id: "t1", task: baseTask({ id: "t1" }),
      children: [{ kind: "subtask" as const, id: "t2", task: baseTask({ id: "t2", parentTaskId: "t1" }) }] };
    const project: GanttNode = { kind: "project", id: "p1", name: "P", status: "active", children: [task1] };
    const cat: GanttNode = { kind: "category", id: "c1", name: "C", colour: null, children: [project] };

    const expanded = new Set<string>(["cat:c1", "proj:p1"]); // task NOT expanded → subtask hidden
    const rows = flattenVisible(cat, expanded);
    expect(rows.map(r => r.key)).toEqual(["cat:c1", "proj:p1", "task:t1"]);

    expanded.add("task:t1");
    const rows2 = flattenVisible(cat, expanded);
    expect(rows2.map(r => r.key)).toEqual(["cat:c1", "proj:p1", "task:t1", "sub:t2"]);
  });
});

describe("rollUpBar", () => {
  it("spans min-start to max-end and averages progress weighted by duration", () => {
    const a = baseTask({ id: "a", startDate: "2026-01-01", endDate: "2026-01-05", dueDate: "2026-01-05", progressPercent: 100 });
    const b = baseTask({ id: "b", startDate: "2026-01-03", endDate: "2026-01-10", dueDate: "2026-01-10", progressPercent: 0 });
    const r = rollUpBar([a, b]);
    expect(r?.start).toBe("2026-01-01");
    expect(r?.end).toBe("2026-01-10");
    // 4 days × 100 + 7 days × 0 = 400 / 11 = ~36
    expect(r?.progressPercent).toBeGreaterThan(30);
    expect(r?.progressPercent).toBeLessThan(45);
  });

  it("returns null when no tasks have dates", () => {
    expect(rollUpBar([baseTask()])).toBeNull();
  });
});
