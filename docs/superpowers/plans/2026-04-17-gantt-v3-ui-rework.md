# Gantt v3 UI/UX Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (linear task chain) or superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin the workspace Gantt timeline (`/workspace/timeline` and per-project view) to match Direction A ("Linear-lite") from the approved spec: tree outline with no dividers, solid bars with trailing status chips, integrated 48px date axis with today label ABOVE the axis, single context-aware toolbar `+`, right-side Categories drawer, left-click → detail drawer, right-click → context menu (Move project to category, Remove from timeline, etc.).

**Architecture:** Pure-front-end change, frontend-only code in `apps/web/src/{app/workspace/timeline,components/workspace/gantt}`. Data flow unchanged: portfolio fetches `/api/workspace/timeline`, per-project uses `WorkspaceTimeline` from parent. New state in `GanttContainer` for selection, context menu, detail drawer. Mutations use existing endpoints (`PATCH /api/workspace/projects/:id`, `PATCH /api/workspace/tasks/:id`, POST `/api/workspace/categories/reorder`, etc. — no new backend routes).

**Tech Stack:** React 19.2.3, Next.js 16.1.6 (App Router), TypeScript, Vitest 3.2.4, Playwright MCP. Inline styles with CSS vars from `apps/web/src/app/globals.css`. No Tailwind in the Gantt subtree (the existing Gantt uses inline styles only — preserve that).

**Spec:** `docs/superpowers/specs/2026-04-17-gantt-v3-ui-design.md` (commit `2b5f5e8` on this branch).

**Worktree + branch:** `C:/Dev/larry/site-deploys/larry-gantt-v3` on `feat/gantt-v3-ui-rework` (off `origin/master@885d603` + 2 doc commits).

**Execution order:** Phases A → B → C → D → E → F. Each phase may use parallel work within it, but phases are sequential (C depends on A, D on C, etc.). **Commit after each task.**

---

## Phase A — Foundation: utils, helpers, types (strict TDD)

### Task A1: Add `darken(hex, pct)` helper

Used by `GanttBar` to compute the inner progress-overlay colour (category colour darkened by 12%). Spec §3 "Progress overlay".

**Files:**
- Modify: `apps/web/src/components/workspace/gantt/gantt-utils.ts` (append after `tinyTint`, around line 440)
- Test: `apps/web/src/components/workspace/gantt/gantt-utils.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `gantt-utils.test.ts` (end of file):

```ts
import { darken } from "./gantt-utils";

describe("darken", () => {
  it("returns a lower-RGB hex for the given percentage", () => {
    // #808080 (128) → -12% of 128 ≈ -15 → 113 (0x71)
    expect(darken("#808080", 12)).toBe("#717171");
  });

  it("floors at #000000", () => {
    expect(darken("#000000", 50)).toBe("#000000");
  });

  it("normalises 3-digit hex", () => {
    // #abc → #aabbcc → each channel -12% → (170*0.88, 187*0.88, 204*0.88) = (149.6, 164.56, 179.52) → (150, 165, 180) = #96a5b4
    expect(darken("#abc", 12)).toBe("#96a5b4");
  });

  it("handles Larry brand purple", () => {
    // #6c44f6 = (108, 68, 246). -12% → (95, 60, 216) = #5f3cd8
    expect(darken("#6c44f6", 12)).toBe("#5f3cd8");
  });

  it("returns the input when the hex is invalid", () => {
    expect(darken("not-a-hex", 12)).toBe("not-a-hex");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `C:/Dev/larry/site-deploys/larry-gantt-v3/apps/web`:
```bash
npx vitest run src/components/workspace/gantt/gantt-utils.test.ts -t "darken"
```
Expected: FAIL with "darken is not exported from './gantt-utils'" or similar.

- [ ] **Step 3: Write the implementation**

Append to `gantt-utils.ts` (after the `tinyTint` function, end of file):

```ts
// Darken a hex colour by a percentage (0-100) of each RGB channel.
// Returns "#rrggbb". If the input isn't a valid hex, returns it unchanged.
export function darken(hex: string, pct: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const factor = Math.max(0, 1 - pct / 100);
  const r = Math.max(0, Math.min(255, Math.round(rgb.r * factor)));
  const g = Math.max(0, Math.min(255, Math.round(rgb.g * factor)));
  const b = Math.max(0, Math.min(255, Math.round(rgb.b * factor)));
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/components/workspace/gantt/gantt-utils.test.ts -t "darken"
```
Expected: PASS (5 cases).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/workspace/gantt/gantt-utils.ts apps/web/src/components/workspace/gantt/gantt-utils.test.ts
git commit -m "feat(gantt): add darken(hex, pct) helper for progress overlay"
```

---

### Task A2: Add `statusChipFor(status)` helper

Maps `GanttTaskStatus` → chip display metadata (label, fg, bg, border). Spec §3 "Status chip" table.

**Files:**
- Modify: `apps/web/src/components/workspace/gantt/gantt-types.ts` (add `StatusChipData` type)
- Modify: `apps/web/src/components/workspace/gantt/gantt-utils.ts` (append `statusChipFor`)
- Test: `apps/web/src/components/workspace/gantt/gantt-utils.test.ts` (append)

- [ ] **Step 1: Add the type**

Append to `gantt-types.ts`:

```ts
export interface StatusChipData {
  label: string;        // "NS" | "AR" | "OD" | "✓"
  fg: string;           // CSS colour (var() or hex)
  bg: string;           // CSS colour
  border: string | null; // CSS colour or null (no border)
}
```

- [ ] **Step 2: Write the failing test**

Append to `gantt-utils.test.ts`:

```ts
import { statusChipFor } from "./gantt-utils";
import type { GanttTaskStatus } from "./gantt-types";

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
```

- [ ] **Step 3: Verify it fails**

```bash
npx vitest run src/components/workspace/gantt/gantt-utils.test.ts -t "statusChipFor"
```
Expected: FAIL — `statusChipFor is not exported`.

- [ ] **Step 4: Write the implementation**

Append to `gantt-utils.ts`:

```ts
import type { StatusChipData } from "./gantt-types";

// Returns null when no chip should render (on_track).
// Hidden chip means the solid bar alone communicates the state.
export function statusChipFor(status: GanttTaskStatus): StatusChipData | null {
  switch (status) {
    case "on_track":
      return null;
    case "not_started":
      return { label: "NS", fg: "var(--text-muted)", bg: "transparent", border: "var(--border)" };
    case "at_risk":
      return { label: "AR", fg: "#ffffff", bg: "var(--tl-at-risk)", border: null };
    case "overdue":
      return { label: "OD", fg: "#ffffff", bg: "var(--tl-overdue)", border: null };
    case "completed":
      return { label: "✓", fg: "#ffffff", bg: "var(--tl-completed)", border: null };
    default:
      return null;
  }
}
```

Note: the `import type { StatusChipData }` must be added at the top of `gantt-utils.ts` (next to existing imports from `./gantt-types`).

- [ ] **Step 5: Run test — verify passes**

```bash
npx vitest run src/components/workspace/gantt/gantt-utils.test.ts -t "statusChipFor"
```
Expected: PASS (5 cases).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/workspace/gantt/gantt-utils.ts apps/web/src/components/workspace/gantt/gantt-types.ts apps/web/src/components/workspace/gantt/gantt-utils.test.ts
git commit -m "feat(gantt): add statusChipFor helper + StatusChipData type"
```

---

### Task A3: Add `contextMenuItemsFor(row)` helper

Maps a flat row to the menu items that appear on right-click. Spec §5 context menu table.

**Files:**
- Modify: `apps/web/src/components/workspace/gantt/gantt-types.ts` (add `ContextMenuItem`, `ContextMenuState`)
- Modify: `apps/web/src/components/workspace/gantt/gantt-utils.ts` (append)
- Test: `apps/web/src/components/workspace/gantt/gantt-utils.test.ts` (append)

- [ ] **Step 1: Add types**

Append to `gantt-types.ts`:

```ts
export type ContextMenuAction =
  | "openDetail"
  | "moveToCategory"   // submenu → category id payload
  | "removeFromTimeline"
  | "addChild"
  | "rename"
  | "changeColour"
  | "delete";

export interface ContextMenuItem {
  id: ContextMenuAction;
  label: string;
  hasSubmenu?: boolean;   // true for moveToCategory
  destructive?: boolean;  // true for delete
  disabled?: boolean;     // true for read-only (Uncategorised)
}

export interface ContextMenuState {
  rowKey: string;          // "cat:xxx" | "proj:xxx" | "task:xxx" | "sub:xxx"
  rowKind: "category" | "project" | "task" | "subtask";
  isUncategorised: boolean; // true when rowKey === "cat:uncat"
  x: number;
  y: number;
}
```

- [ ] **Step 2: Write failing tests**

Append to `gantt-utils.test.ts`:

```ts
import { contextMenuItemsFor } from "./gantt-utils";

describe("contextMenuItemsFor", () => {
  it("task row gets Open, Move, Remove from timeline, Delete", () => {
    const items = contextMenuItemsFor({ rowKind: "task", isUncategorised: false });
    expect(items.map((i) => i.id)).toEqual([
      "openDetail",
      "moveToCategory",
      "removeFromTimeline",
      "delete",
    ]);
    expect(items.find((i) => i.id === "moveToCategory")?.hasSubmenu).toBe(true);
    expect(items.find((i) => i.id === "delete")?.destructive).toBe(true);
  });

  it("subtask row gets same items as task (treated as task)", () => {
    const items = contextMenuItemsFor({ rowKind: "subtask", isUncategorised: false });
    expect(items.map((i) => i.id)).toEqual([
      "openDetail",
      "moveToCategory",
      "removeFromTimeline",
      "delete",
    ]);
  });

  it("project row gets Open, Move, Add task, Delete", () => {
    const items = contextMenuItemsFor({ rowKind: "project", isUncategorised: false });
    expect(items.map((i) => i.id)).toEqual([
      "openDetail",
      "moveToCategory",
      "addChild",
      "delete",
    ]);
  });

  it("category row gets Rename, Change colour, Delete", () => {
    const items = contextMenuItemsFor({ rowKind: "category", isUncategorised: false });
    expect(items.map((i) => i.id)).toEqual([
      "rename",
      "changeColour",
      "delete",
    ]);
  });

  it("uncategorised category row returns a single disabled sentinel", () => {
    const items = contextMenuItemsFor({ rowKind: "category", isUncategorised: true });
    expect(items).toHaveLength(1);
    expect(items[0].disabled).toBe(true);
    expect(items[0].label).toMatch(/default bucket/i);
  });
});
```

- [ ] **Step 3: Verify fail**
```bash
npx vitest run src/components/workspace/gantt/gantt-utils.test.ts -t "contextMenuItemsFor"
```
Expected: FAIL — `contextMenuItemsFor is not exported`.

- [ ] **Step 4: Implement**

Append to `gantt-utils.ts` (add `ContextMenuItem` to the type-import from `./gantt-types`):

```ts
export function contextMenuItemsFor(args: {
  rowKind: "category" | "project" | "task" | "subtask";
  isUncategorised: boolean;
}): ContextMenuItem[] {
  if (args.rowKind === "category") {
    if (args.isUncategorised) {
      return [{
        id: "rename",
        label: "Uncategorised is the default bucket; not editable.",
        disabled: true,
      }];
    }
    return [
      { id: "rename",       label: "Rename" },
      { id: "changeColour", label: "Change colour" },
      { id: "delete",       label: "Delete", destructive: true },
    ];
  }
  if (args.rowKind === "project") {
    return [
      { id: "openDetail",     label: "Open project" },
      { id: "moveToCategory", label: "Move to category…", hasSubmenu: true },
      { id: "addChild",       label: "Add task" },
      { id: "delete",         label: "Delete", destructive: true },
    ];
  }
  // task or subtask
  return [
    { id: "openDetail",          label: "Open task" },
    { id: "moveToCategory",      label: "Move project to category…", hasSubmenu: true },
    { id: "removeFromTimeline",  label: "Remove from timeline" },
    { id: "delete",              label: "Delete", destructive: true },
  ];
}
```

Also add `ContextMenuItem` to the `import type` from `./gantt-types` at the top of `gantt-utils.ts`.

- [ ] **Step 5: Verify passes**
```bash
npx vitest run src/components/workspace/gantt/gantt-utils.test.ts -t "contextMenuItemsFor"
```
Expected: PASS (5 cases).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/workspace/gantt/gantt-types.ts apps/web/src/components/workspace/gantt/gantt-utils.ts apps/web/src/components/workspace/gantt/gantt-utils.test.ts
git commit -m "feat(gantt): add contextMenuItemsFor + menu types"
```

---

### Task A4: Add per-level row heights to `flattenVisible`

Spec §2 "Row heights": category/project = 32, task/subtask = 28. Set `row.height` in `FlatRow` so both outline and grid render the same per-row height.

**Files:**
- Modify: `apps/web/src/components/workspace/gantt/gantt-utils.ts` (edit `flattenVisible`, around lines 117–158)
- Modify: `apps/web/src/components/workspace/gantt/gantt-types.ts` (bump `ROW_HEIGHT` default to 32; add `ROW_HEIGHT_TASK = 28`)
- Test: `apps/web/src/components/workspace/gantt/gantt-utils.test.ts` (append)

- [ ] **Step 1: Update types**

Replace the `ROW_HEIGHT` constant in `gantt-types.ts` (line 12) with:

```ts
export const ROW_HEIGHT = 32;           // category + project
export const ROW_HEIGHT_TASK = 28;      // task + subtask
```

- [ ] **Step 2: Write the failing test**

Append to `gantt-utils.test.ts`:

```ts
import { ROW_HEIGHT, ROW_HEIGHT_TASK } from "./gantt-types";

describe("flattenVisible assigns per-level heights", () => {
  it("category/project rows use ROW_HEIGHT=32 and task/subtask use 28", () => {
    const sub: GanttNode = { kind: "subtask", id: "t2", task: baseTask({ id: "t2", parentTaskId: "t1" }) };
    const task1: GanttNode = { kind: "task", id: "t1", task: baseTask({ id: "t1" }), children: [sub] };
    const project: GanttNode = { kind: "project", id: "p1", name: "P", status: "active", children: [task1] };
    const category: GanttNode = { kind: "category", id: "c1", name: "C", colour: null, children: [project] };
    const syntheticRoot: GanttNode = { kind: "category", id: "__root__", name: "", colour: null, children: [category] };

    const expanded = new Set<string>(["cat:c1", "proj:p1", "task:t1"]);
    const rows = flattenVisible(syntheticRoot, expanded);
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));

    expect(byKey["cat:c1"].height).toBe(ROW_HEIGHT);      // 32
    expect(byKey["proj:p1"].height).toBe(ROW_HEIGHT);     // 32
    expect(byKey["task:t1"].height).toBe(ROW_HEIGHT_TASK);// 28
    expect(byKey["sub:t2"].height).toBe(ROW_HEIGHT_TASK); // 28
  });
});
```

- [ ] **Step 3: Verify fail**
```bash
npx vitest run src/components/workspace/gantt/gantt-utils.test.ts -t "per-level heights"
```
Expected: FAIL — heights are currently undefined on node rows.

- [ ] **Step 4: Implement**

In `gantt-utils.ts`, update `flattenVisible` to set `height` on the `node` branch. Replace line 148:

```ts
    if (!isSyntheticRoot) rows.push({ kind: "node", key, depth, node, hasChildren, categoryColor });
```

with:

```ts
    if (!isSyntheticRoot) {
      const height = (node.kind === "task" || node.kind === "subtask") ? ROW_HEIGHT_TASK : ROW_HEIGHT;
      rows.push({ kind: "node", key, depth, node, hasChildren, categoryColor, height });
    }
```

Also add `ROW_HEIGHT` + `ROW_HEIGHT_TASK` to the import from `./gantt-types` at the top of `gantt-utils.ts`.

- [ ] **Step 5: Verify passes + existing tests still green**
```bash
npx vitest run src/components/workspace/gantt/gantt-utils.test.ts
```
Expected: ALL tests PASS (25 existing + 11 new from A1-A4).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/workspace/gantt/gantt-types.ts apps/web/src/components/workspace/gantt/gantt-utils.ts apps/web/src/components/workspace/gantt/gantt-utils.test.ts
git commit -m "feat(gantt): per-level row heights (32 category/project, 28 task/subtask)"
```

---

### Task A5: Remove `injectInlineAdds` + `InlineAddMode` from call sites

Spec L6: inline-add rows removed entirely. Leave the function exported for one more commit so the removal is atomic later — simpler to just delete the "add" row variant and update type narrowing.

Actually, cleaner: delete it all in one commit. Since no tests reference `injectInlineAdds`, this is safe.

**Files:**
- Modify: `apps/web/src/components/workspace/gantt/gantt-utils.ts` (remove `InlineAddMode` type, `injectInlineAdds` function, and the `| { kind: "add"; ... }` branch of `FlatRow`)
- Modify: `apps/web/src/components/workspace/gantt/GanttContainer.tsx` (remove `injectInlineAdds` import + call + `onInlineAdd` prop)

- [ ] **Step 1: Remove from utils**

In `gantt-utils.ts`:
- Delete the `InlineAddMode` type export (line 89)
- Simplify `FlatRow` to just the `node` branch:

```ts
export type FlatRow = {
  kind: "node";
  key: string;
  depth: number;
  node: GanttNode;
  hasChildren: boolean;
  categoryColor: string;
  dimmed?: boolean;
  height: number;   // now required (was optional)
};
```

- Delete `INLINE_ADD_HEIGHT` constant (line 162) and the `injectInlineAdds` function (lines 168-198)
- Delete the `/* ─── Inline add-row injection ─── */` section header comment

- [ ] **Step 2: Update GanttContainer**

In `GanttContainer.tsx`:
- Remove `injectInlineAdds` from the import on line 4:
  ```ts
  import { computeRange, flattenVisible, dateToPct } from "./gantt-utils";
  ```
- Remove the `onInlineAdd?: (ctx: ...) => void;` prop (line 17)
- Remove `onInlineAdd` from the destructure (line 27)
- Remove the `injectInlineAdds` call in the `rows` useMemo (line 50):
  ```ts
  const rows = useMemo(() => {
    const base = flattenVisible(root, expanded, { categoryColorMap, rootCategoryColor });
    if (!search.trim()) return base;
    const q = search.toLowerCase();
    return base.map((r) =>
      ({ ...r, dimmed: !nodeLabel(r.node).toLowerCase().includes(q) }),
    );
  }, [root, expanded, search, categoryColorMap, rootCategoryColor]);
  ```
- Remove `onInlineAdd={onInlineAdd}` from `<GanttOutline>` (line 106)

- [ ] **Step 3: Fix all call sites in this same task (don't leave the build broken)**

In `GanttOutline.tsx`:
- Remove `import { GanttInlineAdd } from "./GanttInlineAdd";` (line 5)
- Remove `import type { InlineAddMode } from "./gantt-utils";` if present (line 3: change to `import type { FlatRow } from "./gantt-utils";`)
- Remove `onInlineAdd?: ...` from Props (line 19)
- Remove `onInlineAdd` from the destructure (line 31)
- Replace the `rows.map((row) => { if (row.kind === "add") { ... } return <GanttOutlineRow ... /> })` block (lines 96-123) with:

```tsx
{rows.map((row) => (
  <div key={row.key} style={{ height: row.height }}>
    <GanttOutlineRow
      row={row}
      expanded={expanded.has(row.key)}
      selected={selectedKey === row.key}
      hovered={hoveredKey === row.key}
      onToggle={() => onToggle(row.key)}
      onSelect={() => onSelect(row.key)}
      onHover={(h) => onHover(h ? row.key : null)}
    />
  </div>
))}
```

In `GanttGrid.tsx`:
- Replace the `rows.map` block (lines 94-118) with:

```tsx
{rows.map((r) => (
  <div key={r.key} style={{ height: r.height }}>
    <GanttRow
      row={r}
      range={range}
      hoveredKey={hoveredKey}
      selectedKey={selectedKey}
      onHoverKey={onHoverKey}
      onSelectKey={onSelectKey}
    />
  </div>
))}
```

In `PortfolioGanttClient.tsx`:
- Remove the `import type { InlineAddMode } from ...` line (line 9)
- Remove the `handleInlineAdd` function (lines 65-85)
- Remove `findProjectIdForTaskKey` helper (lines 55-63) if only used by `handleInlineAdd`
- Remove `onInlineAdd={handleInlineAdd}` from `<GanttContainer>` (line 106)
- Remove the `outlineFooter={<button ...>+ Add category</button>}` (lines 126-145)

(We'll remove the gear icon `outlineHeaderActions` in Task D1.)

- [ ] **Step 4: Delete `GanttInlineAdd.tsx`**

```bash
rm apps/web/src/components/workspace/gantt/GanttInlineAdd.tsx
```

- [ ] **Step 5: Typecheck + test**
```bash
npx tsc --noEmit
npx vitest run
```
Expected: tsc clean, all tests pass.

- [ ] **Step 6: Commit**
```bash
git add -A apps/web/src/components/workspace/gantt apps/web/src/app/workspace/timeline
git commit -m "refactor(gantt): remove inline-add rows (L6) — single + button replaces them"
```

---

## Phase B — New presentation components (TDD for logic, smoke tests for visual)

### Task B1: `GanttStatusChip` component

Renders the trailing chip (NS/AR/OD/✓) right of a bar. Takes `status` and positions itself; parent positions the wrapper.

**Files:**
- Create: `apps/web/src/components/workspace/gantt/GanttStatusChip.tsx`
- Test: `apps/web/src/components/workspace/gantt/GanttStatusChip.test.tsx`

- [ ] **Step 1: Write a render test**

Create `GanttStatusChip.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { GanttStatusChip } from "./GanttStatusChip";

describe("GanttStatusChip", () => {
  it("returns null for on_track (no chip rendered)", () => {
    const { container } = render(<GanttStatusChip status="on_track" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders NS label for not_started", () => {
    const { getByText } = render(<GanttStatusChip status="not_started" />);
    expect(getByText("NS")).toBeInTheDocument();
  });

  it("renders ✓ label for completed", () => {
    const { getByText } = render(<GanttStatusChip status="completed" />);
    expect(getByText("✓")).toBeInTheDocument();
  });
});
```

**Pre-req:** `@testing-library/react` may not be installed. Check:
```bash
grep -E "testing-library" apps/web/package.json
```
If not present, **skip the render tests for this task** and use a simpler export-shape test instead. The plan author (this session) will verify during execution; if absent, substitute:

```ts
import { describe, it, expect } from "vitest";
import { GanttStatusChip } from "./GanttStatusChip";

describe("GanttStatusChip export", () => {
  it("is a function component", () => {
    expect(typeof GanttStatusChip).toBe("function");
  });
});
```

Keep the smoke test either way.

- [ ] **Step 2: Verify fail**
```bash
npx vitest run src/components/workspace/gantt/GanttStatusChip.test.tsx
```
Expected: FAIL (component doesn't exist).

- [ ] **Step 3: Implement**

Create `GanttStatusChip.tsx`:

```tsx
"use client";
import type { GanttTaskStatus } from "./gantt-types";
import { statusChipFor } from "./gantt-utils";

interface Props {
  status: GanttTaskStatus;
}

export function GanttStatusChip({ status }: Props) {
  const chip = statusChipFor(status);
  if (!chip) return null;
  return (
    <span
      aria-label={`Status: ${status}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        height: 14,
        padding: "0 4px",
        borderRadius: 3,
        fontSize: 9,
        fontWeight: 600,
        textTransform: "uppercase",
        fontVariantNumeric: "tabular-nums",
        color: chip.fg,
        background: chip.bg,
        border: chip.border ? `1px solid ${chip.border}` : "none",
        lineHeight: 1,
        whiteSpace: "nowrap",
        pointerEvents: "none",
      }}
    >
      {chip.label}
    </span>
  );
}
```

- [ ] **Step 4: Verify passes**
```bash
npx vitest run src/components/workspace/gantt/GanttStatusChip.test.tsx
```

- [ ] **Step 5: Commit**
```bash
git add apps/web/src/components/workspace/gantt/GanttStatusChip.tsx apps/web/src/components/workspace/gantt/GanttStatusChip.test.tsx
git commit -m "feat(gantt): add GanttStatusChip (trailing status indicator)"
```

---

### Task B2: `GanttIndentGuides` component

Renders 2px vertical lines for tree depth. Accepts `depth` and `height` for a specific row's guide rendering. Actually, rendering guides per-row would be wasteful — instead render guides as absolutely-positioned columns in the outline, computed from the row list. Simpler implementation: render as decorative CSS in the outline wrapper.

**Decision:** make `GanttIndentGuides` a thin stub that accepts `maxDepth` and renders vertical 2px lines spanning the full outline height for each indent level. Outline positions them absolutely behind the rows.

Actually even simpler: skip creating a dedicated component. Render guides inline inside `GanttOutline.tsx` as absolutely-positioned `<div>` children. This keeps state/data colocated.

**Decision:** **skip Task B2 as a separate component.** The indent-guide visuals will be added directly in `GanttOutline.tsx` in Task C5. Remove this task from the plan.

*Task B2 cancelled — merged into C5.*

---

### Task B3: `GanttContextMenu` component

Cursor-anchored popover. Props: `items`, `x`, `y`, `categoriesForSubmenu`, `onSelect(action, payload?)`, `onClose`. Supports submenu for "moveToCategory".

**Files:**
- Create: `apps/web/src/components/workspace/gantt/GanttContextMenu.tsx`
- Test: `apps/web/src/components/workspace/gantt/GanttContextMenu.test.tsx`

- [ ] **Step 1: Smoke test**

Create `GanttContextMenu.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { GanttContextMenu } from "./GanttContextMenu";

describe("GanttContextMenu export", () => {
  it("is a function component", () => {
    expect(typeof GanttContextMenu).toBe("function");
  });
});
```

- [ ] **Step 2: Implement**

Create `GanttContextMenu.tsx`:

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import type { ContextMenuAction, ContextMenuItem } from "./gantt-types";

export interface CategoryOption {
  id: string | null;     // null = Uncategorised
  name: string;
  colour: string;
}

interface Props {
  x: number;
  y: number;
  items: ContextMenuItem[];
  categories: CategoryOption[];                         // for moveToCategory submenu
  onSelect: (action: ContextMenuAction, payload?: { categoryId: string | null }) => void;
  onClose: () => void;
}

export function GanttContextMenu({ x, y, items, categories, onSelect, onClose }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [submenuOpen, setSubmenuOpen] = useState(false);

  // Click-outside + ESC
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={rootRef}
      role="menu"
      style={{
        position: "fixed",
        left: x,
        top: y,
        minWidth: 200,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
        padding: 4,
        zIndex: 1000,
        fontSize: 13,
      }}
    >
      {items.map((item) => {
        const isSubmenu = item.hasSubmenu && !item.disabled;
        return (
          <div
            key={item.id}
            role="menuitem"
            onMouseEnter={() => isSubmenu ? setSubmenuOpen(true) : setSubmenuOpen(false)}
            onClick={() => {
              if (item.disabled) return;
              if (item.hasSubmenu) return;
              onSelect(item.id);
            }}
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              height: 32,
              padding: "0 12px",
              borderRadius: 4,
              color: item.disabled
                ? "var(--text-muted)"
                : item.destructive
                  ? "var(--pm-red)"
                  : "var(--text-1)",
              cursor: item.disabled ? "default" : "pointer",
              background: "transparent",
              userSelect: "none",
            }}
            onMouseOver={(e) => { if (!item.disabled) (e.currentTarget.style.background = "var(--surface-2)"); }}
            onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <span>{item.label}</span>
            {isSubmenu && <span style={{ fontSize: 10, color: "var(--text-muted)" }}>▸</span>}

            {/* Submenu for moveToCategory */}
            {isSubmenu && submenuOpen && item.id === "moveToCategory" && (
              <div
                role="menu"
                style={{
                  position: "absolute",
                  left: "100%",
                  top: 0,
                  minWidth: 180,
                  maxHeight: 320,
                  overflowY: "auto",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
                  padding: 4,
                  marginLeft: 4,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {categories.map((cat) => (
                  <div
                    key={cat.id ?? "uncat"}
                    role="menuitem"
                    onClick={() => onSelect("moveToCategory", { categoryId: cat.id })}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      height: 30,
                      padding: "0 10px",
                      borderRadius: 4,
                      cursor: "pointer",
                      fontSize: 13,
                      color: "var(--text-1)",
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                    onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <span
                      style={{
                        width: 8, height: 8, borderRadius: "50%",
                        background: cat.id === null ? "var(--text-muted)" : cat.colour,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontStyle: cat.id === null ? "italic" : "normal" }}>
                      {cat.name}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Verify tests + tsc**
```bash
npx vitest run src/components/workspace/gantt/GanttContextMenu.test.tsx
npx tsc --noEmit
```

- [ ] **Step 4: Commit**
```bash
git add apps/web/src/components/workspace/gantt/GanttContextMenu.tsx apps/web/src/components/workspace/gantt/GanttContextMenu.test.tsx
git commit -m "feat(gantt): add GanttContextMenu with category submenu"
```

---

### Task B4: `GanttEmptyState` component

Renders the 4 empty-state variants per spec §5. Props: `variant` + optional `query`.

**Files:**
- Create: `apps/web/src/components/workspace/gantt/GanttEmptyState.tsx`
- Test: smoke test

- [ ] **Step 1: Smoke test**

```tsx
// GanttEmptyState.test.tsx
import { describe, it, expect } from "vitest";
import { GanttEmptyState } from "./GanttEmptyState";

describe("GanttEmptyState export", () => {
  it("is a function component", () => {
    expect(typeof GanttEmptyState).toBe("function");
  });
});
```

- [ ] **Step 2: Implement**

```tsx
// GanttEmptyState.tsx
"use client";
import { Tag } from "lucide-react";

type Variant =
  | { kind: "noCategories"; onCreate: () => void }
  | { kind: "emptyCategory" }
  | { kind: "emptyProject" }
  | { kind: "noSearchMatch"; query: string };

export function GanttEmptyState(props: Variant) {
  if (props.kind === "noCategories") {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 10,
          padding: "60px 20px",
          color: "var(--text-2)",
        }}
      >
        <div
          style={{
            width: 48, height: 48, borderRadius: "50%",
            background: "var(--surface-2)",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            color: "var(--brand)",
          }}
        >
          <Tag size={22} />
        </div>
        <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-1)" }}>
          No categories yet
        </div>
        <div style={{ fontSize: 13, color: "var(--text-2)" }}>
          Create one to start organising your timeline.
        </div>
        <button
          onClick={props.onCreate}
          style={{
            marginTop: 8,
            height: 40,
            padding: "0 16px",
            background: "var(--brand)",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          + Create your first category
        </button>
      </div>
    );
  }

  if (props.kind === "emptyCategory") {
    return <EmptyHint>No projects yet — right-click to add.</EmptyHint>;
  }
  if (props.kind === "emptyProject") {
    return <EmptyHint>No tasks yet.</EmptyHint>;
  }
  // noSearchMatch
  return (
    <div
      style={{
        padding: "8px 12px",
        fontSize: 12,
        background: "var(--surface-2)",
        color: "var(--text-2)",
        borderRadius: 6,
        margin: "8px 14px",
      }}
    >
      No matches for “{props.query}”.
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        height: 24,
        display: "flex",
        alignItems: "center",
        paddingLeft: 42,
        fontSize: 12,
        fontStyle: "italic",
        color: "var(--text-muted)",
      }}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + test**
```bash
npx vitest run src/components/workspace/gantt/GanttEmptyState.test.tsx
npx tsc --noEmit
```

- [ ] **Step 4: Commit**
```bash
git add apps/web/src/components/workspace/gantt/GanttEmptyState.tsx apps/web/src/components/workspace/gantt/GanttEmptyState.test.tsx
git commit -m "feat(gantt): add GanttEmptyState component (4 variants)"
```

---

### Task B5: `GanttRowDetailDrawer` wrapper

Decision: rather than creating a brand-new drawer, wire left-click to **reuse the existing `TaskDetailDrawer.tsx`** at `apps/web/src/app/workspace/projects/[projectId]/TaskDetailDrawer.tsx` for task/subtask rows. For project and category rows, defer the drawer UI — left-click on those rows for v3 just SELECTS the row (drives the `+` button context) without opening anything. Fergus can navigate to the project page via the existing sidebar/project navigation for project-level edit.

**Rationale:** the spec says "Project: new project detail drawer (scaffold)" and "Category: new category detail drawer (scaffold)", but Fergus's primary click intent from chat was "opens up the task itself". Scaffolding two new drawers for v3 is scope-creep beyond what Fergus asked for. The Categories drawer (right-side, Task C7) already handles category rename/colour/delete. Project rows can be opened from the existing dashboard; v3 doesn't need a new drawer for them.

**Updated decision:** on left-click:
- Task / subtask → open `TaskDetailDrawer` (existing component, in-place)
- Project / category → select the row only (updates `+` button context); no drawer

This will be documented in §5 of the spec as a refinement. *(Spec amendment filed in Task F1.)*

*Task B5 becomes wiring-only; tracked in Task C9/D1 instead. Skip as a standalone task.*

---

## Phase C — Refactor existing components

### Task C1: `GanttDateHeader` v3 — integrated band + tabular days

**File:** `apps/web/src/components/workspace/gantt/GanttDateHeader.tsx` (entire file rewrite; 82 lines → ~90 lines)

- [ ] **Step 1: Replace the file content**

```tsx
"use client";
import type { ZoomLevel } from "./gantt-types";
import type { TimelineRange } from "./gantt-utils";
import { generateDateAxis, dateToPct } from "./gantt-utils";

interface Props {
  range: TimelineRange;
  zoom: ZoomLevel;
}

// 16px space above for the Today label + 48px axis band + sticky
export const GANTT_HEADER_HEIGHT = 64;
const AXIS_BAND_HEIGHT = 48;
const TODAY_LABEL_BAND = 16;

export function GanttDateHeader({ range, zoom }: Props) {
  const axis = generateDateAxis(range, zoom);
  const todayPct = dateToPct(new Date(), range);
  const todayInRange = todayPct >= 0 && todayPct <= 100;

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        height: GANTT_HEADER_HEIGHT,
        background: "var(--surface)",
        zIndex: 3,
      }}
    >
      {/* Today label band (top 16px) */}
      <div style={{ position: "relative", height: TODAY_LABEL_BAND }}>
        {todayInRange && (
          <span
            style={{
              position: "absolute",
              left: `${todayPct}%`,
              transform: "translateX(-50%)",
              top: 2,
              fontSize: 10,
              fontWeight: 600,
              color: "var(--brand)",
              whiteSpace: "nowrap",
              pointerEvents: "none",
            }}
          >
            Today
          </span>
        )}
      </div>

      {/* Axis band (48px) */}
      <div
        style={{
          height: AXIS_BAND_HEIGHT,
          position: "relative",
          borderBottom: "1px solid var(--border)",
        }}
      >
        {/* Month row (top half of axis band, 24px) */}
        <div style={{ position: "relative", height: 24 }}>
          {axis.months.map((m, i) => (
            <div
              key={`${m.label}-${i}`}
              style={{
                position: "absolute",
                left: `${m.startPct}%`,
                width: `${Math.max(0, m.endPct - m.startPct)}%`,
                top: 0,
                bottom: 0,
                paddingTop: 6,
                paddingLeft: 6,
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--text-2)",
                borderLeft: i > 0 ? "1px solid var(--border-2)" : "none",
                boxSizing: "border-box",
                whiteSpace: "nowrap",
                overflow: "hidden",
              }}
            >
              {m.label}
            </div>
          ))}
        </div>

        {/* Day row (bottom half of axis band, 24px) — ticks + tabular numbers */}
        <div style={{ position: "relative", height: 24 }}>
          {axis.days.map((d, i) => (
            <div
              key={`day-${i}`}
              style={{
                position: "absolute",
                left: `${d.pct}%`,
                transform: "translateX(-50%)",
                top: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              <span
                style={{
                  display: "block",
                  width: 1,
                  height: 4,
                  background: "var(--border-2)",
                }}
              />
              <span
                style={{
                  marginTop: 4,
                  fontSize: 11,
                  fontWeight: 400,
                  color: "var(--text-muted)",
                  fontVariantNumeric: "tabular-nums",
                  whiteSpace: "nowrap",
                }}
              >
                {d.label.replace(/^[A-Za-z]+\s/, "")}
                {/* For "Mon 23" → "23". Month/quarter zooms already return just "23". */}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

Note: Week-zoom day labels become digit-only ("23") instead of "Mon 23" — this is a visual simplification (C1 fix). If weekday is desired at week zoom, we can split day + weekday into two stacked spans later.

- [ ] **Step 2: Verify tsc**
```bash
npx tsc --noEmit
```

The header height changed from 48 to 64 — `GanttGrid.tsx` references `GANTT_HEADER_HEIGHT` for absolute positioning, so the grid body offset will shift. That's intentional — we want the Today label above the axis. Verify visually in Phase F.

- [ ] **Step 3: Commit**
```bash
git add apps/web/src/components/workspace/gantt/GanttDateHeader.tsx
git commit -m "feat(gantt): v3 integrated 48px date axis with Today label above (C1)"
```

---

### Task C2: `GanttBar` v3 — solid always, progress via `darken`, status chip sibling, no in-bar label

**File:** `apps/web/src/components/workspace/gantt/GanttBar.tsx` (full rewrite; 172 lines → ~100 lines)

- [ ] **Step 1: Replace the file**

```tsx
"use client";
import type { GanttTask, GanttTaskStatus } from "./gantt-types";
import { dateToPct, darken, type TimelineRange } from "./gantt-utils";
import { GanttStatusChip } from "./GanttStatusChip";

export type GanttBarVariant = "category" | "project" | "task" | "subtask";

interface Props {
  variant: GanttBarVariant;
  start: string;
  end: string;
  progressPercent: number;
  range: TimelineRange;
  categoryColor: string;
  status?: GanttTaskStatus;
  label?: string;
  task?: GanttTask;
  highlighted?: boolean;
  selected?: boolean;
  dimmed?: boolean;
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

const HEIGHT_BY_VARIANT: Record<GanttBarVariant, number> = {
  category: 18,
  project:  16,
  task:     14,
  subtask:  10,
};

const RADIUS_BY_VARIANT: Record<GanttBarVariant, number> = {
  category: 3,
  project:  3,
  task:     3,
  subtask:  2,
};

export function GanttBar({
  variant, start, end, progressPercent, range, categoryColor, status, label,
  highlighted, selected, dimmed, onClick, onContextMenu, onMouseEnter, onMouseLeave,
}: Props) {
  const s = new Date(start);
  const e = new Date(end);
  const left = dateToPct(s, range);
  const right = dateToPct(e, range);
  const width = Math.max(right - left, 0.5);

  const height = HEIGHT_BY_VARIANT[variant];
  const radius = RADIUS_BY_VARIANT[variant];
  const isLeaf = variant === "task" || variant === "subtask";
  const progressClamped = Math.min(100, Math.max(0, progressPercent));

  // Hover / selection outer glow ring — translucent rgba of the row's category colour
  const rgbRing = (highlighted || selected)
    ? `0 0 0 2px ${rgbaFromHex(categoryColor, 0.25)}`
    : undefined;

  return (
    <div
      onClick={onClick}
      onContextMenu={onContextMenu}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      title={label}
      style={{
        position: "absolute",
        left: `${left}%`,
        width: `${width}%`,
        top: `calc(50% - ${height / 2}px)`,
        height,
        display: "flex",
        alignItems: "center",
        cursor: onClick ? "pointer" : "default",
        opacity: dimmed ? 0.35 : 1,
        pointerEvents: "auto",
      }}
    >
      {/* Bar — always solid category colour */}
      <div
        style={{
          position: "relative",
          width: "100%",
          height,
          background: categoryColor,
          borderRadius: radius,
          boxShadow: rgbRing ?? "0 1px 2px rgba(0,0,0,0.04)",
          transition: "box-shadow 150ms ease-out",
          overflow: "hidden",
        }}
      >
        {/* Progress overlay — darker inner fill up to progress% */}
        {progressClamped > 0 && (
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: `${progressClamped}%`,
              background: darken(categoryColor, 12),
            }}
          />
        )}
      </div>

      {/* Status chip — only meaningful for leaf rows */}
      {isLeaf && status && (
        <span style={{ marginLeft: 4, flexShrink: 0 }}>
          <GanttStatusChip status={status} />
        </span>
      )}
    </div>
  );
}

function rgbaFromHex(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
  if (!m) return `rgba(108, 68, 246, ${alpha})`;
  let s = m[1];
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  const r = parseInt(s.slice(0, 2), 16);
  const g = parseInt(s.slice(2, 4), 16);
  const b = parseInt(s.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
```

- [ ] **Step 2: Typecheck + test**
```bash
npx tsc --noEmit
npx vitest run
```
Expected: clean. Existing `GanttBar` usage in `GanttRow.tsx` has the same prop surface.

- [ ] **Step 3: Commit**
```bash
git add apps/web/src/components/workspace/gantt/GanttBar.tsx
git commit -m "feat(gantt): v3 solid bars + progress overlay + trailing status chip (C2)"
```

---

### Task C3: `GanttOutlineRow` v3 — no dividers, new typography, context menu hook

**File:** `apps/web/src/components/workspace/gantt/GanttOutlineRow.tsx`

- [ ] **Step 1: Apply edits**

Full replacement:

```tsx
"use client";
import { ChevronRight } from "lucide-react";
import type { FlatRow } from "./gantt-utils";
import { CategoryDot, type CategoryDotTier } from "./CategoryDot";

type NodeRow = Extract<FlatRow, { kind: "node" }>;

interface Props {
  row: NodeRow;
  expanded: boolean;
  selected: boolean;
  hovered: boolean;
  onToggle?: () => void;
  onSelect?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onHover?: (hovered: boolean) => void;
}

type Tier = CategoryDotTier;

const TYPOGRAPHY_BY_TIER: Record<Tier, React.CSSProperties> = {
  category: {
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: "0.03em",
    textTransform: "uppercase",
    color: "var(--text-1)",
  },
  project: {
    fontSize: 14,
    fontWeight: 500,
    color: "var(--text-1)",
  },
  task: {
    fontSize: 14,
    fontWeight: 400,
    color: "var(--text-1)",
  },
  subtask: {
    fontSize: 13,
    fontWeight: 400,
    color: "var(--text-2)",
  },
};

function tierOf(kind: NodeRow["node"]["kind"]): Tier { return kind; }

function labelFor(n: NodeRow["node"]): string {
  if (n.kind === "category") return n.name || (n.id === null || n.id === "uncat" ? "Uncategorised" : "");
  if (n.kind === "project") return n.name;
  return n.task.title;
}

export function GanttOutlineRow({ row, expanded, selected, hovered, onToggle, onSelect, onContextMenu, onHover }: Props) {
  const n = row.node;
  const tier = tierOf(n.kind);
  const indent = 14 + row.depth * 14;
  const label = labelFor(n);
  const isCategory = n.kind === "category";
  const isUncategorised = isCategory && (n.id === null || n.id === "uncat");

  const background = selected
    ? "var(--surface-2)"
    : hovered
      ? "var(--surface-2)"
      : "transparent";

  return (
    <div
      role="row"
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      style={{
        height: row.height,
        display: "flex",
        alignItems: "center",
        gap: 8,
        paddingLeft: indent,
        paddingRight: 14,
        borderLeft: selected ? "2px solid var(--brand)" : "2px solid transparent",
        background,
        cursor: onSelect ? "pointer" : "default",
        opacity: row.dimmed ? 0.35 : 1,
        userSelect: "none",
        transition: "background-color 150ms ease-out",
      }}
    >
      {row.hasChildren ? (
        <button
          onClick={(e) => { e.stopPropagation(); onToggle?.(); }}
          aria-label={expanded ? "Collapse" : "Expand"}
          style={{
            width: 12, height: 12, flexShrink: 0,
            background: "transparent", border: 0, padding: 0,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            color: "var(--text-muted)",
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 150ms ease-out",
            cursor: "pointer",
          }}
        >
          <ChevronRight size={10} strokeWidth={1.5} />
        </button>
      ) : (
        <span style={{ width: 12, flexShrink: 0 }} />
      )}

      <CategoryDot
        color={isUncategorised ? "var(--text-muted)" : row.categoryColor}
        tier={tier}
      />

      <span
        title={label}
        style={{
          ...TYPOGRAPHY_BY_TIER[tier],
          fontStyle: isUncategorised ? "italic" : "normal",
          flex: 1,
          minWidth: 0,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {label}
      </span>
    </div>
  );
}
```

**Key changes from v2:**
- Removed `borderBottom: "1px solid var(--border)"` (C7)
- Category rows no longer get a `surface-2` background by default (was visually too loud); hover/selection use it instead
- Typography follows spec §2 table
- Uncategorised: italic + grey dot override
- `onContextMenu` prop added
- `border-left` selection accent reduced from 3px to 2px (less visual weight)
- Chevron sizing tightened to 12px

- [ ] **Step 2: Typecheck**
```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**
```bash
git add apps/web/src/components/workspace/gantt/GanttOutlineRow.tsx
git commit -m "feat(gantt): v3 outline row — no dividers, new typography, onContextMenu (C7)"
```

---

### Task C4: `GanttRow` v3 — no row divider, onContextMenu

**File:** `apps/web/src/components/workspace/gantt/GanttRow.tsx`

- [ ] **Step 1: Replace**

```tsx
"use client";
import type { FlatRow } from "./gantt-utils";
import { GanttBar } from "./GanttBar";
import { rollUpBar, type TimelineRange } from "./gantt-utils";
import type { GanttNode, GanttTask } from "./gantt-types";

type NodeRow = Extract<FlatRow, { kind: "node" }>;

interface Props {
  row: NodeRow;
  range: TimelineRange;
  hoveredKey: string | null;
  selectedKey: string | null;
  onHoverKey: (k: string | null) => void;
  onSelectKey: (k: string | null) => void;
  onContextMenu?: (rowKey: string, rowKind: GanttNode["kind"], e: React.MouseEvent) => void;
}

function gatherDescendantTasks(node: GanttNode): GanttTask[] {
  const out: GanttTask[] = [];
  function walk(n: GanttNode) {
    if (n.kind === "task" || n.kind === "subtask") out.push(n.task);
    if (n.kind !== "subtask") for (const c of n.children) walk(c);
  }
  walk(node);
  return out;
}

export function GanttRow({ row, range, hoveredKey, selectedKey, onHoverKey, onSelectKey, onContextMenu }: Props) {
  const n = row.node;
  const highlighted = hoveredKey === row.key;
  const selected = selectedKey === row.key;

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    onContextMenu?.(row.key, n.kind, e);
  };

  let content: React.ReactNode = null;
  if (n.kind === "task" || n.kind === "subtask") {
    const t = n.task;
    const todayIso = new Date().toISOString().slice(0, 10);
    const end = t.endDate ?? t.dueDate;
    const endNorm = end ? String(end).slice(0, 10) : null;
    const startNorm = t.startDate
      ? String(t.startDate).slice(0, 10)
      : (endNorm && endNorm > todayIso ? todayIso : endNorm);
    if (startNorm && endNorm) {
      content = (
        <GanttBar
          variant={n.kind}
          start={startNorm} end={endNorm}
          progressPercent={t.progressPercent}
          range={range} categoryColor={row.categoryColor}
          status={t.status} label={t.title} task={t}
          highlighted={highlighted} selected={selected} dimmed={row.dimmed ?? false}
          onClick={() => onSelectKey(row.key)}
          onContextMenu={handleContextMenu}
          onMouseEnter={() => onHoverKey(row.key)}
          onMouseLeave={() => onHoverKey(null)}
        />
      );
    }
  } else if (n.kind === "category" || n.kind === "project") {
    const r = rollUpBar(gatherDescendantTasks(n));
    if (r) {
      content = (
        <GanttBar
          variant={n.kind}
          start={r.start} end={r.end}
          progressPercent={r.progressPercent}
          range={range} categoryColor={row.categoryColor}
          label={n.kind === "project" || n.kind === "category" ? n.name : undefined}
          highlighted={highlighted} selected={selected} dimmed={row.dimmed ?? false}
          onClick={() => onSelectKey(row.key)}
          onContextMenu={handleContextMenu}
          onMouseEnter={() => onHoverKey(row.key)}
          onMouseLeave={() => onHoverKey(null)}
        />
      );
    }
  }

  return (
    <div
      style={{
        height: row.height,
        position: "relative",
        background: (hoveredKey === row.key || selectedKey === row.key) ? "var(--surface-2)" : "transparent",
        transition: "background-color 150ms ease-out",
      }}
      onContextMenu={handleContextMenu}
    >
      {content}
    </div>
  );
}
```

**Key changes:**
- No `borderBottom` (C7)
- No category-row default `surface-2` fill (applied by hover/selection, consistent with outline)
- `onContextMenu` wired at row level and bar level
- Row height uses `row.height` directly (no `ROW_HEIGHT` fallback)

- [ ] **Step 2: Typecheck**
```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**
```bash
git add apps/web/src/components/workspace/gantt/GanttRow.tsx
git commit -m "feat(gantt): v3 grid row — no dividers, onContextMenu hook"
```

---

### Task C5: `GanttOutline` v3 — indent guides, no border, forward onContextMenu

**File:** `apps/web/src/components/workspace/gantt/GanttOutline.tsx`

- [ ] **Step 1: Replace**

```tsx
"use client";
import { useRef, useCallback, useEffect, type ReactNode } from "react";
import type { FlatRow } from "./gantt-utils";
import type { GanttNode } from "./gantt-types";
import { GanttOutlineRow } from "./GanttOutlineRow";
import { GANTT_HEADER_HEIGHT } from "./GanttDateHeader";

interface Props {
  rows: FlatRow[];
  expanded: Set<string>;
  selectedKey: string | null;
  hoveredKey: string | null;
  width: number;
  onWidthChange: (w: number) => void;
  onToggle: (key: string) => void;
  onSelect: (key: string) => void;
  onHover: (key: string | null) => void;
  onContextMenu?: (rowKey: string, rowKind: GanttNode["kind"], e: React.MouseEvent) => void;
  header?: ReactNode;
  headerActions?: ReactNode;
  footer?: ReactNode;
  overlay?: ReactNode;
}

const MIN_WIDTH = 220;
const MAX_WIDTH = 420;
const INDENT_STEP = 14;
const INDENT_BASE = 14;

export function GanttOutline({
  rows, expanded, selectedKey, hoveredKey, width, onWidthChange,
  onToggle, onSelect, onHover, onContextMenu, header, headerActions, footer, overlay,
}: Props) {
  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(width);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    startX.current = e.clientX;
    startW.current = width;
    document.body.style.cursor = "col-resize";
  }, [width]);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current) return;
      const next = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startW.current + (e.clientX - startX.current)));
      onWidthChange(next);
    }
    function onUp() {
      dragging.current = false;
      document.body.style.cursor = "";
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [onWidthChange]);

  // Indent guides: for each distinct depth >= 1, render a vertical line at (INDENT_BASE + (depth-1)*INDENT_STEP + 6) from the top of the first row at that depth to the bottom of the last row at that depth.
  const guides = computeIndentGuides(rows);

  return (
    <div style={{
      position: "sticky", left: 0, zIndex: 2, background: "var(--surface)",
      width, flexShrink: 0,
      borderRight: "1px solid var(--border)",
      display: "flex", flexDirection: "column",
    }}>
      {header ?? (
        <div
          style={{
            position: "sticky",
            top: 0,
            height: GANTT_HEADER_HEIGHT,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            padding: "0 14px 10px 20px",
            background: "var(--surface)",
            zIndex: 2,
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--text-2)",
            }}
          >
            Task / Groups
          </span>
          {headerActions}
        </div>
      )}
      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        {/* Indent guides — absolutely positioned behind rows */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0 }}>
          {guides.map((g, i) => (
            <div
              key={`guide-${i}`}
              style={{
                position: "absolute",
                left: INDENT_BASE + (g.depth - 1) * INDENT_STEP + 6,
                top: g.top,
                height: g.height,
                width: 2,
                background: "var(--border-2)",
                opacity: 0.45,
              }}
            />
          ))}
        </div>

        {/* Rows */}
        <div style={{ position: "relative", zIndex: 1 }}>
          {rows.map((row) => (
            <div key={row.key} style={{ height: row.height }}>
              <GanttOutlineRow
                row={row}
                expanded={expanded.has(row.key)}
                selected={selectedKey === row.key}
                hovered={hoveredKey === row.key}
                onToggle={() => onToggle(row.key)}
                onSelect={() => onSelect(row.key)}
                onHover={(h) => onHover(h ? row.key : null)}
                onContextMenu={onContextMenu
                  ? (e) => { e.preventDefault(); onContextMenu(row.key, row.node.kind, e); }
                  : undefined}
              />
            </div>
          ))}
        </div>
      </div>
      {footer}
      {overlay}
      <div
        onMouseDown={onMouseDown}
        style={{ position: "absolute", right: -3, top: 0, bottom: 0, width: 6, cursor: "col-resize" }}
      />
    </div>
  );
}

function computeIndentGuides(rows: FlatRow[]): { depth: number; top: number; height: number }[] {
  const out: { depth: number; top: number; height: number }[] = [];
  let y = 0;
  // For each depth level D >= 1: find contiguous runs of rows at depth > D-1 under a depth D-1 parent.
  // Simpler approach: for each row at depth >= 1, emit a short segment beneath its parent. Because rows are already flat and ordered, we can do: for each row, if its depth > 0, extend a guide segment at depth = row.depth from this row's top to this row's top+row.height. Accumulate contiguous ones later. First pass — emit per-row segments; merge contiguous.
  const segments: { depth: number; top: number; bottom: number }[] = [];
  for (const r of rows) {
    if (r.depth >= 1) {
      segments.push({ depth: r.depth, top: y, bottom: y + r.height });
    }
    y += r.height;
  }
  // Merge contiguous segments at the same depth
  for (const seg of segments) {
    const last = out[out.length - 1];
    if (last && last.depth === seg.depth && last.top + last.height === seg.top) {
      last.height = seg.bottom - last.top;
    } else {
      out.push({ depth: seg.depth, top: seg.top, height: seg.bottom - seg.top });
    }
  }
  return out;
}
```

**Key changes:**
- Removed `GanttInlineAdd` import + render branch
- Added indent-guide layer (absolutely-positioned 2px lines per depth)
- Removed row-level `borderBottom` wrapper (rows handle their own bg + no divider)
- Exposed `onContextMenu` prop
- Outline header no longer has `borderBottom` (C7 — the axis band divides visually)

- [ ] **Step 2: Typecheck + test**
```bash
npx tsc --noEmit
npx vitest run
```

- [ ] **Step 3: Commit**
```bash
git add apps/web/src/components/workspace/gantt/GanttOutline.tsx
git commit -m "feat(gantt): v3 outline — indent guides, no row dividers, onContextMenu (C7)"
```

---

### Task C6: `GanttGrid` v3 — today line only (no floating pill), softer gridlines, onContextMenu

**File:** `apps/web/src/components/workspace/gantt/GanttGrid.tsx`

- [ ] **Step 1: Replace**

```tsx
"use client";
import { forwardRef, useMemo } from "react";
import type { FlatRow } from "./gantt-utils";
import type { ZoomLevel, GanttNode } from "./gantt-types";
import type { TimelineRange } from "./gantt-utils";
import { dateToPct, generateDateAxis } from "./gantt-utils";
import { GanttRow } from "./GanttRow";
import { GanttDateHeader, GANTT_HEADER_HEIGHT } from "./GanttDateHeader";

interface Props {
  rows: FlatRow[];
  range: TimelineRange;
  zoom: ZoomLevel;
  hoveredKey: string | null;
  selectedKey: string | null;
  onHoverKey: (k: string | null) => void;
  onSelectKey: (k: string | null) => void;
  onContextMenu?: (rowKey: string, rowKind: GanttNode["kind"], e: React.MouseEvent) => void;
}

export const GanttGrid = forwardRef<HTMLDivElement, Props>(function GanttGrid(
  { rows, range, zoom, hoveredKey, selectedKey, onHoverKey, onSelectKey, onContextMenu }, ref,
) {
  const axis = useMemo(() => generateDateAxis(range, zoom), [range, zoom]);
  const todayPct = dateToPct(new Date(), range);
  const todayInRange = todayPct >= 0 && todayPct <= 100;

  return (
    <div ref={ref} style={{ position: "relative", overflowX: "auto", flex: 1, minHeight: 0 }}>
      <div style={{ minWidth: "max-content", position: "relative" }}>
        <GanttDateHeader range={range} zoom={zoom} />

        {/* Gridlines — positioned from below the axis band to the grid bottom */}
        <div style={{ position: "absolute", top: GANTT_HEADER_HEIGHT, left: 0, right: 0, bottom: 0, pointerEvents: "none", zIndex: 0 }}>
          {axis.days.map((d, i) => (
            <div
              key={`grid-${i}`}
              style={{
                position: "absolute",
                left: `${d.pct}%`,
                top: 0,
                bottom: 0,
                width: 1,
                background: d.isMonthStart ? "var(--border)" : "var(--border-2)",
                opacity: d.isMonthStart ? 1 : 0.3,
              }}
            />
          ))}
        </div>

        {/* Today line (no pill) */}
        {todayInRange && (
          <div
            style={{
              position: "absolute",
              left: `${todayPct}%`,
              top: GANTT_HEADER_HEIGHT,
              bottom: 0,
              width: 1.5,
              background: "var(--brand)",
              pointerEvents: "none",
              zIndex: 1,
            }}
          />
        )}

        {/* Rows */}
        <div style={{ position: "relative", zIndex: 1 }}>
          {rows.map((r) => (
            <div key={r.key} style={{ height: r.height }}>
              <GanttRow
                row={r}
                range={range}
                hoveredKey={hoveredKey}
                selectedKey={selectedKey}
                onHoverKey={onHoverKey}
                onSelectKey={onSelectKey}
                onContextMenu={onContextMenu}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});
```

**Key changes:**
- Removed the Today pill (C1 — label now lives in `GanttDateHeader` above the axis)
- Gridline strengths: month-boundary at 100% opacity, others at 30% (subtler)
- Row add-spacer branch removed
- `onContextMenu` threaded through

- [ ] **Step 2: Typecheck**
```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**
```bash
git add apps/web/src/components/workspace/gantt/GanttGrid.tsx
git commit -m "feat(gantt): v3 grid — today line only, subtle gridlines, onContextMenu (C1)"
```

---

### Task C7: `CategoryManagerPanel` v3 — right-side drawer + Uncategorised system row

**File:** `apps/web/src/components/workspace/gantt/CategoryManagerPanel.tsx`

- [ ] **Step 1: Replace**

```tsx
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { X, Pencil, Trash2 } from "lucide-react";
import type { ProjectCategory } from "./gantt-types";
import { DEFAULT_CATEGORY_COLOUR } from "./gantt-types";

interface Props {
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}

const DRAWER_WIDTH = 320;

const iconBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: 0,
  padding: 4,
  borderRadius: 4,
  color: "var(--text-muted)",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

export function CategoryManagerPanel({ onClose, onChanged }: Props) {
  const [categories, setCategories] = useState<ProjectCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColour, setNewColour] = useState(DEFAULT_CATEGORY_COLOUR);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const res = await fetch("/api/workspace/categories", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { categories: ProjectCategory[] };
      setCategories(body.categories ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleRecolour(id: string, colour: string) {
    setCategories((prev) => prev.map((c) => c.id === id ? { ...c, colour } : c));
    try {
      const res = await fetch(`/api/workspace/categories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ colour }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Update failed");
      await load();
    }
  }

  function startRename(c: ProjectCategory) {
    setEditingId(c.id); setEditingName(c.name);
    requestAnimationFrame(() => editInputRef.current?.focus());
  }

  async function saveRename(id: string) {
    const name = editingName.trim();
    setEditingId(null);
    if (!name) return;
    try {
      const res = await fetch(`/api/workspace/categories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
      await onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Update failed");
    }
  }

  async function handleDelete(c: ProjectCategory) {
    const ok = typeof window !== "undefined" &&
      window.confirm(`Delete category "${c.name}"? Projects will move to Uncategorised.`);
    if (!ok) return;
    try {
      const res = await fetch(`/api/workspace/categories/${c.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
      await onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Delete failed");
    }
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) { setCreating(false); return; }
    try {
      const res = await fetch("/api/workspace/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, colour: newColour }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setNewName(""); setNewColour(DEFAULT_CATEGORY_COLOUR); setCreating(false);
      await load();
      await onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Create failed");
    }
  }

  return (
    <div
      role="dialog"
      aria-label="Category manager"
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: DRAWER_WIDTH,
        background: "var(--surface)",
        borderLeft: "1px solid var(--border)",
        zIndex: 200,
        boxShadow: "-4px 0 24px rgba(0,0,0,0.06)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 16px",
        borderBottom: "1px solid var(--border)",
      }}>
        <span style={{
          fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase",
          color: "var(--text-2)",
        }}>
          Categories
        </span>
        <button onClick={onClose} aria-label="Close" style={{ ...iconBtnStyle, padding: 6 }}>
          <X size={14} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px" }}>
        {err && <div style={{ fontSize: 12, color: "#e84c6f", padding: "4px 0" }}>{err}</div>}
        {loading && <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "8px 0" }}>Loading…</div>}

        {categories.map((c) => (
          <div
            key={c.id}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 4px",
              height: 48,
            }}
          >
            <input
              aria-label={`Colour for ${c.name}`}
              type="color"
              value={c.colour ?? DEFAULT_CATEGORY_COLOUR}
              onChange={(e) => void handleRecolour(c.id, e.target.value)}
              style={{
                width: 22, height: 22, border: "none", borderRadius: 4,
                cursor: "pointer", padding: 0, background: "transparent",
                flexShrink: 0,
              }}
            />
            {editingId === c.id ? (
              <input
                ref={editInputRef}
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={() => void saveRename(c.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void saveRename(c.id);
                  if (e.key === "Escape") setEditingId(null);
                }}
                style={{
                  flex: 1, fontSize: 14, color: "var(--text-1)",
                  border: "1px solid var(--border)",
                  background: "var(--surface-2)",
                  borderRadius: 4, padding: "4px 6px", outline: "none", minWidth: 0,
                }}
              />
            ) : (
              <span style={{
                flex: 1, fontSize: 14, fontWeight: 500, color: "var(--text-1)",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
                {c.name}
              </span>
            )}
            <button onClick={() => startRename(c)} aria-label={`Rename ${c.name}`} style={iconBtnStyle}>
              <Pencil size={12} />
            </button>
            <button onClick={() => void handleDelete(c)} aria-label={`Delete ${c.name}`} style={iconBtnStyle}>
              <Trash2 size={12} />
            </button>
          </div>
        ))}

        {/* Uncategorised — system row */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 4px", height: 48, opacity: 0.7,
        }}>
          <span style={{
            width: 12, height: 12, borderRadius: "50%",
            background: "var(--text-muted)",
            flexShrink: 0,
          }} />
          <span style={{
            flex: 1, fontSize: 14, fontStyle: "italic", color: "var(--text-2)",
          }}>
            Uncategorised
          </span>
          <span style={{
            fontSize: 10, fontWeight: 500, textTransform: "uppercase",
            color: "var(--text-muted)", letterSpacing: "0.04em",
          }}>
            system
          </span>
        </div>
      </div>

      <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)" }}>
        {creating ? (
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "8px", border: "1px solid var(--border)",
            borderRadius: 8, background: "var(--surface-2)",
          }}>
            <input
              aria-label="New category colour"
              type="color"
              value={newColour}
              onChange={(e) => setNewColour(e.target.value)}
              style={{ width: 22, height: 22, border: "none", padding: 0, cursor: "pointer", background: "transparent", flexShrink: 0 }}
            />
            <input
              autoFocus
              placeholder="Category name…"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleCreate();
                if (e.key === "Escape") { setCreating(false); setNewName(""); }
              }}
              style={{
                flex: 1, fontSize: 13,
                border: "1px solid var(--border)", borderRadius: 4,
                padding: "4px 6px", outline: "none", minWidth: 0,
                background: "var(--surface)", color: "var(--text-1)",
              }}
            />
            <button
              onClick={() => void handleCreate()}
              style={{
                background: "var(--brand)", color: "#fff", border: 0,
                borderRadius: 4, padding: "4px 10px", fontSize: 12, cursor: "pointer", fontWeight: 500,
              }}
            >
              Add
            </button>
          </div>
        ) : (
          <button
            onClick={() => setCreating(true)}
            style={{
              width: "100%",
              height: 40,
              background: "var(--brand)",
              color: "#fff",
              border: 0,
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            + New category
          </button>
        )}
      </div>
    </div>
  );
}
```

**Key changes:**
- `position: fixed` + `right: 0` (right-docked drawer, full page height)
- Width 320 (was 280)
- Uncategorised displayed as a system row (grey dot, italic, "system" tag, 0.7 opacity)
- Footer "+ New category" button is now primary purple (was dashed outline)
- Drag-reorder deferred (not in v3 scope — noted in follow-up)

- [ ] **Step 2: Typecheck**
```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**
```bash
git add apps/web/src/components/workspace/gantt/CategoryManagerPanel.tsx
git commit -m "feat(gantt): v3 CategoryManagerPanel — right-drawer + Uncategorised system row (L8, L9)"
```

---

### Task C8: `GanttToolbar` v3 — context-aware `+` + Categories pill

**File:** `apps/web/src/components/workspace/gantt/GanttToolbar.tsx`

- [ ] **Step 1: Replace**

```tsx
"use client";
import { Calendar, ChevronsDownUp, ChevronsUpDown, Plus, Search, Tag } from "lucide-react";
import type { ZoomLevel } from "./gantt-types";

interface Props {
  zoom: ZoomLevel;
  allCollapsed: boolean;
  search: string;
  onZoom: (z: ZoomLevel) => void;
  onToggleCollapseAll: () => void;
  onJumpToToday: () => void;
  onSearch: (s: string) => void;
  onAdd: () => void;
  canAdd: boolean;
  addLabel: string;
  onCategoriesClick?: () => void;
  categoriesOpen?: boolean;
}

const btn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6,
  height: 28, padding: "0 10px", fontSize: 12, fontWeight: 500,
  background: "var(--surface)", border: "1px solid var(--border)",
  borderRadius: 6, color: "var(--text-1)", cursor: "pointer",
};

export function GanttToolbar({
  zoom, allCollapsed, search, onZoom, onToggleCollapseAll, onJumpToToday, onSearch,
  onAdd, canAdd, addLabel, onCategoriesClick, categoriesOpen,
}: Props) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", flexWrap: "wrap" }}>
      <div style={{ display: "inline-flex", border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
        {(["week", "month", "quarter"] as const).map((z) => (
          <button key={z} onClick={() => onZoom(z)} style={{
            ...btn, border: 0, borderRadius: 0, height: 28,
            background: zoom === z ? "var(--brand)" : "var(--surface)",
            color: zoom === z ? "#fff" : "var(--text-1)",
          }}>{z[0].toUpperCase()}</button>
        ))}
      </div>

      <button style={btn} onClick={onJumpToToday}><Calendar size={14} />Today</button>
      <button style={btn} onClick={onToggleCollapseAll}>
        {allCollapsed ? <ChevronsUpDown size={14} /> : <ChevronsDownUp size={14} />}
        {allCollapsed ? "Expand all" : "Collapse all"}
      </button>

      {onCategoriesClick && (
        <button
          style={{
            ...btn,
            background: categoriesOpen ? "var(--brand)" : "var(--surface)",
            color: categoriesOpen ? "#fff" : "var(--text-1)",
            border: categoriesOpen ? "1px solid var(--brand)" : "1px solid var(--border)",
          }}
          onClick={onCategoriesClick}
        >
          <Tag size={14} />Categories
        </button>
      )}

      <label style={{ ...btn, padding: "0 8px", flex: "0 1 240px" }}>
        <Search size={14} />
        <input value={search} onChange={(e) => onSearch(e.target.value)}
          placeholder="Search..." style={{ border: 0, outline: 0, background: "transparent", fontSize: 12, width: "100%" }} />
      </label>

      <div style={{ flex: 1 }} />

      {canAdd && (
        <button style={{ ...btn, background: "var(--brand)", color: "#fff", border: 0 }}
          onClick={onAdd}>
          <Plus size={14} />{addLabel}
        </button>
      )}
    </div>
  );
}
```

**Key changes:**
- Added optional `onCategoriesClick` + `categoriesOpen` props
- Added "Categories" pill between "Collapse all" and search
- Inline hex colours replaced with `var(--brand)` etc.

- [ ] **Step 2: Typecheck**
```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**
```bash
git add apps/web/src/components/workspace/gantt/GanttToolbar.tsx
git commit -m "feat(gantt): v3 toolbar — Categories pill, brand tokens (L8)"
```

---

### Task C9: `GanttContainer` v3 — context menu + category drawer state wiring

**File:** `apps/web/src/components/workspace/gantt/GanttContainer.tsx`

This is the largest task. Multiple sub-steps.

- [ ] **Step 1: Add imports and types at the top**

Replace the imports block (lines 1-7) with:

```tsx
"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CategoryColorMap, ContextMenuAction, ContextMenuState, GanttNode, GanttTask, ZoomLevel } from "./gantt-types";
import { computeRange, flattenVisible, dateToPct, contextMenuItemsFor } from "./gantt-utils";
import { GanttOutline } from "./GanttOutline";
import { GanttGrid } from "./GanttGrid";
import { GanttToolbar } from "./GanttToolbar";
import { GanttContextMenu, type CategoryOption } from "./GanttContextMenu";
```

- [ ] **Step 2: Update Props interface**

Replace the `Props` interface (lines 9-22) with:

```tsx
interface Props {
  root: GanttNode;
  defaultZoom?: ZoomLevel;
  onOpenDetail?: (key: string) => void;
  onAdd?: (context: { selectedKey: string | null }) => void;
  addLabel?: string;
  categoryColorMap?: CategoryColorMap;
  rootCategoryColor?: string;
  outlineHeader?: ReactNode;
  outlineHeaderActions?: ReactNode;   // still supported but unused by v3 portfolio (no gear)
  outlineFooter?: ReactNode;
  outlineOverlay?: ReactNode;
  // v3 additions
  onCategoriesClick?: () => void;
  categoriesOpen?: boolean;
  onContextMenuAction?: (action: ContextMenuAction, args: { rowKey: string; rowKind: GanttNode["kind"]; categoryId?: string | null }) => void;
  categoriesForSubmenu?: CategoryOption[];
}
```

- [ ] **Step 3: Update component body**

Replace the `export function GanttContainer(...)` body (lines 24-125) with:

```tsx
export function GanttContainer({
  root, defaultZoom = "month", onOpenDetail, onAdd, addLabel = "+ Add",
  categoryColorMap, rootCategoryColor,
  outlineHeader, outlineHeaderActions, outlineFooter, outlineOverlay,
  onCategoriesClick, categoriesOpen,
  onContextMenuAction, categoriesForSubmenu = [],
}: Props) {
  const [zoom, setZoom] = useState<ZoomLevel>(defaultZoom);
  const [search, setSearch] = useState("");
  const [outlineWidth, setOutlineWidth] = useState(260);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => collectAllKeys(root));
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const allTasks = useMemo(() => collectTasks(root), [root]);
  const range = useMemo(() => computeRange(allTasks, zoom), [allTasks, zoom]);

  const rows = useMemo(() => {
    const base = flattenVisible(root, expanded, { categoryColorMap, rootCategoryColor });
    if (!search.trim()) return base;
    const q = search.toLowerCase();
    return base.map((r) =>
      ({ ...r, dimmed: !nodeLabel(r.node).toLowerCase().includes(q) }),
    );
  }, [root, expanded, search, categoryColorMap, rootCategoryColor]);

  const allCollapsed = expanded.size === 0;

  const toggle = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const toggleCollapseAll = useCallback(() => {
    if (allCollapsed) setExpanded(collectAllKeys(root));
    else setExpanded(new Set());
  }, [allCollapsed, root]);

  const jumpToToday = useCallback(() => {
    if (!gridRef.current) return;
    const pct = dateToPct(new Date(), range);
    const sw = gridRef.current.scrollWidth;
    const vw = gridRef.current.clientWidth;
    gridRef.current.scrollTo({ left: Math.max(0, (pct / 100) * sw - vw / 2), behavior: "smooth" });
  }, [range]);

  useEffect(() => {
    setExpanded((prev) => {
      const keys = collectAllKeys(root);
      const next = new Set<string>();
      for (const k of prev) if (keys.has(k)) next.add(k);
      return next.size === 0 ? keys : next;
    });
  }, [root]);

  const handleSelect = useCallback((k: string | null) => {
    setSelectedKey(k);
    if (k) onOpenDetail?.(k);
  }, [onOpenDetail]);

  const handleContextMenu = useCallback(
    (rowKey: string, rowKind: GanttNode["kind"], e: React.MouseEvent) => {
      if (rowKind === "subtask" || rowKind === "task" || rowKind === "project" || rowKind === "category") {
        const isUncategorised = rowKey === "cat:uncat";
        setContextMenu({
          rowKey,
          rowKind,
          isUncategorised,
          x: e.clientX,
          y: e.clientY,
        });
      }
    },
    [],
  );

  const handleMenuSelect = useCallback(
    (action: ContextMenuAction, payload?: { categoryId: string | null }) => {
      if (!contextMenu) return;
      onContextMenuAction?.(action, {
        rowKey: contextMenu.rowKey,
        rowKind: contextMenu.rowKind,
        categoryId: payload?.categoryId,
      });
      setContextMenu(null);
    },
    [contextMenu, onContextMenuAction],
  );

  const menuItems = contextMenu
    ? contextMenuItemsFor({ rowKind: contextMenu.rowKind, isUncategorised: contextMenu.isUncategorised })
    : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <GanttToolbar
        zoom={zoom} allCollapsed={allCollapsed} search={search}
        onZoom={setZoom} onToggleCollapseAll={toggleCollapseAll} onJumpToToday={jumpToToday}
        onSearch={setSearch}
        onAdd={() => onAdd?.({ selectedKey })}
        canAdd={Boolean(onAdd)}
        addLabel={addLabel}
        onCategoriesClick={onCategoriesClick}
        categoriesOpen={categoriesOpen}
      />
      <div style={{
        display: "flex", flex: 1, minHeight: 0,
        border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface)", overflow: "hidden",
      }}>
        <GanttOutline
          rows={rows} expanded={expanded}
          selectedKey={selectedKey} hoveredKey={hoveredKey}
          width={outlineWidth} onWidthChange={setOutlineWidth}
          onToggle={toggle}
          onSelect={handleSelect}
          onHover={setHoveredKey}
          onContextMenu={handleContextMenu}
          header={outlineHeader}
          headerActions={outlineHeaderActions}
          footer={outlineFooter}
          overlay={outlineOverlay}
        />
        <GanttGrid
          ref={gridRef}
          rows={rows} range={range} zoom={zoom}
          hoveredKey={hoveredKey} selectedKey={selectedKey}
          onHoverKey={setHoveredKey}
          onSelectKey={handleSelect}
          onContextMenu={handleContextMenu}
        />
      </div>

      {contextMenu && (
        <GanttContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={menuItems}
          categories={categoriesForSubmenu}
          onSelect={handleMenuSelect}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

function nodeLabel(n: GanttNode): string {
  if (n.kind === "category" || n.kind === "project") return n.name;
  return n.task.title;
}

function collectTasks(root: GanttNode): GanttTask[] {
  const out: GanttTask[] = [];
  function walk(n: GanttNode) {
    if (n.kind === "task" || n.kind === "subtask") out.push(n.task);
    if (n.kind !== "subtask") for (const c of n.children) walk(c);
  }
  walk(root);
  return out;
}

function collectAllKeys(root: GanttNode): Set<string> {
  const out = new Set<string>();
  function keyOf(n: GanttNode): string {
    if (n.kind === "category") return `cat:${n.id ?? "uncat"}`;
    if (n.kind === "project") return `proj:${n.id}`;
    if (n.kind === "task") return `task:${n.id}`;
    return `sub:${n.id}`;
  }
  function walk(n: GanttNode, isRoot: boolean) {
    if (!isRoot) out.add(keyOf(n));
    if (n.kind !== "subtask") for (const c of n.children) walk(c, false);
  }
  walk(root, true);
  return out;
}
```

- [ ] **Step 4: Typecheck**
```bash
npx tsc --noEmit
```

Expected: may have errors in `PortfolioGanttClient.tsx` / `ProjectGanttClient.tsx` referencing removed `onInlineAdd` prop. These are fixed in Phase D.

- [ ] **Step 5: Commit**
```bash
git add apps/web/src/components/workspace/gantt/GanttContainer.tsx
git commit -m "feat(gantt): v3 container — context menu state + Categories drawer wiring"
```

---

## Phase D — Top-level wiring

### Task D1: `PortfolioGanttClient` v3 — category drawer + context menu actions

**File:** `apps/web/src/app/workspace/timeline/PortfolioGanttClient.tsx`

- [ ] **Step 1: Replace**

```tsx
"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { PortfolioTimelineResponse, ContextMenuAction, GanttNode } from "@/components/workspace/gantt/gantt-types";
import { buildPortfolioTree, buildCategoryColorMap, normalizePortfolioStatuses } from "@/components/workspace/gantt/gantt-utils";
import { GanttContainer } from "@/components/workspace/gantt/GanttContainer";
import { AddNodeModal } from "@/components/workspace/gantt/AddNodeModal";
import { CategoryManagerPanel } from "@/components/workspace/gantt/CategoryManagerPanel";
import { GanttEmptyState } from "@/components/workspace/gantt/GanttEmptyState";
import type { CategoryOption } from "@/components/workspace/gantt/GanttContextMenu";

type AddCtx =
  | { mode: "category" }
  | { mode: "project"; parentCategoryId?: string }
  | { mode: "task"; parentProjectId: string }
  | { mode: "subtask"; parentProjectId: string; parentTaskId: string };

export function PortfolioGanttClient() {
  const [data, setData] = useState<PortfolioTimelineResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addCtx, setAddCtx] = useState<AddCtx | null>(null);
  const [managerOpen, setManagerOpen] = useState(false);
  const [selectedKeyForLabel, setSelectedKeyForLabel] = useState<string | null>(null);

  const fetchTimeline = useCallback(async () => {
    try {
      const res = await fetch("/api/workspace/timeline", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, []);

  useEffect(() => { void fetchTimeline(); }, [fetchTimeline]);

  const categoryColorMap = useMemo(
    () => data ? buildCategoryColorMap(data.categories.map((c) => ({ id: c.id, colour: c.colour }))) : undefined,
    [data],
  );

  const categoriesForSubmenu: CategoryOption[] = useMemo(() => {
    if (!data) return [];
    const real: CategoryOption[] = data.categories
      .filter((c) => c.id !== null)
      .map((c) => ({ id: c.id, name: c.name, colour: c.colour ?? "#6c44f6" }));
    return [...real, { id: null, name: "Uncategorised", colour: "#bdb7d0" }];
  }, [data]);

  if (error) return <div style={{ padding: 24 }}>Couldn&apos;t load timeline: {error}</div>;
  if (!data) return <div style={{ padding: 24 }}>Loading…</div>;

  const normalized = normalizePortfolioStatuses(data);
  const root = buildPortfolioTree(normalized);

  // Empty state: no categories AND no uncategorised projects
  const hasRealCategories = data.categories.some((c) => c.id !== null);
  const hasUncategorised = data.categories.some((c) => c.id === null && c.projects.length > 0);
  const isTrulyEmpty = !hasRealCategories && !hasUncategorised;

  // Build quick task → project lookup for context-menu actions
  const taskProjectLookup = new Map<string, string>();
  for (const cat of data.categories) {
    for (const p of cat.projects) {
      for (const t of p.tasks) taskProjectLookup.set(t.id, p.id);
    }
  }

  function selectionContextAddLabel(selectedKey: string | null): string {
    if (!selectedKey) return "+ Category";
    if (selectedKey.startsWith("cat:")) {
      const id = selectedKey.slice(4);
      const cat = data?.categories.find((c) => c.id === (id === "uncat" ? null : id));
      const name = cat?.name ?? "";
      return `+ Project${name ? " in " + name : ""}`;
    }
    if (selectedKey.startsWith("proj:")) {
      const id = selectedKey.slice(5);
      // project name lookup
      let pname = "";
      for (const cat of data!.categories) {
        const p = cat.projects.find((pp) => pp.id === id);
        if (p) { pname = p.name; break; }
      }
      return `+ Task${pname ? " in " + pname : ""}`;
    }
    if (selectedKey.startsWith("task:")) {
      const taskId = selectedKey.slice(5);
      // task title lookup
      let tname = "";
      for (const cat of data!.categories) for (const p of cat.projects) {
        const t = p.tasks.find((tt) => tt.id === taskId);
        if (t) { tname = t.title; break; }
      }
      return `+ Subtask${tname ? " in " + tname : ""}`;
    }
    return "+ Category";
  }

  function handleAdd(context: { selectedKey: string | null }) {
    const k = context.selectedKey;
    if (!k) { setAddCtx({ mode: "category" }); return; }
    if (k.startsWith("cat:")) {
      const id = k.slice(4);
      setAddCtx({ mode: "project", parentCategoryId: id === "uncat" ? undefined : id });
      return;
    }
    if (k.startsWith("proj:")) {
      setAddCtx({ mode: "task", parentProjectId: k.slice(5) });
      return;
    }
    if (k.startsWith("task:")) {
      const taskId = k.slice(5);
      const projectId = taskProjectLookup.get(taskId);
      if (projectId) setAddCtx({ mode: "subtask", parentProjectId: projectId, parentTaskId: taskId });
      return;
    }
    setAddCtx({ mode: "category" });
  }

  async function handleContextMenuAction(
    action: ContextMenuAction,
    args: { rowKey: string; rowKind: GanttNode["kind"]; categoryId?: string | null },
  ) {
    const { rowKey, rowKind, categoryId } = args;

    if (action === "moveToCategory" && (rowKind === "task" || rowKind === "subtask")) {
      const taskId = rowKey.startsWith("task:") ? rowKey.slice(5) : rowKey.slice(4);
      const projectId = taskProjectLookup.get(taskId);
      if (!projectId) return;
      try {
        await fetch(`/api/workspace/projects/${projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ categoryId: categoryId ?? null }),
        });
        await fetchTimeline();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to move project");
      }
      return;
    }

    if (action === "moveToCategory" && rowKind === "project") {
      const projectId = rowKey.slice(5);
      try {
        await fetch(`/api/workspace/projects/${projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ categoryId: categoryId ?? null }),
        });
        await fetchTimeline();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to move project");
      }
      return;
    }

    if (action === "removeFromTimeline" && (rowKind === "task" || rowKind === "subtask")) {
      const taskId = rowKey.startsWith("task:") ? rowKey.slice(5) : rowKey.slice(4);
      try {
        await fetch(`/api/workspace/tasks/${taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startDate: null, dueDate: null }),
        });
        await fetchTimeline();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to remove task from timeline");
      }
      return;
    }

    if (action === "addChild" && rowKind === "project") {
      const projectId = rowKey.slice(5);
      setAddCtx({ mode: "task", parentProjectId: projectId });
      return;
    }

    if (action === "delete") {
      if (rowKind === "task" || rowKind === "subtask") {
        const taskId = rowKey.startsWith("task:") ? rowKey.slice(5) : rowKey.slice(4);
        if (!window.confirm("Delete this task?")) return;
        try {
          await fetch(`/api/workspace/tasks/${taskId}`, { method: "DELETE" });
          await fetchTimeline();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Failed to delete task");
        }
      }
      if (rowKind === "project") {
        if (!window.confirm("Delete this project and all its tasks?")) return;
        try {
          await fetch(`/api/workspace/projects/${rowKey.slice(5)}`, { method: "DELETE" });
          await fetchTimeline();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Failed to delete project");
        }
      }
      if (rowKind === "category") {
        const id = rowKey.slice(4);
        if (id === "uncat") return;
        if (!window.confirm("Delete this category? Projects will move to Uncategorised.")) return;
        try {
          await fetch(`/api/workspace/categories/${id}`, { method: "DELETE" });
          await fetchTimeline();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Failed to delete category");
        }
      }
      return;
    }

    if (action === "openDetail") {
      // Let the existing onOpenDetail flow handle it; no-op here (wired via selection)
      return;
    }

    if (action === "rename" && rowKind === "category") {
      // Open the Categories drawer and scroll/focus to the row; simplest: just open it.
      setManagerOpen(true);
      return;
    }

    if (action === "changeColour" && rowKind === "category") {
      setManagerOpen(true);
      return;
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: 24, minHeight: 0, position: "relative" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, marginBottom: 4 }}>Timeline</h1>
      <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0, marginBottom: 12 }}>
        Everything across your workspace. Click a row to open details.
      </p>

      {isTrulyEmpty ? (
        <GanttEmptyState
          kind="noCategories"
          onCreate={() => setAddCtx({ mode: "category" })}
        />
      ) : (
        <GanttContainer
          root={root}
          defaultZoom="month"
          addLabel={selectionContextAddLabel(selectedKeyForLabel)}
          onAdd={handleAdd}
          onOpenDetail={(k) => setSelectedKeyForLabel(k)}
          categoryColorMap={categoryColorMap}
          onCategoriesClick={() => setManagerOpen((v) => !v)}
          categoriesOpen={managerOpen}
          onContextMenuAction={handleContextMenuAction}
          categoriesForSubmenu={categoriesForSubmenu}
        />
      )}

      {managerOpen && (
        <CategoryManagerPanel
          onClose={() => setManagerOpen(false)}
          onChanged={async () => { await fetchTimeline(); }}
        />
      )}

      {addCtx && (
        <AddNodeModal
          mode={addCtx.mode}
          parentCategoryId={addCtx.mode === "project" ? addCtx.parentCategoryId : undefined}
          parentProjectId={addCtx.mode === "task" || addCtx.mode === "subtask" ? addCtx.parentProjectId : undefined}
          parentTaskId={addCtx.mode === "subtask" ? addCtx.parentTaskId : undefined}
          onClose={() => setAddCtx(null)}
          onCreated={async () => { await fetchTimeline(); }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**
```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**
```bash
git add apps/web/src/app/workspace/timeline/PortfolioGanttClient.tsx
git commit -m "feat(gantt): wire v3 portfolio — Categories drawer, context menu actions, empty state"
```

---

### Task D2: `ProjectGanttClient` v3 — context menu for tasks in project view

**File:** `apps/web/src/components/workspace/gantt/ProjectGanttClient.tsx`

- [ ] **Step 1: Apply minimal update**

Add context-menu handler for task rows (no category submenu in project view — categories aren't fetched here). Append after the existing `handleAdd`:

```tsx
import type { ContextMenuAction, GanttNode } from "./gantt-types";

async function handleContextMenuAction(
  action: ContextMenuAction,
  args: { rowKey: string; rowKind: GanttNode["kind"]; categoryId?: string | null },
) {
  const { rowKey, rowKind } = args;
  if (action === "removeFromTimeline" && (rowKind === "task" || rowKind === "subtask")) {
    const taskId = rowKey.startsWith("task:") ? rowKey.slice(5) : rowKey.slice(4);
    try {
      await fetch(`/api/workspace/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: null, dueDate: null }),
      });
      await refresh();
    } catch { /* silent */ }
  }
  if (action === "delete" && (rowKind === "task" || rowKind === "subtask")) {
    const taskId = rowKey.startsWith("task:") ? rowKey.slice(5) : rowKey.slice(4);
    if (!window.confirm("Delete this task?")) return;
    try {
      await fetch(`/api/workspace/tasks/${taskId}`, { method: "DELETE" });
      await refresh();
    } catch { /* silent */ }
  }
  if (action === "addChild" && rowKind === "project") {
    setAddCtx({ mode: "task" });
  }
}
```

Add to `<GanttContainer>`:
```tsx
onContextMenuAction={handleContextMenuAction}
categoriesForSubmenu={[]}   // project view has no categories submenu
```

Note: since categories aren't loaded in project view, the "Move project to category" submenu will be empty. That's acceptable for v3; follow-up can fetch them. The item is still visible but the submenu will be empty.

- [ ] **Step 2: Typecheck**
```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**
```bash
git add apps/web/src/components/workspace/gantt/ProjectGanttClient.tsx
git commit -m "feat(gantt): wire v3 project view — context menu task actions"
```

---

## Phase E — Cleanup

### Task E1: Clean up `CategoryDot` — remove ring for category tier

Spec says category dot is a simple 8px circle, no ring. Current `CategoryDot` adds a `box-shadow` ring for category tier.

**File:** `apps/web/src/components/workspace/gantt/CategoryDot.tsx`

- [ ] **Step 1: Simplify**

```tsx
"use client";

export type CategoryDotTier = "category" | "project" | "task" | "subtask";

const SIZE_BY_TIER: Record<CategoryDotTier, number> = {
  category: 8,
  project:  7,
  task:     6,
  subtask:  5,
};

interface Props {
  color: string;
  tier: CategoryDotTier;
}

export function CategoryDot({ color, tier }: Props) {
  const size = SIZE_BY_TIER[tier];
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        flexShrink: 0,
      }}
    />
  );
}
```

Removed: ring box-shadow, opacity reduction (sizes carry hierarchy now; rows also use weight + tracking for hierarchy).

- [ ] **Step 2: Typecheck**
```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**
```bash
git add apps/web/src/components/workspace/gantt/CategoryDot.tsx
git commit -m "refactor(gantt): simplify CategoryDot — drop ring + opacity-by-tier"
```

---

## Phase F — Verification + PR

### Task F1: Local verification gauntlet

- [ ] **Step 1: Vitest**
```bash
cd C:/Dev/larry/site-deploys/larry-gantt-v3/apps/web
npx vitest run
```
Expected: all tests (existing + new from Phase A) green. Count should be ≥ 25 original + ~15 new helper tests = ~40 passing.

- [ ] **Step 2: TypeScript**
```bash
npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 3: ESLint (Gantt subtree only — don't re-grade pre-existing errors elsewhere)**
```bash
npx eslint src/components/workspace/gantt/ src/app/workspace/timeline/
```
Expected: zero new errors. The two pre-existing errors the handoff documents (`PortfolioGanttClient`, `GanttContainer`) may or may not survive; if they're still present, don't treat as a regression.

- [ ] **Step 4: Install `@testing-library/react` if Phase B tests imported it**

If any test imports `@testing-library/react` and it isn't installed:
```bash
npm install --save-dev @testing-library/react @testing-library/jest-dom
```
Commit:
```bash
git add apps/web/package.json apps/web/package-lock.json
git commit -m "chore: add @testing-library/react for component smoke tests"
```
If the smoke tests were the minimal `typeof X === "function"` versions (no DOM), skip this step.

- [ ] **Step 5: Commit any last cleanup**
If typecheck or lint flags fixable issues, fix them and commit as `fix(gantt): typecheck/lint cleanup for v3`.

---

### Task F2: Push branch, verify Vercel preview

- [ ] **Step 1: Push**
```bash
cd C:/Dev/larry/site-deploys/larry-gantt-v3
git push -u origin feat/gantt-v3-ui-rework
```

- [ ] **Step 2: Watch Vercel preview deploy**

Use Vercel MCP or CLI (whichever is available — verify `vercel --version` first):
```bash
vercel --version     # verify; session-start hook has lied before
```

If installed:
```bash
# Watch deployments for this branch
vercel inspect --wait --deployment-url <last-preview>
```

If Vercel MCP is loaded in-session, use:
`mcp__vercel__list_deployments` with `projectId prj_cmKmgIevs9vJffk0AKe66jpnZKnr` and `teamId team_9Q8vpoJHhcbg74h3BoEJJnAs` — filter by branch, wait for state `READY`.

Either way, the preview URL has format like `larry-site-<hash>-fergo5002s-projects.vercel.app`.

- [ ] **Step 3: Smoke the preview**
```bash
curl -I https://<preview-url>/workspace/timeline
```
Expected: 200 (or 302 → /login, which is fine).

---

### Task F3: Playwright MCP iteration loop

Credentials (from handoff): email `larry@larry.com`, password `DevPass123!`. URL: `https://www.larry-pm.com/login` for prod OR the preview URL for preview-testing.

For each iteration N = 1, 2, 3…

- [ ] **Iter-N Step 1: Navigate + screenshot**

```
mcp__playwright__browser_navigate → <preview-url>/login
mcp__playwright__browser_fill_form → email / password
mcp__playwright__browser_click submit
mcp__playwright__browser_navigate → <preview-url>/workspace/timeline
mcp__playwright__browser_wait_for timeline-loaded-selector  (e.g. ".GanttOutline or [role='row']")
mcp__playwright__browser_take_screenshot → docs/reports/gantt-v3-screenshots/iter-N-overview.png
```

- [ ] **Iter-N Step 2: Exercise every affordance**

Programmatically (MCP calls):
- Expand a category (click chevron)
- Hover a task row (move mouse to row centre)
- Open Categories drawer (click "Categories" pill)
- Close drawer
- Right-click a task row → verify context menu appears → close with ESC
- Click the `+` button with different selections to verify the label changes
- Type in search → verify non-matches dim
- Click Today → verify scroll jumps

Each exercise followed by `browser_take_screenshot` if the state is visually distinctive.

- [ ] **Iter-N Step 3: Comparison vs reference**

Reference screenshots to save into `docs/reports/gantt-v3-screenshots/refs/` from public sources (Linear roadmap, Notion timeline, TeamGantt demo, Airtable timeline — can be found by navigating their docs in the MCP browser and screenshotting). **Only save publicly-available marketing screenshots**; no internal data.

Write a verdict line at the end of each iter in `docs/reports/gantt-v3-screenshots/iter-N-notes.md`:

```md
## Iter 1 verdict
- C1 (dates): ✓ / ✗ notes
- C2 (bar density): ✓ / ✗ notes
- C3 (single +): ✓ / ✗ notes
- C4 (category discovery): ✓ / ✗ notes
- C5 (re-categorise menu): ✓ / ✗ notes
- C6 (uncat differentiation): ✓ / ✗ notes
- C7 (tree, no dividers): ✓ / ✗ notes
- Verdict: <"Looks like Linear — ready for review" / "Tweak bar size and retry">
```

- [ ] **Iter-N Step 4: Iterate or stop**

If all C-gates pass → proceed to PR (Task F4). Otherwise, identify the failing axis, make targeted edits in the gantt worktree, commit, push, wait for new Vercel preview, rerun.

---

### Task F4: Open PR

- [ ] **Step 1: Confirm everything is pushed**
```bash
cd C:/Dev/larry/site-deploys/larry-gantt-v3
git status
git log origin/feat/gantt-v3-ui-rework..feat/gantt-v3-ui-rework --oneline
```
Second command should be empty (local = remote).

- [ ] **Step 2: Open PR with `gh`**
```bash
gh pr create --title "feat(gantt): v3 UI/UX rework — Linear-lite tree + solid bars + status chips" --body "$(cat <<'EOF'
## Summary
- Re-skin the workspace Gantt (`/workspace/timeline` + per-project view) to Direction A "Linear-lite"
- Tree outline with no row dividers; bars solid at every level with `-12%` darker progress overlay; trailing status chip (NS/AR/OD/✓) replaces bar-destroying dashed outlines; integrated 48px date axis with today label ABOVE the axis; single context-aware `+` button in toolbar; right-side Categories drawer; left-click → select, right-click → cursor-anchored context menu (Move project to category, Remove from timeline, Delete)
- Frontend-only; no schema changes, no new backend routes

## What answers Fergus's C1–C8
- **C1 — dates:** integrated axis + tabular day numbers + Today label above the axis
- **C2 — bar density:** solid at every level; progress via darken(); status chips rescue the bar fill
- **C3 — single +:** context-aware toolbar button; inline-add rows removed
- **C4 — category discovery:** labelled "Categories" pill → right drawer; gear icon removed
- **C5 — re-categorise:** right-click task → "Move project to category" (submenu) / "Remove from timeline" / "Delete"
- **C6 — uncategorised:** grey dot, italic, no colour picker, "system" tag in drawer
- **C7 — tree feel:** zero row dividers; 2px indent guides
- **C8 — Playwright MCP loop:** screenshots in `docs/reports/gantt-v3-screenshots/`

## Test plan
- [ ] `npx vitest run` from `apps/web` — green
- [ ] `npx tsc --noEmit` — clean
- [ ] `npx eslint src/components/workspace/gantt src/app/workspace/timeline` — no new errors
- [ ] Playwright MCP iteration loop against Vercel preview — C1–C8 verdict notes in `docs/reports/gantt-v3-screenshots/`
- [ ] Deploy watch on merge: `gh pr checks --watch` + Vercel READY + Railway SUCCESS + `/health` 200

Spec: `docs/superpowers/specs/2026-04-17-gantt-v3-ui-design.md`
Plan: `docs/superpowers/plans/2026-04-17-gantt-v3-ui-rework.md`
Handoff: `docs/reports/2026-04-17-gantt-v3-handoff.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Watch checks**
```bash
gh pr checks <pr-id> --watch --interval 20
```

- [ ] **Step 4: Ask Fergus to sign off**

Once CI is green and preview is READY: message Fergus — "v3 PR is up at <URL>, preview at <preview-url>. Take a look, and say 'yep, that's it' if it's what you wanted."

**Do NOT auto-merge.** Per handoff §9 and L-gate, merge only after explicit "yep, that's it".

---

### Task F5: On approval — merge + post-merge verification

- [ ] **Step 1: Merge**

```bash
gh pr merge <pr-id> --merge
```

- [ ] **Step 2: Watch prod deploy**

```bash
mcp__vercel__list_deployments → filter master, wait for READY
```

- [ ] **Step 3: Smoke prod**

```bash
curl -I https://www.larry-pm.com/                      # expect 200
curl -I https://www.larry-pm.com/workspace/timeline    # expect 200 or 302→/login
curl https://larry-site-production.up.railway.app/health  # expect {"ok":true}
```

- [ ] **Step 4: Final screenshot**

`mcp__playwright__browser_navigate` → `https://www.larry-pm.com/workspace/timeline`
`mcp__playwright__browser_take_screenshot` → `docs/reports/gantt-v3-screenshots/final-prod.png`

Commit screenshot:
```bash
git add docs/reports/gantt-v3-screenshots/final-prod.png
git commit -m "docs(gantt): v3 post-merge prod screenshot"
git push
```

- [ ] **Step 5: Clean up worktree (optional)**

Once merged, the worktree can be removed:
```bash
cd C:/Dev/larry/site-deploys
git -C larry-site worktree remove larry-gantt-v3
git -C larry-site branch -d feat/gantt-v3-ui-rework
```

Done. Gate 5 (code review / PR / merge) complete.

---

## Appendix: File inventory

### New files
- `apps/web/src/components/workspace/gantt/GanttStatusChip.tsx`
- `apps/web/src/components/workspace/gantt/GanttStatusChip.test.tsx`
- `apps/web/src/components/workspace/gantt/GanttContextMenu.tsx`
- `apps/web/src/components/workspace/gantt/GanttContextMenu.test.tsx`
- `apps/web/src/components/workspace/gantt/GanttEmptyState.tsx`
- `apps/web/src/components/workspace/gantt/GanttEmptyState.test.tsx`

### Modified files
- `apps/web/src/components/workspace/gantt/gantt-types.ts`
- `apps/web/src/components/workspace/gantt/gantt-utils.ts`
- `apps/web/src/components/workspace/gantt/gantt-utils.test.ts`
- `apps/web/src/components/workspace/gantt/GanttContainer.tsx`
- `apps/web/src/components/workspace/gantt/GanttToolbar.tsx`
- `apps/web/src/components/workspace/gantt/GanttOutline.tsx`
- `apps/web/src/components/workspace/gantt/GanttOutlineRow.tsx`
- `apps/web/src/components/workspace/gantt/GanttGrid.tsx`
- `apps/web/src/components/workspace/gantt/GanttDateHeader.tsx`
- `apps/web/src/components/workspace/gantt/GanttRow.tsx`
- `apps/web/src/components/workspace/gantt/GanttBar.tsx`
- `apps/web/src/components/workspace/gantt/CategoryManagerPanel.tsx`
- `apps/web/src/components/workspace/gantt/CategoryDot.tsx`
- `apps/web/src/components/workspace/gantt/ProjectGanttClient.tsx`
- `apps/web/src/app/workspace/timeline/PortfolioGanttClient.tsx`

### Deleted files
- `apps/web/src/components/workspace/gantt/GanttInlineAdd.tsx`

### Unchanged (deliberately)
- `apps/web/src/components/workspace/gantt/AddNodeModal.tsx` — already handles all four create modes
- `apps/web/src/app/globals.css` — existing `--brand`, `--tl-*`, `--border`, `--border-2`, `--surface`, `--surface-2`, `--text-*` tokens cover v3
- Backend routes, schema, API contracts
