# Gantt v3 — UI/UX Rework Design Spec

**Date:** 2026-04-17
**Status:** Approved (Direction A — Linear-lite — selected by Fergus on 2026-04-17)
**Author:** Claude (Opus 4.7)
**Supersedes:** `docs/reports/2026-04-16-gantt-restructure-plan.md` for visual-layer concerns only (the data-layer plumbing it describes stays)
**Context:** `docs/reports/2026-04-17-gantt-v3-handoff.md`
**Worktree:** `C:/Dev/larry/site-deploys/larry-gantt-v3`
**Branch:** `feat/gantt-v3-ui-rework` (off `origin/master@885d603`)

---

## 0. Context

PR #67 shipped the category-colour + hierarchy plumbing for the portfolio Gantt (Category → Project → Task → Subtask). The data layer works. Visually the result "is really far off what we need" (Fergus, 2026-04-17). Eight specific complaints (unpacked in the handoff doc §1, C1–C8) motivate this rework. **This spec redesigns the visual language and interaction model; it does NOT change the data model, backend routes, or the category CRUD API contract.**

### In scope
- `apps/web/src/app/workspace/timeline/**`
- `apps/web/src/components/workspace/gantt/**`
- `apps/web/src/app/globals.css` (token additions only, no renames)

### Out of scope
- DB schema
- Any backend route beyond what's already exposing data
- Worker / AI / auth / rate-limiting code
- The category CRUD API contract
- Drag-to-reschedule dates on bars
- Dependency arrows, baseline bars, critical-path
- Mobile / tablet responsive (desktop-only)

---

## 1. Locked design decisions

From the handoff doc + clarifying exchange 2026-04-17.

| # | Decision | Source |
|---|---|---|
| L1 | Direction A — "Linear-lite portfolio" — dense, tree-feel, solid bars, trailing status chips | Fergus picked A, 2026-04-17 |
| L2 | Left-click any row → opens detail drawer (right-docked 600px) | Fergus, 2026-04-17 |
| L3 | Right-click any row → context menu anchored at cursor | Fergus, 2026-04-17 |
| L4 | "Move to category" is **project-wide** — moves the task's parent project (and siblings), not the task alone | Fergus, 2026-04-17 ("project-wide, organisation-wide timeline with subcategories") |
| L5 | "Remove from timeline" = clear `startDate` + `dueDate` on the entity, **not** delete | Handoff C5 |
| L6 | Inline-add rows (`+Add project`, `+Add task`, `+Add category` footer) **removed entirely** | Handoff C3 |
| L7 | Exactly **one** context-aware `+` button in the toolbar, right-aligned | Handoff C3, refined |
| L8 | Category management = labelled "Categories" pill in toolbar → right-side drawer | Handoff C4 |
| L9 | Uncategorised = grey dot, italic label, always rendered last, not editable in drawer | Handoff C6 |
| L10 | Tree outline, **no row dividers**, 2px indent guides, lavender hover wash | Handoff C7 |
| L11 | Playwright MCP iteration loop against Vercel preview — the **screenshot** must pass, not just the tests | Handoff C8 |
| L12 | Gear icon in outline header removed (replaced by labelled Categories pill) | Handoff C4 |

---

## 2. Visual design — Outline column

### Row structure
- 4 levels: Category → Project → Task → Subtask
- "Uncategorised" is a synthetic first-level bucket holding orphan projects (projects whose `category_id` is null). Always rendered last, regardless of sort order.

### Row heights
| Level | Height |
|---|---|
| Category | 32px |
| Project | 32px |
| Task | 28px |
| Subtask | 28px |

Hierarchy is conveyed by size + indent + weight, not colour. (Addresses `visual-hierarchy` skill rule.)

### Dividers
**None.** No `border-bottom` on any row. This is the single biggest v3 change from v2 and the direct answer to C7. Vertical rhythm comes from consistent row heights + padding, not lines.

### Hover
- Whole row (outline + its aligned grid row) → `background: var(--surface-2)`
- Transition: `background-color 150ms ease-out`
- No border-on-hover, no box-shadow change

### Selection
- A row becomes "selected" when single-clicked (left-click). A 2px left-edge accent (`var(--brand)`) appears on that row's outline cell and persists until another row is selected or ESC is pressed. Selection drives the context-aware `+` button label (see §5).
- Selection is **independent** of opening the detail drawer — both happen on left-click, and selecting without opening the drawer is not a user intent; the drawer open-on-click IS the selection signal.

### Indent guides
- 2px-wide vertical line per nesting level
- Colour: `var(--border-2)` (lightest token)
- Starts 8px left of chevron, extends from the first child row's top to the last child row's bottom
- Rendered only for rows that have children (leaves don't render a guide below themselves)

### Chevrons
- 12 × 12px, 1.5px stroke, `var(--text-muted)` colour
- Rotate 90° on expand: `transform 150ms ease-out`
- No fill change, no background on hover — the row hover wash is enough
- Leaves (no children) show no chevron; the chevron slot still reserves 12px of width to keep alignment

### Label typography
| Level | Size | Weight | Case | Colour |
|---|---|---|---|---|
| Category | 13px | 600 | UPPERCASE, 0.03em tracked | `--text-1` |
| Project | 14px | 500 | Sentence | `--text-1` |
| Task | 14px | 400 | Sentence | `--text-1` |
| Subtask | 13px | 400 | Sentence | `--text-2` |

### Category dot
- 8px circle, left of label, 8px right margin
- Category colour (from `CategoryColorMap`)
- Uncategorised: `--text-muted` circle, no brand colour

### Truncation
- Single-line ellipsis (`text-overflow: ellipsis; white-space: nowrap; overflow: hidden;`)
- Native `title` attribute for full text on hover (no custom tooltip)

### Uncategorised special-case
- Label: italic, weight 500, "Uncategorised" (sentence-case, not UPPERCASE — it's not a real category)
- Dot: grey circle (`--text-muted`)
- No colour picker in drawer, no rename, no delete — displays with a "system" tag in the drawer list
- Always last in sort order, regardless of category `order` column

### Removed
- Inline `+ Add project` rows
- Inline `+ Add task` rows
- `+ Add category` footer row
- Gear icon in outline header

---

## 3. Visual design — Bars + status

### Bar sizes + spans
| Entity | Height | Radius | Span | Fill |
|---|---|---|---|---|
| Category bar | 18px | 3px | earliest descendant start → latest descendant due | category colour, 100% |
| Project bar | 16px | 3px | earliest child task start → latest child task due | category colour, 100% |
| Task bar | 14px | 3px | `task.startDate` → `task.dueDate` | inherited category colour, 100% |
| Subtask bar | 10px | 2px | subtask dates | inherited category colour, 100% |

Bars sit vertically centred within their row (category/project in 32px; task/subtask in 28px).

### Progress overlay
- Same geometry as the base bar (same top/height/radius)
- Inner fill from bar-start to `progress%` point
- Colour: category colour darkened by 12% luminosity (helper `darken(hexOrRgb, pct)`; see §6)
- Rendered only if `progress > 0`
- If `progress = 100`, status is `completed` and the bar shows the full darker fill plus the ✓ chip

### Status chip (trailing, OUTSIDE the bar)
- Position: immediately right of the bar's end-date edge, 4px gap
- Geometry: auto-width × 14px tall, 3px radius, 4px horizontal padding
- Typography: 9px weight 600 UPPERCASE tabular; symbol for `completed`
- **Hidden entirely** for `on_track` — the solid bar is the signal

| Status | Chip label | FG | BG | Border |
|---|---|---|---|---|
| `not_started` | NS | `--text-muted` | transparent | 1px `--border` |
| `on_track` | — | — | — | — |
| `at_risk` | AR | white | `--tl-at-risk` (amber) | none |
| `overdue` | OD | white | `--tl-overdue` (red) | none |
| `completed` | ✓ | white | `--tl-completed` (green) | none |

**C2 is addressed:** no more 1.5px dashed outlines on `not_started`. Every bar is solid, coloured, visible. Status rides alongside as a chip, never through destroying the bar fill.

### Elevation
- Every bar: `box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04)`
- Subtle lift; consistent elevation scale (skill rule `elevation-consistent`)

### Hover state (on bar)
- Outer glow ring: `box-shadow: 0 0 0 2px rgba(categoryRgb, 0.18)` in addition to the base elevation
- Transition: `box-shadow 150ms ease-out`
- **No size change** — bars hovering must not jitter layout

### Cross-row alignment
- Bar-row alignment with outline-row stays invariant
- With inline-add rows removed, `flattenVisible` no longer needs `injectInlineAdds` — simplifies the data pipeline

### In-bar label
- **Removed** for all bar types — the outline already displays the label, duplicating it inside the bar is noise and was problematic at narrow zooms

---

## 4. Visual design — Date header, today indicator, gridlines

### Header geometry
- Single integrated band, **48px tall** total
- Top 24px: month label row
- Bottom 24px: tick + day-number row

### Month label row (top 24px)
- Font: 11px, weight 500, UPPERCASE, 0.06em tracked, `--text-2`
- Each month span has a 1px left-side vertical divider (`--border-2`) at the column boundary
- Label: left-aligned in its span, 4px right of the divider, vertically centred in the 24px row

### Day number row (bottom 24px)
- Font: 11px, weight 400, `--text-muted`, **tabular** (`font-variant-numeric: tabular-nums`)
- Week-start tick: 4px tall, 1px wide, `--border-2`, centred under the column
- Numbers centred over their column
- Spacing: even across the zoom's column grid

### Zoom levels
| Zoom | Cols per period | Day numbers shown |
|---|---|---|
| W (week) | 7 daily cols per week | every day |
| M (month) | 1 weekly col per week | every 7 days (week start) |
| Q (quarter) | 1 biweekly col per 14 days | every 14 days |

### Today indicator
- Vertical line: 1.5px wide, `--brand` (`#6c44f6`), full grid-body height (from just below the date header bottom to the outline-grid bottom), under bars (`z-index` below the bar z)
- "Today" label: 10px weight 600 `--brand`, positioned **above** the date header's top edge (in a 16px band above the 48px axis, so total axis + label = 64px), horizontally centred on today's column
- **No pill.** **No floating badge inside the axis.** C1 is addressed: today is anchored above the month row, never colliding with it.

### Gridlines in grid body
| Boundary | Stroke |
|---|---|
| Day (W zoom only) | 1px dashed `--border-2` |
| Week | 1px solid `--border-2` |
| Month | 1px solid `--border` (slightly stronger) |

Month gridlines are deliberately stronger so the month label visually ties to its column — part of the C1 fix. Day gridlines only at W zoom; M/Q zooms drop the day lines entirely.

---

## 5. Interactions, add flow, category management, empty states

### Click model (applies uniformly to outline row and its aligned grid row + any bar on that row)
- **Left-click**: opens detail drawer from right (600px wide)
  - Task / subtask: task detail drawer (reuses existing task-detail patterns from the dashboard; if none exists yet as a drawer, scaffolds one wrapping the existing `AddNodeModal` in read-mode)
  - Project: project detail drawer (same scaffold)
  - Category: category detail drawer (same scaffold; allows rename/colour/delete inline)
- **Right-click**: opens a popover context menu anchored at cursor position (prevents the browser default menu)
- **Cursor**: `pointer` on all interactive rows and bars

### Context menu contents

| Row type | Menu items (in order) |
|---|---|
| Task / Subtask | Open task · Move project to category… (submenu with all categories including Uncategorised) · Remove from timeline · Delete |
| Project | Open project · Move to category… · Add task · Delete |
| Category (real) | Rename · Change colour · Delete |
| Uncategorised (system) | (read-only — menu is disabled and shows "Uncategorised is the default bucket; not editable.") |

**Submenu behaviour ("Move project to category…"):** opens on hover with a 150ms delay; slides to the right of the parent menu; shows the categories list; clicking a category fires `PATCH /api/workspace/projects/:projectId` with `{ categoryId }` for the task's parent project; the menu closes; the UI re-renders with the project under the new category. A toast confirms: "Moved '<Project name>' to '<Category name>'" with an Undo affordance that reverses the PATCH.

**"Remove from timeline"** (tasks only): fires `PATCH /api/workspace/tasks/:taskId` with `{ startDate: null, dueDate: null }`. The task bar disappears from the grid, the outline row remains but with no bar on the grid side. Confirmation: toast "Removed '<Task name>' from timeline" with Undo.

### Menu UX details
- 180px min-width, 8px corner radius, `box-shadow: 0 4px 16px rgba(0,0,0,0.08)`
- Items: 32px tall, 14px text, 12px left-pad, `cursor: pointer`
- Hover: `--surface-2` background
- Close on: click-outside, ESC, or item-selected
- Keyboard: arrow keys navigate, Enter selects, ESC closes, right-arrow opens submenu, left-arrow closes submenu

### Add flow — SINGLE context-aware toolbar button

Right-aligned in the toolbar. Label changes by current selection:

| Selection | Button label | On click |
|---|---|---|
| Nothing selected | + Category | Opens `AddNodeModal` in category mode |
| Category row selected | + Project in [Category name] | Opens modal in project mode, category pre-filled |
| Project row selected | + Task in [Project name] | Opens modal in task mode, project pre-filled |
| Task row selected | + Subtask in [Task name] | Opens modal in subtask mode, task pre-filled |

Selection = single-clicked row (persistent hover wash + 2px left-edge accent). ESC deselects.

Right-click menu "Add …" items open the same modal with parent pre-filled. No other add surfaces exist.

### Category management

- "Categories" pill in toolbar, positioned left of search
  - Icon: tag/label SVG, 14px
  - Text: "Categories", 13px weight 500
  - Active state (drawer open): purple fill, white text/icon
- Click → right-side drawer slides in: 320px wide, full-height, `box-shadow: -4px 0 24px rgba(0,0,0,0.06)`, background `--surface`
- Drawer header: "CATEGORIES" (11px UPPERCASE tracked, weight 600) + X close button
- Drawer body: ordered list of categories. Each row (48px tall):
  - 12×12px colour swatch (click → inline colour picker popover with swatches from the Larry palette + custom hex)
  - Name (14px weight 500; click → inline-edit with text input + Enter-to-save + ESC-to-cancel)
  - Drag handle (⋮⋮ 6-dot icon, 10px grey; grab cursor; drag-to-reorder sends `POST /api/workspace/categories/reorder`)
  - Delete icon (trash SVG, 14px, `--text-muted`; opens confirm dialog; if category has projects, dialog warns "Projects in this category will move to Uncategorised")
- Uncategorised: listed but with "system" tag in grey italics after the name, no swatch-edit, no drag handle, no delete
- Drawer footer: primary button "+ New category" (44px tall, `--brand` fill, white text) opens an inline form above the list: swatch picker + input + "Add" button (the existing create-UX, polished)
- Drawer state: persistent; only closes via X or clicking the Categories pill again

### Empty states

| State | Presentation |
|---|---|
| No real categories, no uncategorised projects (fresh tenant) | Centred lavender callout in the outline column space (not full-page): 48×48 lavender circle with tag icon, "No categories yet" (18px weight 600), subline "Create one to start organising your timeline." (13px `--text-2`), primary button "+ Create your first category" (44px tall, `--brand` fill). Grid area shows the faded date header only. |
| No real categories, uncategorised has projects | Outline shows Uncategorised + its projects as normal; no callout. A subtle "+ Create your first category" link appears in the Categories drawer footer instead. |
| Category with no projects | Category row renders normally. Below it, a 24px italic hint row: "No projects yet — right-click to add." (`--text-muted`, 12px). |
| Project with no tasks | Project row renders normally. Below it, same 24px italic hint: "No tasks yet." |
| Search with no matches | All outline rows dim to 0.3 opacity, a floating banner appears at the top of the outline column: "No matches for '<query>'." (12px, `--text-2`, `--surface-2` background, 8px padding) |

### Zoom & toolbar inventory

| Control | Fate in v3 | Notes |
|---|---|---|
| W / M / Q zoom pills | **Keep** | Active state: purple fill + white text |
| Today button | **Keep** | Scrolls grid so today's column is horizontally centred |
| Collapse all | **Keep** | Collapses all category/project rows to one-level view |
| Search | **Keep** | Dims non-matches, doesn't filter-out |
| "Categories" pill | **NEW** | Opens right drawer |
| Context-aware `+` button | **NEW (replaces) ** | Replaces the v2 static "+ Category / + Project / + Task" button |
| Gear icon | **REMOVED** | Replaced by labelled Categories pill |

### Scroll behaviour
- Horizontal scroll in grid area moves date header + grid body together (already works)
- Outline column stays fixed on horizontal scroll (already works)
- Vertical scroll is shared across outline + grid (already works)

---

## 6. Component structure

### Existing components — refactored
| File | Change |
|---|---|
| `apps/web/src/components/workspace/gantt/GanttContainer.tsx` | Remove inline-add injection. Add `selectedRowId` state. Add `contextMenu: { rowId, x, y } \| null` state. Add `detailDrawerRowId` state. Add `categoryDrawerOpen` bool. Wire toolbar `+` button to context-aware mode via selection. |
| `apps/web/src/components/workspace/gantt/GanttToolbar.tsx` | Replace static `+` button with context-aware version driven by `selectedRowId`. Add "Categories" pill. Remove gear icon reference. |
| `apps/web/src/components/workspace/gantt/GanttOutline.tsx` | Remove `border-bottom` on all row wrappers. Remove footer "Add category" button. Remove gear icon. Render `GanttIndentGuides`. Simplify header to just "TASK / GROUPS" label. |
| `apps/web/src/components/workspace/gantt/GanttOutlineRow.tsx` | Drop row dividers. Adjust row heights per §2 (32/28). Apply typography table. Wire `onClick` (left-click) and `onContextMenu` (right-click). Render selection accent (2px left-border in `--brand`). |
| `apps/web/src/components/workspace/gantt/GanttGrid.tsx` | Update today indicator to thin line + above-axis label. Adjust gridline strokes per §4. Forward click/context-menu events from grid row to shared handlers. |
| `apps/web/src/components/workspace/gantt/GanttDateHeader.tsx` | Rework to integrated 48px band per §4. Apply tabular day numbers. Render week-start ticks. Add 16px "Today" label band above the 48px axis. |
| `apps/web/src/components/workspace/gantt/GanttRow.tsx` | Drop row dividers. Apply same hover wash as outline row. `onClick` / `onContextMenu` wired. |
| `apps/web/src/components/workspace/gantt/GanttBar.tsx` | Remove dashed-outline mode. Always solid fill. Render progress overlay (inner darker fill). Move status out to a sibling `GanttStatusChip`. Remove in-bar labels. |
| `apps/web/src/components/workspace/gantt/CategoryManagerPanel.tsx` | Rework to right-side drawer. Add Uncategorised system row. Add drag-reorder handle. Polish typography/spacing per §5. |
| `apps/web/src/components/workspace/gantt/GanttInlineAdd.tsx` | **DELETE** — no longer rendered. |
| `apps/web/src/components/workspace/gantt/gantt-types.ts` | Add `RowSelection`, `ContextMenuState`, `StatusChipData`, `DetailDrawerState` types. |
| `apps/web/src/components/workspace/gantt/gantt-utils.ts` | Add `darken(hex, pct)` helper. Add `statusChipFor(status)` helper. Adjust `flattenVisible` to drop inline-add injection (`injectInlineAdds` becomes a no-op or is removed). Add `contextMenuItemsFor(row)` helper. |

### New components
| File | Purpose |
|---|---|
| `apps/web/src/components/workspace/gantt/GanttContextMenu.tsx` | Popover menu rendered at cursor on right-click. Accepts `items`, `x`, `y`, `onClose`. Supports submenus for "Move to category". |
| `apps/web/src/components/workspace/gantt/GanttStatusChip.tsx` | Trailing chip beside bar with status code. Accepts `status`, positions itself right of `barRight`. |
| `apps/web/src/components/workspace/gantt/GanttRowDetailDrawer.tsx` | Right-docked 600px drawer. Renders task/project/category detail based on row type. Reuses `AddNodeModal` internals in read-with-edit mode. |
| `apps/web/src/components/workspace/gantt/GanttIndentGuides.tsx` | Renders 2px vertical lines for tree nesting, positioned absolutely in the outline column. |
| `apps/web/src/components/workspace/gantt/GanttEmptyState.tsx` | Renders the four empty-state variants (no categories, no projects, no tasks, no search match). |

### Token additions (`apps/web/src/app/globals.css`)
No new tokens strictly required; existing `--brand`, `--tl-*`, `--border`, `--border-2`, `--surface`, `--surface-2`, `--text-1`, `--text-2`, `--text-muted` cover everything. If the selection accent needs a dedicated token, add `--selection-accent: var(--brand)` (alias only). Avoid new hex values in components (skill rule `color-semantic`).

---

## 7. Testing

### Unit tests (Vitest, in `gantt-utils.test.ts` and new test files)
- `darken(hex, pct)` helper — 5 cases: `#000000` + 12 → `#000000` (floor), `#ffffff` + 12 → `#e0e0e0`, `#6c44f6` + 12 → expected darker purple, 3-digit hex `#abc` → normalised, invalid string → throws
- `statusChipFor(status)` — 5 cases, one per status value, asserting returned `{ label, fg, bg, border }`
- `flattenVisible(tree)` without inline-adds — update existing test expectations: asserts emitted row count drops by 1 per category + 1 per project + 1 per workspace footer
- `contextMenuItemsFor(row)` — 4 cases: task row, project row, category row, uncategorised row
- All existing 21 `gantt-utils.test.ts` tests remain green

### Visual iteration (Playwright MCP — per handoff §5 loop, executed manually per iteration)
1. Push branch, wait for Vercel preview READY
2. `mcp__playwright__browser_navigate` → preview URL `/workspace/timeline`
3. `mcp__playwright__browser_take_screenshot` full-page → `docs/reports/gantt-v3-screenshots/iter-N-overview.png`
4. Exercise affordances: expand a category, hover a task row, open Categories drawer, right-click a task, test `+` button context awareness, search, Today, zoom changes
5. Second screenshot after interaction → `iter-N-interaction.png`
6. Compare with Linear / Notion / TeamGantt / Airtable references (screenshots saved in `docs/reports/gantt-v3-screenshots/refs/`)
7. Verdict line + iterate until the screenshot passes the rubric (§8 C1–C8)

### Lint / type / CI
- `npx vitest run` from `apps/web` → green
- `npx tsc --noEmit` from `apps/web` → clean
- `npx eslint src/components/workspace/gantt/ src/app/workspace/timeline/` → no new errors (2 pre-existing errors on master remain, documented in the handoff)
- Backend CI green, Vercel production deploy READY, Railway Api SUCCESS, `curl /health → {ok: true}`

---

## 8. Success criteria (from handoff; these are the merge gates)

| # | Criterion | Verification |
|---|---|---|
| C1 | Date header readable — month + week of any bar obvious without reading code | Screenshot eyeball |
| C2 | Bars dominate the grid — no empty-looking page | Screenshot eyeball |
| C3 | Exactly one `+` affordance, Fergus finds it in <5s | Fergus-time-trial |
| C4 | Empty state tells user how to create first category | Load tenant with no categories, screenshot |
| C5 | Right-click task → "Move project to category" + "Remove from timeline" menu items work | MCP interaction test |
| C6 | Uncategorised visually differentiated (grey dot, italics, no colour in drawer) | Screenshot check |
| C7 | Outline reads as a tree, not a spreadsheet (no row dividers) | Screenshot check |
| C8 | ≥4 side-by-side reference screenshots saved in `docs/reports/gantt-v3-screenshots/` | File check |
| T1 | All existing 21 + new vitest tests green | `npx vitest run` |
| T2 | `tsc --noEmit` clean | Command |
| T3 | No *new* ESLint errors | Command (2 pre-existing known) |
| D1 | Backend CI green, Vercel prod READY, Railway SUCCESS, `/health` 200 | Post-merge |

---

## 9. Anti-requirements (explicit "do NOT build")

- Drag-to-reschedule dates on bars
- Dependency arrows between tasks
- Baseline / planned-vs-actual comparison bars
- Critical-path highlighting
- Mobile / tablet responsive layout
- Keyboard shortcuts beyond basic nav (ESC, Enter, Arrow keys, Delete)
- Bulk selection / multi-select
- Custom zoom levels beyond W/M/Q
- Task dependencies visible as connecting lines
- Exporting the Gantt as PNG / PDF (separate feature)
- Changes to the category CRUD API contract
- New backend routes
- DB schema changes

---

## 10. Open questions

None at spec-commit time. All blocking decisions confirmed with Fergus on 2026-04-17.

---

## 11. Follow-up work (out of scope for v3)

- Drag-to-reschedule (likely v4)
- Task dependencies (would warrant its own design round)
- Gantt export (PNG / PDF)
- Keyboard shortcut power-user mode
- First-admin → owner promotion flow (tracked in RBAC v2 memory, unrelated to Gantt)

---

**End of spec. Next step: invoke `superpowers:writing-plans` to produce a placeholder-free, file-level implementation plan against this spec.**
