import { describe, it, expect } from "vitest";
import {
  buildCategoryColorMap,
  buildPortfolioTree, buildProjectTree,
  contrastTextFor,
  computeRange,
  flattenVisible,
  generateDateAxis,
  normalizeGanttStatus,
  resolveCategoryColor,
  rollUpBar,
  tinyTint,
} from "./gantt-utils";
import type { PortfolioTimelineResponse, GanttTask, GanttNode } from "./gantt-types";
import { ROW_HEIGHT, ROW_HEIGHT_TASK } from "./gantt-types";

const baseTask = (over: Partial<GanttTask> = {}): GanttTask => ({
  id: "t", projectId: "p", parentTaskId: null, categoryId: null, title: "T",
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

  it("nests subcategories under their parent category (v4)", () => {
    const resp: PortfolioTimelineResponse = {
      categories: [
        { id: "c-parent", name: "Parent", colour: null, sortOrder: 0, parentCategoryId: null, projectId: null, projects: [] },
        { id: "c-child",  name: "Child",  colour: null, sortOrder: 0, parentCategoryId: "c-parent", projectId: null, projects: [] },
        { id: "c-peer",   name: "Peer",   colour: null, sortOrder: 1, parentCategoryId: null, projectId: null, projects: [] },
      ],
      dependencies: [],
    };
    const tree = buildPortfolioTree(resp);
    const topLevel = (tree as Extract<GanttNode, { kind: "category" }>).children as Array<Extract<GanttNode, { kind: "category" }>>;
    // Two top-level categories — the child is not here, it's under Parent.
    expect(topLevel.map((n) => n.id)).toEqual(["c-parent", "c-peer"]);
    const parent = topLevel.find((n) => n.id === "c-parent")!;
    expect(parent.children).toHaveLength(1);
    expect((parent.children[0] as Extract<GanttNode, { kind: "category" }>).id).toBe("c-child");
  });

  it("skips project-scoped categories (projectId set) from the portfolio tree (v4)", () => {
    const resp: PortfolioTimelineResponse = {
      categories: [
        { id: "c-org",   name: "Org",          colour: null, sortOrder: 0, parentCategoryId: null, projectId: null,    projects: [] },
        { id: "c-proj",  name: "Project-scoped", colour: null, sortOrder: 0, parentCategoryId: null, projectId: "p1",    projects: [] },
      ],
      dependencies: [],
    };
    const tree = buildPortfolioTree(resp);
    const topLevel = (tree as Extract<GanttNode, { kind: "category" }>).children as Array<Extract<GanttNode, { kind: "category" }>>;
    expect(topLevel.map((n) => n.id)).toEqual(["c-org"]);
  });

  // Timeline Slice 2 — subtask depth used to be capped at 1. Now it's
  // unlimited: task → subtask → subtask → … renders as a chain as long as
  // the parentTaskId links stay valid.
  it("builds arbitrarily-deep subtask chains", () => {
    const resp: PortfolioTimelineResponse = {
      categories: [{
        id: "c1", name: "C", colour: null, sortOrder: 0,
        projects: [{
          id: "p1", name: "P", status: "active", startDate: null, targetDate: null,
          tasks: [
            baseTask({ id: "t1", projectId: "p1" }),                         // root task
            baseTask({ id: "t2", projectId: "p1", parentTaskId: "t1" }),     // subtask
            baseTask({ id: "t3", projectId: "p1", parentTaskId: "t2" }),     // sub-subtask
            baseTask({ id: "t4", projectId: "p1", parentTaskId: "t3" }),     // depth 3
          ],
        }],
      }],
      dependencies: [],
    };
    const tree = buildPortfolioTree(resp);
    const cats = (tree as Extract<GanttNode, { kind: "category" }>).children;
    const c1 = cats[0] as Extract<GanttNode, { kind: "category" }>;
    const p1 = c1.children[0] as Extract<GanttNode, { kind: "project" }>;
    const t1 = p1.children[0] as Extract<GanttNode, { kind: "task" }>;
    expect(t1.children.map((c) => c.id)).toEqual(["t2"]);
    const t2 = t1.children[0] as Extract<GanttNode, { kind: "subtask" }>;
    expect(t2.children.map((c) => c.id)).toEqual(["t3"]);
    const t3 = t2.children[0] as Extract<GanttNode, { kind: "subtask" }>;
    expect(t3.children.map((c) => c.id)).toEqual(["t4"]);
  });

  // Defensive — a corrupt DB loop (a.parent = b, b.parent = a) must not
  // hang the render. buildTaskForest guards via a `visited` set; the
  // second time a task id is seen on a descent, its children are empty.
  it("breaks out of a parentTaskId cycle", () => {
    const resp: PortfolioTimelineResponse = {
      categories: [{
        id: "c1", name: "C", colour: null, sortOrder: 0,
        projects: [{
          id: "p1", name: "P", status: "active", startDate: null, targetDate: null,
          tasks: [
            // t1 has no parent → becomes a root. t1 and t2 point at each
            // other; since t1 is in `top` via parentTaskId=null we start
            // there, and when we re-encounter t1 under t2 the visited
            // guard stops recursion.
            baseTask({ id: "t1", projectId: "p1" }),
            baseTask({ id: "t2", projectId: "p1", parentTaskId: "t1" }),
          ],
        }],
      }],
      dependencies: [],
    };
    expect(() => buildPortfolioTree(resp)).not.toThrow();
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

  it("renders project-scoped categories above tasks when supplied (v4 Slice 4)", () => {
    const tasks: GanttTask[] = [baseTask({ id: "t1", projectId: "p1" })];
    const categories = [
      { id: "cA", name: "Cat A", colour: "#ef4444", sortOrder: 0, parentCategoryId: null, projectId: "p1" },
    ];
    const tree = buildProjectTree({ id: "p1", name: "P", status: "active" }, tasks, categories);
    expect(tree.children.map((c) => c.kind)).toEqual(["category", "task"]);
    const catNode = tree.children[0] as Extract<GanttNode, { kind: "category" }>;
    expect(catNode.id).toBe("cA");
    expect(catNode.name).toBe("Cat A");
    expect(catNode.colour).toBe("#ef4444");
  });

  it("nests project-scoped subcategories under their project-scoped parent", () => {
    const categories = [
      { id: "cA", name: "Parent", colour: null, sortOrder: 0, parentCategoryId: null, projectId: "p1" },
      { id: "cB", name: "Child",  colour: null, sortOrder: 0, parentCategoryId: "cA", projectId: null },
    ];
    const tree = buildProjectTree({ id: "p1", name: "P", status: "active" }, [], categories);
    const topLevelCat = tree.children[0] as Extract<GanttNode, { kind: "category" }>;
    expect(topLevelCat.id).toBe("cA");
    expect(topLevelCat.children).toHaveLength(1);
    expect((topLevelCat.children[0] as Extract<GanttNode, { kind: "category" }>).id).toBe("cB");
  });

  it("ignores categories scoped to other projects", () => {
    const categories = [
      { id: "cA", name: "Own", colour: null, sortOrder: 0, parentCategoryId: null, projectId: "p1" },
      { id: "cB", name: "Other", colour: null, sortOrder: 0, parentCategoryId: null, projectId: "p2" },
      { id: "cC", name: "Org-level", colour: null, sortOrder: 0, parentCategoryId: null, projectId: null },
    ];
    const tree = buildProjectTree({ id: "p1", name: "P", status: "active" }, [], categories);
    const catIds = tree.children.filter((c) => c.kind === "category").map((c) => (c as Extract<GanttNode, { kind: "category" }>).id);
    expect(catIds).toEqual(["cA"]);
  });

  it("renders multiple project-scoped top-level categories in sortOrder", () => {
    const categories = [
      { id: "cA", name: "A", colour: null, sortOrder: 2, parentCategoryId: null, projectId: "p1" },
      { id: "cB", name: "B", colour: null, sortOrder: 0, parentCategoryId: null, projectId: "p1" },
      { id: "cC", name: "C", colour: null, sortOrder: 1, parentCategoryId: null, projectId: "p1" },
    ];
    const tree = buildProjectTree({ id: "p1", name: "P", status: "active" }, [], categories);
    const catIds = tree.children.filter((c) => c.kind === "category").map((c) => (c as Extract<GanttNode, { kind: "category" }>).id);
    expect(catIds).toEqual(["cB", "cC", "cA"]);
  });

  it("is a no-op when passed an empty categories array", () => {
    const tasks: GanttTask[] = [baseTask({ id: "t1", projectId: "p1" })];
    const tree = buildProjectTree({ id: "p1", name: "P", status: "active" }, tasks, []);
    expect(tree.children.every((c) => c.kind === "task")).toBe(true);
  });
});

describe("flattenVisible", () => {
  it("respects expandedSet", () => {
    const task1 = { kind: "task" as const, id: "t1", task: baseTask({ id: "t1" }),
      children: [{ kind: "subtask" as const, id: "t2", task: baseTask({ id: "t2", parentTaskId: "t1" }), children: [] }] };
    const project: GanttNode = { kind: "project", id: "p1", name: "P", status: "active", children: [task1] };
    const cat: GanttNode = { kind: "category", id: "c1", name: "C", colour: null, children: [project] };
    // Use synthetic __root__ wrapper (mirrors portfolio usage; root is always skipped)
    const syntheticRoot: GanttNode = { kind: "category", id: "__root__", name: "", colour: null, children: [cat] };

    const expanded = new Set<string>(["cat:c1", "proj:p1"]); // task NOT expanded → subtask hidden
    const rows = flattenVisible(syntheticRoot, expanded);
    expect(rows.map(r => r.key)).toEqual(["cat:c1", "proj:p1", "task:t1"]);

    expanded.add("task:t1");
    const rows2 = flattenVisible(syntheticRoot, expanded);
    expect(rows2.map(r => r.key)).toEqual(["cat:c1", "proj:p1", "task:t1", "sub:t2"]);
  });

  it("flattenVisible skips a project-kind root", () => {
    const task = { kind: "task" as const, id: "t1", task: baseTask({ id: "t1" }), children: [] };
    const proj: GanttNode = { kind: "project", id: "p1", name: "P", status: "active", children: [task] };
    const rows = flattenVisible(proj, new Set(["proj:p1"]));
    expect(rows.map(r => r.key)).toEqual(["task:t1"]); // no "proj:p1" at depth 0
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

  it("rollUpBar synthesizes start = today when only dueDate present and date is in future", () => {
    const future = new Date();
    future.setDate(future.getDate() + 30);
    const futureIso = future.toISOString().slice(0, 10);
    const t = baseTask({ id: "a", startDate: null, endDate: null, dueDate: futureIso });
    const r = rollUpBar([t]);
    expect(r).not.toBeNull();
    expect(r!.start).toBeTruthy();
    expect(r!.end).toBe(futureIso);
  });
});

/* ─── Category colour map + resolution ─────────────────────────────── */

describe("buildCategoryColorMap", () => {
  it("maps real categories by id and the synthetic Uncategorised bucket by 'uncat'", () => {
    const map = buildCategoryColorMap([
      { id: "c1", colour: "#ff0000" },
      { id: "c2", colour: "#00ff00" },
      { id: null, colour: null },
    ]);
    expect(map.get("cat:c1")).toBe("#ff0000");
    expect(map.get("cat:c2")).toBe("#00ff00");
    expect(map.get("cat:uncat")).toBe("#6c44f6");
  });

  it("falls back to Larry purple when a category has null colour", () => {
    const map = buildCategoryColorMap([{ id: "c1", colour: null }]);
    expect(map.get("cat:c1")).toBe("#6c44f6");
  });
});

describe("resolveCategoryColor", () => {
  const task1: GanttNode = { kind: "task", id: "t1", task: baseTask({ id: "t1" }), children: [] };
  const project: GanttNode = { kind: "project", id: "p1", name: "P", status: "active", children: [task1] };
  const category: GanttNode = { kind: "category", id: "c1", name: "Marketing", colour: "#ff0000", children: [project] };
  const root: GanttNode = { kind: "category", id: "__root__", name: "", colour: null, children: [category] };

  it("walks up to find the ancestor category's colour", () => {
    expect(resolveCategoryColor("task:t1", root)).toBe("#ff0000");
  });

  it("prefers the categoryColorMap entry over the tree's inline colour", () => {
    const map = buildCategoryColorMap([{ id: "c1", colour: "#0000ff" }]);
    expect(resolveCategoryColor("task:t1", root, map)).toBe("#0000ff");
  });

  it("returns the Larry purple default when the node isn't in the tree", () => {
    expect(resolveCategoryColor("task:missing", root)).toBe("#6c44f6");
  });
});

describe("flattenVisible populates categoryColor", () => {
  const sub: GanttNode = { kind: "subtask", id: "t2", task: baseTask({ id: "t2", parentTaskId: "t1" }), children: [] };
  const task1: GanttNode = { kind: "task", id: "t1", task: baseTask({ id: "t1" }), children: [sub] };
  const project: GanttNode = { kind: "project", id: "p1", name: "P", status: "active", children: [task1] };
  const category: GanttNode = { kind: "category", id: "c1", name: "C", colour: "#123456", children: [project] };
  const syntheticRoot: GanttNode = { kind: "category", id: "__root__", name: "", colour: null, children: [category] };

  it("inherits the resolved category colour down to tasks and subtasks", () => {
    const expanded = new Set<string>(["cat:c1", "proj:p1", "task:t1"]);
    const map = buildCategoryColorMap([{ id: "c1", colour: "#abcdef" }]);
    const rows = flattenVisible(syntheticRoot, expanded, { categoryColorMap: map });
    for (const r of rows) expect(r.categoryColor).toBe("#abcdef");
  });

  it("uses rootCategoryColor when the root is a bare project node", () => {
    const proj: GanttNode = { kind: "project", id: "p1", name: "P", status: "active", children: [task1] };
    const rows = flattenVisible(proj, new Set(["proj:p1"]), { rootCategoryColor: "#ff00aa" });
    expect(rows.every((r) => r.categoryColor === "#ff00aa")).toBe(true);
  });
});

/* ─── Date axis ────────────────────────────────────────────────────── */

describe("generateDateAxis", () => {
  const range = computeRange(
    [baseTask({ id: "x", startDate: "2026-04-01", endDate: "2026-06-30", dueDate: "2026-06-30" })],
    "month",
  );

  it("month zoom produces month spans plus weekly day markers", () => {
    const axis = generateDateAxis(range, "month");
    expect(axis.months.length).toBeGreaterThan(0);
    expect(axis.months[0].label).toMatch(/^[A-Z]{3} \d{4}$/);
    // Months must cover the full axis width in order and non-overlapping.
    let prevEnd = 0;
    for (const m of axis.months) {
      expect(m.endPct).toBeGreaterThan(m.startPct);
      expect(m.startPct).toBeGreaterThanOrEqual(prevEnd - 0.001);
      prevEnd = m.endPct;
    }
    expect(axis.days.length).toBeGreaterThan(2);
  });

  it("week zoom produces one marker per day", () => {
    const axis = generateDateAxis(range, "week");
    // Every marker label is in "Mon 23" / "Tue 24" format (a weekday short + number).
    for (const d of axis.days) expect(d.label).toMatch(/^\w{3} \d{1,2}$/);
    // Should be roughly `totalDays + 1` markers.
    expect(axis.days.length).toBeGreaterThan(range.totalDays - 2);
  });

  it("quarter zoom produces biweekly markers", () => {
    const axis = generateDateAxis(range, "quarter");
    for (const d of axis.days) expect(d.label).toMatch(/^\d{1,2}$/);
    // Biweekly → fewer markers than daily.
    expect(axis.days.length).toBeLessThan(range.totalDays / 10);
  });
});

/* ─── Colour helpers ───────────────────────────────────────────────── */

describe("contrastTextFor", () => {
  it("returns white for dark background colours", () => {
    expect(contrastTextFor("#000000")).toBe("#ffffff");
    expect(contrastTextFor("#6c44f6")).toBe("#ffffff");
    expect(contrastTextFor("#123456")).toBe("#ffffff");
  });

  it("returns dark text for light background colours", () => {
    expect(contrastTextFor("#ffffff")).toBe("#11172c");
    expect(contrastTextFor("#ffe47a")).toBe("#11172c");
  });
});

describe("tinyTint", () => {
  it("returns an rgba() string with the given alpha", () => {
    expect(tinyTint("#ff0000", 0.2)).toBe("rgba(255, 0, 0, 0.2)");
    expect(tinyTint("#6c44f6")).toMatch(/^rgba\(108, 68, 246, 0\.15\)$/);
  });
});

/* ─── v3 additions ─────────────────────────────────────────────────── */

import { darken, statusChipFor, contextMenuItemsFor } from "./gantt-utils";

describe("contextMenuItemsFor", () => {
  it("task row gets Open, Move, Remove from timeline, Delete", () => {
    const items = contextMenuItemsFor({ rowKind: "task", isUncategorised: false });
    expect(items.map((i) => i.id)).toEqual([
      "openDetail", "moveToCategory", "removeFromTimeline", "delete",
    ]);
    expect(items.find((i) => i.id === "moveToCategory")?.hasSubmenu).toBe(true);
    expect(items.find((i) => i.id === "delete")?.destructive).toBe(true);
  });

  it("subtask row gets same items as task", () => {
    const items = contextMenuItemsFor({ rowKind: "subtask", isUncategorised: false });
    expect(items.map((i) => i.id)).toEqual([
      "openDetail", "moveToCategory", "removeFromTimeline", "delete",
    ]);
  });

  it("project row gets Open, Move, Add task, Add category, Delete", () => {
    const items = contextMenuItemsFor({ rowKind: "project", isUncategorised: false });
    expect(items.map((i) => i.id)).toEqual([
      "openDetail", "moveToCategory", "addChild", "addCategory", "delete",
    ]);
  });

  it("category row gets Add subcategory, Rename, Change colour, Delete", () => {
    const items = contextMenuItemsFor({ rowKind: "category", isUncategorised: false });
    expect(items.map((i) => i.id)).toEqual([
      "addSubcategory", "rename", "changeColour", "delete",
    ]);
  });

  it("uncategorised category row returns a single disabled sentinel", () => {
    const items = contextMenuItemsFor({ rowKind: "category", isUncategorised: true });
    expect(items).toHaveLength(1);
    expect(items[0].disabled).toBe(true);
    expect(items[0].label).toMatch(/default bucket/i);
  });
});

describe("flattenVisible assigns per-level heights", () => {
  it("category/project rows use ROW_HEIGHT=32 and task/subtask use 28", () => {
    const sub: GanttNode = { kind: "subtask", id: "t2", task: baseTask({ id: "t2", parentTaskId: "t1" }), children: [] };
    const task1: GanttNode = { kind: "task", id: "t1", task: baseTask({ id: "t1" }), children: [sub] };
    const project: GanttNode = { kind: "project", id: "p1", name: "P", status: "active", children: [task1] };
    const category: GanttNode = { kind: "category", id: "c1", name: "C", colour: null, children: [project] };
    const syntheticRoot: GanttNode = { kind: "category", id: "__root__", name: "", colour: null, children: [category] };

    const expanded = new Set<string>(["cat:c1", "proj:p1", "task:t1"]);
    const rows = flattenVisible(syntheticRoot, expanded);
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));

    expect((byKey["cat:c1"] as { height: number }).height).toBe(ROW_HEIGHT);
    expect((byKey["proj:p1"] as { height: number }).height).toBe(ROW_HEIGHT);
    expect((byKey["task:t1"] as { height: number }).height).toBe(ROW_HEIGHT_TASK);
    expect((byKey["sub:t2"] as { height: number }).height).toBe(ROW_HEIGHT_TASK);
  });
});


describe("statusChipFor", () => {
  it("returns null for on_track (no chip shown)", () => {
    expect(statusChipFor("on_track")).toBeNull();
  });

  it("returns NS chip for not_started with a muted outline", () => {
    const chip = statusChipFor("not_started");
    expect(chip).not.toBeNull();
    expect(chip!.label).toBe("NS");
    expect(chip!.bg).toBe("transparent");
    expect(chip!.border).not.toBeNull();
  });

  it("returns AR chip for at_risk with amber fill", () => {
    const chip = statusChipFor("at_risk");
    expect(chip!.label).toBe("AR");
    expect(chip!.bg).toBe("var(--tl-at-risk)");
    expect(chip!.fg).toBe("#ffffff");
    expect(chip!.border).toBeNull();
  });

  it("returns OD chip for overdue with red fill", () => {
    expect(statusChipFor("overdue")!.bg).toBe("var(--tl-overdue)");
  });

  it("returns ✓ chip for completed with green fill", () => {
    const chip = statusChipFor("completed");
    expect(chip!.label).toBe("✓");
    expect(chip!.bg).toBe("var(--tl-completed)");
  });
});

/* ─── v4 Slice 5 — search dimming ─────────────────────────────────── */

import { searchUnDimmedKeys } from "./gantt-utils";

describe("searchUnDimmedKeys", () => {
  const mkTree = (): GanttNode => {
    const task: GanttNode = { kind: "task", id: "t1", task: baseTask({ id: "t1", title: "Verify migrations" }), children: [] };
    const sibTask: GanttNode = { kind: "task", id: "t2", task: baseTask({ id: "t2", title: "Design landing page" }), children: [] };
    const project: GanttNode = { kind: "project", id: "p1", name: "Onboarding", status: "active", children: [task, sibTask] };
    const category: GanttNode = { kind: "category", id: "c1", name: "Marketing", colour: null, children: [project] };
    const peerCat: GanttNode = { kind: "category", id: "c2", name: "Legal", colour: null, children: [] };
    return { kind: "category", id: "__root__", name: "", colour: null, children: [category, peerCat] };
  };

  it("returns an empty set for an empty query", () => {
    const set = searchUnDimmedKeys(mkTree(), "");
    expect(set.size).toBe(0);
  });

  it("includes the matching task AND its ancestors", () => {
    const set = searchUnDimmedKeys(mkTree(), "verify");
    expect(set).toContain("task:t1");
    expect(set).toContain("proj:p1");
    expect(set).toContain("cat:c1");
    // Sibling task that doesn't match is NOT un-dimmed
    expect(set.has("task:t2")).toBe(false);
    // Peer category that doesn't match is NOT un-dimmed
    expect(set.has("cat:c2")).toBe(false);
  });

  it("when a category matches, its whole subtree stays un-dimmed", () => {
    const set = searchUnDimmedKeys(mkTree(), "marketing");
    expect(set).toContain("cat:c1");
    expect(set).toContain("proj:p1");
    expect(set).toContain("task:t1");
    expect(set).toContain("task:t2");
    expect(set.has("cat:c2")).toBe(false);
  });

  it("never emits the synthetic __root__ key", () => {
    const set = searchUnDimmedKeys(mkTree(), "verify");
    expect(set.has("cat:__root__")).toBe(false);
  });

  it("query is case-insensitive and trims whitespace", () => {
    const set = searchUnDimmedKeys(mkTree(), "  MIGR  ");
    expect(set).toContain("task:t1");
  });
});

/* ─── v4 Slice 4 — validateDrop ────────────────────────────────────── */

import { validateDrop, parseDndKey, type DropContext } from "./gantt-utils";

describe("parseDndKey", () => {
  it("parses every prefix", () => {
    expect(parseDndKey("dnd-cat:abc")).toEqual({ kind: "cat", id: "abc" });
    expect(parseDndKey("dnd-proj:def")).toEqual({ kind: "proj", id: "def" });
    expect(parseDndKey("dnd-task:ghi")).toEqual({ kind: "task", id: "ghi" });
    expect(parseDndKey("dnd-sub:jkl")).toEqual({ kind: "sub", id: "jkl" });
    expect(parseDndKey("garbage")).toBeNull();
  });
});

function mkCtx(overrides: Partial<DropContext> = {}): DropContext {
  return {
    categoriesById: overrides.categoriesById ?? new Map(),
    tasksById:      overrides.tasksById      ?? new Map(),
  };
}

describe("validateDrop", () => {
  it("rejects self-drops", () => {
    const r = validateDrop("dnd-cat:c1", "dnd-cat:c1", mkCtx());
    expect(r.ok).toBe(false);
  });

  it("rejects unrecognised ids", () => {
    const r = validateDrop("junk", "dnd-cat:c1", mkCtx());
    expect(r.ok).toBe(false);
  });

  it("rejects synthetic Uncategorised/__root__ on either side", () => {
    expect(validateDrop("dnd-cat:uncat", "dnd-cat:c1", mkCtx()).ok).toBe(false);
    expect(validateDrop("dnd-cat:c1", "dnd-cat:uncat", mkCtx()).ok).toBe(false);
    expect(validateDrop("dnd-cat:c1", "dnd-cat:__root__", mkCtx()).ok).toBe(false);
  });

  it("category → category emits moveCategory (reparent)", () => {
    const r = validateDrop("dnd-cat:c1", "dnd-cat:c2", mkCtx({
      categoriesById: new Map([
        ["c1", { parentCategoryId: null, projectId: null }],
        ["c2", { parentCategoryId: null, projectId: null }],
      ]),
    }));
    expect(r).toEqual({
      ok: true,
      effect: { kind: "moveCategory", sourceId: "c1", newParentCategoryId: "c2", newProjectId: null },
    });
  });

  it("category → descendant-of-itself rejected (cycle guard)", () => {
    // c2 is a descendant of c1; dragging c1 onto c2 must be rejected.
    const r = validateDrop("dnd-cat:c1", "dnd-cat:c2", mkCtx({
      categoriesById: new Map([
        ["c1", { parentCategoryId: null, projectId: null }],
        ["c2", { parentCategoryId: "c1", projectId: null }],
      ]),
    }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/descendant/i);
  });

  it("category → project emits moveCategory with projectId set", () => {
    const r = validateDrop("dnd-cat:c1", "dnd-proj:p1", mkCtx());
    expect(r).toEqual({
      ok: true,
      effect: { kind: "moveCategory", sourceId: "c1", newParentCategoryId: null, newProjectId: "p1" },
    });
  });

  it("project → category emits moveProject", () => {
    const r = validateDrop("dnd-proj:p1", "dnd-cat:c1", mkCtx());
    expect(r).toEqual({
      ok: true,
      effect: { kind: "moveProject", sourceId: "p1", newCategoryId: "c1" },
    });
  });

  it("task → task (target = top-level task) makes source its subtask", () => {
    const r = validateDrop("dnd-task:t1", "dnd-task:t2", mkCtx({
      tasksById: new Map([
        ["t1", { projectId: "p1", parentTaskId: null }],
        ["t2", { projectId: "p1", parentTaskId: null }],
      ]),
    }));
    expect(r).toEqual({
      ok: true,
      effect: { kind: "moveTask", sourceId: "t1", newProjectId: "p1", newParentTaskId: "t2" },
    });
  });

  // Timeline Slice 2 — depth cap removed. Dropping a task onto a subtask
  // now nests it under the subtask (previously it became a sibling because
  // the old rule said "subtasks can't parent subtasks").
  it("task → subtask becomes a child of the target subtask", () => {
    const r = validateDrop("dnd-task:t1", "dnd-sub:t3", mkCtx({
      tasksById: new Map([
        ["t1", { projectId: "p1", parentTaskId: null }],
        ["t2", { projectId: "p1", parentTaskId: null }],
        ["t3", { projectId: "p1", parentTaskId: "t2" }],
      ]),
    }));
    expect(r).toEqual({
      ok: true,
      effect: { kind: "moveTask", sourceId: "t1", newProjectId: "p1", newParentTaskId: "t3" },
    });
  });

  it("rejects task cycle — drop a task onto one of its own descendants", () => {
    // t2 is a descendant of t1 (t2.parent = t1). Dragging t1 onto t2 must
    // be rejected so we don't create an a → b → a cycle.
    const r = validateDrop("dnd-task:t1", "dnd-task:t2", mkCtx({
      tasksById: new Map([
        ["t1", { projectId: "p1", parentTaskId: null }],
        ["t2", { projectId: "p1", parentTaskId: "t1" }],
      ]),
    }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/descendant/i);
  });

  it("task → task cross-project is allowed", () => {
    const r = validateDrop("dnd-task:t1", "dnd-task:t2", mkCtx({
      tasksById: new Map([
        ["t1", { projectId: "p1", parentTaskId: null }],
        ["t2", { projectId: "p2", parentTaskId: null }],
      ]),
    }));
    expect(r).toEqual({
      ok: true,
      effect: { kind: "moveTask", sourceId: "t1", newProjectId: "p2", newParentTaskId: "t2" },
    });
  });

  it("task → project clears parent task", () => {
    const r = validateDrop("dnd-task:t1", "dnd-proj:p2", mkCtx());
    expect(r).toEqual({
      ok: true,
      effect: { kind: "moveTask", sourceId: "t1", newProjectId: "p2", newParentTaskId: null },
    });
  });

  it("subtask → project clears parent task", () => {
    const r = validateDrop("dnd-sub:t3", "dnd-proj:p2", mkCtx());
    expect(r).toEqual({
      ok: true,
      effect: { kind: "moveTask", sourceId: "t3", newProjectId: "p2", newParentTaskId: null },
    });
  });

  // Timeline Slice 1 — regression guard. `moveTaskToCategory` is a
  // validateDrop output the portfolio handleDragEnd switch forgot to handle,
  // causing task→category drops to silently fail on the org timeline. The
  // switch now has a case for it; this test pins the effect shape so the
  // case can't drift out of sync with the validator again.
  it("task → category emits moveTaskToCategory", () => {
    const r = validateDrop("dnd-task:t1", "dnd-cat:c1", mkCtx());
    expect(r).toEqual({
      ok: true,
      effect: { kind: "moveTaskToCategory", sourceId: "t1", newCategoryId: "c1" },
    });
  });

  it("subtask → category emits moveTaskToCategory", () => {
    const r = validateDrop("dnd-sub:t3", "dnd-cat:c1", mkCtx());
    expect(r).toEqual({
      ok: true,
      effect: { kind: "moveTaskToCategory", sourceId: "t3", newCategoryId: "c1" },
    });
  });

  it("rejects unsupported combinations (project → project, project → task, category → task)", () => {
    expect(validateDrop("dnd-proj:p1", "dnd-proj:p2", mkCtx()).ok).toBe(false);
    expect(validateDrop("dnd-proj:p1", "dnd-task:t1", mkCtx()).ok).toBe(false);
    expect(validateDrop("dnd-cat:c1",  "dnd-task:t1", mkCtx()).ok).toBe(false);
  });

  it("rejects task self-parenting (task onto its own subtask)", () => {
    const r = validateDrop("dnd-task:t1", "dnd-sub:t2", mkCtx({
      tasksById: new Map([
        ["t1", { projectId: "p1", parentTaskId: null }],
        ["t2", { projectId: "p1", parentTaskId: "t1" }],
      ]),
    }));
    // Target subtask's parent is t1 (= source). Source would become its own
    // sibling-of-self, i.e. child of t1 (= itself). Must reject.
    expect(r.ok).toBe(false);
  });
});

describe("darken", () => {
  it("returns a lower-RGB hex for the given percentage", () => {
    // #808080 (128) → -12% of 128 ≈ -15 → 113 (0x71)
    expect(darken("#808080", 12)).toBe("#717171");
  });

  it("floors at #000000", () => {
    expect(darken("#000000", 50)).toBe("#000000");
  });

  it("normalises 3-digit hex", () => {
    // #abc → #aabbcc → each channel × 0.88 = (150, 165, 180) = #96a5b4
    expect(darken("#abc", 12)).toBe("#96a5b4");
  });

  it("handles Larry brand purple", () => {
    // #6c44f6 = (108, 68, 246). × 0.88 → (95, 60, 216) = #5f3cd8
    expect(darken("#6c44f6", 12)).toBe("#5f3cd8");
  });

  it("returns the input when the hex is invalid", () => {
    expect(darken("not-a-hex", 12)).toBe("not-a-hex");
  });
});
