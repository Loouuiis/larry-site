# Gantt restructure plan

**For:** implementation agent (next Claude session)
**Context doc:** the brief at the top of this chat
**Reviewed screenshots:** sketch + current production (`/workspace/projects/<id>` → Timeline tab, Nordvik Bank)
**Date:** 2026-04-16
**Target branch:** `feat/gantt-v2-category-colour`

---

## 1. The gap in one paragraph

The current Gantt has the right data model (category → project → task → subtask) but renders it as a flat indented list where bars are all status-coloured variants of the same blue. Hierarchy reads as whitespace, not as grouping. The user's three complaints — "no subcategories", "doesn't look different", "task labels too big" — and the hand-drawn sketch all point at the same fix: **make category the dominant visual signal**. Colour a row by its category, not by its status. Give every row a category-coloured dot so you can track grouping at a glance. Separate the date header into month + day rows so it stops reading as one jumbled string. Shrink the outline labels. Add inline `+ add task` rows so creating work doesn't always route through a modal. That is the restructure.

---

## 2. Design decisions

### 2.1 Colour semantics (the big one)

Today: bars are coloured by status (`--tl-in-progress`, `--tl-overdue`, etc.) regardless of category.
New: **bars are coloured by category. Status becomes a modifier.**

Resolution walk for any task's colour:

```
task → parent project → parent category → colour
```

If the category's `colour` field is null or the task is in the Uncategorised bucket, fall back to Larry purple `#6c44f6`. Every row in the outline and every bar in the grid uses this same resolved colour — the colour dot, the rollup bar for the Category/Project row, the task bar, and the subtask bar all inherit it.

Status modifiers layer on top of that base colour:

| Status | Modifier | Rationale |
|---|---|---|
| `on_track` | none — solid fill | default |
| `completed` | opacity 0.5 + trailing `✓` glyph in the bar label | muted, clearly done |
| `not_started` | transparent fill + 1.5px dashed border in category colour | visually "planned, not started" |
| `at_risk` | solid fill + 3px amber stripe along bar's top edge | warning flag that reads from distance |
| `overdue` | solid fill + 2px coral outline + coral dot at bar's right end | more alarming than at_risk |

All modifier values already exist as Larry tokens (`--tl-at-risk`, `--tl-overdue`). No new colours.

### 2.2 Outline hierarchy

Four visual tiers, tuned so a glance answers "is this a group or a task":

| Level | Font | Weight | Case | Size | Colour | Dot size |
|---|---|---|---|---|---|---|
| Category | system | 500 | UPPERCASE, letter-spacing 0.06em | 11px | `--text-1` | 8px, 2px ring in category-50 |
| Project (sub-category) | system | 500 | Sentence | 13px | `--text-1` | 7px, 80% opacity |
| Task | system | 400 | Sentence | 12px | `--text-1` | 5px, 60% opacity |
| Subtask | system | 400 | Sentence | 11px | `--text-2` | 4px, 50% opacity |

Category rows get a **soft lavender background** (`--surface-2`) spanning the full row width — in outline AND in grid — so they visually band across the whole Gantt. Project rows stay white but bold. Task and subtask rows stay white.

Labels truncate with CSS ellipsis at the column width; the full title lives in a `title=` attribute for hover tooltip. No more `[DM]` prefix hacks.

### 2.3 Dimensions

| Token | Old | New | Why |
|---|---|---|---|
| Row height | 36px | 36px | keep the alignment invariant |
| Outline default width | 320px | 260px | give the timeline more room |
| Outline min / max | 220 / 520 | 220 / 420 | cap the lateral intrusion |
| Grid header height | 34px | 48px | two-row month/day header needs it |
| Indent per depth | 12px | 14px | slightly more obvious stair-step |
| Category colour dot | — | 8px | new |
| Project colour dot | — | 7px | new |
| Task colour dot | — | 5px | new |
| Subtask colour dot | — | 4px | new |

Bar heights unchanged: category rollup 6px, project rollup 10px, task 16px, subtask 10px.

### 2.4 Date header

Two rows, 48px total.

- **Top row (20px):** month label, bold small-caps 11px in `--text-2`, letter-spacing 0.08em, left-aligned inside the span of days belonging to that month, with a 1px right border at the month boundary in `--border-2`.
- **Bottom row (28px):** day numbers only (no repeated month words), 10px regular in `--text-2`, centered over their positions.

Day marker cadence by zoom:
- Week zoom: every day shown, `Mon 23`, `Tue 24`, etc. on bottom row, week label on top.
- Month zoom (default): every 7 days (`2, 9, 16, 23, 30`) on bottom row, month label on top. This is the view in the screenshot the user complained about.
- Quarter zoom: every 14 days on bottom row, month label on top, `Q1 2026`-style on a third-row band.

Vertical gridlines at every day marker, 1px in `--surface-2` (almost invisible — just enough to anchor the eye). Month-boundary gridlines are stronger, in `--border`.

### 2.5 Today line

Keep the existing vertical purple line at `rgba(108,68,246,0.4)`, but add a small `Today` label pill at the top of the line, 10px bold purple text on white bg with 4px horizontal padding, sitting just above the grid rows. Visible even when scrolled.

### 2.6 Milestones

New concept. A task marked as a milestone renders as a **10px rotated square** (diamond) at its `dueDate`, not as a bar. Diamond fill = category colour. Label floats to the right of the diamond in 11px.

Data: add `is_milestone BOOLEAN NOT NULL DEFAULT false` to `tasks`. Minimal migration, no backfill needed.

### 2.7 Inline add affordances

Under every Category row and every Project row, when expanded, render a 28px-tall `+ add task` (or `+ add project` / `+ add subtask`) row in `--text-muted` 11px italic, only visible on hover of the parent group. Click opens the same `AddNodeModal` already built, pre-scoped to the correct parent. No new modal code.

This replaces the toolbar `+ Task` button being the only path. The toolbar button stays for keyboard-first flows.

---

## 3. Reference aesthetic

The sketch. Then, for the classic-Gantt feel the user wants: **TeamGantt's timeline view** and **Notion's timeline database** are the closest references. Specifically:

- From TeamGantt: coloured bars per group, milestone diamonds, month-over-days header, soft gridlines.
- From Notion: restrained typography, generous whitespace, no chrome.
- From Linear (Larry's prior reference): the hover/selection states, the subtle left-border-on-selection pattern.

What to consciously NOT copy: MS Project's grey density, Jira's traffic-light dots, Monday's rainbow saturation, Asana's Android-style card chunks. Those are the anti-patterns the brief flags in §1 and §13.7.

---

## 4. Component diff

| File | Status | Notes |
|---|---|---|
| `gantt-types.ts` | **Modify** | Add `categoryColor: string` on `FlatRow`, add `isMilestone?: boolean` on `GanttTask`, add `GanttMilestone` type |
| `gantt-utils.ts` | **Modify** | Add `resolveCategoryColor(node, tree)`, `generateDateAxis(range, zoom)`, `formatMonthSpans(markers)`, `isMilestone(task)` |
| `gantt-utils.test.ts` | **Modify** | Cover the new utilities; existing 8 tests stay |
| `GanttContainer.tsx` | **Modify** | Build `categoryColorMap` memo from tree; pass down; nothing else changes |
| `GanttToolbar.tsx` | **Modify** | Slightly shorter buttons; no other changes |
| `GanttOutline.tsx` | **Modify** | Add sticky "TASK / GROUPS" header row at 48px; smaller default width (260px) |
| `GanttOutlineRow.tsx` | **Rewrite** | New layout: chevron (10px) + `<CategoryDot />` + truncated label with `title=` tooltip; tier-specific typography; category rows get `--surface-2` band |
| `GanttGrid.tsx` | **Modify** | Delegate header to `<GanttDateHeader />`; add vertical gridlines via absolutely-positioned background div; keep everything else |
| `GanttRow.tsx` | **Modify** | Accept `categoryColor` prop; pass to `<GanttBar />`; category rows get `--surface-2` band |
| `GanttBar.tsx` | **Rewrite** | Category colour base + status modifier overlay + milestone variant; `variant` prop now `'category' \| 'project' \| 'task' \| 'subtask' \| 'milestone'` |
| `PortfolioGanttClient.tsx` | **Modify** | Build `categoryColorMap` from API response; fallback to Larry purple for null/Uncategorised |
| `ProjectGanttClient.tsx` | **Modify** | Fetch parent project's `category` field from `/api/workspace/projects/:id` (already in response); use its colour for all bars in this view; fallback to Larry purple |
| `AddNodeModal.tsx` | **Keep** | No changes — already parametric on `mode` and parent ID |
| **NEW** `GanttDateHeader.tsx` | Create | Two-row month/day header; exports `generateMarkersByZoom` helper |
| **NEW** `GanttInlineAdd.tsx` | Create | 28px row shown under expanded Category/Project nodes on hover; opens `AddNodeModal` |
| **NEW** `CategoryDot.tsx` | Create | 8/7/5/4px round dot in category colour; optional 2px ring for Category-tier |
| **NEW** `GanttMilestone.tsx` | Create | 10px rotated square, absolutely positioned in grid row |
| **NEW** `CategoryManagerPanel.tsx` | Create | Slide-over panel for listing, creating, renaming, recolouring, deleting, and reordering categories |

15 files total: 4 new, 8 modified, 2 rewritten, 1 kept.

---

## 5. File-level proposals

Paths relative to `apps/web/src/components/workspace/gantt/`.

### 5.1 `gantt-types.ts`

Append (do not modify existing exports):

```typescript
export type CategoryColorMap = Map<string, string>; // key: "cat:<id>" | "cat:uncategorised" → hex

export type FlatRow = {
  // existing fields...
  categoryColor: string; // resolved colour, never null; Uncategorised → '#6c44f6'
};

export type GanttMilestone = {
  id: string;
  taskId: string;
  date: string; // YYYY-MM-DD
  title: string;
  categoryColor: string;
};

// GanttTask gets one optional field:
export type GanttTask = {
  // existing fields...
  isMilestone?: boolean;
};
```

### 5.2 `gantt-utils.ts`

Add three pure helpers:

```typescript
// Walk up the tree to find the Category colour for any node.
// Task → Project → Category → colour. Returns Larry purple if nothing found.
export function resolveCategoryColor(nodeKey: string, tree: GanttNode[]): string;

// Generate the date-axis markers for a given range and zoom.
// Returns { months: [{label, startPct, endPct}], days: [{label, pct}] }.
export function generateDateAxis(range: DateRange, zoom: ZoomLevel): DateAxis;

// Derive milestones from the flattened rows.
export function extractMilestones(rows: FlatRow[]): GanttMilestone[];
```

Move the existing inline marker generation OUT of `GanttGrid.tsx` into `generateDateAxis`. Write four unit tests for each new helper (12 tests total added). Existing `rollUpBar` and `flattenVisible` untouched.

### 5.3 `GanttContainer.tsx`

One new memo, passed through to children:

```typescript
const categoryColorMap = useMemo(
  () => buildCategoryColorMap(allTasks, tree),
  [allTasks, tree]
);
```

Pass `categoryColorMap` to `<GanttOutline>` and `<GanttGrid>`. State count unchanged (still 6 `useState`).

### 5.4 `GanttOutlineRow.tsx` (rewrite)

Layout:

```tsx
<div
  role="row"
  style={{
    height: 36,
    paddingLeft: 14 + depth * 14,
    paddingRight: 14,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: isCategory ? 'var(--surface-2)' : isSelected ? 'rgba(108,68,246,0.03)' : 'transparent',
    borderBottom: '1px solid var(--border)',
    borderLeft: isSelected ? '3px solid var(--brand)' : '3px solid transparent',
  }}
>
  {hasChildren && <Chevron expanded={expanded} />}
  <CategoryDot color={categoryColor} tier={kind} />
  <span style={typographyByTier[kind]} title={title}>
    {truncate(title, outlineWidth)}
  </span>
</div>
```

Typography map in the same file:

```typescript
const typographyByTier = {
  category:  { fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-1)' },
  project:   { fontSize: 13, fontWeight: 500, color: 'var(--text-1)' },
  task:      { fontSize: 12, fontWeight: 400, color: 'var(--text-1)' },
  subtask:   { fontSize: 11, fontWeight: 400, color: 'var(--text-2)' },
} as const;
```

Truncation: use `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` on the span. Don't compute truncation in JS — let CSS do it. The column width flexes via the resizable outline.

### 5.5 `GanttBar.tsx` (rewrite)

New prop signature:

```typescript
type GanttBarProps = {
  variant: 'category' | 'project' | 'task' | 'subtask' | 'milestone';
  status: GanttStatus;
  categoryColor: string; // always present now, never undefined
  startPct: number;
  widthPct: number;
  progressPct: number;
  label: string;
  isSelected: boolean;
};
```

Body structure (task variant shown; others are variations):

```tsx
<div style={{ position: 'absolute', left: `${startPct}%`, width: `${widthPct}%`, top: 10, height: 16 }}>
  <div style={{
    position: 'absolute', inset: 0,
    background: status === 'not_started' ? 'transparent' : categoryColor,
    opacity: status === 'completed' ? 0.5 : 1,
    border: status === 'not_started' ? `1.5px dashed ${categoryColor}` : status === 'overdue' ? `2px solid var(--tl-overdue)` : 'none',
    borderRadius: 4,
  }} />
  {status === 'at_risk' && (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'var(--tl-at-risk)', borderTopLeftRadius: 4, borderTopRightRadius: 4 }} />
  )}
  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', paddingLeft: 8, fontSize: 11, fontWeight: 500, color: contrastTextFor(categoryColor) }}>
    {label}{status === 'completed' && ' ✓'}
  </div>
</div>
```

`contrastTextFor(hex)` is a pure helper in `gantt-utils.ts` that returns white for dark colours, category-900 for light ones. Use WCAG luminance, not eyeballing. Two unit tests.

Category and project variants are rollup bars: shorter (6px / 10px), lower opacity (0.45), no label inside the bar, no status modifiers.

Milestone variant:

```tsx
<div style={{
  position: 'absolute', left: `calc(${pct}% - 10px)`, top: 8,
  width: 20, height: 20, background: categoryColor,
  transform: 'rotate(45deg)', borderRadius: 2,
}} />
```

### 5.6 `GanttDateHeader.tsx` (new)

```tsx
export function GanttDateHeader({ range, zoom, outlineWidth }: Props) {
  const axis = generateDateAxis(range, zoom);
  return (
    <div style={{ height: 48, position: 'sticky', top: 0, background: 'var(--surface)', borderBottom: '1px solid var(--border)', zIndex: 2 }}>
      <div style={{ height: 20, display: 'flex' }}>
        {axis.months.map(m => (
          <div key={m.label} style={{ width: `${m.endPct - m.startPct}%`, padding: '4px 0 0 8px', fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-2)', borderRight: '1px solid var(--border-2)' }}>
            {m.label}
          </div>
        ))}
      </div>
      <div style={{ height: 28, position: 'relative' }}>
        {axis.days.map(d => (
          <span key={d.pct} style={{ position: 'absolute', left: `${d.pct}%`, transform: 'translateX(-50%)', top: 8, fontSize: 10, color: 'var(--text-2)' }}>
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}
```

### 5.7 `GanttInlineAdd.tsx` (new)

```tsx
type Props = { mode: 'category' | 'project' | 'task' | 'subtask'; parentKey: string; onAdd(): void };

export function GanttInlineAdd({ mode, onAdd }: Props) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onAdd}
      style={{
        height: 28, paddingLeft: indentByMode[mode], paddingRight: 14,
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 11, fontStyle: 'italic', color: 'var(--text-muted)',
        borderBottom: '1px solid var(--border)',
        cursor: 'pointer',
        opacity: hovered ? 1 : 0.6,
      }}
    >
      + Add {mode === 'project' ? 'project' : mode === 'subtask' ? 'subtask' : 'task'}
    </div>
  );
}
```

Wire into `GanttOutline.tsx`: after rendering a Category or Project row, if it's in `expanded`, render a `<GanttInlineAdd>`. `onAdd` calls the container's existing `onAdd` callback.

### 5.8 `CategoryDot.tsx` (new)

```tsx
type Tier = 'category' | 'project' | 'task' | 'subtask';
const sizeByTier: Record<Tier, number> = { category: 8, project: 7, task: 5, subtask: 4 };
const opacityByTier: Record<Tier, number> = { category: 1, project: 0.8, task: 0.6, subtask: 0.5 };

export function CategoryDot({ color, tier }: { color: string; tier: Tier }) {
  const size = sizeByTier[tier];
  return (
    <span
      aria-hidden
      style={{
        width: size, height: size, borderRadius: '50%',
        background: color, opacity: opacityByTier[tier],
        boxShadow: tier === 'category' ? `0 0 0 2px ${tinyTint(color)}` : 'none',
        flexShrink: 0,
      }}
    />
  );
}
```

`tinyTint(hex)` returns a 10%-alpha version of the colour for the ring. Pure function, one test.

### 5.9 `GanttMilestone.tsx` (new)

Very small. Renders the diamond at a percentage-based x within the grid row.

### 5.10 `PortfolioGanttClient.tsx`

Build the colour map after the tree normalisation step:

```typescript
const categoryColorMap = useMemo(() => {
  const map = new Map<string, string>();
  for (const cat of data?.categories ?? []) {
    const key = cat.id ? `cat:${cat.id}` : 'cat:uncategorised';
    map.set(key, cat.colour ?? '#6c44f6');
  }
  return map;
}, [data]);
```

Pass `categoryColorMap` into `<GanttContainer>`. Plumbing only; no other changes.

### 5.11 `ProjectGanttClient.tsx`

Per-project view doesn't have a Category-root node. Fetch the project's category from the existing `/api/workspace/projects/:id` response (the data is there, `category_id` and the join). Build a single-entry `categoryColorMap` and pass it down. Fallback to `'#6c44f6'` if no category.

### 5.12 Migration

New file `packages/db/src/migrations/022_task_milestones.sql`:

```sql
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_milestone BOOLEAN NOT NULL DEFAULT false;
```

Expose on `GanttTask` in both timeline routes. Accept in `POST /v1/tasks` and `PATCH /v1/tasks/:id`. Three new lines in each route, plus the Zod schema.

### 5.13 `CategoryManagerPanel.tsx` (new)

A slide-over panel (280px wide, position absolute, right-aligned over the outline column) triggered by a small gear icon next to the "TASK / GROUPS" header in `GanttOutline`. It uses the existing category CRUD endpoints:

- `GET /v1/categories` → list (already used by the timeline)
- `POST /v1/categories` → create (name + colour)
- `PATCH /v1/categories/:id` → rename / recolour
- `DELETE /v1/categories/:id` → delete (projects go to Uncategorised via FK)
- `POST /v1/categories/reorder` → drag-reorder

Layout:

```tsx
<div style={{
  position: 'absolute', top: 48, left: 0, width: 280, bottom: 0,
  background: 'var(--surface)', borderRight: '1px solid var(--border)',
  zIndex: 10, padding: '12px 14px',
  boxShadow: '4px 0 12px rgba(0,0,0,0.04)',
}}>
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
    <span style={{ fontSize: 12, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-2)' }}>
      Categories
    </span>
    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14 }}>
      ✕
    </button>
  </div>

  {categories.map(cat => (
    <div key={cat.id} style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 0', borderBottom: '1px solid var(--border)',
    }}>
      <input type="color" value={cat.colour ?? '#6c44f6'}
        onChange={e => handleRecolour(cat.id, e.target.value)}
        style={{ width: 20, height: 20, border: 'none', borderRadius: 4, cursor: 'pointer', padding: 0 }}
      />
      <span style={{ flex: 1, fontSize: 13, color: 'var(--text-1)' }}>{cat.name}</span>
      <button onClick={() => handleRename(cat.id)} style={iconBtnStyle}>✎</button>
      <button onClick={() => handleDelete(cat.id)} style={iconBtnStyle}>✕</button>
    </div>
  ))}

  <button onClick={handleCreate} style={{
    marginTop: 8, width: '100%', padding: '8px 0',
    background: 'var(--surface-2)', border: '1px dashed var(--border-2)',
    borderRadius: 8, fontSize: 12, color: 'var(--text-2)', cursor: 'pointer',
  }}>
    + New category
  </button>
</div>
```

State: 2 `useState` — `isOpen: boolean` (lives in `GanttOutline`) and `editingId: string | null` (inline rename mode). Mutations call the proxy endpoints and then trigger `fetchTimeline()` via a callback prop from `PortfolioGanttClient`. No new state in `GanttContainer`.

Rename UX: click the pencil → the label turns into a 13px inline `<input>` with the current name; blur or Enter saves via `PATCH /v1/categories/:id`.

Delete UX: confirm via `window.confirm('Delete category "{name}"? Projects will move to Uncategorised.')` — no custom modal needed for MVP.

Reorder: deferred to P1 (drag-reorder is a nice-to-have; `sort_order` already works via the API for manual callers).

---

## 6. State model

`GanttContainer` stays at 6 `useState`:

```typescript
const [zoom, setZoom] = useState<ZoomLevel>('month');
const [search, setSearch] = useState('');
const [outlineWidth, setOutlineWidth] = useState(260); // was 320
const [hoveredKey, setHoveredKey] = useState<string | null>(null);
const [selectedKey, setSelectedKey] = useState<string | null>(null);
const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
```

Derived (memo, not state):
- `allTasks`
- `range`
- `rows` (flattened visible)
- `categoryColorMap` ← new
- `milestones` ← new (extracted from rows)
- `dateAxis` ← new

Lifted out of `GanttGrid` to `GanttContainer` for sharing. No new state elsewhere.

---

## 7. Priority order

### MVP — first PR, target 2–3 days

Everything the user explicitly named, plus the structural fixes that make the rest possible.

1. `CategoryDot` component + `resolveCategoryColor` utility + `buildCategoryColorMap` (foundational)
2. Rewritten `GanttOutlineRow`: chevron + dot + tier-typography + truncation + Category bands
3. Rewritten `GanttBar`: category-colour base + status modifiers
4. New `GanttDateHeader`: two-row month/day
5. Vertical gridlines at day markers
6. Outline default width 260px
7. New `GanttInlineAdd` under expanded Category and Project rows + `+ Add category` at outline bottom
8. Today-line label pill
9. New `CategoryManagerPanel`: slide-over from the outline header, list/create/rename/recolour/delete/reorder categories
10. Unit tests for new utils (12 added)

### P1 — second PR, target 1–2 days

11. Milestones: `is_milestone` column migration + API plumbing + `GanttMilestone` component
12. Hover tooltip on bars: full title + due date + assignee + status — use native `<div>` positioned on hover, no library
13. Selection state on bars (2px outline in `--brand`) matching selection state in outline

### Later — not in this plan

The brief's §9 gaps, triaged against whether they're needed for "feeling like a proper Gantt":

| §9 item | MVP? | Notes |
|---|---|---|
| 1. Dependency lines | No | Visually busy; Linear/Notion don't have them; user didn't mention |
| 2. Unscheduled panel | No but soon | Useful for the empty-state case; defer to a follow-up PR |
| 3. Mobile fallback | No | Larry is a desktop PM tool primarily; not on the critical path |
| 4. Drag bars | No | Big lift; revisit after category colour lands |
| 5. In-bar tooltips | **P1** | Cheap, high value — listed above |
| 6. Assignee avatars | No for now | Fits later; adds visual noise if done too early |
| 7. Milestones | **P1** | Explicitly in the sketch — listed above |
| 8. Baseline vs actual | No | Enterprise-PM territory; out of scope for Larry |
| 9. Critical path | No | Same |
| 10. Row reorder | No | Covered by category `sort_order` + project `sort_order` already in DB |
| 11. Re-parent task by drag | No | Edit fields is fine for v1 |
| 12. Re-parent project by drag | No | Same |

---

## 8. Scope limit

This plan does NOT propose:

- Any DB schema change except one `ALTER TABLE tasks ADD COLUMN is_milestone BOOLEAN DEFAULT false`
- Any new npm dependency (no chart lib, no dnd lib, no tooltip lib)
- Changes to the backend API contracts beyond serialising `isMilestone`
- Changes to non-Gantt components or pages (the category panel lives inside the Gantt outline, not a new route)
- Mobile responsive pass (the Gantt remains a desktop feature)
- Weekend shading (explicitly skipped for cleanliness)
- Drag-and-drop of bars, rows, or reparenting
- Dependency arrow rendering
- Unscheduled-tasks panel (deferred, see §7)
- Critical path, baseline, or earned-value concepts
- Assignee avatar rendering on bars

If the implementation agent finds any of these are blockers for the MVP items, stop and escalate rather than scope-creep.

---

## 9. Acceptance criteria

Run through these with the user on a screenshare before merging:

1. Open `/workspace/timeline` on a tenant with ≥3 categories. Each category row's background is `--surface-2`, its label is uppercase, and its coloured dot is visible and matches the category's `colour` field.
2. Projects under a category inherit that category's colour in their dot AND their rollup bar.
3. Tasks under a project inherit the same colour in their dot AND their bar. Status shows as: solid (on_track), dashed outline (not_started), amber top stripe (at_risk), coral outline (overdue), 50% opacity + ✓ (completed).
4. The date header shows two rows: month labels on top, day numbers on bottom, with the month boundary clearly separated.
5. Hovering over an expanded Category or Project row shows a faded `+ Add task` / `+ Add project` line underneath; clicking it opens the existing `AddNodeModal` scoped to the right parent.
6. At the bottom of the outline, a subtle `+ Add category` row is visible; clicking it opens the `AddNodeModal` in category mode.
7. Clicking the gear icon in the outline header opens the `CategoryManagerPanel` slide-over. From there: create a new category with a name and colour, rename an existing one inline, change its colour via the colour swatch, and delete it (projects move to Uncategorised).
8. A task with `is_milestone = true` renders as a rotated-square diamond at its due date instead of a bar.
9. Creating an Uncategorised project, its tasks' bars are Larry purple `#6c44f6`.
10. Per-project Timeline tab (`/workspace/projects/<id>`): all bars use the parent category's colour; if the project is uncategorised, all bars are Larry purple.
11. The row-alignment invariant holds: outline row N lines up pixel-exactly with grid row N at every zoom.
12. No task label in the outline overflows — long titles truncate with `…` and show the full title on hover.
13. The today-line carries a `Today` pill label at the top of the grid.
14. All 12 new unit tests + 8 existing tests pass.

---

## 10. Resolved decisions (user confirmed 2026-04-16)

1. **Category management** → Ship a proper "Manage categories" panel in this PR (MVP). See §5.13 for spec.
2. **Milestone data** → `is_milestone BOOLEAN` on `tasks`. Confirmed.
3. **Inline add at the Category root** → A subtle `+ Add category` inline row at the very bottom of the outline (same style as other inline-add rows). Minimalistic, no toolbar clutter.
4. **Completed-task treatment** → Faded same category colour at 50% opacity + `✓` glyph. No hide/toggle. Confirmed.
5. **Weekend shading** → Skipped entirely for cleanliness. Not in any PR.

---

## 11. What gets shipped in which PR

**PR #67 — Gantt v2: Category colour, hierarchy & category management**
Items 1–10 from §7 MVP. Target ~800 LOC net, mostly in the Gantt folder. Includes the `CategoryManagerPanel` slide-over for full category CRUD. Unit-test coverage ≥ 80% on new helpers. No DB migration. No backend changes. Should be reviewable in one sitting.

**PR #68 — Gantt v2: Milestones & polish**
Items 11–13 from §7 P1. ~200 LOC net. One small migration. Three lines of backend per timeline route. Ship behind a `feature_gantt_milestones` flag if you want to stage it.

Both PRs together are the full restructure the user asked for.

---

*End of plan. Attach to the brief as a companion doc and hand both to the implementation session.*
