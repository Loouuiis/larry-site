# Timeline Bug Bash — 2026-04-20 (PR #141)

Manual test sheet for the 9 timeline fixes landed on branch
`fix/timeline-slice-1-dnd-hover-expand-memo`. Run these on the Vercel
preview deploy for the PR, then again on production once merged. Every
case has a pre-condition, steps, and a pass/fail criterion — tick each
one off as you go.

> Tests on BotID-protected routes (anything under `/login` and
> `/workspace/**`) must use a real Chromium (Playwright MCP, manual
> browser) — headless Chromium is served a "Code 21" block page.

---

## 0. Setup — run once before starting

**Test account:** `launch-test-2026@larry-pm.com` / `TestLarry123%`
(admin, own tenant; seeded 2026-04-18).

**Seed data prep** (open the browser devtools console on
`/workspace/timeline` after login and paste):

```js
// Wipes the persisted Gantt state for a clean run. Skip if you want
// to test the persistence behaviour from a pre-existing state.
Object.keys(localStorage)
  .filter((k) => k.startsWith("larry:gantt:"))
  .forEach((k) => localStorage.removeItem(k));
```

Create the following tree via right-click → Add actions (or the
toolbar "Add item" button), if the seed tenant doesn't already have
them. You'll reuse these in the cases below.

```
[Category] Bug Bash 2026-04-20
  ├─ [Subcategory] Client Work
  │   └─ [Project] Website Redesign
  │       └─ [Task] Wireframes (start: 2026-04-21, due: 2026-05-01)
  │           └─ [Subtask] Home (start: 2026-04-21, due: 2026-04-25)
  │               └─ [Sub-subtask] Hero (start: 2026-04-21, due: 2026-04-23)
  └─ [Project] Internal Tools
      └─ [Task] Rewrite invoicing (start: 2026-04-22, due: 2026-05-30)
```

---

## 1. Bug 1 — DnD: task → category completes silently (was no-op)

**Was:** Dragging a task onto a category row on `/workspace/timeline`
did nothing — validateDrop emitted `moveTaskToCategory` but the
portfolio handler had no case for it.

**Case 1.1 — Org timeline, task onto category**
- [ ] On `/workspace/timeline`, drag "Rewrite invoicing" onto the
      "Bug Bash 2026-04-20" category row.
- [ ] **Pass:** The task now renders under that category's bucket
      (the project stays where it was, but the task's `categoryId` is
      set). Network tab: `PATCH /api/workspace/tasks/<id>` returned
      200. No "silent no-op", no error toast.

**Case 1.2 — Org timeline, subtask onto category**
- [ ] Drag "Home" (a subtask) onto any category. Same expected
      outcome as 1.1.

**Case 1.3 — Regression: other DnD combos still work**
- [ ] Drag a subcategory onto another category → reparents
      (moveCategory).
- [ ] Drag a project onto a different category → reparents
      (moveProject).
- [ ] Drag a task onto a different project → cross-project move
      (moveTask with newProjectId).
- [ ] Drag a task onto another task → nests as subtask (see Bug 4
      for the deeper case).
- [ ] Attempt: drag category onto its own descendant → toast
      "Can't move a category under its own descendant.", drop
      rejected.

---

## 2. Bug 2 — "Add item" is hover-aware

**Was:** Clicking the toolbar "Add item" button always opened the
Category/Project picker, ignoring the row you were hovering.

**Case 2.1 — Hover a project, click Add**
- [ ] Hover the row "Website Redesign".
- [ ] Click "Add item".
- [ ] **Pass:** AddNodeModal opens directly in **task** mode with
      Website Redesign as parent (visible via the modal heading
      "New task"). No picker step.

**Case 2.2 — Hover a task, click Add**
- [ ] Expand the project row so "Wireframes" is visible.
- [ ] Hover "Wireframes".
- [ ] Click "Add item".
- [ ] **Pass:** AddNodeModal opens directly in **subtask** mode with
      Wireframes as parentTaskId ("New subtask" heading).

**Case 2.3 — Hover a subtask, click Add (Slice 2)**
- [ ] Hover "Home" (a subtask).
- [ ] Click "Add item".
- [ ] **Pass:** AddNodeModal opens in **subtask** mode with Home as
      parentTaskId — a nested subtask under Home (unlimited depth,
      see Bug 4).

**Case 2.4 — Hover a category, click Add**
- [ ] Hover "Client Work".
- [ ] Click "Add item".
- [ ] **Pass:** Picker opens (because both "subcategory" and "new
      project in this category" are reasonable actions). Selecting
      **Group** → AddNodeModal opens as subcategory of Client Work.
      Selecting **Task** (labelled "Project" on the picker) → new
      project in Client Work.

**Case 2.5 — Nothing hovered, click Add**
- [ ] Move mouse outside any row, click "Add item".
- [ ] **Pass:** Picker opens. Group → new root category. Task → new
      top-level project.

**Case 2.6 — Same behaviour inside a project timeline**
- [ ] Navigate to `/workspace/projects/<id>?tab=timeline` (e.g. use
      Internal Tools).
- [ ] Hover a task, click Add → subtask modal directly.
- [ ] Hover a subtask, click Add → subtask modal directly (not task).
- [ ] Hover nothing, click Add → picker.

---

## 3. Bug 3 — New subcategories/subtasks land expanded

**Was:** Creating a subcategory via right-click inserted it into the
tree collapsed, so it looked missing until the user clicked the
chevron.

**Case 3.1 — Create a new subcategory**
- [ ] Right-click "Bug Bash 2026-04-20" → "Add subcategory".
- [ ] Name it "TEMP-001" and save.
- [ ] **Pass:** The new subcategory appears **expanded** (its chevron
      points down, no collapse).

**Case 3.2 — Create a new subtask**
- [ ] Right-click "Wireframes" and use the add-subtask flow (or hover
      + Add item — Case 2.2).
- [ ] Name it "TEMP-sub" with today's dates.
- [ ] **Pass:** The new subtask appears under Wireframes immediately,
      and the parent row is still expanded.

**Case 3.3 — Previously-collapsed siblings stay collapsed**
- [ ] Collapse "Client Work" (click its chevron).
- [ ] Create a new top-level category via the Add picker.
- [ ] **Pass:** The new category appears expanded. "Client Work"
      remains collapsed.

**(Cleanup)** Delete TEMP-001 and TEMP-sub via right-click → Delete.

---

## 4. Bug 4 — Unlimited subtask depth

**Was:** `buildTaskForest` capped subtasks at one level and
`validateDrop` forced deeper drops to become siblings of the target.
Depth > 1 was architecturally impossible via the UI.

**Case 4.1 — Create depth-3 chain**
- [ ] On Website Redesign → Wireframes → Home, right-click "Home" →
      Add subtask (or hover + Add item).
- [ ] Name the new subtask "Hero" with today's dates.
- [ ] **Pass:** The Gantt shows three levels under Wireframes
      (Wireframes → Home → Hero). Each level is clickable and
      expandable.

**Case 4.2 — Drag to deepen**
- [ ] Create a sibling subtask "Gallery" under Wireframes.
- [ ] Drag "Gallery" onto "Hero".
- [ ] **Pass:** Gallery now nests under Hero (depth 4). Previously
      it would have become a sibling of Home, at depth 2.

**Case 4.3 — Cycle rejection on task drops**
- [ ] Drag "Wireframes" onto "Hero" (Hero is a descendant of
      Wireframes).
- [ ] **Pass:** Error toast "Can't move a task under its own
      descendant." No mutation sent.

**Case 4.4 — Roll-up bars span deep children**
- [ ] Set Hero dates to 2026-04-23 → 2026-04-30 (i.e. extend past
      the parent Wireframes due date).
- [ ] **Pass:** The Wireframes parent bar visually extends to cover
      through 2026-04-30 (roll-up includes deep descendants via
      `gatherDescendantTasks`).

**(Cleanup)** Delete the test rows you created.

---

## 5. Bug 5 — Latency

**Was:** `buildPortfolioTree`, `normalizePortfolioStatuses`, and two
lookup maps rebuilt in render on every parent state change, so a
1000-project tenant walked the full tree on every keystroke.

**Case 5.1 — Search-box responsiveness**
- [ ] On `/workspace/timeline`, type slowly into the search box:
      `T-I-M-E-L-I-N-E`.
- [ ] **Pass:** Each keystroke paints within ~16ms. No noticeable
      freeze between letters. Dimming animation flows smoothly.

**Case 5.2 — Scroll the grid**
- [ ] Scroll the timeline horizontally with trackpad / scroll wheel.
- [ ] **Pass:** No jank. Smooth 60fps scroll.

**Case 5.3 — Zoom switcher**
- [ ] Cycle Week → Month → Quarter a few times.
- [ ] **Pass:** Each switch paints in <100ms. No "Loading…" flash.

**Case 5.4 — Pragmatic perf sanity (devtools Profiler)**
- [ ] React DevTools → Profiler → record → expand a category → stop.
- [ ] **Pass:** `GanttContainer` / `PortfolioGanttClient` don't
      appear repeatedly in the render flame graph. `root` is the
      same object ref between parent renders (check via Profiler
      props diff).

---

## 6. Bug 6 — Sub-groups paint in a single frame

**Was:** Sub-groups appeared staggered because each parent re-render
rebuilt `root`, triggering the expand-state useEffect cascade.

**Case 6.1 — Hard refresh → timeline paints as one batch**
- [ ] On a tenant with ≥ 3 categories + subcategories, hard-refresh
      the org timeline URL (Cmd/Ctrl-Shift-R).
- [ ] **Pass:** After the "Loading…" flash, the full tree paints in
      a single frame. No visible cascade of rows appearing one by
      one.

---

## 7. Bug 7 — View state persists across refresh

**Was:** Zoom, collapsed rows, and outline width reset to defaults on
every page load.

**Case 7.1 — Collapse some rows, refresh**
- [ ] On `/workspace/timeline`, collapse "Client Work" and "Bug Bash
      2026-04-20" by clicking their chevrons.
- [ ] Hard-refresh the page.
- [ ] **Pass:** Both rows are still collapsed after reload. Other
      rows remain expanded.

**Case 7.2 — Set Quarter zoom, refresh**
- [ ] Switch zoom to Quarter.
- [ ] Hard-refresh.
- [ ] **Pass:** Page reloads in Quarter zoom, not Month.

**Case 7.3 — Resize the outline panel, refresh**
- [ ] Drag the outline-panel divider right to widen it (to ~400px).
- [ ] Hard-refresh.
- [ ] **Pass:** Outline is ~400px wide on reload.

**Case 7.4 — Per-project scope**
- [ ] On the Website Redesign project timeline, collapse a task row
      and set zoom to Week. Hard-refresh.
- [ ] **Pass:** Project timeline restores to Week with the task
      collapsed.
- [ ] Navigate to the Internal Tools project timeline.
- [ ] **Pass:** Internal Tools has its OWN state (Month, everything
      expanded) — Website Redesign's state is not shared.

**Case 7.5 — New rows appear expanded after refresh**
- [ ] Without interacting with the org timeline, create a new
      category called "TEMP-Fresh" via the Add picker.
- [ ] Refresh.
- [ ] **Pass:** TEMP-Fresh appears expanded (new keys that were
      never collapsed don't land in the `collapsed` set, so they
      default to expanded on reload).

**Case 7.6 — localStorage shape sanity**
- [ ] Browser devtools → Application → Local Storage →
      `https://larry-pm.com`.
- [ ] **Pass:** Keys `larry:gantt:portfolio:collapsed`,
      `larry:gantt:portfolio:zoom`, `larry:gantt:portfolio:outline`
      exist. Project timelines use `larry:gantt:proj:<uuid>:…`
      keys. The collapsed value is a JSON array of strings. Zoom is
      one of `week`/`month`/`quarter`. Outline is a number string.

**(Cleanup)** Delete TEMP-Fresh. Run the localStorage wipe snippet
from §0 if you want to reset state between later cases.

---

## 8. Bug 8 — Project timeline self-sufficiency

**Was:** Landing directly on a project URL without visiting
`/workspace/timeline` first rendered the project row in neutral grey
(NEUTRAL_ROW_COLOUR) until the org cache populated. Category colours
depended on an org-wide query.

**Case 8.1 — Cold-cache project visit shows real colour**
- [ ] Log out and back in (or open an incognito window).
- [ ] Navigate directly to `/workspace/projects/<id>?tab=timeline`
      for a project that belongs to a coloured category (e.g.
      Website Redesign under Client Work).
- [ ] **Pass:** The project row's colour dot matches Client Work's
      colour on first paint. No grey flash, no wait for a background
      org-timeline fetch.

**Case 8.2 — Project-scoped subcategories render without org cache**
- [ ] On the Website Redesign project timeline, right-click the
      project row → "Add category in this project". Name it
      "PROJ-CAT".
- [ ] Log out / back in to fully reset caches, then navigate
      directly to `/workspace/projects/<id>?tab=timeline` again.
- [ ] **Pass:** PROJ-CAT row is visible on first paint (came from
      the project-timeline's own categories slice, not the org
      cache).

**Case 8.3 — Network sanity**
- [ ] Devtools Network tab, filter to `timeline`.
- [ ] **Pass:** Visiting a project page only requires
      `/api/workspace/projects/<id>/overview` (which includes the
      timeline internally). Loading succeeds even if
      `/api/workspace/timeline` is never requested.

**Case 8.4 — Backwards-compat during a partial deploy**
- [ ] If the API deploy precedes the web deploy (or vice versa),
      the project timeline should still render — the frontend falls
      back to the org cache when `timeline.categories` is absent.
- [ ] **Pass:** Mixed deploy window doesn't break either view. (This
      is a roll-forward / roll-back safety check; hard to simulate
      manually — verify via `git diff` review that both paths are
      guarded.)

**(Cleanup)** Delete PROJ-CAT.

---

## 9. Follow-up: #9 — Hover-aware Add (redundant with Bug 2)

Covered entirely by Bug 2 cases 2.1–2.6. No separate cases.

---

## Regression sweep — stuff that should still work

These are high-blast-radius scenarios that aren't fixes in this PR
but touch the same code paths. If any of these break, roll back.

- [ ] **R1** — Context menus: right-click category / project / task /
      subtask show the expected items. "Delete" prompts for confirm.
- [ ] **R2** — Moving a project to a category via the right-click
      submenu still works (different code path from DnD).
- [ ] **R3** — "Remove from timeline" on a task nulls its dates and
      removes the bar.
- [ ] **R4** — Archived projects: write actions show the
      "unarchive first" message.
- [ ] **R5** — Uncategorised bucket is non-editable: no right-click
      menu, drops on it are rejected.
- [ ] **R6** — Category colour picker works (right-click → Change
      colour → pick a swatch → apply → timeline recolours).
- [ ] **R7** — Category rename works (right-click → Rename →
      prompt).
- [ ] **R8** — The "+ Add item" button shows when the tenant has
      content AND the empty-state CTA shows when it doesn't.
- [ ] **R9** — Larry's accept flow (e.g. accept an action that
      creates a task): the timeline refetches via the
      `larry:refresh-timeline` window event.
- [ ] **R10** — Task bars render correctly for each status:
      not_started / on_track / at_risk / overdue / completed.

---

## Edge cases to poke at

- [ ] A tenant with **zero projects** → empty state, no crashes.
- [ ] A tenant with **one project, no tasks** → project row shows
      "(no scheduled tasks)" suffix.
- [ ] **Very wide outline panel** (~550px) → saved + restored; UI
      doesn't break the grid below.
- [ ] **Very narrow outline panel** (~150px) → readable, doesn't
      clip chevrons.
- [ ] **Task with dates but no assignee** → bar renders, row shows
      no avatar.
- [ ] **Dependency arrows** between tasks still render.
- [ ] **Delete a category** while some of its rows are collapsed →
      no localStorage tombstones (the GC pass runs on every tree
      change).

---

## If something fails

1. Note the exact case number and URL.
2. Open devtools → Console → copy any error/warning text.
3. Open devtools → Network → find the failing request, copy its
   status + response body.
4. Grab a screenshot of the UI state.
5. File under PR #141 comment with those four items.

---

## Signoff

- [ ] All Slice 1 cases pass (Bugs 1, 2, 3, 5, 6 — §§1–3, 5, 6)
- [ ] All Slice 2 cases pass (Bugs 4, 7, 8 — §§4, 7, 8)
- [ ] Full regression sweep passes (§R1–R10)
- [ ] Edge cases spot-checked
- [ ] Signed off by: __________  date: __________
