# 2026-04-18 — Gantt v4 post-launch bug repro

Live reproduction captured via Playwright MCP against prod (`larry-pm.com`) at
~19:30 UTC on 2026-04-18, before implementation of the
`2026-04-18-gantt-v4-slice-4-post-launch-bugs.md` plan.

## Environment

- URL: https://larry-pm.com
- Tenant: `launch-test-2026@larry-pm.com` (tenant id `5d7cd81b-03ed-4309-beba-b8e41ae21ac8`)
- Project under test: "Modify Test 2026-04-18" (`fe0afe7a-cacc-43c4-bdd9-7f7105a054a3`)
- Category under test: "ColourFlashTestRed" (`65fb90d9-250f-4493-84d1-53a58e0d8a4b`, colour `#ef4444`)
- Build under test: commit `63414e7` (Slice 3C-3 — category-only DnD)

## Bug 1 — right-click "Add subcategory" broken on project timeline

### Org timeline (works)

1. Navigate to `/workspace/timeline`
2. Right-click the "Diag 409" category row → context menu opens with entries:
   - Add subcategory
   - Rename
   - Change colour
   - Delete
3. Click "Add subcategory" → `New subcategory` modal opens. Typing a name + clicking Create → new nested row appears.

End-to-end path verified. This surface is **not** broken.

### Project timeline (broken)

1. Navigate to `/workspace/projects/fe0afe7a-cacc-43c4-bdd9-7f7105a054a3?tab=timeline`
2. DOM audit of all `[role="row"]` and `[role="button"]` nodes in the outline:

```json
[
  { "text": "Issue 109 verify task — EDITED",           "role": "row" },
  { "text": "Review QA checklist — EDITED BY TEST",     "role": "row" }
]
```

No category row is rendered at all. The project's own category
("ColourFlashTestRed") is attached in the DB (`projects.category_id =
65fb90d9-...`) but never appears in the outline, so right-click on a category
is physically impossible — there is nothing to right-click.

### Root cause

`apps/web/src/components/workspace/gantt/ProjectGanttClient.tsx:46` calls
`buildProjectTree(project, tasks)` with only project + tasks. Categories are
not threaded in at all. No category rows are ever built.

## Bug 2 — project timeline flashes Larry purple before the category colour loads

### Measurement

Setup:

1. Moved "Modify Test 2026-04-18" under the red category "ColourFlashTestRed"
   via `PATCH /api/workspace/projects/:id { categoryId: … }`.
2. Loaded `/workspace/projects/:id?tab=overview`.
3. Installed a 50 ms polling observer on every
   `div[style*="background"]` with bounding-rect height 10-20 px and width > 100 px
   (i.e. task-bar-sized elements).
4. Clicked the `Timeline` tab (triggers client-side mount of `ProjectGanttClient`).
5. Let the observer run for ~4 s and dumped the sample array.

### Results

```json
{
  "firstPurpleT":  12367,
  "firstPurpleBg": "rgb(108, 68, 246)",
  "lastPurpleT":   12962,
  "firstRedT":     13006,
  "firstRedBg":    "rgb(239, 68, 68)",
  "totalSamples":  485
}
```

- `rgb(108, 68, 246)` = `#6c44f6` = `DEFAULT_CATEGORY_COLOUR` (Larry purple)
- `rgb(239, 68, 68)`  = `#ef4444` = the category's real colour (red)

The task bar was purple for **~640 ms** on a warm cache (tab switch). On a
fresh navigate without React Query cache warmth, Fergus reports the window at
2-3 s.

### Root cause

`apps/web/src/components/workspace/gantt/ProjectGanttClient.tsx:52`:

```ts
const [categoryColour, setCategoryColour] = useState<string>(DEFAULT_CATEGORY_COLOUR);
```

Line 56-77 fires a post-mount `useEffect` that does two `fetch()`s (projects +
categories), resolves the cascade colour, and calls `setCategoryColour` on
completion. The component renders once with Larry purple and once more with
the real colour.

## Bug 3 — drag-and-drop only wired for categories

DOM audit of outline rows on `/workspace/timeline`:

| Row kind      | `role`   | `aria-roledescription` | cursor    | Draggable? |
|---------------|----------|------------------------|-----------|------------|
| Diag 409 (category) | button | draggable | grab | ✓ |
| ColourFlashTestRed (category) | button | draggable | grab | ✓ |
| Modify Test 2026-04-18 (project) | row | — | pointer | ✗ |
| Uncategorised (synthetic bucket) | row | — | pointer | ✗ |
| Verify-109 child — EDITED (project) | row | — | pointer | ✗ |
| Verify-109 child — EDITED (project) | row | — | pointer | ✗ |

Only real-id categories are draggable. Projects, tasks, subtasks, and the
synthetic Uncategorised row have no drag attrs, no `dnd-kit` listeners, and a
pointer cursor.

### Root cause

`apps/web/src/components/workspace/gantt/GanttOutlineRow.tsx:62-64`:

```ts
function isDraggableCategory(n) {
  return n.kind === "category" && n.id !== null && n.id !== "uncat" && n.id !== "__root__";
}
```

`useDraggable({ disabled: !dndEnabled })` is only enabled for that narrow
case. Slice 3C-3 (PR #118) intentionally shipped this as category→category
only; the rest of the v4 spec §4.5 matrix was deferred.

## Next steps

See
`docs/superpowers/plans/2026-04-18-gantt-v4-slice-4-post-launch-bugs.md` for
the three-PR fix plan (project-timeline category rows, colour-flash removal,
full DnD matrix).
