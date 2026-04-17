# Gantt v3 — UI/UX rework handoff

> **Next session: start here.** Read the boxed prompt below first — it's the
> session kickoff. Everything after §0 is the deep reference the prompt
> points at.

---

## Session kickoff prompt (paste as your first message in the new chat)

```
Gantt v3 — UI/UX rework for Larry PM.

Context doc (read FIRST, end-to-end, before any tool call):
  C:\Dev\larry\site-deploys\larry-site\docs\reports\2026-04-17-gantt-v3-handoff.md

Current-state screenshots from prod (look at them before designing):
  docs/reports/gantt-v3-screenshots/current-state/timeline-loaded.png
  docs/reports/gantt-v3-screenshots/current-state/category-manager-open.png
  docs/reports/gantt-v3-screenshots/current-state/category-creating.png

Previous plan (data-layer context only, do NOT keep executing it):
  docs/reports/2026-04-16-gantt-restructure-plan.md
  docs/reports/gantt-redesign-brief.md

What Fergus said after seeing PR #67 shipped on prod:
  1. The dates at the top are off.
  2. The bars should be coloured and more pronounced — they look empty.
  3. There are still two (actually four) "+" affordances — pick one.
  4. There's no clear way to make a category.
  5. I can't click a task and move it to a category or remove it from
     the timeline.
  6. Everything should be automatically in an uncategorised section.
  7. We need that collapsible, foldable look on the side — not these boxes.
  8. Do a full UI/UX frontend test — this is really far off what we need.

Absolute rules for this session:

- Treat this as a UI/UX rework, not a feature addition. Visual polish is
  the bar, not test green.
- No DB schema changes. No new backend routes. No touching worker / AI /
  auth / rate-limiting code. Stay in apps/web/src/{app/workspace/timeline,
  components/workspace/gantt} + the types.ts and globals.css files.
- Start a fresh branch off master: feat/gantt-v3-ui-rework.
- Do not auto-merge. Merge only after Fergus says "yep, that's it."

Mandatory skill gate order — do NOT skip any:

  1. ui-ux-pro-max  — invoke first. Pull palette / typography /
     anti-pattern guidance. React + inline styles, Larry purple #6c44f6,
     lavender-neutral surfaces. The Gantt should feel like Linear /
     Notion / Airtable Timeline / TeamGantt, not MS Project or Jira.
  2. superpowers:brainstorming  — present 2–3 distinct UX directions
     with trade-offs (the handoff doc suggests three: Linear-lite,
     TeamGantt-clone, Notion-timeline). Get Fergus's pick BEFORE planning.
  3. superpowers:writing-plans  — concrete, placeholder-free, file-level
     plan. Every row / bar / state / hover / empty-state specified.
  4. superpowers:executing-plans  (or subagent-driven-development if
     tasks are parallel) — implement against the plan.
  5. superpowers:verification-before-completion  — run the Playwright MCP
     loop against the Vercel preview, take screenshots, compare to
     references, only then declare done.
  6. superpowers:requesting-code-review  — dispatch a reviewer before PR
     merge.

Playwright MCP loop — run every iteration, not just at the end:

  Login: https://www.larry-pm.com/login
    email:    larry@larry.com
    password: DevPass123!
    (.env.test has TestLarry123% but that's stale; Nordvik seed reset it)

  For each design iteration:
    1. browser_navigate → /workspace/timeline
    2. browser_take_screenshot full-page → save iter-<N>-overview.png
    3. Exercise every affordance: expand a category, hover a task row,
       open the category panel, scroll the date axis, test + buttons,
       inline-add rows, today pill, gear icon.
    4. Take a second screenshot after interaction.
    5. Compare to Linear / Notion / TeamGantt / Airtable Timeline —
       write a one-line verdict.
    6. Iterate until the SCREENSHOT passes, not just the tests.

Tools available in this environment (verify with --version before
claiming any is missing — session hooks have lied before):

  - gh         2.88.1    (auth: fergo5002)
  - vercel     50.40.0   (auth: loouuiis)
      project: ailarry, id prj_cmKmgIevs9vJffk0AKe66jpnZKnr,
      team team_9Q8vpoJHhcbg74h3BoEJJnAs
  - railway    4.36.0    (auth: led1299@gmail.com)
      project: soothing-contentment, service: Api
  - Playwright MCP (mcp__playwright__browser_*)
  - Vercel MCP (mcp__vercel__list_deployments, get_deployment, …)
  - Context7, Figma MCP if you want to pull reference component snippets

Deploy watch on merge:
  gh pr checks <id> --watch --interval 20
  mcp__vercel__list_deployments → state READY for the merge SHA
  railway deployment list → SUCCESS on Api
  curl https://larry-site-production.up.railway.app/health → {"ok":true}
  curl -I https://www.larry-pm.com/ → 200

Success criteria (these are MY verification gates — don't ship unless all pass):

  C1  Looking at the date header alone, you know what month + week
      any bar sits in without reading code.
  C2  Screenshot of the seeded tenant reads as visually DENSE — bars
      dominate the grid. No bar is a 1.5px dashed outline on empty.
  C3  Exactly one way to create each of category / project / task
      from the UI. Fergus finds it in under 5 seconds.
  C4  Empty-state (zero categories) tells the user HOW to create one,
      not just a blank outline.
  C5  Click a task row → menu surfaces "Move to category" and
      "Remove from timeline" (confirm scope of "move" with Fergus —
      does it mean re-parent the task's project, or move the task to
      a different project that's in the target category? They're
      different features).
  C6  Uncategorised visually differentiated from real categories
      (grey dot, italics, no colour swatch in the manager panel).
  C7  Outline column reads as a tree, not a spreadsheet. No uniform
      row dividers. Tree feel, not grid-cell feel.
  C8  ≥4 side-by-side screenshots (yours vs. TeamGantt / Linear /
      Notion / Airtable) saved into docs/reports/gantt-v3-screenshots/
      before declaring done.
  All 25 existing vitest tests green. `tsc --noEmit` clean. Backend CI
  green. Vercel prod READY. Railway SUCCESS. /health 200.

If you hit a blocker that would require touching anything outside the
allowed scope (schema, backend routes, non-gantt components), STOP and
ask Fergus before scope-creeping.

The bar is not "it compiles". The bar is "Fergus opens the page and
doesn't wince."
```

---

## Deep reference (everything the prompt above points at)

**For:** the next Claude Code session
**From:** Claude (shipped PR #67, saw user react "really far off")
**Date:** 2026-04-17
**Production URL:** https://www.larry-pm.com/workspace/timeline
**Repo:** `C:\Dev\larry\site-deploys\larry-site`
**Branch:** start a new one — `feat/gantt-v3-ui-rework` — off current `master`
**Previous plan:** `docs/reports/2026-04-16-gantt-restructure-plan.md` (PR #67, merged)
**Previous brief:** `docs/reports/gantt-redesign-brief.md`

---

## 0. Read this before doing anything

**The user (Fergus) reviewed the shipped PR #67 Gantt v2 on prod and said it is still wrong.** You are NOT executing the existing plan any further. You are doing a UI/UX rework informed by his specific complaints below. Treat the previous plan as context about the data layer — its category-colour plumbing is solid — but the rendered result is not what he wanted. Your job is to rethink the *visual language* with a UI/UX designer's mindset, not to mechanically tick more boxes off the old plan.

**Do NOT skip the skill gates.** In this order:

1. **`ui-ux-pro-max`** — invoke *first*, before any design thinking. Pull style/palette/type-pairing/anti-pattern guidance. This is a global auto-invoke for any UI task and the user explicitly cares about design polish.
2. **`superpowers:brainstorming`** — present 2–3 UX approaches with trade-offs. Get Fergus's pick before planning.
3. **`superpowers:writing-plans`** — produce a concrete, placeholder-free plan with exact files and decisions. No hand-waving; every row/bar/state gets specified.
4. **`superpowers:executing-plans`** (or `subagent-driven-development` if tasks are parallelisable) — implement.
5. **`superpowers:verification-before-completion`** — run the Playwright MCP flow against prod *before* saying "done".

Global `CLAUDE.md` rules apply as always: TDD for new helpers, `systematic-debugging` before any fix, `requesting-code-review` before merge.

---

## 1. Fergus's verbatim complaints (2026-04-17)

> "The dates at the top are off, the actual rectangles should be coloured and more pronounced, there's still two '+' on the task, there's no clear way to make a category, you can't click onto a task and put it into a category or remove from the timeline, everything should be automatically in an uncategorised section, you need to do a full UI/UX frontend test because this is really far off what we need. … We need that collapsable and foldable look on the side, not these boxes."

Unpacked:

| # | Complaint | What I think he means |
|---|---|---|
| C1 | "Dates at the top are off" | The two-row header (APR 2026 / MAY 2026 on top, 6/13/20/27… on bottom) doesn't read as "a real calendar". Day numbers aren't visibly tied to their month, the month spans feel arbitrary, the "Today" pill floats awkwardly near the APR label. Needs redesign — possibly ditch the two-row pattern and go with a single integrated header like TeamGantt (month label sits above a mini-scale of week-start tick marks). Verify alignment with pixel rule by eye, not code. |
| C2 | "Rectangles should be coloured and more pronounced" | Status modifiers over-quieted the bars. Most tasks in the seed are `not_started` → render as 1.5px dashed outlines on a transparent fill → the chart looks empty. He wants **solid, saturated, visually dominant bars** like TeamGantt/ClickUp. Fix by making `not_started` solid with ~0.25 opacity category-colour tint, `on_track` solid with full saturation, `completed` solid with a darker inner checkmark badge. The modifier system is fine; the values are tuned too conservatively. |
| C3 | "Still two '+' on the task" | Too many add affordances. Today there are four: toolbar `+ Category/+ Project/+ Task` (label shifts with selection), inline `+ Add project` per category, inline `+ Add task` per project, and `+ Add category` in the outline footer. Pick ONE dominant entry point (the toolbar button, context-sensitive) and remove the others, OR keep only the inline rows and kill the toolbar button. Do not ship both. |
| C4 | "No clear way to make a category" | Even though the gear icon opens a slide-over with + New category, Fergus didn't find it. The gear is 14px, unlabelled, and sits in a corner of the outline header. Make category management a *primary* action: either a visible "Categories" pill in the toolbar, a first-class empty state ("No categories yet — create one"), or a sidebar drawer triggered by a labelled button. The slide-over can stay as the editor; it's discovery that's broken. |
| C5 | "Can't click onto a task and put it into a category or remove from the timeline" | Tasks have no re-categorise affordance. He wants: click a task → inline menu with "Move to category X / Y / Z / Uncategorised" and "Remove from timeline" (which should mean clear the task's `startDate`+`dueDate` so it falls out of the Gantt, not delete it). Build this as a row context menu (right-click or kebab on hover) backed by `PATCH /api/workspace/tasks/:id`. Tasks don't have `categoryId` directly — their *project* does — so "move task to category X" actually means *either* (a) move the task's parent project to that category, or (b) move the task to a different project that's in that category. Ask him which; they're different features. |
| C6 | "Everything should be automatically in an uncategorised section" | Already is — orphan projects live under the synthetic "cat:uncat" bucket. The issue is probably visual: the Uncategorised row doesn't feel like a default bucket; it reads as a category you'd want to get rid of. Treat Uncategorised differently visually (neutral grey dot, italic label, no colour in the colour picker) so the user understands it's a holding pen, not a real category. |
| C7 | "Collapsable and foldable look on the side, not these boxes" | The current outline reads as a grid with borders on every row. He wants a **tree-view** feel — Linear sidebar, Notion page tree, Finder list view. That means: no full-width row dividers, indented tree lines (optional), row hover darkens but doesn't box, chevrons are 10–12px and flip smoothly, inline-add rows are whisper-faint unless hovered. Less ink overall. Replace the `border-bottom: 1px solid var(--border)` on every row with zebra-striping or no dividers at all. |
| C8 | "Full UI/UX frontend test" | He wants you to use Playwright MCP against prod as part of the loop, not just at the end. Take screenshots at each design iteration, compare to references (Linear, Notion, TeamGantt, Airtable Timeline), annotate differences, iterate. Don't merge until the *screenshot* looks like a real Gantt, not just until the tests pass. |

## 2. Anti-requirements — what NOT to assume he meant

- He didn't ask for drag-and-drop bars to move dates. Don't implement unless it falls out of C5 (re-parenting, which can be a menu not a drag).
- He didn't ask to replace the data model. The category → project → task → subtask tree is fine; `category_id` on `projects` is fine. Don't suggest schema changes.
- He didn't ask for MS Project. Don't reach for dependency arrows, baseline bars, or critical-path highlighting. Stay in the Linear/Notion aesthetic lane.
- He didn't ask for mobile. Desktop only, same as before.
- He didn't ask to undo PR #67's colour map or category panel; *underlying data plumbing stays*. This is a visual rework.

---

## 3. Current state (as of master SHA `dbce6718`, merged PR #69)

### What works

- `categoryColorMap` flows correctly: portfolio builds it from `/v1/timeline`, per-project fetches it from `/v1/projects + /v1/categories`. Tasks and subtasks inherit the ancestor category colour.
- `FlatRow` is a discriminated union (`node` | `add`). `flattenVisible` emits node rows; `injectInlineAdds` interleaves add rows so outline + grid row-alignment invariant holds even with variable row heights.
- `GanttDateHeader` generates month spans + day markers by zoom (week = daily, month = weekly, quarter = biweekly).
- `CategoryManagerPanel` CRUDs categories against `/api/workspace/categories`.
- 25 vitest tests green, `tsc --noEmit` clean, Backend CI green, Vercel prod green, Railway prod green.

### What looks wrong (my own MCP screenshots)

- Viewable at `.playwright-mcp/timeline-loaded.png`, `category-manager-open.png`, `category-creating.png` on the machine. Take fresh ones via `mcp__playwright__browser_take_screenshot` at the start of your session for ground truth.
- Bars are mostly 1.5px dashed outlines → the grid reads as empty.
- Month header + day header appear as two disconnected strips; "Today" pill collides with the APR label.
- The outline has full-width bottom borders on every single row → grid-cell feel.
- Inline add rows are visible at 0.55 opacity → they compete with real task rows.
- Toolbar "+ Category" button and outline "+ Add category" footer duplicate each other.
- No visible way to re-categorise a task.

---

## 4. Files that matter

All under `C:\Dev\larry\site-deploys\larry-site\`.

### Frontend (all inline-styles, no Tailwind)
- `apps/web/src/app/workspace/timeline/PortfolioGanttClient.tsx` — portfolio wrapper
- `apps/web/src/components/workspace/gantt/ProjectGanttClient.tsx` — per-project wrapper
- `apps/web/src/components/workspace/gantt/GanttContainer.tsx` — orchestrator, state
- `apps/web/src/components/workspace/gantt/GanttToolbar.tsx` — top toolbar (zoom, today, search, + button)
- `apps/web/src/components/workspace/gantt/GanttOutline.tsx` — left column, resizable, header/footer/overlay slots
- `apps/web/src/components/workspace/gantt/GanttOutlineRow.tsx` — one outline row
- `apps/web/src/components/workspace/gantt/GanttGrid.tsx` — right pane, date header + today line + gridlines
- `apps/web/src/components/workspace/gantt/GanttDateHeader.tsx` — month + day header
- `apps/web/src/components/workspace/gantt/GanttRow.tsx` — one grid row (bar container)
- `apps/web/src/components/workspace/gantt/GanttBar.tsx` — the bar itself
- `apps/web/src/components/workspace/gantt/GanttInlineAdd.tsx` — "+ Add …" row
- `apps/web/src/components/workspace/gantt/CategoryDot.tsx` — colour dot
- `apps/web/src/components/workspace/gantt/CategoryManagerPanel.tsx` — slide-over
- `apps/web/src/components/workspace/gantt/AddNodeModal.tsx` — create modal (category/project/task/subtask)
- `apps/web/src/components/workspace/gantt/gantt-types.ts` — types, `CategoryColorMap`, `DEFAULT_CATEGORY_COLOUR`, `ROW_HEIGHT`
- `apps/web/src/components/workspace/gantt/gantt-utils.ts` — pure helpers (tree build, flatten, rollup, axis, contrastTextFor, tinyTint)
- `apps/web/src/components/workspace/gantt/gantt-utils.test.ts` — 21 tests

### Backend proxies (Next.js)
- `apps/web/src/app/api/workspace/categories/route.ts` — GET/POST
- `apps/web/src/app/api/workspace/categories/[id]/route.ts` — PATCH/DELETE
- `apps/web/src/app/api/workspace/categories/reorder/route.ts` — POST
- `apps/web/src/app/api/workspace/projects/route.ts` — GET/POST
- `apps/web/src/app/api/workspace/projects/[id]/overview/route.ts` — heavy GET (has project meta incl. `categoryId` at runtime)
- `apps/web/src/app/api/workspace/timeline/route.ts` — portfolio timeline feed
- `apps/web/src/app/api/workspace/tasks/*` — task CRUD

### API (Fastify)
- `apps/api/src/routes/v1/categories.ts` — list/create/patch/delete/reorder
- `apps/api/src/routes/v1/projects.ts` — includes `category_id` in list response (column exists but `WorkspaceProject` TS type in `apps/web/src/app/dashboard/types.ts` doesn't declare it yet; cast or extend)
- `apps/api/src/routes/v1/timeline.ts` — portfolio tree
- `apps/api/src/routes/v1/tasks.ts` — task CRUD with parent-task depth validation

### Design tokens
- `apps/web/src/app/globals.css` — `--brand` `#6c44f6`, `--surface`, `--surface-2`, `--border`, `--border-2`, `--text-1/2/muted`, `--tl-not-started/in-progress/at-risk/overdue/completed`, radii

### Docs to reuse
- `docs/reports/2026-04-16-gantt-restructure-plan.md`
- `docs/reports/gantt-redesign-brief.md`

---

## 5. Testing — do this every iteration, not just at the end

The user said "do a full UI/UX frontend test". Take him literally.

### Credentials for prod login
- URL: https://www.larry-pm.com/login
- Email: `larry@larry.com`
- Password: `DevPass123!` (the `.env.test` file shows `TestLarry123%` but that's stale — the Nordvik demo seed reset the password)

### Playwright MCP loop per iteration

Tools (load via ToolSearch → `select:mcp__playwright__browser_navigate,mcp__playwright__browser_snapshot,mcp__playwright__browser_click,mcp__playwright__browser_type,mcp__playwright__browser_hover,mcp__playwright__browser_take_screenshot,mcp__playwright__browser_wait_for,mcp__playwright__browser_evaluate`):

1. `browser_navigate` → `/workspace/timeline`
2. `browser_take_screenshot` full-page → save as `iter-N-overview.png`
3. Expand a category, hover a task row, open the category panel, scroll the date axis, test every affordance
4. Take a second screenshot after interaction
5. **Compare visually** to these references (keep tabs open in your head):
   - TeamGantt's portfolio timeline: https://www.teamgantt.com/
   - Linear's roadmap and project view: https://linear.app/
   - Notion's timeline database view
   - Airtable's Timeline view
6. Write a one-line verdict: "looks like TeamGantt — ship it" OR "still reads as a spreadsheet — iterate"

Don't declare done until the **screenshot** passes, not just the tests.

### Vercel + Railway deploy watch
- `gh pr checks <id> --watch --interval 20` — CI + Vercel preview
- `mcp__vercel__list_deployments` with `projectId prj_cmKmgIevs9vJffk0AKe66jpnZKnr` + `teamId team_9Q8vpoJHhcbg74h3BoEJJnAs` — inspect by state
- `railway deployment list` from repo root (CLI links to `soothing-contentment` / service `Api`) — verify backend rebuild stays SUCCESS
- `curl https://larry-site-production.up.railway.app/health` → `{"ok":true}` before and after merge

### Tools available in this session (verify with `--version` first per `feedback-verify-tool-availability.md`)
- `gh` 2.88.1 (auth: `fergo5002`)
- `vercel` 50.40.0 (auth: `loouuiis`)
- `railway` 4.36.0 (auth: `led1299@gmail.com`, project `soothing-contentment`)
- Playwright MCP, Vercel MCP

---

## 6. Suggested brainstorm starter — 3 directions, pick one with Fergus

**Direction A — "Linear-lite portfolio"**
A tree outline with no dividers, Linear-style hover states, and category bars that are solid at full saturation with a thin progress overlay. Status is conveyed by a trailing state badge (not-started chip, at-risk ⚠, overdue red dot) not by changing the bar fill. Category management via a labelled "Categories" button in the toolbar that opens a right-docked drawer. Re-categorise via right-click on a project row (not task — C5 ambiguity).

**Direction B — "TeamGantt-clone"**
Keep the current date header two-row pattern but tighten it: month label row is narrow (16px), day numbers read as week labels ("Apr 20 · wk17"), gridlines only at week boundaries. Bars are thick (20px), solid categoryColor, with a darker categoryColor-800 progress fill inside. Status modifiers are *subtle* overlays — a 2px top bar only, no border changes. No inline-add rows at all; add via a floating "+" button that's always the same size and opens a context-aware modal.

**Direction C — "Notion timeline database"**
Visually de-emphasise the date axis (thin grey, minimalist month labels only at column boundaries), emphasise the outline (bigger typography, more whitespace, no dividers, subtle guide lines for hierarchy). Bars are rounded pills, solid fill, no status borders — status is a dot at the bar's left edge. Category management and inline-add live in a right-click menu only; the toolbar has just zoom + today + search.

Each addresses every complaint differently. Present trade-offs, get Fergus to pick, write the plan, then execute.

---

## 7. Success criteria (for your own verification-before-completion)

- C1 passes: you can look at the date header and, without reading the code, know what month and week any bar sits in.
- C2 passes: a screenshot of a fully seeded tenant is visually *dense* — bars dominate the grid, no page looks empty.
- C3 passes: there is exactly one way to create a new category / project / task from the UI, and Fergus finds it in under 5 seconds when he tries it.
- C4 passes: hitting `/workspace/timeline` with zero categories shows an empty state that tells the user *how* to create one, not just a blank outline.
- C5 passes: clicking a task row surfaces a menu with "Move to category" and "Remove from timeline" (confirm scope of "move" with Fergus first).
- C6 passes: Uncategorised is visually differentiated from real categories (grey dot, italics, no colour pick).
- C7 passes: the outline column reads as a tree, not a spreadsheet — no uniform row dividers, softer hover, tree-indent guides or not (your call after brainstorm).
- C8 passes: you have ≥4 side-by-side screenshots (yours vs. TeamGantt / Linear / Notion / Airtable) in `docs/reports/gantt-v3-screenshots/` before declaring done.
- All 25 existing vitest tests still green. New helpers have their own tests. `tsc --noEmit` clean. Backend CI green. Vercel prod green. Railway green. `/health` 200.

---

## 8. Scope discipline

Do NOT touch in this PR:
- The DB schema (no `ALTER TABLE` at all)
- Any backend route beyond what's needed to expose existing data
- Any file outside `apps/web/src/{app/workspace/timeline,components/workspace/gantt}` plus the `types.ts` and `globals.css`
- Worker / AI / auth / rate-limiting code
- The category CRUD API contract (just re-skin the panel if needed)

If you hit a blocker that would require any of the above, STOP and ask Fergus before scope-creeping.

---

## 9. Final ritual

Before you open the PR:

1. Run `npx vitest run` from `apps/web` — all green.
2. Run `npx tsc --noEmit` from `apps/web` — clean.
3. Run `npx eslint src/components/workspace/gantt/ src/app/workspace/timeline/` — no *new* errors (two pre-existing ones in `PortfolioGanttClient` and `GanttContainer` are on master).
4. Take fresh MCP screenshots of the Vercel preview and paste them into the PR body.
5. Invoke `superpowers:requesting-code-review` on the branch.
6. Merge only after Fergus says "yep, that's it" — do NOT auto-merge.

Good luck. The bar is not "it compiles", it's "Fergus opens the page and doesn't wince."
