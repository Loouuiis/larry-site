# Timeline 2 — Phase 0 data flow (diagnostic baseline)

This document describes how snapshot data reaches the Gantt and which fields exist on each node **as of Phase 0**. No schema changes were made for this phase.

## Snapshot HTTP path

1. **Browser / Next.js BFF**  
   - `GET /api/workspace/timeline2/projects/:projectId/snapshot`  
   - `apps/web/src/app/api/workspace/timeline2/[...path]/route.ts` proxies to the API with the authenticated session.

2. **API (Fastify)**  
   - `GET /v1/timeline2/projects/:projectId/snapshot`  
   - `apps/api/src/routes/v2/timeline2/manual/register-manual-routes.ts`  
   - Handler calls `buildSnapshot(tenantId, projectId)` in `apps/api/src/routes/v2/timeline2/index.ts`.

3. **Ensure plan** (before first snapshot in the hook)  
   - `POST /api/workspace/timeline2/projects/:projectId/ensure` → `POST /v1/timeline2/projects/:projectId/ensure`.

## Frontend fetch / cache

- Hook: `apps/web/src/hooks/useTimeline2.ts`  
- **TanStack Query**  
  - Query key: `["timeline2", "snapshot", projectId]` (`timeline2SnapshotQueryKey`).  
  - `queryFn`: `POST …/ensure` then `GET …/snapshot` → `Timeline2Snapshot`.  
- Preferences and critical-path are **separate** queries (`/preferences`, `/critical-path`); they are not part of the snapshot JSON body.

## `Timeline2Snapshot` (relevant pieces)

- `tree`: nested roots (`Timeline2Node[]` with `children`).  
- `nodes`: **flat** list of all nodes.  
- `dependencies`: flat edges (`fromNodeId`, `toNodeId`, `relation`, `lagDays`).  
- `openBranches`: branch review / AI proposals.  
- There is **no synthetic “project” row** in the snapshot JSON: the workspace **project** owns one `timeline2_plans` row; top-level nodes are roots under that plan (`parentId === null`).

## Synthetic project root (display-only)

The Gantt/table **injects** a top row whose label matches the workspace **project name** (`projectDisplayName` passed into `Timeline2GanttSurface`). Implementation:

- **Id:** `TIMELINE2_SYNTHETIC_PROJECT_ROOT_ID` (`__timeline2_project_root__`) in `timeline-render-types.ts`.
- **Not in** `snapshot.nodes` / **not PATCHable** — `useTimeline2.updateNode` rejects this id; bars are not draggable for this row.
- **Summary semantics:** progress, workflow (`rollup.healthStatus`), date span, assignees, counts are computed in the client by `computeTimeline2RollupAggregateForSummaryNode` over **all DB roots** in `snapshot.tree` (same shared rules as API summary rows).
- **Outline:** DB roots render at **depth 1** with WBS prefixed (`1.1`, `1.2`, …). Collapsing the synthetic row hides all DB rows.

## Fields on each `Timeline2Node`

Type source: `packages/shared/src/timeline2.ts`.

| Concern | Field(s) | Notes |
|--------|-----------|--------|
| Identity | `id`, `planId`, `parentId` | DB `parent_node_id` → `parentId`. |
| Kind | `kind` | `"group"` \| `"task"` \| `"milestone"` (not a separate `type`). |
| Title | `title`, `description` | |
| Workflow | `status`, `priority`, `progress` | `progress` 0–100 from DB; **groups** get `progress` overwritten in `buildSnapshot` via weighted average of **direct children** (see rollup ordering below). |
| Dates | `startDate`, `dueDate` | ISO date strings or `null`. |
| Roll-up | `rollup` | `healthStatus`, `priority`, `startDate`, `dueDate`, assignees, counts — computed server-side in `computeRollup`. |
| Assignees | `assignees` | On-node list; rollup merges descendant assignees. |
| Risk flags | `actionRequired` | |
| Critical path | `isCriticalPath` | Set from schedule metrics; ancestors with children marked critical when any descendant is. |
| Hierarchy | `children` | Populated on nodes inside `tree`; **flat `snapshot.nodes` entries typically have `children: []`** — use `tree` + `parentId` / outline helpers for structure. |
| Dependencies | *(none on node)* | Only in `snapshot.dependencies`. |

## Rollup ordering (`computeRollup`) — verified behavior

Shared pure helpers live in **`packages/shared/src/timeline2-rollup.ts`** (`computeTimeline2RollupAggregateForSummaryNode`, status aggregation, weighted progress). Both **`buildSnapshot`** (`apps/api/src/routes/v2/timeline2/index.ts`) and **`recomputeTimeline2Rollups`** (`apps/web/src/lib/timeline2-local-rollup.ts`) call into this logic so optimistic UI matches the API.

In `buildSnapshot`, `computeRollup(node)` runs **post-order**:

1. For each child it runs `computeRollup(child, …)` **before** combining rollups for the parent.
2. **Leaf row** (`node.children.length === 0`): `rollup.healthStatus` mirrors stored `status`; dates, priority, assignees match the node; `descendantCount === 0`.
3. **Summary row** (any node **with** children, regardless of `kind`): aggregated **`healthStatus`, date span, priority, assignees** come **only from direct children’s rollups** (parent stored workflow/dates/priority do not override derived values). **`node.progress`** is set to a **duration-weighted** average of each child’s **post-rollup** `child.progress`, using each child’s rollup **`startDate`/`dueDate`** span (`diffDays + 1`, minimum weight `1`).
4. Parent **`actionRequiredCount`** / **`dependencyWarningCount`** still fold the node’s **own** counts plus descendants.

Critical-path ancestor marking applies to **any** node with children (not only `kind === "group"`).

**Workflow rollup nuances:** `aggregateTimeline2HealthStatusFromChildren` (same shared module) defines how child **`rollup.healthStatus`** values combine — notably **`completed` + `cancelled`** → **`completed`** when no unfinished active mix remains; **`cancelled` + `not_started`** (without **`completed`**) → **`not_started`**. Blocked / action-required still wins first.

**Frontend row shape:** `buildTimelineGanttVisibleRows` treats **leaf vs summary** by **`node.children.length === 0`**, not by `kind === "task"` alone — tasks with subtasks behave as summary rows (derived display fields; leaf-only bar drag / edits on the Gantt).

## Frontend diagnostics

- **`validateTimelineSnapshot`** — `apps/web/src/components/workspace/timeline2/timeline2-snapshot-validation.ts`  
  Hierarchy integrity, tree ↔ flat identity,rollup `descendantCount` vs DFS, dependency endpoints, optional `criticalPathNodeIds` cross-check. Invoked from `Timeline2GanttSurface` in development only.

- **`TimelineRenderRow` / `buildTimelineRenderRowsFromSnapshot`** — `apps/web/src/components/workspace/timeline2/timeline-render-types.ts`  
  Canonical shape separating **stored** (`progress`, `startDate`, …) from **display** (`displayProgress`, `displayStartDate`, …) for Phase 1 UI work.

- **`TimelineGanttVisibleRow` / `buildTimelineGanttVisibleRows`** — same module  
  Outline-ready rows (WBS path, collapse chrome, structural-child hints) built from snapshot tree + flat nodes via `visibleRows`. Pass **`projectDisplayName`** to insert the **synthetic project root** (see above); otherwise rows mirror DB roots at depth 0. Visible **`displayProgress`** is clamped to **0–100** for bars and labels.

- **`recomputeTimeline2Rollups`** — `apps/web/src/lib/timeline2-local-rollup.ts`  
  After optimistic patches, runs the same rollup rules as the API (critical-path flags are not recomputed here).

## Dev-only Gantt logging

`Timeline2GanttSurface.tsx` (development only):

- Runs `validateTimelineSnapshot` and logs errors/warnings.
- Logs the first N visible outline rows plus a **`renderProbe`** slice from `buildTimelineRenderRowsFromSnapshot` (stored vs display fields).

`useTimeline2.ts` (development only): logs **`[Timeline2 optimistic rollup probe]`** with a **`kind`** of **`progress`**, **`status`**, or **`dates`** (rollup-related patches only). Each payload includes edited child fields and parent **display** rollups before vs after local `recomputeTimeline2Rollups`, plus a **`…ChangedBeforeRefetch`** boolean when both parent rows resolve.
