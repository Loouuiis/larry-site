# Timeline × Larry — Integration, Polish, and Gantt v5 Roadmap

**Date:** 2026-04-19
**Status:** Draft — awaiting Fergus review
**Author:** Claude (Opus 4.7, 1M context)
**Builds on:** `2026-04-18-gantt-v4-subcategories-sync-design.md`, `2026-04-15-modify-action-design.md`
**Source:** brainstorming exchange 2026-04-19 (post-launch review)
**Scope type:** Multi-slice feature + polish + roadmap

---

## 0. Context

Gantt v4 (shipped 2026-04-18) delivered the full Category → Subcategory → Project → Task → Subtask tree with shared cache, DnD, and context-menu actions. It works, but day-one usage surfaced three concrete gaps plus the absence of Larry itself from the surface that most visually represents the organisation's work.

### Inbound items

1. **Larry has no timeline-organisation capabilities** — the intelligence engine knows the whole project/task graph but cannot suggest categorisation, colour schemes, or project groupings. The timeline's organisational quality depends entirely on manual user effort.
2. **Task creation from the timeline drops the description field** — `AddNodeModal` exposes title + optional dates only. `tasks.description TEXT` (`schema.sql:254`) and the `/api/workspace/tasks` Zod schema (`apps/api/src/routes/v1/tasks.ts:19`, accepts up to 4000 chars) both support it.
3. **Colour flash switching between org and project timelines** — `PortfolioGanttClient` reads `/api/workspace/timeline` into cache key `["timeline","org"]`; `ProjectGanttClient` reads `/api/workspace/categories` + `/api/workspace/projects` into `["categories"]` + `["projects"]`. The org payload contains every category colour already, but the project view never reads from it, so the first paint on a cold project visit renders neutral grey (`NEUTRAL_ROW_COLOUR = #bdb7d0`) until the dedicated queries resolve.
4. **Polish debt** — `ErrorBanner` in `PortfolioGanttClient` uses hard-coded `#fdecef`/`#f5c1cb`/`#8a1f33`; an unused `useEffect` import sits on line 2; the org query has no `staleTime` so it refetches on every visit.
5. **Gantt industry-standard features absent** — the timeline API returns `dependencies`, the UI ignores them. No bar resize, no milestones, no critical path, no export. Called out by Fergus as the "overall technical review" lens; shipped as a v5 roadmap of individual PRs, not a single design.

### Scope framing (Option 2, locked in 2026-04-19)

Three slices, stacked PRs:

- **Slice 1 — Polish + cache + description.** No AI, low risk, ships first and removes day-to-day friction.
- **Slice 2 — Larry timeline tools.** The headline feature. Larry proposes category/colour/regroup actions via the existing Action Centre + NotificationBell banner pipeline; user accepts or dismisses.
- **Slice 3 — Gantt v5 feature roadmap.** Dependency arrows first; bar resize, milestones, critical path, export follow as independent PRs.

### In scope

- `apps/web/src/components/workspace/gantt/**` — AddNodeModal description field, banner token migration
- `apps/web/src/app/workspace/timeline/PortfolioGanttClient.tsx` — cache cross-pollination, stale-time, import cleanup
- `packages/ai/src/**` — new tool module `timeline-tools.ts`, prompt additions in `intelligence.ts`
- `packages/db/src/schema.sql` + `migrations/**` — `larry_events.project_id` nullable with CHECK
- `apps/api/src/lib/timeline-suggestion-executor.ts` — new module
- `apps/api/src/routes/v1/larry.ts` — accept handler dispatch for `timeline_*` action types
- `apps/web/src/components/workspace/TimelineSuggestionPreview.tsx` — new component
- `apps/web/src/lib/action-types.ts` — three new action-type tags

### Out of scope

- Slice 3 individual implementations (roadmap only — each feature gets its own PR-time spec)
- Auto-execution of timeline suggestions (every suggestion stays gated behind user accept, matching Larry's existing suggestion UX)
- Drag-to-reschedule on the Gantt bar (earmarked for Slice 3)
- Mobile/tablet layouts — desktop only, same as v4
- Any changes to the Gantt visual tokens established in v3/v4
- Auth, worker, rate-limiting, or unrelated API surfaces

---

## 1. Slice 1 — Polish + cache + description

### 1.1 Description field on `AddNodeModal`

**File:** `apps/web/src/components/workspace/gantt/AddNodeModal.tsx`

**Change:**
- Add `description: string` state, initialised `""`.
- Add an `<details><summary>Add description</summary></details>` collapsible block rendered only when `mode === "task" || mode === "subtask"`. Inside: a `<textarea>` bound to `description`, `maxLength={4000}`, placeholder `"What does this task cover? (optional)"`, `rows={3}`, styled with the same `inputStyle` constant.
- Collapsed by default to keep the modal height unchanged for the common case.
- In the task/subtask branch of `handleSave`, add `if (description.trim()) body.description = description.trim();` before the POST.

**No API change needed** — `CreateTaskSchema` (`apps/api/src/routes/v1/tasks.ts:19`) already accepts `description: z.string().max(4_000).optional()`.

**Keyboard parity:** `Enter` inside the textarea should insert a newline (default browser behaviour), NOT submit. The existing `onKeyDown={(e) => { if (e.key === "Enter") void handleSave(); ... }}` is on the **title** input only — no change needed there, but verify the textarea doesn't inherit it.

### 1.2 Cross-surface cache — shared hook, no cross-writing

**Originally** this section proposed warming `["categories"]` + `["projects"]` cache keys from inside `PortfolioGanttClient` via `useEffect`. On review, writing across sibling cache keys from one component is a TanStack Query anti-pattern — it creates a last-write-wins race if ProjectGanttClient is mounted concurrently (prefetched link, open tab) and can silently overwrite an optimistic update mid-mutation.

**Replacement design: extract a shared hook.**

**New file:** `apps/web/src/hooks/useTimelineSnapshot.ts`

```ts
import { useQuery } from "@tanstack/react-query";
import type { PortfolioTimelineResponse } from "@larry/shared";
import { toCategorySummaries, toProjectSummaries } from "@larry/shared/timeline";

export const QK_TIMELINE_ORG = ["timeline", "org"] as const;

// Single source of truth for the timeline payload. Both Portfolio- and
// Project-GanttClient read from this hook; no component ever writes into
// `["categories"]` or `["projects"]` directly for read purposes.
export function useTimelineSnapshot() {
  return useQuery({
    queryKey: QK_TIMELINE_ORG,
    queryFn: async (): Promise<PortfolioTimelineResponse> => {
      const res = await fetch("/api/workspace/timeline", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 30_000,
  });
}

// Derived-view helpers. Consumers call useCategoriesFromTimeline() and
// useProjectsFromTimeline() instead of running their own `/api/workspace/…`
// query; both derive from the same cached org payload.
export function useCategoriesFromTimeline() {
  const { data, ...rest } = useTimelineSnapshot();
  return { ...rest, data: data ? { categories: toCategorySummaries(data) } : undefined };
}

export function useProjectsFromTimeline() {
  const { data, ...rest } = useTimelineSnapshot();
  return { ...rest, data: data ? { items: toProjectSummaries(data) } : undefined };
}
```

**Change in `ProjectGanttClient.tsx`** — replace the two standalone `useQuery` calls (categories + projects) with `useCategoriesFromTimeline()` and `useProjectsFromTimeline()`. Only write-path mutations retain `qc.invalidateQueries({ queryKey: QK_TIMELINE_ORG })`, which in turn re-derives both views.

**Change in `PortfolioGanttClient.tsx`** — replace the inline `useQuery` with `useTimelineSnapshot()`. No `useEffect`, no cache cross-writing.

**Shared types** (§1.3 below) — `toCategorySummaries` and `toProjectSummaries` live in `packages/shared/src/timeline.ts` so any payload-shape drift is a compile error on both server and client.

**Result:** one round-trip serves both surfaces. Cold project visit after an org-timeline visit has zero additional network. No race, no write-side-effect, no stale optimistic updates overwritten.

### 1.3 Shared mapping types

**File:** `packages/shared/src/timeline.ts` (new)

```ts
import type { PortfolioTimelineResponse, ProjectCategory } from "./index";

export interface ProjectSummary { id: string; categoryId: string | null; }

export function toCategorySummaries(
  resp: PortfolioTimelineResponse,
): ProjectCategory[] {
  return resp.categories
    .filter((c) => c.id !== null)
    .map((c) => ({
      id: c.id as string,
      name: c.name,
      colour: c.colour,
      sortOrder: c.sortOrder,
      parentCategoryId: c.parentCategoryId ?? null,
      projectId: c.projectId ?? null,
    }));
}

export function toProjectSummaries(
  resp: PortfolioTimelineResponse,
): ProjectSummary[] {
  return resp.categories.flatMap((c) =>
    c.projects.map((p) => ({ id: p.id, categoryId: c.id ?? null })),
  );
}
```

Pure functions, trivially unit-testable. Any field drift in `PortfolioTimelineResponse` breaks these at compile time on both sides of the network.

### 1.4 Polish

- `ErrorBanner` colour migration: replace `background: "#fdecef"` → `"var(--pm-red-light)"`, `border: "1px solid #f5c1cb"` → `"1px solid var(--pm-red)"`, `color: "#8a1f33"` → `"var(--pm-red)"`. Matches ProjectGanttClient's existing banner (`PortfolioGanttClient.tsx:411`).
- Remove the stray `useEffect` import from line 2 — actually, Slice 1.2 makes it needed; keep.
- `aria-live="polite"` on the banner so screen readers announce load failures.
- `WorkspaceTopBar` pill navigation: no change (Timeline is already an entry).

### 1.5 Testing

- **Unit** (`AddNodeModal.test.tsx`, new if absent):
  - In `task` mode, the description textarea is rendered inside the collapsible block; when typed and submitted, the POST body contains `description`.
  - In `category` and `project` modes, the description block is not rendered.
  - Empty/whitespace description is not sent (trimmed → omitted from body).
- **Unit** (`shared/timeline.test.ts`, new):
  - `toCategorySummaries(fixture)` returns only real categories (synthetic `null`-id uncategorised bucket excluded) with correct field mapping.
  - `toProjectSummaries(fixture)` returns one entry per project with the correct `categoryId` re-stitched from its parent category row.
- **Unit** (`hooks/useTimelineSnapshot.test.tsx`, new):
  - `useCategoriesFromTimeline()` derives the expected `{ categories }` shape from the cached org payload.
  - `useProjectsFromTimeline()` derives the expected `{ items }` shape from the same cached payload.
  - With the org query already warm, mounting `ProjectGanttClient` does not fire a network request (asserted by a `fetch` spy).
- **API** (`tasks.test.ts`, extend if not covered):
  - POST `/api/workspace/tasks` with `description: "x".repeat(4001)` → 400.
  - POST with a valid description persists and reads back via GET `/api/workspace/tasks`.

---

## 2. Slice 2 — Larry timeline tools

### 2.1 DB migration

**File:** `packages/db/src/migrations/027_larry_events_nullable_project.sql` (next after `026_invites_project_scope_and_links.sql`)

```sql
BEGIN;

-- Relax the NOT NULL so org-scope suggestions (no single project anchor)
-- can live in the same table as project-scoped ones.
ALTER TABLE larry_events
  ALTER COLUMN project_id DROP NOT NULL;

-- Constrain the new freedom: only timeline_* action types may use null
-- project_id. Every existing row has a non-null project_id so the CHECK
-- passes backfill.
ALTER TABLE larry_events
  ADD CONSTRAINT larry_events_project_scope_check
  CHECK (
    project_id IS NOT NULL
    OR action_type LIKE 'timeline\_%' ESCAPE '\'
  );

-- Partial index for the suggestion poll (NotificationBell) — surface pending
-- org-scope suggestions quickly without scanning the whole table.
CREATE INDEX IF NOT EXISTS idx_larry_events_org_pending
  ON larry_events (tenant_id, created_at DESC)
  WHERE project_id IS NULL AND event_type = 'suggested';

COMMIT;
```

**Rollback:** single `ALTER TABLE ... ALTER COLUMN project_id SET NOT NULL;` after deleting any org-scope rows. Safe because the forward migration adds new capability without touching existing data.

**Caveat (from prior Larry incident — see memory `feedback-pg-enum-add-value.md`):** no enum adds in this migration, so the "can't use a freshly-added enum value in the same batch" trap doesn't apply. The new `action_type` values are plain TEXT.

### 2.2 AI tool module

**Context architecture (org-wide pass, not a per-project extension).**

`runIntelligence` today runs scoped to a single project and is given that project's snapshot. Timeline reorganisation is inherently cross-project — Larry cannot propose "group 4 projects under a new Customer Onboarding theme" from inside a single-project context because he doesn't know the other 3 projects exist.

To fix this: introduce a **new org-wide intelligence pass** triggered by the existing scheduler (`scripts/run-intelligence.ts` or its worker equivalent — verify filename during implementation) that runs once per tenant per scan window with a dedicated context:

```ts
interface OrgTimelineContext {
  tenantId: string;
  categories: Array<{ id: string; name: string; colour: string | null;
                      parentCategoryId: string | null; projectId: string | null;
                      createdAt: string; lastRenamedAt: string | null }>;
  projects: Array<{ id: string; name: string; categoryId: string | null;
                    status: string; createdAt: string }>;
  recentSignals: Array<{ projectId: string; source: string; excerpt: string }>;
  pendingTimelineSuggestions: string[];   // display_text of open timeline_* events
}
```

- Runs at most once per tenant per hour (rate limit via a `larry_org_scan_runs` table, same pattern as existing scan-rate limits).
- Only the `proposeTimelineRegroup` tool is available in this context — no per-project tools.
- Skipped entirely when `pendingTimelineSuggestions.length >= 3` so we don't pile up suggestions the user hasn't reviewed.
- Token budget: capped at 4k output tokens. `categories` and `projects` are sent in a compressed tabular format (`id|name|categoryId`) rather than verbose JSON. `recentSignals` limited to 20 entries, 200 chars each. Hard ceiling under 2k input tokens beyond the system prompt.

Per-project scans are unchanged and do not get the `proposeTimelineRegroup` tool in their tool set.

**File:** `packages/ai/src/timeline-tools.ts` (new)

**Tool registered with the Vercel AI SDK:**

```ts
import { tool } from "ai";
import { z } from "zod";

export const proposeTimelineRegroup = tool({
  description:
    "Propose grouping projects under new or existing categories, optionally with colour assignments. " +
    "Only call when 3+ projects share strong shared signals (meeting transcripts, task-title patterns, shared " +
    "stakeholders). Do NOT call if a similar timeline_regroup suggestion is already pending for this tenant — " +
    "that list is provided in the system prompt.",
  parameters: z.object({
    displayText: z.string().min(10).max(140),
    reasoning: z.string().min(20).max(600),
    createCategories: z
      .array(z.object({
        tempId: z.string().regex(/^cat_[a-z0-9]{4,12}$/),
        name: z.string().min(1).max(60),
        colour: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      }))
      .max(5)
      .optional(),
    moveProjects: z
      .array(z.object({
        projectId: z.string().uuid(),
        toCategoryTempId: z.string().optional(),
        toCategoryId: z.string().uuid().optional(),
      }).refine((v) => !!v.toCategoryTempId !== !!v.toCategoryId,
        "exactly one of toCategoryTempId / toCategoryId"))
      .max(10)
      .optional(),
    recolourCategories: z
      .array(z.object({
        categoryId: z.string().uuid(),
        colour: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      }))
      .max(10)
      .optional(),
  })
    .refine((v) =>
      (v.createCategories?.length ?? 0)
      + (v.moveProjects?.length ?? 0)
      + (v.recolourCategories?.length ?? 0) >= 1,
      "At least one change is required"),
  execute: async (args, context) => {
    // Writes a single larry_events row with event_type='suggested',
    // action_type='timeline_regroup', project_id=NULL, payload=args.
    // Returns { eventId, status: 'pending' } to Larry so follow-up tool
    // calls can reference it.
  },
});
```

The 10-change cap keeps accepts reviewable. `createCategories` is capped at 5 because most regroupings create at most one or two themes — the ceiling is an anti-hallucination guardrail.

### 2.3 Prompt additions

**File:** `packages/ai/src/intelligence.ts`

Append to the system prompt (near line 202 where "You are Larry" already lives), in its own block so it can be token-trimmed under budget pressure:

```
# Timeline organisation

You can propose changes to how the workspace's timeline is organised by calling
`proposeTimelineRegroup`. Use it SPARINGLY. Good triggers:
- 3+ uncategorised or loosely-grouped projects share a theme (customer name,
  product area, quarter, stakeholder).
- An existing category has accumulated projects that clearly split into two
  sub-themes (suggest a subcategory).
- A category's colour conflicts with another category's colour (same hex) or
  uses the default Larry purple when the category is meaningful enough to
  deserve its own colour.

Do NOT propose:
- Reorganisation of fewer than 3 projects unless fixing a duplicate colour.
- Changes that would undo an active-looking manual choice (category named by
  a human in the last 7 days).
- A new suggestion when an identical timeline_regroup is already pending.

The list of pending timeline_regroup suggestions is provided in the context
snapshot under `pendingTimelineSuggestions`.
```

Context builder in `intelligence.ts` passes `pendingTimelineSuggestions: string[]` (human-readable summaries) so Larry can self-deduplicate.

### 2.4 Executor

**File:** `apps/api/src/lib/timeline-suggestion-executor.ts` (new)

```ts
type ExecuteResult = {
  applied: { categories: number; moves: number; recolours: number };
  skipped: Array<{ reason: string; projectId?: string; categoryId?: string }>;
};

export async function executeTimelineSuggestion(
  fastify: FastifyInstance,
  tenantId: string,
  eventId: string,
  payload: TimelineRegroupPayload,
  actorUserId: string,
): Promise<ExecuteResult>;
```

**Behaviour:**
1. Open a tenant-scoped transaction via `fastify.db.transactionTenant(tenantId, async (tx) => { ... })`.
2. **Concurrency guard — first statement in the transaction:**
   ```sql
   SELECT id, event_type FROM larry_events
    WHERE id = $1 AND tenant_id = $2
    FOR UPDATE;
   ```
   If the row is missing, or `event_type != 'suggested'`, return `{ applied: {0,0,0}, skipped: [{ reason: 'already_resolved' }] }` immediately (no rollback needed because no writes have happened). This blocks concurrent accepts: the second caller waits on the lock, then finds the event already `accepted` and no-ops.
3. Resolve `tempId` → real UUID for each entry in `createCategories` by inserting into `project_categories` (reusing the same insert path the `POST /api/workspace/categories` route uses — **extract a shared helper** if the route logic is currently inline).
   - **Name collision handling:** if an `INSERT` fails on the `(tenant_id, parent_category_id, name)` unique constraint, query the existing category with that name and reuse its id in the tempId map; record `skipped: [{ reason: 'category_name_already_exists', categoryId: existingId }]` so the accept response is honest about having reused rather than created.
4. For each `moveProjects` entry, resolve `toCategoryTempId` (from step 2's map) or `toCategoryId` (validated to exist in this tenant). If the project no longer exists → skipped with reason `"project_not_found"`. Otherwise UPDATE `projects.category_id`.
5. For each `recolourCategories` entry, UPDATE `project_categories.colour`. Missing category → skipped with reason `"category_not_found"`.
6. Update `larry_events` row: `event_type='accepted'`, `approved_by_user_id=actorUserId`, `approved_at=NOW()`, `execution_mode='approval'`, `executed_by_kind='user'`, `executed_by_user_id=actorUserId`.
7. Return `ExecuteResult`. Transaction commits only if steps 2–6 all succeed; any SQL error rolls back and the event stays `suggested` for retry/dismiss.

**Partial-apply policy:** a missing project or category within a suggestion is NOT a rollback trigger — it's a `skipped` entry. Rollback is reserved for integrity errors (FK violations other than the handled name collision, etc.).

**Write audit:** one entry per mutated entity via the existing `writeAuditLog` helper, with `sourceKind='larry_suggestion'` and `sourceRecordId=eventId`.

### 2.5 Accept handler dispatch

**File:** `apps/api/src/routes/v1/larry.ts`

Wherever the existing suggestion-accept handler lives (find by grep for `event_type` / `accepted`), add a branch:

```ts
if (event.actionType.startsWith("timeline_")) {
  // RBAC: org-scope timeline changes require workspace-level authority.
  // Per-project suggestions already fall through project_memberships gates;
  // a null project_id event has no project to gate against, so we gate on
  // workspace role directly. Matches the "pm or above" check used by
  // POST /api/workspace/categories today.
  const role = request.user.role;
  if (!["owner", "admin", "pm"].includes(role)) {
    return reply.code(403).send({
      message: "Only owners, admins, and PMs can apply timeline reorganisations.",
    });
  }
  const result = await executeTimelineSuggestion(
    fastify, tenantId, event.id,
    TimelineRegroupPayloadSchema.parse(event.payload),
    request.user.id,
  );
  return reply.send({ ok: true, result });
}
```

**Dismiss** is unchanged in handler logic, but add the same role gate so non-PMs can't dismiss org-scope suggestions either (keeps the "who sees the banner vs. who acts on it" story consistent). Non-PMs still see the banner but it's read-only with a tooltip explaining who can act.

**Verification step during implementation:** grep for the existing accept handler and confirm the `event.actionType` and `event.payload` field names match what I've written (memory says v4 shipped `larry_events` but field-name casing on the TS side isn't verified here).

### 2.6 Frontend — TimelineSuggestionPreview

**File:** `apps/web/src/components/workspace/TimelineSuggestionPreview.tsx` (new)

**Props:** the `WorkspaceLarryEvent` row (already typed in `apps/web/src/app/dashboard/types.ts`). Only renders for events whose `actionType` starts with `timeline_`.

**Visual:**
- Header: Larry avatar + `displayText` + action-type tag.
- Reasoning block: `reasoning` text in `var(--text-2)`, small.
- Diff preview — a mini-tree:
  - For each `createCategories` entry: a new `cat:` row with the proposed colour swatch (CategoryDot component, already shared) + name.
  - Under each, a nested list of `moveProjects` entries that target it, showing the project name + its current category → new category.
  - For each `recolourCategories` entry: a before/after swatch pair + category name.
- Footer: `Accept` + `Dismiss` buttons using the existing Action Centre action handlers (route through `useLarryActionCentre`).

**Routing:** `apps/web/src/app/workspace/actions/page.tsx` already picks up custom previews via `ActionDetailPreview` (`components/workspace/ActionDetailPreview.tsx`). Add a branch: if `actionType.startsWith("timeline_")`, render `<TimelineSuggestionPreview>` instead of the default preview.

### 2.7 NotificationBell banner

No code change. NotificationBell already polls `/api/workspace/larry/events?state=pending` (or equivalent — verify) and surfaces `display_text` verbatim as a banner. The three new action types flow through with no additional wiring. Verify by reading `NotificationBell.tsx` during implementation; if it filters by action type, extend the whitelist.

### 2.8 Action-type tags

**File:** `apps/web/src/lib/action-types.ts`

Append to `ACTION_TYPE_MAP`:

```ts
timeline_regroup:     { key: "timeline_regroup",     label: "Reorganise Timeline", color: "#6c44f6" },
timeline_categorise:  { key: "timeline_categorise",  label: "New Category",        color: "#6c44f6" },
timeline_recolour:    { key: "timeline_recolour",    label: "Category Colour",     color: "#6c44f6" },
```

Colour `#6c44f6` matches Larry's brand purple (memory `larry-design-decisions.md`). The `timeline_regroup` tag covers the omnibus type emitted by the current tool; `timeline_categorise` / `timeline_recolour` are reserved for future narrower tools (see §4) and added now so the UI doesn't render `Other` if Larry ever emits them in isolation.

### 2.9 Context builder additions

**File:** `packages/ai/src/intelligence.ts` (context snapshot construction)

Add to the snapshot passed into `runIntelligence`:

```ts
pendingTimelineSuggestions: string[];   // display_text of existing timeline_*
                                        // events with event_type='suggested'
```

Populated from a new query in the context loader:
```sql
SELECT display_text FROM larry_events
 WHERE tenant_id = $1
   AND action_type LIKE 'timeline_%'
   AND event_type = 'suggested'
 ORDER BY created_at DESC
 LIMIT 10
```

Ten is the dedup horizon — Larry sees the most recent pending suggestions and avoids duplicating them.

### 2.10 Invalidation after accept

**File:** client-side, wherever the accept mutation's `onSuccess` lives (hook `useLarryActionCentre` in `apps/web/src/hooks/`).

On accept of a `timeline_*` action:

```ts
await qc.invalidateQueries({ queryKey: ["timeline", "org"] });
await qc.invalidateQueries({ queryKey: ["categories"] });
await qc.invalidateQueries({ queryKey: ["projects"] });
```

Both timeline surfaces refetch; colour + groupings reflect the applied diff.

### 2.11 Error handling

- **Tool rejection** (Zod validation fails on the arguments): Larry sees the error in the tool loop and can retry with a fixed payload. No UI surface.
- **Executor transaction rollback**: `larry_events` row stays `suggested`. Surface error to the accept caller as a 500 with a structured message; ActionDetailPreview shows the error inline with a Retry button.
- **Partial apply** (some projects or categories skipped but others applied): accept succeeds, UI shows a summary — "Applied 3 of 4 moves. 1 skipped: project no longer exists." — via the existing toast system.
- **Scan budget exhausted**: timeline tool is gated by the same budget guard in `packages/ai/src/budget.ts` that already protects other tools. If budget is below threshold, Larry sees the tool as unavailable and doesn't try.

### 2.12 Testing

- **Unit — executor** (`timeline-suggestion-executor.test.ts`):
  - Full apply: 2 createCategories + 3 moveProjects + 1 recolourCategories → all applied, event marked accepted.
  - Partial apply: one projectId doesn't exist → applied returns 2 moves, skipped returns 1 entry with reason.
  - Rollback: second `createCategories` name collides with existing category → transaction aborts, nothing applied, event stays suggested.
  - tempId resolution: moveProjects with toCategoryTempId correctly resolves against the category inserted in the same transaction.
- **Unit — tool** (`timeline-tools.test.ts`):
  - Valid args → inserts one `larry_events` row with matching payload.
  - Invalid args (11 moves) → Zod throws, no DB row written.
  - Duplicate-detection: when `pendingTimelineSuggestions` contains a similar entry, the prompt-level guard is documented in a prompt-regression test (snapshot of the system prompt block).
- **Unit — TimelineSuggestionPreview** (component test):
  - Renders createCategories rows, moveProjects nested under them, recolourCategories swatch pairs.
  - Accept button calls the shared action-centre accept mutation with the event id.
- **E2E** (`e2e/timeline-suggestion.spec.ts`, Playwright MCP to handle Vercel BotID per memory `larry-botid-blocks-headless-playwright.md`):
  - Seed a tenant with 4 projects that share onboarding signals.
  - Trigger a scan (`POST /api/admin/scan/run` or the existing test helper).
  - Assert one `larry_events` row exists with `action_type='timeline_regroup'`, `event_type='suggested'`, `project_id=null`.
  - Navigate to `/workspace/actions`, open the preview, click Accept.
  - Assert the 4 projects now belong to the new category; assert the category's colour matches the payload; assert `/workspace/timeline` renders them grouped.

### 2.13 Observability

- Log (with correlation id) every tool call → event insert; every accept → executor result summary; every skipped entry with reason.
- Metric counters via existing Railway logging pipeline:
  - `larry.timeline.suggested.count`
  - `larry.timeline.accepted.count`
  - `larry.timeline.dismissed.count`
  - `larry.timeline.executor.rollback.count`
  - `larry.timeline.executor.skipped.count{reason}`
- No PII in logs — only UUIDs and counts.

---

## 3. Slice 3 — Gantt v5 feature roadmap

Roadmap only. Each feature ships as its own PR with a short, focused PR-time spec. Listed in value-per-LOC order so we can stop whenever the budget runs out.

### 3.1 Dependency arrows (highest-value, smallest change)

The server returns `dependencies: { taskId, dependsOnTaskId }[]` in every `/api/workspace/timeline` response and the UI ignores them (`PortfolioTimelineResponse.dependencies` in `packages/shared`). New SVG overlay in `GanttGrid.tsx` painting finish-to-start arrows from the right edge of the predecessor bar to the left edge of the dependent bar, routed around intervening rows with a simple L-shape. Arrow colour: `var(--text-muted)`; highlighted on hover of either endpoint.

Estimated: one PR, one day.

### 3.2 Bar drag-resize for start/due

Left/right 6px resize handles on `GanttBar`. On drag-end, PATCH `/api/workspace/tasks/:id` with the new `startDate` or `dueDate`, snapping to day boundaries in the user's timezone. Optimistic update + rollback on failure, same pattern as Slice 4 DnD.

Estimated: one PR, one-to-two days. Needs tests for timezone correctness (the existing `timezone-context.ts` utility handles this).

### 3.3 Milestones

Tasks where `startDate === dueDate` AND `progressPercent === 0` render as rotated-square diamonds instead of bars. No schema change — it's a visual rule over existing data. Future: add a proper `task_kind` enum if the implicit rule turns out to be too fragile.

Estimated: one PR, half a day.

### 3.4 Critical path

Client-side forward + backward pass over the dependency DAG using the durations already in `GanttTask`. Toolbar toggle paints critical-chain bars in `var(--pm-red)`. Pure compute, no backend change.

Estimated: one PR, one-to-two days.

### 3.5 Export to PNG/PDF

Toolbar button that uses `html-to-image` (already in some projects — verify) + `jspdf` to capture the Gantt panel, preserving colours + arrows. For long timelines, paginate by month.

Estimated: one PR, one day.

---

## 4. Future tools (documented, not built in this spec)

Slice 2 ships one omnibus `proposeTimelineRegroup` tool. Once usage data tells us which shapes of suggestion Larry actually emits, split into narrower tools:

- `proposeNewCategory({ name, colour, underProjects })` — single-category create.
- `proposeRecolour({ categoryId, colour, reasoning })` — single-colour recolour.
- `proposeProjectMove({ projectId, toCategoryId })` — single-move.

Narrower tools give Larry clearer affordances and make Zod validation sharper. Deferred because it's premature to optimise the surface before seeing real usage.

---

## 5. Sequencing and risk

**Order:**
1. Slice 1 — ships first, all three pieces (description, cache, polish) in one PR. Low risk.
2. Slice 2 — migration first (own PR, backward-compatible), then tool + executor + frontend (own PR). Two-PR gate because the migration needs to be live on prod before the code that relies on nullable `project_id`.
3. Slice 3 — feature-by-feature as capacity allows. Dependency arrows first.

**Risks and mitigations:**
- *Larry hallucinating poor groupings.* Mitigated by prompt guards (3+ project minimum, 7-day recent-manual-change filter), 10-change payload cap, and the accept/dismiss gate. Every suggestion is reversible because each individual move can be undone via the existing timeline UI.
- *Accept executes on stale data.* Partial-apply policy tolerates missing projects/categories; user sees a summary of what did and didn't apply.
- *Cache warming writes wrong shape.* Unit-tested in Slice 1.4; shape mismatches are caught at compile time by the existing `ProjectCategory` and `ProjectSummary` types.
- *Migration blocks on prod.* The `ALTER TABLE ... DROP NOT NULL` is instant on Postgres and has no data rewrite. Safe to run during business hours.
- *Gantt v5 features conflicting with v4 DnD.* Each v5 feature is additive; dependency arrows are a pure render-layer overlay, resize handles live on `GanttBar` not `GanttOutlineRow`. No mutation-path collision.

---

## 6. Design follow-ups (flagged for post-launch discussion)

These are *known gaps* — not oversights. The spec ships without resolving them because each one either depends on usage data we don't have yet, is cheap to add later, or would expand scope beyond what's needed for the first shipping version.

1. **Semantic dedup is prompt-only.** `pendingTimelineSuggestions` stops Larry from emitting the same *wording* twice. It doesn't stop him from emitting semantically-identical suggestions in different words. Server-side hardening: reject a tool insert if a pending suggestion has >50% overlap on `moveProjects.projectId` set. Deferred until we see whether this actually happens in practice.

2. **Token-cost monitoring for the org-wide pass.** §2.2 caps context at ~2k input + 4k output. We should track actual consumption via the existing `larry.tokens.*` metric family and tune the cap once we have real numbers. If the org-wide pass turns out to cost more than a batch of per-project scans, we may want to run it daily instead of hourly.

3. **Undo.** Once Larry applies a regroup, there's no single-click revert — you'd have to manually move each project back and delete the created category. For a feature marketed as "Larry organises your timeline", an "undo last Larry regroup" action is a reasonable v2. Design sketch: store the pre-state in `larry_events.previous_payload` (already a column), add a `POST /api/workspace/larry/events/:id/undo` endpoint, gate by same RBAC and a 7-day TTL.

4. **NotificationBell.tsx hasn't been verified** to pass `timeline_*` action types through unchanged. Low-risk but an explicit implementation-time check: read the component, confirm it filters by event_type only (not action_type), extend the whitelist if needed.

5. **Org-scope dismiss with `project_id IS NULL`.** The existing dismiss handler presumably keys off the event id, not `project_id`. Presumed-working but un-tested; implementation-time smoke test.

6. **Slice 3 effort estimates removed.** Original spec had "one day / half a day" estimates. Dropped because without checking Gantt row virtualisation, axis renderer architecture, etc., those numbers would mislead at PR time. Each Slice 3 feature gets a real estimate at its own PR-time spec.

7. **Accept-handler field-name audit.** §2.5 references `event.actionType` and `event.payload`. Casing on the TS side of `larry_events` is unverified here. If the code uses snake_case on the JSON boundary, adjust. Zero-risk fix at implementation time.

## 7. Open questions (none at time of writing)

All questions raised during brainstorming (Larry autonomy level, surfacing mechanism, project_id nullability, slice sequencing, org-wide context architecture, concurrent accepts, RBAC on accept, cache anti-pattern, schema drift) are resolved inline above. Any new questions that surface during implementation should be added here and re-confirmed before proceeding.
