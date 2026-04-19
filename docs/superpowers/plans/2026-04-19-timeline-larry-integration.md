# Timeline × Larry — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Slice 1 (timeline polish + shared cache + task description field) and Slice 2 (Larry timeline-organisation tools surfaced through the Action Centre). Slice 3 (Gantt v5 features) is roadmap-only in the spec and out of scope for this plan.

**Architecture:** Slice 1 replaces duplicate timeline queries with a single `useTimelineSnapshot` hook feeding both the org and project Gantts; exposes task description in the creation modal; tidies polish debt. Slice 2 introduces an org-wide intelligence pass that emits `timeline_regroup` suggestions into the existing `larry_events` + Action Centre pipeline; a tenant-transactional executor applies accepted suggestions with `SELECT … FOR UPDATE` concurrency safety; frontend adds a preview component and RBAC-gated accept.

**Tech Stack:** PostgreSQL + Fastify 5 (apps/api), Next.js 16 App Router + TanStack Query (apps/web), Vercel AI SDK v6 + Gemini (packages/ai), Vitest for unit tests, Playwright MCP for prod E2E. Types shared via `@larry/shared`.

**Branch:** `feat/timeline-larry-slice-1` for Part A (Slice 1). `feat/timeline-larry-slice-2-migration` and `feat/timeline-larry-slice-2-feature` stacked on top for Part B (Slice 2). Both cut from `master`.

**Spec:** `docs/superpowers/specs/2026-04-19-timeline-larry-integration-design.md`

---

## File map

**Create:**
- `packages/shared/src/timeline.ts`
- `packages/shared/src/timeline.test.ts`
- `apps/web/src/hooks/useTimelineSnapshot.ts`
- `apps/web/src/hooks/useTimelineSnapshot.test.tsx`
- `packages/db/src/migrations/027_larry_events_nullable_project.sql`
- `packages/ai/src/timeline-tools.ts`
- `packages/ai/src/timeline-tools.test.ts`
- `packages/ai/src/org-intelligence.ts`
- `packages/ai/src/org-intelligence.test.ts`
- `apps/api/src/lib/timeline-suggestion-executor.ts`
- `apps/api/src/lib/timeline-suggestion-executor.test.ts`
- `apps/web/src/components/workspace/TimelineSuggestionPreview.tsx`
- `apps/web/src/components/workspace/TimelineSuggestionPreview.test.tsx`

**Modify:**
- `packages/shared/src/index.ts` (re-export timeline helpers)
- `packages/db/src/schema.sql` (reflect migration 027)
- `apps/web/src/components/workspace/gantt/AddNodeModal.tsx`
- `apps/web/src/app/workspace/timeline/PortfolioGanttClient.tsx`
- `apps/web/src/components/workspace/gantt/ProjectGanttClient.tsx`
- `apps/web/src/lib/action-types.ts`
- `apps/web/src/components/workspace/ActionDetailPreview.tsx`
- `apps/web/src/hooks/useLarryActionCentre.ts`
- `packages/ai/src/intelligence.ts` (context builder only — no per-project tool changes)
- `apps/api/src/routes/v1/larry.ts` (accept handler dispatch)
- `apps/api/src/routes/v1/index.ts` (register org-scan admin route if new)

---

# PART A — SLICE 1: Polish + Cache + Description

## Task 1: Shared timeline-derivation types and tests

**Files:**
- Create: `packages/shared/src/timeline.ts`
- Create: `packages/shared/src/timeline.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/timeline.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  toCategorySummaries,
  toProjectSummaries,
  type TimelineCategorySummary,
  type TimelineProjectSummary,
} from "./timeline";
import type { PortfolioTimelineResponse } from "./index";

const fixture: PortfolioTimelineResponse = {
  categories: [
    {
      id: "c1", name: "Customer", colour: "#ff0000", sortOrder: 0,
      parentCategoryId: null, projectId: null,
      projects: [
        { id: "p1", name: "Onboarding", status: "active", startDate: null, targetDate: null, tasks: [] },
        { id: "p2", name: "Renewal",    status: "active", startDate: null, targetDate: null, tasks: [] },
      ],
    },
    {
      id: null, name: "Uncategorised", colour: null, sortOrder: Number.MAX_SAFE_INTEGER,
      projects: [
        { id: "p3", name: "Misc", status: "active", startDate: null, targetDate: null, tasks: [] },
      ],
    },
  ],
  dependencies: [],
};

describe("toCategorySummaries", () => {
  it("skips the synthetic uncategorised bucket", () => {
    const result = toCategorySummaries(fixture);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("c1");
  });

  it("normalises optional parent/project fields to null", () => {
    const result = toCategorySummaries(fixture);
    expect(result[0].parentCategoryId).toBeNull();
    expect(result[0].projectId).toBeNull();
  });
});

describe("toProjectSummaries", () => {
  it("returns one entry per project including those under uncategorised", () => {
    const result = toProjectSummaries(fixture);
    expect(result).toHaveLength(3);
  });

  it("stitches the parent categoryId back onto each project", () => {
    const byId = Object.fromEntries(toProjectSummaries(fixture).map((p) => [p.id, p]));
    expect(byId.p1.categoryId).toBe("c1");
    expect(byId.p2.categoryId).toBe("c1");
    expect(byId.p3.categoryId).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `cd C:/Dev/larry/site-deploys/larry-site && npm --workspace @larry/shared run test`
Expected: FAIL — `./timeline` module not found.

- [ ] **Step 3: Implement the module**

Create `packages/shared/src/timeline.ts`:

```ts
import type { PortfolioTimelineResponse } from "./index";

/** Subset of ProjectCategory that's actually needed by timeline renderers. */
export interface TimelineCategorySummary {
  id: string;
  name: string;
  colour: string | null;
  sortOrder: number;
  parentCategoryId: string | null;
  projectId: string | null;
}

export interface TimelineProjectSummary {
  id: string;
  categoryId: string | null;
}

export function toCategorySummaries(
  resp: PortfolioTimelineResponse,
): TimelineCategorySummary[] {
  return resp.categories
    .filter((c): c is (typeof c) & { id: string } => c.id !== null)
    .map((c) => ({
      id: c.id,
      name: c.name,
      colour: c.colour,
      sortOrder: c.sortOrder,
      parentCategoryId: c.parentCategoryId ?? null,
      projectId: c.projectId ?? null,
    }));
}

export function toProjectSummaries(
  resp: PortfolioTimelineResponse,
): TimelineProjectSummary[] {
  return resp.categories.flatMap((c) =>
    c.projects.map((p) => ({ id: p.id, categoryId: c.id ?? null })),
  );
}
```

- [ ] **Step 4: Re-export from the package root**

Edit `packages/shared/src/index.ts` — append at end of file:

```ts
export * from "./timeline";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm --workspace @larry/shared run test`
Expected: PASS — 4 tests.

- [ ] **Step 6: Build the shared package so downstream workspaces see it**

Run: `npm --workspace @larry/shared run build`
Expected: no output; `packages/shared/dist/timeline.js` exists.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/timeline.ts packages/shared/src/timeline.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): timeline payload derivation helpers with tests"
```

---

## Task 2: useTimelineSnapshot hook and tests

**Files:**
- Create: `apps/web/src/hooks/useTimelineSnapshot.ts`
- Create: `apps/web/src/hooks/useTimelineSnapshot.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/hooks/useTimelineSnapshot.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PortfolioTimelineResponse } from "@larry/shared";
import {
  useTimelineSnapshot,
  useCategoriesFromTimeline,
  useProjectsFromTimeline,
  QK_TIMELINE_ORG,
} from "./useTimelineSnapshot";

const payload: PortfolioTimelineResponse = {
  categories: [
    { id: "c1", name: "X", colour: "#123456", sortOrder: 0, parentCategoryId: null, projectId: null,
      projects: [{ id: "p1", name: "P", status: "active", startDate: null, targetDate: null, tasks: [] }] },
  ],
  dependencies: [],
};

function makeWrapper(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe("useTimelineSnapshot", () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it("fetches and caches the timeline payload", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(payload), { status: 200 }),
    );
    const { result } = renderHook(() => useTimelineSnapshot(), { wrapper: makeWrapper(qc) });
    await waitFor(() => expect(result.current.data).toEqual(payload));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(qc.getQueryData(QK_TIMELINE_ORG)).toEqual(payload);
  });

  it("does not refetch when the cache is already warm within staleTime", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(QK_TIMELINE_ORG, payload);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { result } = renderHook(() => useCategoriesFromTimeline(), { wrapper: makeWrapper(qc) });
    await waitFor(() => expect(result.current.data?.categories).toHaveLength(1));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("useProjectsFromTimeline derives items with categoryId stitched", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(QK_TIMELINE_ORG, payload);
    const { result } = renderHook(() => useProjectsFromTimeline(), { wrapper: makeWrapper(qc) });
    await waitFor(() => expect(result.current.data?.items).toEqual([{ id: "p1", categoryId: "c1" }]));
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm --workspace apps/web exec -- vitest run src/hooks/useTimelineSnapshot.test.tsx`
Expected: FAIL — `./useTimelineSnapshot` not found.

- [ ] **Step 3: Implement the hook**

Create `apps/web/src/hooks/useTimelineSnapshot.ts`:

```ts
"use client";
import { useQuery } from "@tanstack/react-query";
import type { PortfolioTimelineResponse } from "@larry/shared";
import {
  toCategorySummaries,
  toProjectSummaries,
  type TimelineCategorySummary,
  type TimelineProjectSummary,
} from "@larry/shared";

export const QK_TIMELINE_ORG = ["timeline", "org"] as const;

// Single source of truth for the timeline payload. Both the org and
// project Gantt surfaces read from this hook; no component writes into
// sibling cache keys.
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

interface CategoriesView {
  categories: TimelineCategorySummary[];
}
interface ProjectsView {
  items: TimelineProjectSummary[];
}

export function useCategoriesFromTimeline() {
  const { data, ...rest } = useTimelineSnapshot();
  return {
    ...rest,
    data: data ? ({ categories: toCategorySummaries(data) } satisfies CategoriesView) : undefined,
  };
}

export function useProjectsFromTimeline() {
  const { data, ...rest } = useTimelineSnapshot();
  return {
    ...rest,
    data: data ? ({ items: toProjectSummaries(data) } satisfies ProjectsView) : undefined,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --workspace apps/web exec -- vitest run src/hooks/useTimelineSnapshot.test.tsx`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/hooks/useTimelineSnapshot.ts apps/web/src/hooks/useTimelineSnapshot.test.tsx
git commit -m "feat(web): useTimelineSnapshot hook + derived category/project views"
```

---

## Task 3: Migrate PortfolioGanttClient to the shared hook

**Files:**
- Modify: `apps/web/src/app/workspace/timeline/PortfolioGanttClient.tsx`

- [ ] **Step 1: Replace the inline useQuery with useTimelineSnapshot**

Edit `PortfolioGanttClient.tsx`:

Replace the import block at lines 4-19:

```ts
import { useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import {
  DndContext, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import type { PortfolioTimelineResponse, ContextMenuAction, GanttNode } from "@/components/workspace/gantt/gantt-types";
import {
  buildPortfolioTree, buildCategoryColorMap, normalizePortfolioStatuses,
  validateDrop, type DropContext,
} from "@/components/workspace/gantt/gantt-utils";
import { GanttContainer } from "@/components/workspace/gantt/GanttContainer";
import { AddNodeModal } from "@/components/workspace/gantt/AddNodeModal";
import { CategoryManagerPanel } from "@/components/workspace/gantt/CategoryManagerPanel";
import { GanttEmptyState } from "@/components/workspace/gantt/GanttEmptyState";
import { CategoryColourPopover } from "@/components/workspace/gantt/CategoryColourPopover";
import type { CategoryOption } from "@/components/workspace/gantt/GanttContextMenu";
import { useTimelineSnapshot, QK_TIMELINE_ORG } from "@/hooks/useTimelineSnapshot";
```

Remove lines 23 (`const QK_TIMELINE_ORG = ["timeline", "org"] as const;`) — now imported.

Replace the existing `useQuery` block (roughly lines 46–53) with:

```ts
const { data, error: queryError, isError: isFetchError, refetch } = useTimelineSnapshot();
```

Remove the unused `useEffect` import — wait, we now import it but don't use it yet (it was unused before, still unused). Delete `useEffect,` from the React import.

- [ ] **Step 2: Type-check the file**

Run: `npm --workspace apps/web exec -- tsc --noEmit src/app/workspace/timeline/PortfolioGanttClient.tsx`
Expected: no errors.

(If the tsc invocation fails because the file isn't a project root, run `npm --workspace apps/web exec -- tsc --noEmit` to type-check the whole web app.)

- [ ] **Step 3: Run the existing PortfolioGanttClient suite**

Run: `npm --workspace apps/web exec -- vitest run src/app/workspace/timeline`
Expected: all pre-existing tests still pass.

- [ ] **Step 4: Manual smoke check on dev server**

```bash
# Terminal 1
docker compose up -d
# Terminal 2
npm run api:dev
# Terminal 3
npm run web:dev
```

Visit `http://localhost:3000/workspace/timeline`. Confirm: page loads, categories + colours render, DnD still works, add/delete still works.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/workspace/timeline/PortfolioGanttClient.tsx
git commit -m "refactor(web): PortfolioGanttClient reads from useTimelineSnapshot"
```

---

## Task 4: Migrate ProjectGanttClient to derived views

**Files:**
- Modify: `apps/web/src/components/workspace/gantt/ProjectGanttClient.tsx`

- [ ] **Step 1: Replace the two standalone queries**

Edit `ProjectGanttClient.tsx`:

At the top, add to imports:

```ts
import { useCategoriesFromTimeline, useProjectsFromTimeline, QK_TIMELINE_ORG } from "@/hooks/useTimelineSnapshot";
```

Remove these constants (lines 41-42):

```ts
const QK_CATEGORIES = ["categories"] as const;
const QK_PROJECTS = ["projects"] as const;
```

Replace the two `useQuery` calls (categories + projects, lines 71-88) with:

```ts
const { data: categoriesData } = useCategoriesFromTimeline();
const { data: projectsData } = useProjectsFromTimeline();
```

- [ ] **Step 2: Update the categoryColour lookup**

The function `categoryColour` at lines 95-101 uses `projectsData.items.find` which still works (shape matches). Also uses `categoriesData.categories.map` — still works because the derived view returns `{ categories: TimelineCategorySummary[] }` with the same field names.

But `buildCategoryColorMap` is called with `categoriesData.categories` — verify no extra fields are required. The `TimelineCategorySummary` is missing `tenantId`, `createdAt`, `updatedAt` but `buildCategoryColorMap` only reads `id` and `colour` so we're fine.

Update the type annotation in `allCategories` (line 90):

```ts
import type { TimelineCategorySummary } from "@larry/shared";

const allCategories: TimelineCategorySummary[] = categoriesData?.categories ?? [];
```

Remove the old `import type { GanttTask, ProjectCategory, ... }` — keep everything except `ProjectCategory`. Replace with `TimelineCategorySummary`.

(Every remaining reference to `ProjectCategory` in this file should be retyped — `ProjectSummary = { id: string; categoryId: string | null }` can be reused since the derived view matches that shape.)

- [ ] **Step 3: Update the invalidateCategoryCaches helper**

Replace lines 126-129 (`invalidateCategoryCaches`) with:

```ts
const invalidateCategoryCaches = () => {
  void qc.invalidateQueries({ queryKey: QK_TIMELINE_ORG });
};
```

The single invalidation of the org payload now cascades through both derived views. Drop references to `QK_CATEGORIES` and `QK_PROJECTS` entirely (search-and-delete).

In `moveProjectMutation.onSuccess` (line 168-171), remove `void qc.invalidateQueries({ queryKey: QK_PROJECTS });` — only `invalidateCategoryCaches()` is needed.

In `refreshAll` (lines 240-244), remove `void qc.invalidateQueries({ queryKey: QK_PROJECTS });`.

- [ ] **Step 4: Type-check**

Run: `npm --workspace apps/web exec -- tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual smoke test — this is the colour-flash fix**

Dev server running (from Task 3 Step 4). Navigate:

1. Load `/workspace/timeline` — wait for categories to render in colour.
2. Click into a project row → open its dedicated page (routes through `ProjectWorkspaceView`).
3. Confirm the project timeline renders category colours on first paint, no neutral-grey flash.
4. Navigate back to `/workspace/timeline` → confirm no extra network request to `/api/workspace/timeline` (check DevTools Network).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/workspace/gantt/ProjectGanttClient.tsx
git commit -m "refactor(web): ProjectGanttClient reads from shared timeline snapshot"
```

---

## Task 5: AddNodeModal description field

**Files:**
- Modify: `apps/web/src/components/workspace/gantt/AddNodeModal.tsx`
- Create: `apps/web/src/components/workspace/gantt/AddNodeModal.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `AddNodeModal.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AddNodeModal } from "./AddNodeModal";

describe("AddNodeModal description field", () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it("shows the description toggle only in task/subtask modes", () => {
    const { rerender } = render(
      <AddNodeModal mode="category" onClose={() => {}} onCreated={() => {}} />,
    );
    expect(screen.queryByText(/add description/i)).not.toBeInTheDocument();

    rerender(<AddNodeModal mode="project" onClose={() => {}} onCreated={() => {}} />);
    expect(screen.queryByText(/add description/i)).not.toBeInTheDocument();

    rerender(<AddNodeModal mode="task" parentProjectId="p" onClose={() => {}} onCreated={() => {}} />);
    expect(screen.getByText(/add description/i)).toBeInTheDocument();

    rerender(<AddNodeModal mode="subtask" parentProjectId="p" parentTaskId="t" onClose={() => {}} onCreated={() => {}} />);
    expect(screen.getByText(/add description/i)).toBeInTheDocument();
  });

  it("sends description in the POST body when typed and submitted", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 200 }),
    );
    const onCreated = vi.fn();
    render(
      <AddNodeModal
        mode="task"
        parentProjectId="p"
        onClose={() => {}}
        onCreated={onCreated}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText(/task title/i), { target: { value: "New thing" } });
    fireEvent.click(screen.getByText(/add description/i));
    fireEvent.change(screen.getByPlaceholderText(/what does this task cover/i), {
      target: { value: "Investigate why X is slow" },
    });
    // both start+due required since requireDates is default-false here;
    // this test skips the date fields.
    fireEvent.click(screen.getByRole("button", { name: /create/i }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const body = JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body));
    expect(body.description).toBe("Investigate why X is slow");
    expect(body.title).toBe("New thing");
  });

  it("omits description from the POST body when empty", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 200 }),
    );
    render(
      <AddNodeModal mode="task" parentProjectId="p" onClose={() => {}} onCreated={vi.fn()} />,
    );
    fireEvent.change(screen.getByPlaceholderText(/task title/i), { target: { value: "Thing" } });
    fireEvent.click(screen.getByRole("button", { name: /create/i }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const body = JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body));
    expect(body).not.toHaveProperty("description");
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm --workspace apps/web exec -- vitest run src/components/workspace/gantt/AddNodeModal.test.tsx`
Expected: FAIL — `add description` text not found.

- [ ] **Step 3: Implement the description field**

Edit `AddNodeModal.tsx`:

Add `description` state after the existing state hooks (line 37):

```ts
const [description, setDescription] = useState("");
const [descOpen, setDescOpen] = useState(false);
```

In the `handleSave` task/subtask branch (roughly lines 69-81), add before the POST:

```ts
if (description.trim()) body.description = description.trim();
```

Insert a collapsible description block into the JSX inside the `isTaskMode && (` block, after the date inputs (roughly line 159, before the `requireDates && datesMissing` hint):

```tsx
<div>
  <button
    type="button"
    onClick={() => setDescOpen((v) => !v)}
    style={{
      background: "transparent",
      border: 0,
      padding: 0,
      fontSize: 11,
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: 1,
      color: "var(--text-muted)",
      cursor: "pointer",
    }}
  >
    {descOpen ? "− Description" : "+ Add description"}
  </button>
  {descOpen && (
    <textarea
      value={description}
      onChange={(e) => setDescription(e.target.value)}
      placeholder="What does this task cover? (optional)"
      rows={3}
      maxLength={4000}
      style={{ ...inputStyle, resize: "vertical", marginTop: 6 }}
    />
  )}
</div>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --workspace apps/web exec -- vitest run src/components/workspace/gantt/AddNodeModal.test.tsx`
Expected: PASS — 3 tests.

- [ ] **Step 5: Manual verification**

On dev server, open the timeline, click `+ Task` on a project. Confirm:
- No description field visible initially.
- Click "+ Add description" → textarea appears.
- Type text, submit → new task appears on the timeline.
- Click the task (hits `TaskDetailDrawer`) → description renders.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/workspace/gantt/AddNodeModal.tsx apps/web/src/components/workspace/gantt/AddNodeModal.test.tsx
git commit -m "feat(web): optional description field on AddNodeModal"
```

---

## Task 6: API test for task description persistence

**Files:**
- Modify: `apps/api/src/routes/v1/tasks.test.ts` (verify exists; create if absent)

- [ ] **Step 1: Check existing coverage**

Run: `grep -n "description" apps/api/src/routes/v1/tasks.test.ts 2>/dev/null || echo "no file"`

If there's no file or no description coverage, proceed; otherwise extend the existing block.

- [ ] **Step 2: Add a description round-trip test**

Append to `tasks.test.ts` (or create with the standard test-server harness used by other `apps/api/src/routes/v1/*.test.ts` files — copy the imports and setup block from `categories.test.ts`):

```ts
describe("POST /api/v1/tasks — description", () => {
  it("persists a description and returns it on GET", async () => {
    const project = await createProject({ tenantId, name: "P" });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tasks",
      headers: authHeader(user),
      payload: {
        projectId: project.id,
        title: "With desc",
        description: "A short but meaningful description.",
      },
    });
    expect(res.statusCode).toBe(200);
    const created = res.json();
    const list = await app.inject({
      method: "GET",
      url: `/api/v1/tasks?projectId=${project.id}`,
      headers: authHeader(user),
    });
    const found = list.json().items.find((t: { id: string }) => t.id === created.id);
    expect(found.description).toBe("A short but meaningful description.");
  });

  it("rejects descriptions over 4000 chars", async () => {
    const project = await createProject({ tenantId, name: "P" });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tasks",
      headers: authHeader(user),
      payload: {
        projectId: project.id,
        title: "Too long",
        description: "x".repeat(4001),
      },
    });
    expect(res.statusCode).toBe(400);
  });
});
```

- [ ] **Step 3: Run the API test**

Run: `npm --workspace apps/api exec -- vitest run src/routes/v1/tasks.test.ts`
Expected: PASS — new two tests pass plus existing suite.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/v1/tasks.test.ts
git commit -m "test(api): task description round-trip + length-limit coverage"
```

---

## Task 7: ErrorBanner colour tokens

**Files:**
- Modify: `apps/web/src/app/workspace/timeline/PortfolioGanttClient.tsx`

- [ ] **Step 1: Replace hard-coded hex with CSS tokens**

Edit the `ErrorBanner` function (bottom of file, starts at line 688).

Replace:
- `background: "#fdecef"` → `background: "var(--pm-red-light)"`
- `border: "1px solid #f5c1cb"` → `border: "1px solid var(--pm-red)"`
- `color: "#8a1f33"` → `color: "var(--pm-red)"`

(There are three occurrences of `#8a1f33` — span, retry button, dismiss button — replace all.)

Add `aria-live="polite"` to the outer `<div role="alert">` element.

- [ ] **Step 2: Type-check and run tests**

Run: `npm --workspace apps/web exec -- tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Visual verification**

Trigger an error on dev (stop the API server, refresh `/workspace/timeline`). Banner should match the existing red used on ProjectGanttClient's mutation-error banner.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/workspace/timeline/PortfolioGanttClient.tsx
git commit -m "refactor(web): ErrorBanner uses shared pm-red tokens + a11y live region"
```

---

## Task 8: Slice 1 integration verification and PR

**Files:** (no code — verification)

- [ ] **Step 1: Run the entire affected test surface**

```bash
npm --workspace @larry/shared run test
npm --workspace apps/web exec -- vitest run
npm --workspace apps/api exec -- vitest run
```

Expected: all pass.

- [ ] **Step 2: Build both apps**

```bash
npm --workspace @larry/shared run build
npm --workspace apps/web run build
npm --workspace apps/api run build
```

Expected: no errors in any of the three.

- [ ] **Step 3: Manual end-to-end smoke on prod test user (Fergus tests on deployed, per memory)**

Push to the feature branch:

```bash
git push -u origin feat/timeline-larry-slice-1
```

Once Vercel preview URL is green, log in with `launch-test-2026@larry-pm.com` / `TestLarry123%`. Verify:
1. `/workspace/timeline` loads, no console errors.
2. Create a task via the modal — add a description — confirm it saves and reads back in TaskDetailDrawer.
3. Click into a project → project timeline paints with the correct colours on first frame, no neutral-grey flash.
4. Navigate back to org timeline → no extra `/api/workspace/timeline` request (Network tab).

- [ ] **Step 4: Open PR**

```bash
gh pr create --title "Slice 1: timeline polish, shared cache, task description" --body "$(cat <<'EOF'
## Summary
- Single `useTimelineSnapshot` hook feeds both org and project Gantts — kills the colour flash when switching surfaces.
- `AddNodeModal` gains an optional description field in task/subtask modes (API + DB already supported it).
- `ErrorBanner` migrated to shared pm-red tokens; `aria-live` for a11y.
- Shared derivation types in `@larry/shared` so payload drift is a compile error.

Spec: `docs/superpowers/specs/2026-04-19-timeline-larry-integration-design.md` §1.

## Test plan
- [x] Shared types: 4 unit tests
- [x] useTimelineSnapshot: 3 unit tests
- [x] AddNodeModal description: 3 component tests
- [x] Task description round-trip: 2 API tests
- [x] Manual: org → project navigation no-flash, description persist
- [ ] Reviewer smoke on preview URL

Slice 2 (Larry timeline tools) will be stacked on top once this lands.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: Monitor the merge + prod deploy**

Once reviewed + merged to master, watch `vercel ls ailarry` and `gh run list --limit 5` for the prod deploy. Verify prod smoke (same four checks as Step 3).

---

# PART B — SLICE 2: Larry timeline tools

Part B is cut from `master` AFTER Part A merges. Migration is its own branch and PR so it lands before the code that relies on it.

---

## Task 9: Migration 027 — nullable `larry_events.project_id`

**Files:**
- Create: `packages/db/src/migrations/027_larry_events_nullable_project.sql`
- Modify: `packages/db/src/schema.sql`

- [ ] **Step 1: Write the migration**

Create `packages/db/src/migrations/027_larry_events_nullable_project.sql`:

```sql
-- Migration 027 — make larry_events.project_id nullable so Larry can
-- emit org-wide timeline_* suggestions (no single project anchor).
--
-- Forward: ALTER column + CHECK constraint + partial index.
-- Rollback: SET NOT NULL after deleting any org-scope rows.
-- Safe: instant metadata change on Postgres, no table rewrite.

BEGIN;

ALTER TABLE larry_events
  ALTER COLUMN project_id DROP NOT NULL;

ALTER TABLE larry_events
  ADD CONSTRAINT larry_events_project_scope_check
  CHECK (
    project_id IS NOT NULL
    OR action_type LIKE 'timeline\_%' ESCAPE '\'
  );

CREATE INDEX IF NOT EXISTS idx_larry_events_org_pending
  ON larry_events (tenant_id, created_at DESC)
  WHERE project_id IS NULL AND event_type = 'suggested';

COMMIT;
```

- [ ] **Step 2: Apply the migration locally**

```bash
docker compose up -d
npm --workspace @larry/db run migrate
```

Expected: migration runs, no errors. Verify:

```bash
docker compose exec db psql -U postgres -d larry -c "\d larry_events" | grep project_id
```

Expected output includes `project_id ... uuid |` (no `not null`).

- [ ] **Step 3: Update schema.sql to reflect the new shape**

Edit `packages/db/src/schema.sql` at line 1067:

Before:
```sql
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
```

After:
```sql
  project_id   UUID REFERENCES projects(id) ON DELETE CASCADE,
```

Then append, at the end of the `larry_events` ALTER TABLE block (after line 1131), the migration's additions so a fresh schema.sql run produces the same shape:

```sql
-- Migration 027: org-scope suggestions have no single project anchor.
ALTER TABLE larry_events
  ALTER COLUMN project_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'larry_events_project_scope_check'
  ) THEN
    ALTER TABLE larry_events
      ADD CONSTRAINT larry_events_project_scope_check
      CHECK (
        project_id IS NOT NULL
        OR action_type LIKE 'timeline\_%' ESCAPE '\'
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_larry_events_org_pending
  ON larry_events (tenant_id, created_at DESC)
  WHERE project_id IS NULL AND event_type = 'suggested';
```

- [ ] **Step 4: Rerun schema.sql on a fresh DB to confirm idempotency**

```bash
docker compose down -v
docker compose up -d
sleep 5
npm --workspace @larry/db run migrate
```

Expected: clean apply, same output.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/migrations/027_larry_events_nullable_project.sql packages/db/src/schema.sql
git commit -m "feat(db): migration 027 — larry_events.project_id nullable for timeline actions"
```

- [ ] **Step 6: Push, open PR, merge and deploy BEFORE writing any code that depends on it**

```bash
git push -u origin feat/timeline-larry-slice-2-migration
gh pr create --title "Slice 2 migration: larry_events.project_id nullable" --body "Enables org-scope timeline_* suggestions. Zero-downtime ALTER (metadata only). See spec §2.1."
```

Wait for merge + Railway deploy. Confirm the constraint is live in prod (use the Railway console) before starting Task 10 et seq.

---

## Task 10: Action-type tags for timeline suggestions

**Files:**
- Modify: `apps/web/src/lib/action-types.ts`

Branch from `master` onto `feat/timeline-larry-slice-2-feature` for all subsequent tasks.

- [ ] **Step 1: Add the three new entries**

Edit `apps/web/src/lib/action-types.ts`, inside `ACTION_TYPE_MAP` (append before `other:`):

```ts
timeline_regroup:     { key: "timeline_regroup",     label: "Reorganise Timeline", color: "#6c44f6" },
timeline_categorise:  { key: "timeline_categorise",  label: "New Category",        color: "#6c44f6" },
timeline_recolour:    { key: "timeline_recolour",    label: "Category Colour",     color: "#6c44f6" },
```

- [ ] **Step 2: Smoke-check by calling `getActionTypeTag`**

Add a quick unit test at `apps/web/src/lib/action-types.test.ts` (create if missing):

```ts
import { describe, it, expect } from "vitest";
import { getActionTypeTag } from "./action-types";

describe("action-types map", () => {
  it("returns tags for timeline actions", () => {
    expect(getActionTypeTag("timeline_regroup").label).toBe("Reorganise Timeline");
    expect(getActionTypeTag("timeline_categorise").label).toBe("New Category");
    expect(getActionTypeTag("timeline_recolour").label).toBe("Category Colour");
  });
  it("falls back to other for unknown types", () => {
    expect(getActionTypeTag("nope").label).toBe("Other");
  });
});
```

Run: `npm --workspace apps/web exec -- vitest run src/lib/action-types.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/action-types.ts apps/web/src/lib/action-types.test.ts
git commit -m "feat(web): action-type tags for timeline_regroup / categorise / recolour"
```

---

## Task 11: Executor — skeleton, types, concurrency guard (TDD)

**Files:**
- Create: `apps/api/src/lib/timeline-suggestion-executor.ts`
- Create: `apps/api/src/lib/timeline-suggestion-executor.test.ts`

- [ ] **Step 1: Write the failing concurrency-guard test**

Create `timeline-suggestion-executor.test.ts` (copy the test-harness setup from any existing API test — `categories.test.ts` is the nearest analogue):

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { makeTestApp, createTenantFixture, createAdminUser, insertLarryEvent } from "../test/test-harness";
import { executeTimelineSuggestion } from "./timeline-suggestion-executor";

describe("executeTimelineSuggestion — concurrency guard", () => {
  let app: Awaited<ReturnType<typeof makeTestApp>>;
  let tenantId: string;
  let actorUserId: string;

  beforeEach(async () => {
    app = await makeTestApp();
    const t = await createTenantFixture(app);
    tenantId = t.tenantId;
    actorUserId = (await createAdminUser(app, tenantId)).id;
  });

  it("no-ops when the event is already accepted", async () => {
    const eventId = await insertLarryEvent(app, {
      tenantId, actionType: "timeline_regroup",
      eventType: "accepted", payload: {},
    });
    const result = await executeTimelineSuggestion(
      app, tenantId, eventId, { displayText: "x", reasoning: "x" }, actorUserId,
    );
    expect(result.skipped).toContainEqual({ reason: "already_resolved" });
    expect(result.applied).toEqual({ categories: 0, moves: 0, recolours: 0 });
  });

  it("throws when the event does not exist", async () => {
    await expect(
      executeTimelineSuggestion(
        app, tenantId, "00000000-0000-0000-0000-000000000000",
        { displayText: "x", reasoning: "x" }, actorUserId,
      ),
    ).rejects.toThrow(/not found/i);
  });
});
```

(Utility helpers `insertLarryEvent`, `createAdminUser` and `createTenantFixture` — if they don't yet exist in `apps/api/src/test/test-harness.ts`, add them now. They should be small.)

- [ ] **Step 2: Run to confirm failure**

Run: `npm --workspace apps/api exec -- vitest run src/lib/timeline-suggestion-executor.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the skeleton**

Create `apps/api/src/lib/timeline-suggestion-executor.ts`:

```ts
import type { FastifyInstance } from "fastify";

export interface TimelineRegroupPayload {
  displayText: string;
  reasoning: string;
  createCategories?: Array<{ tempId: string; name: string; colour: string }>;
  moveProjects?: Array<{ projectId: string; toCategoryTempId?: string; toCategoryId?: string }>;
  recolourCategories?: Array<{ categoryId: string; colour: string }>;
}

export interface ExecuteResult {
  applied: { categories: number; moves: number; recolours: number };
  skipped: Array<{ reason: string; projectId?: string; categoryId?: string }>;
}

export async function executeTimelineSuggestion(
  fastify: FastifyInstance,
  tenantId: string,
  eventId: string,
  payload: TimelineRegroupPayload,
  actorUserId: string,
): Promise<ExecuteResult> {
  return fastify.db.transactionTenant(tenantId, async (tx) => {
    // Concurrency guard — first statement in the transaction.
    const rows = await tx.queryTenant<{ id: string; eventType: string }>(
      tenantId,
      `SELECT id, event_type AS "eventType" FROM larry_events
        WHERE id = $1 AND tenant_id = $2
        FOR UPDATE`,
      [eventId, tenantId],
    );
    if (rows.length === 0) {
      throw new Error(`larry_events row ${eventId} not found for tenant ${tenantId}`);
    }
    if (rows[0].eventType !== "suggested") {
      return {
        applied: { categories: 0, moves: 0, recolours: 0 },
        skipped: [{ reason: "already_resolved" }],
      };
    }

    // Slices filled in by Tasks 12-14.
    const applied = { categories: 0, moves: 0, recolours: 0 };
    const skipped: ExecuteResult["skipped"] = [];

    // Mark the event accepted (moved into its own function in Task 14).
    await tx.queryTenant(tenantId,
      `UPDATE larry_events
          SET event_type = 'accepted',
              approved_by_user_id = $2,
              approved_at = NOW(),
              execution_mode = 'approval',
              executed_by_kind = 'user',
              executed_by_user_id = $2
        WHERE id = $1 AND tenant_id = $3`,
      [eventId, actorUserId, tenantId],
    );

    return { applied, skipped };
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --workspace apps/api exec -- vitest run src/lib/timeline-suggestion-executor.test.ts`
Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/timeline-suggestion-executor.ts apps/api/src/lib/timeline-suggestion-executor.test.ts
git commit -m "feat(api): timeline-suggestion executor skeleton with concurrency guard"
```

---

## Task 12: Executor — createCategories with tempId resolution

**Files:**
- Modify: `apps/api/src/lib/timeline-suggestion-executor.ts`
- Modify: `apps/api/src/lib/timeline-suggestion-executor.test.ts`

- [ ] **Step 1: Add failing test for happy-path category creation**

Append to `timeline-suggestion-executor.test.ts`:

```ts
describe("executeTimelineSuggestion — createCategories", () => {
  let app: Awaited<ReturnType<typeof makeTestApp>>;
  let tenantId: string;
  let actorUserId: string;

  beforeEach(async () => {
    app = await makeTestApp();
    const t = await createTenantFixture(app);
    tenantId = t.tenantId;
    actorUserId = (await createAdminUser(app, tenantId)).id;
  });

  it("inserts new categories and returns applied count", async () => {
    const eventId = await insertLarryEvent(app, {
      tenantId, actionType: "timeline_regroup",
      eventType: "suggested", payload: {},
    });
    const result = await executeTimelineSuggestion(
      app, tenantId, eventId,
      {
        displayText: "x", reasoning: "x",
        createCategories: [
          { tempId: "cat_a", name: "Customer Onboarding", colour: "#5fb4d3" },
          { tempId: "cat_b", name: "Internal Tooling",    colour: "#f5b143" },
        ],
      },
      actorUserId,
    );
    expect(result.applied.categories).toBe(2);
    const rows = await app.db.queryTenant(tenantId,
      `SELECT id, name, colour FROM project_categories
        WHERE tenant_id = $1 AND name IN ('Customer Onboarding', 'Internal Tooling')`,
      [tenantId]);
    expect(rows).toHaveLength(2);
  });

  it("reuses an existing category on unique-name collision", async () => {
    // Pre-create a category the suggestion will collide with.
    await app.db.queryTenant(tenantId,
      `INSERT INTO project_categories (tenant_id, name, colour) VALUES ($1, 'Existing', '#000000')`,
      [tenantId]);
    const eventId = await insertLarryEvent(app, {
      tenantId, actionType: "timeline_regroup",
      eventType: "suggested", payload: {},
    });
    const result = await executeTimelineSuggestion(
      app, tenantId, eventId,
      {
        displayText: "x", reasoning: "x",
        createCategories: [{ tempId: "cat_x", name: "Existing", colour: "#111111" }],
      },
      actorUserId,
    );
    expect(result.applied.categories).toBe(0);
    expect(result.skipped.some((s) => s.reason === "category_name_already_exists")).toBe(true);
  });
});
```

- [ ] **Step 2: Run to see both fail**

Run: `npm --workspace apps/api exec -- vitest run src/lib/timeline-suggestion-executor.test.ts`
Expected: FAIL — executor doesn't process `createCategories` yet.

- [ ] **Step 3: Implement category creation inside the executor**

Edit `timeline-suggestion-executor.ts`. Between the concurrency-guard block and the `UPDATE larry_events` block, insert:

```ts
const tempIdToRealId = new Map<string, string>();

for (const cat of payload.createCategories ?? []) {
  try {
    const [row] = await tx.queryTenant<{ id: string }>(tenantId,
      `INSERT INTO project_categories (tenant_id, name, colour)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [tenantId, cat.name, cat.colour],
    );
    tempIdToRealId.set(cat.tempId, row.id);
    applied.categories += 1;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (!/unique/i.test(msg)) throw e;
    const [existing] = await tx.queryTenant<{ id: string }>(tenantId,
      `SELECT id FROM project_categories
        WHERE tenant_id = $1 AND name = $2 AND parent_category_id IS NULL AND project_id IS NULL`,
      [tenantId, cat.name],
    );
    if (existing) {
      tempIdToRealId.set(cat.tempId, existing.id);
      skipped.push({ reason: "category_name_already_exists", categoryId: existing.id });
    } else {
      throw e;
    }
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm --workspace apps/api exec -- vitest run src/lib/timeline-suggestion-executor.test.ts`
Expected: PASS — 4 tests (2 prior + 2 new).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/timeline-suggestion-executor.ts apps/api/src/lib/timeline-suggestion-executor.test.ts
git commit -m "feat(api): executor creates categories with tempId map + collision reuse"
```

---

## Task 13: Executor — moveProjects with tempId and UUID resolution

**Files:**
- Modify: `apps/api/src/lib/timeline-suggestion-executor.ts`
- Modify: `apps/api/src/lib/timeline-suggestion-executor.test.ts`

- [ ] **Step 1: Failing tests — moveProjects happy and missing-project paths**

Append:

```ts
describe("executeTimelineSuggestion — moveProjects", () => {
  let app: Awaited<ReturnType<typeof makeTestApp>>;
  let tenantId: string;
  let actorUserId: string;

  beforeEach(async () => {
    app = await makeTestApp();
    const t = await createTenantFixture(app);
    tenantId = t.tenantId;
    actorUserId = (await createAdminUser(app, tenantId)).id;
  });

  it("moves projects to a tempId-resolved category in the same transaction", async () => {
    const p1 = await createProject({ tenantId, name: "P1" });
    const p2 = await createProject({ tenantId, name: "P2" });
    const eventId = await insertLarryEvent(app, {
      tenantId, actionType: "timeline_regroup",
      eventType: "suggested", payload: {},
    });
    const result = await executeTimelineSuggestion(
      app, tenantId, eventId,
      {
        displayText: "x", reasoning: "x",
        createCategories: [{ tempId: "cat_new", name: "Theme", colour: "#222222" }],
        moveProjects: [
          { projectId: p1.id, toCategoryTempId: "cat_new" },
          { projectId: p2.id, toCategoryTempId: "cat_new" },
        ],
      },
      actorUserId,
    );
    expect(result.applied.moves).toBe(2);
    const rows = await app.db.queryTenant(tenantId,
      `SELECT id, category_id FROM projects WHERE id IN ($1, $2)`,
      [p1.id, p2.id]);
    expect(rows.every((r: { category_id: string }) => r.category_id)).toBe(true);
  });

  it("skips missing project ids", async () => {
    const eventId = await insertLarryEvent(app, {
      tenantId, actionType: "timeline_regroup",
      eventType: "suggested", payload: {},
    });
    const fakeId = "00000000-0000-0000-0000-000000000aaa";
    const result = await executeTimelineSuggestion(
      app, tenantId, eventId,
      {
        displayText: "x", reasoning: "x",
        moveProjects: [{ projectId: fakeId, toCategoryId: "00000000-0000-0000-0000-000000000bbb" }],
      },
      actorUserId,
    );
    expect(result.applied.moves).toBe(0);
    expect(result.skipped).toContainEqual(
      expect.objectContaining({ reason: "project_not_found", projectId: fakeId }),
    );
  });
});
```

- [ ] **Step 2: Run to see failure**

Run: `npm --workspace apps/api exec -- vitest run src/lib/timeline-suggestion-executor.test.ts`
Expected: FAIL — moveProjects path not implemented.

- [ ] **Step 3: Implement moveProjects in the executor**

Insert after the `createCategories` loop, before the `UPDATE larry_events` block:

```ts
for (const mv of payload.moveProjects ?? []) {
  const targetCategoryId =
    mv.toCategoryTempId ? tempIdToRealId.get(mv.toCategoryTempId) :
    mv.toCategoryId ?? null;
  if (mv.toCategoryTempId && !targetCategoryId) {
    skipped.push({ reason: "category_tempid_not_resolved", categoryId: mv.toCategoryTempId });
    continue;
  }
  const upd = await tx.queryTenant(tenantId,
    `UPDATE projects SET category_id = $1 WHERE id = $2 AND tenant_id = $3`,
    [targetCategoryId ?? null, mv.projectId, tenantId],
  );
  // queryTenant on a pg pool returns an array of rows; pg's driver attaches
  // rowCount on the raw result. The project-scoped helper should expose it as
  // `affectedRowCount`. If it doesn't: run a SELECT pre-check instead.
  const [existing] = await tx.queryTenant<{ id: string }>(tenantId,
    `SELECT id FROM projects WHERE id = $1 AND tenant_id = $2`,
    [mv.projectId, tenantId],
  );
  if (!existing) {
    skipped.push({ reason: "project_not_found", projectId: mv.projectId });
  } else {
    applied.moves += 1;
  }
}
```

Note: the comment about `affectedRowCount` handles the likely case that `queryTenant` doesn't return rowcount; using a pre-SELECT for existence keeps the plan robust across drivers. If the driver DOES expose it, simplify at PR time.

- [ ] **Step 4: Run tests**

Run: `npm --workspace apps/api exec -- vitest run src/lib/timeline-suggestion-executor.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/timeline-suggestion-executor.ts apps/api/src/lib/timeline-suggestion-executor.test.ts
git commit -m "feat(api): executor applies project moves with tempId/UUID resolution"
```

---

## Task 14: Executor — recolourCategories + audit log

**Files:**
- Modify: `apps/api/src/lib/timeline-suggestion-executor.ts`
- Modify: `apps/api/src/lib/timeline-suggestion-executor.test.ts`

- [ ] **Step 1: Failing test**

Append:

```ts
describe("executeTimelineSuggestion — recolourCategories", () => {
  let app: Awaited<ReturnType<typeof makeTestApp>>;
  let tenantId: string;
  let actorUserId: string;

  beforeEach(async () => {
    app = await makeTestApp();
    const t = await createTenantFixture(app);
    tenantId = t.tenantId;
    actorUserId = (await createAdminUser(app, tenantId)).id;
  });

  it("updates colour on an existing category", async () => {
    const [{ id: catId }] = await app.db.queryTenant<{ id: string }>(tenantId,
      `INSERT INTO project_categories (tenant_id, name, colour) VALUES ($1, 'X', '#000000') RETURNING id`,
      [tenantId]);
    const eventId = await insertLarryEvent(app, {
      tenantId, actionType: "timeline_recolour",
      eventType: "suggested", payload: {},
    });
    const result = await executeTimelineSuggestion(
      app, tenantId, eventId,
      { displayText: "x", reasoning: "x",
        recolourCategories: [{ categoryId: catId, colour: "#abcdef" }] },
      actorUserId,
    );
    expect(result.applied.recolours).toBe(1);
    const [row] = await app.db.queryTenant<{ colour: string }>(tenantId,
      `SELECT colour FROM project_categories WHERE id = $1`, [catId]);
    expect(row.colour).toBe("#abcdef");
  });

  it("skips missing categories", async () => {
    const eventId = await insertLarryEvent(app, {
      tenantId, actionType: "timeline_recolour",
      eventType: "suggested", payload: {},
    });
    const result = await executeTimelineSuggestion(
      app, tenantId, eventId,
      { displayText: "x", reasoning: "x",
        recolourCategories: [{ categoryId: "00000000-0000-0000-0000-000000000000", colour: "#fff000" }] },
      actorUserId,
    );
    expect(result.applied.recolours).toBe(0);
    expect(result.skipped).toContainEqual(
      expect.objectContaining({ reason: "category_not_found" }),
    );
  });
});
```

- [ ] **Step 2: Run to see failure**

Run: `npm --workspace apps/api exec -- vitest run src/lib/timeline-suggestion-executor.test.ts`
Expected: FAIL on the new tests.

- [ ] **Step 3: Implement recolourCategories**

In the executor, after the `moveProjects` loop, insert:

```ts
for (const rc of payload.recolourCategories ?? []) {
  const [existing] = await tx.queryTenant<{ id: string }>(tenantId,
    `SELECT id FROM project_categories WHERE id = $1 AND tenant_id = $2`,
    [rc.categoryId, tenantId],
  );
  if (!existing) {
    skipped.push({ reason: "category_not_found", categoryId: rc.categoryId });
    continue;
  }
  await tx.queryTenant(tenantId,
    `UPDATE project_categories SET colour = $1 WHERE id = $2 AND tenant_id = $3`,
    [rc.colour, rc.categoryId, tenantId],
  );
  applied.recolours += 1;
}
```

- [ ] **Step 4: Add audit-log writes**

At the top of the executor, import:

```ts
import { writeAuditLog } from "./audit.js";
```

After each of the three application loops (categories, moves, recolours), when `applied.*` is incremented, also call:

```ts
await writeAuditLog(tx, tenantId, actorUserId, {
  sourceKind: "larry_suggestion",
  sourceRecordId: eventId,
  action: "timeline_regroup.category_created",  // or moved / recoloured
  targetId: row.id,  // or mv.projectId / rc.categoryId
});
```

(Check `writeAuditLog` signature in `apps/api/src/lib/audit.ts` — adjust parameters to match.)

- [ ] **Step 5: Run full executor suite**

Run: `npm --workspace apps/api exec -- vitest run src/lib/timeline-suggestion-executor.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/lib/timeline-suggestion-executor.ts apps/api/src/lib/timeline-suggestion-executor.test.ts
git commit -m "feat(api): executor recolours categories + writes audit log"
```

---

## Task 15: AI tool definition — proposeTimelineRegroup

**Files:**
- Create: `packages/ai/src/timeline-tools.ts`
- Create: `packages/ai/src/timeline-tools.test.ts`

- [ ] **Step 1: Failing tests — schema validation**

Create `packages/ai/src/timeline-tools.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { TimelineRegroupArgsSchema } from "./timeline-tools";

describe("TimelineRegroupArgsSchema", () => {
  it("accepts a valid payload with all three kinds of change", () => {
    const parsed = TimelineRegroupArgsSchema.parse({
      displayText: "Group 4 projects under Customer Onboarding",
      reasoning: "Four projects share onboarding signals from last month's meetings",
      createCategories: [{ tempId: "cat_a1", name: "Customer Onboarding", colour: "#5fb4d3" }],
      moveProjects: [
        { projectId: "00000000-0000-0000-0000-000000000001", toCategoryTempId: "cat_a1" },
      ],
      recolourCategories: [
        { categoryId: "00000000-0000-0000-0000-000000000002", colour: "#111111" },
      ],
    });
    expect(parsed.createCategories).toHaveLength(1);
  });

  it("rejects more than 10 moveProjects", () => {
    const moves = Array.from({ length: 11 }, (_, i) => ({
      projectId: `00000000-0000-0000-0000-00000000000${i % 10}`.padEnd(36, "0"),
      toCategoryId: "00000000-0000-0000-0000-000000000aaa",
    }));
    const r = TimelineRegroupArgsSchema.safeParse({
      displayText: "x".repeat(20), reasoning: "y".repeat(40), moveProjects: moves,
    });
    expect(r.success).toBe(false);
  });

  it("rejects empty payload (no changes)", () => {
    const r = TimelineRegroupArgsSchema.safeParse({
      displayText: "x".repeat(20), reasoning: "y".repeat(40),
    });
    expect(r.success).toBe(false);
  });

  it("rejects when moveProjects has both toCategoryTempId AND toCategoryId", () => {
    const r = TimelineRegroupArgsSchema.safeParse({
      displayText: "x".repeat(20), reasoning: "y".repeat(40),
      moveProjects: [{
        projectId: "00000000-0000-0000-0000-000000000001",
        toCategoryTempId: "cat_x",
        toCategoryId:     "00000000-0000-0000-0000-000000000aaa",
      }],
    });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to see failure**

Run: `npm --workspace @larry/ai exec -- vitest run src/timeline-tools.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the tool**

Create `packages/ai/src/timeline-tools.ts`:

```ts
import { tool } from "ai";
import { z } from "zod";
import type { FastifyInstance } from "fastify";

export const TimelineRegroupArgsSchema = z.object({
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
    }).refine((v) =>
      (v.toCategoryTempId == null) !== (v.toCategoryId == null),
      "exactly one of toCategoryTempId / toCategoryId required",
    ))
    .max(10)
    .optional(),
  recolourCategories: z
    .array(z.object({
      categoryId: z.string().uuid(),
      colour: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    }))
    .max(10)
    .optional(),
}).refine((v) =>
  (v.createCategories?.length ?? 0)
  + (v.moveProjects?.length ?? 0)
  + (v.recolourCategories?.length ?? 0) >= 1,
  "At least one change is required"
);

export type TimelineRegroupArgs = z.infer<typeof TimelineRegroupArgsSchema>;

export interface TimelineToolContext {
  fastify: FastifyInstance;
  tenantId: string;
}

export function buildProposeTimelineRegroupTool(ctx: TimelineToolContext) {
  return tool({
    description:
      "Propose grouping projects under new or existing categories, with optional colour " +
      "assignments. Only call when 3+ projects share strong signals (meeting transcripts, " +
      "task-title patterns, shared stakeholders). Do NOT call if a similar timeline_regroup " +
      "suggestion is already pending — the list of pending suggestions is provided in the " +
      "system prompt under pendingTimelineSuggestions.",
    parameters: TimelineRegroupArgsSchema,
    execute: async (args) => {
      const [row] = await ctx.fastify.db.queryTenant<{ id: string }>(
        ctx.tenantId,
        `INSERT INTO larry_events
           (tenant_id, project_id, event_type, action_type, display_text, reasoning,
            payload, triggered_by, execution_mode, source_kind)
         VALUES ($1, NULL, 'suggested', 'timeline_regroup', $2, $3, $4::jsonb,
                 'schedule', 'approval', 'schedule')
         RETURNING id`,
        [ctx.tenantId, args.displayText, args.reasoning, JSON.stringify(args)],
      );
      return { eventId: row.id, status: "pending" as const };
    },
  });
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm --workspace @larry/ai exec -- vitest run src/timeline-tools.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/timeline-tools.ts packages/ai/src/timeline-tools.test.ts
git commit -m "feat(ai): proposeTimelineRegroup tool with Zod-validated payload"
```

---

## Task 16: Org-wide intelligence pass

**Files:**
- Create: `packages/ai/src/org-intelligence.ts`
- Create: `packages/ai/src/org-intelligence.test.ts`

- [ ] **Step 1: Write the context-builder failing test**

Create `packages/ai/src/org-intelligence.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildOrgTimelineContext, shouldRunOrgPass } from "./org-intelligence";

describe("buildOrgTimelineContext", () => {
  it("compresses categories + projects into a tabular format", () => {
    const ctx = buildOrgTimelineContext({
      tenantId: "t",
      categories: [
        { id: "c1", name: "A", colour: "#fff", parentCategoryId: null, projectId: null, createdAt: "", lastRenamedAt: null },
      ],
      projects: [
        { id: "p1", name: "P1", categoryId: "c1", status: "active", createdAt: "" },
      ],
      recentSignals: [],
      pendingTimelineSuggestions: [],
    });
    expect(ctx).toMatch(/c1\|A/);
    expect(ctx).toMatch(/p1\|P1\|c1/);
  });

  it("truncates recentSignals to 20 × 200 chars", () => {
    const signals = Array.from({ length: 30 }, (_, i) => ({
      projectId: "p",
      source: "email",
      excerpt: "x".repeat(400) + "_" + i,
    }));
    const ctx = buildOrgTimelineContext({
      tenantId: "t", categories: [], projects: [],
      recentSignals: signals, pendingTimelineSuggestions: [],
    });
    const signalLines = ctx.split("\n").filter((l) => l.startsWith("signal|"));
    expect(signalLines).toHaveLength(20);
    for (const line of signalLines) expect(line.length).toBeLessThanOrEqual(250);
  });
});

describe("shouldRunOrgPass", () => {
  it("skips when 3 or more pending timeline suggestions already exist", () => {
    expect(shouldRunOrgPass({ pendingCount: 3, lastRunMinutesAgo: 120 })).toBe(false);
    expect(shouldRunOrgPass({ pendingCount: 4, lastRunMinutesAgo: 120 })).toBe(false);
  });
  it("skips when the last run was less than an hour ago", () => {
    expect(shouldRunOrgPass({ pendingCount: 0, lastRunMinutesAgo: 30 })).toBe(false);
    expect(shouldRunOrgPass({ pendingCount: 0, lastRunMinutesAgo: 60 })).toBe(true);
  });
});
```

- [ ] **Step 2: Implement**

Create `packages/ai/src/org-intelligence.ts`:

```ts
import type { FastifyInstance } from "fastify";
import { generateText } from "ai";
import { createModel } from "./provider.js";
import { buildProposeTimelineRegroupTool } from "./timeline-tools.js";

export interface OrgTimelineContextInput {
  tenantId: string;
  categories: Array<{
    id: string; name: string; colour: string | null;
    parentCategoryId: string | null; projectId: string | null;
    createdAt: string; lastRenamedAt: string | null;
  }>;
  projects: Array<{
    id: string; name: string; categoryId: string | null;
    status: string; createdAt: string;
  }>;
  recentSignals: Array<{ projectId: string; source: string; excerpt: string }>;
  pendingTimelineSuggestions: string[];
}

// Pipe-separated tabular format: cheap to tokenise, easy for Larry to parse.
// Keeps context under ~2k tokens for a workspace with up to 200 projects.
export function buildOrgTimelineContext(input: OrgTimelineContextInput): string {
  const lines: string[] = [];
  lines.push("# Categories (id|name|parentId|projectScope)");
  for (const c of input.categories) {
    lines.push(`cat|${c.id}|${c.name}|${c.parentCategoryId ?? ""}|${c.projectId ?? ""}`);
  }
  lines.push("");
  lines.push("# Projects (id|name|categoryId|status)");
  for (const p of input.projects) {
    lines.push(`proj|${p.id}|${p.name}|${p.categoryId ?? ""}|${p.status}`);
  }
  lines.push("");
  lines.push("# Recent signals (projectId|source|excerpt<=200)");
  for (const s of input.recentSignals.slice(0, 20)) {
    const excerpt = s.excerpt.slice(0, 200).replace(/\|/g, "/");
    lines.push(`signal|${s.projectId}|${s.source}|${excerpt}`);
  }
  lines.push("");
  lines.push("# Pending timeline suggestions — DO NOT duplicate");
  for (const t of input.pendingTimelineSuggestions.slice(0, 10)) {
    lines.push(`pending|${t}`);
  }
  return lines.join("\n");
}

export interface OrgPassGateInput {
  pendingCount: number;
  lastRunMinutesAgo: number;
}
export function shouldRunOrgPass(g: OrgPassGateInput): boolean {
  if (g.pendingCount >= 3) return false;
  if (g.lastRunMinutesAgo < 60) return false;
  return true;
}

export const ORG_TIMELINE_SYSTEM_PROMPT = `
You are Larry, a senior PM. You're running the org-wide timeline pass, whose
only purpose is to notice opportunities to reorganise the workspace's timeline.
Available tool: proposeTimelineRegroup.

Call the tool AT MOST ONCE per pass. Trigger it when:
- 3+ uncategorised or loosely-grouped projects share a theme (customer, product
  area, quarter, stakeholder).
- An existing category's projects split into two clear sub-themes.
- A category uses the default Larry purple when it's meaningful enough to
  deserve its own colour, or two categories share the exact same colour.

Do NOT call the tool when:
- Fewer than 3 projects would change.
- A similar pending suggestion already exists (see pendingTimelineSuggestions).
- The signal is weak — do nothing rather than guess.
`;

export async function runOrgIntelligencePass(args: {
  fastify: FastifyInstance;
  tenantId: string;
  context: OrgTimelineContextInput;
}): Promise<{ toolCallMade: boolean }> {
  const contextBlock = buildOrgTimelineContext(args.context);
  const regroupTool = buildProposeTimelineRegroupTool({
    fastify: args.fastify, tenantId: args.tenantId,
  });

  const result = await generateText({
    model: createModel(),
    system: ORG_TIMELINE_SYSTEM_PROMPT,
    prompt: `Workspace snapshot:\n${contextBlock}`,
    tools: { proposeTimelineRegroup: regroupTool },
    maxTokens: 4_000,
  });

  return { toolCallMade: result.toolCalls.length > 0 };
}
```

- [ ] **Step 3: Run tests**

Run: `npm --workspace @larry/ai exec -- vitest run src/org-intelligence.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 4: Commit**

```bash
git add packages/ai/src/org-intelligence.ts packages/ai/src/org-intelligence.test.ts
git commit -m "feat(ai): org-wide intelligence pass + context builder"
```

---

## Task 17: Wire org pass into the scheduler

**Files:**
- Modify: `apps/worker/src/**` (find the scheduler entry — likely `apps/worker/src/index.ts` or a `jobs/*.ts`)
- Create: rate-limit table migration if needed

- [ ] **Step 1: Locate the scheduler entry**

Run: `grep -rln "runIntelligence\|scan.*run\|scan.*schedule" apps/worker/src`

Identify the main scheduler loop. Read the file and find where per-project scans fan out.

- [ ] **Step 2: Add an org pass branch**

After the per-project scan loop, add:

```ts
const pending = await fastify.db.queryTenant<{ count: string }>(tenantId,
  `SELECT count(*)::text FROM larry_events
    WHERE tenant_id = $1 AND action_type LIKE 'timeline\\_%' ESCAPE '\\'
      AND event_type = 'suggested'`,
  [tenantId]);
const pendingCount = Number(pending[0]?.count ?? 0);

const [lastRun] = await fastify.db.queryTenant<{ minutesAgo: number | null }>(tenantId,
  `SELECT EXTRACT(EPOCH FROM (NOW() - last_run_at))::int / 60 AS "minutesAgo"
     FROM larry_org_scan_runs WHERE tenant_id = $1`,
  [tenantId]);
const lastRunMinutesAgo = lastRun?.minutesAgo ?? Number.POSITIVE_INFINITY;

if (shouldRunOrgPass({ pendingCount, lastRunMinutesAgo })) {
  const orgCtx = await loadOrgTimelineContext(fastify, tenantId);  // helper added below
  await runOrgIntelligencePass({ fastify, tenantId, context: orgCtx });
  await fastify.db.queryTenant(tenantId,
    `INSERT INTO larry_org_scan_runs (tenant_id, last_run_at)
     VALUES ($1, NOW())
     ON CONFLICT (tenant_id) DO UPDATE SET last_run_at = NOW()`,
    [tenantId]);
}
```

- [ ] **Step 3: Add the rate-limit table migration**

Create `packages/db/src/migrations/028_larry_org_scan_runs.sql`:

```sql
BEGIN;
CREATE TABLE IF NOT EXISTS larry_org_scan_runs (
  tenant_id    UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  last_run_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMIT;
```

Append equivalent CREATE TABLE to `schema.sql` after the other Larry tables (around line 1151).

- [ ] **Step 4: Create loadOrgTimelineContext helper**

In `packages/ai/src/org-intelligence.ts`, add:

```ts
export async function loadOrgTimelineContext(
  fastify: FastifyInstance,
  tenantId: string,
): Promise<OrgTimelineContextInput> {
  const [categories, projects, pending, signals] = await Promise.all([
    fastify.db.queryTenant(tenantId,
      `SELECT id, name, colour,
              parent_category_id AS "parentCategoryId",
              project_id         AS "projectId",
              created_at::text   AS "createdAt",
              NULL::text         AS "lastRenamedAt"
         FROM project_categories WHERE tenant_id = $1`, [tenantId]),
    fastify.db.queryTenant(tenantId,
      `SELECT id, name, category_id AS "categoryId", status,
              created_at::text AS "createdAt"
         FROM projects WHERE tenant_id = $1`, [tenantId]),
    fastify.db.queryTenant<{ displayText: string }>(tenantId,
      `SELECT display_text AS "displayText" FROM larry_events
        WHERE tenant_id = $1
          AND action_type LIKE 'timeline\\_%' ESCAPE '\\'
          AND event_type = 'suggested'
        ORDER BY created_at DESC LIMIT 10`, [tenantId]),
    fastify.db.queryTenant(tenantId,
      `SELECT project_id AS "projectId", source_kind AS source, content AS excerpt
         FROM project_signals WHERE tenant_id = $1
        ORDER BY created_at DESC LIMIT 20`, [tenantId]),
  ]);
  return {
    tenantId,
    categories: categories as OrgTimelineContextInput["categories"],
    projects: projects as OrgTimelineContextInput["projects"],
    recentSignals: signals as OrgTimelineContextInput["recentSignals"],
    pendingTimelineSuggestions: pending.map((r) => r.displayText),
  };
}
```

(If `project_signals` isn't the right table name — grep for where the per-project scan sources signals — substitute.)

- [ ] **Step 5: Migrate + restart worker**

```bash
npm --workspace @larry/db run migrate
# restart worker
```

- [ ] **Step 6: Commit**

```bash
git add apps/worker packages/ai/src/org-intelligence.ts packages/db/src/migrations/028_larry_org_scan_runs.sql packages/db/src/schema.sql
git commit -m "feat(worker): org-wide timeline intelligence pass in scheduler"
```

---

## Task 18: Intelligence system prompt — reference the org pass

**Files:**
- Modify: `packages/ai/src/intelligence.ts`

- [ ] **Step 1: Locate the system prompt**

Open `packages/ai/src/intelligence.ts` at line 202 where "You are Larry" starts.

- [ ] **Step 2: Add a small note that org-scope changes happen elsewhere**

Append to the system prompt block:

```
# Note on timeline organisation

You cannot call the proposeTimelineRegroup tool from this per-project context —
timeline reorganisation runs in a separate org-wide pass. In the per-project
context, focus on the current project only.
```

This prevents Larry from trying to reach for a tool that isn't in scope here.

- [ ] **Step 3: Run existing intelligence tests**

Run: `npm --workspace @larry/ai exec -- vitest run`
Expected: all pre-existing pass.

- [ ] **Step 4: Commit**

```bash
git add packages/ai/src/intelligence.ts
git commit -m "feat(ai): per-project prompt notes that timeline tools live in org pass"
```

---

## Task 19: Accept handler dispatch + RBAC

**Files:**
- Modify: `apps/api/src/routes/v1/larry.ts`

- [ ] **Step 1: Locate the existing accept handler**

Run: `grep -n "accept\|event_type.*=.*'accepted'\|approved_by" apps/api/src/routes/v1/larry.ts`

Read the handler to understand the event shape it loads.

- [ ] **Step 2: Add the dispatch branch**

Near the top of the handler (just after the event is loaded and before the default execution path), add:

```ts
if (typeof event.actionType === "string" && event.actionType.startsWith("timeline_")) {
  const role = request.user.role;
  if (!["owner", "admin", "pm"].includes(role)) {
    return reply.code(403).send({
      message: "Only owners, admins, and PMs can apply timeline reorganisations.",
    });
  }
  const parsed = TimelineRegroupArgsSchema.parse(event.payload);
  const result = await executeTimelineSuggestion(
    fastify,
    request.user.tenantId,
    event.id,
    parsed,
    request.user.id,
  );
  return reply.send({ ok: true, result });
}
```

Add imports at top:

```ts
import { TimelineRegroupArgsSchema } from "@larry/ai/timeline-tools";
import { executeTimelineSuggestion } from "../../lib/timeline-suggestion-executor.js";
```

(If `@larry/ai` doesn't re-export from subpath, add the re-export in `packages/ai/src/index.ts`: `export * from "./timeline-tools";`.)

- [ ] **Step 3: Apply the same RBAC to dismiss**

Find the dismiss handler in the same file; add the identical role gate.

- [ ] **Step 4: Test manually**

```bash
npm run api:dev
```

Insert a mock suggestion:

```sql
INSERT INTO larry_events
  (tenant_id, project_id, event_type, action_type, display_text, reasoning, payload, triggered_by)
VALUES
  ('<tenant uuid>', NULL, 'suggested', 'timeline_regroup',
   'Test regroup', 'Test reasoning',
   '{"displayText":"Test regroup","reasoning":"Test reasoning","createCategories":[{"tempId":"cat_test","name":"Test Theme","colour":"#123456"}]}'::jsonb,
   'schedule');
```

POST to the accept endpoint with an admin user — expect 200 + category created. POST with a member user — expect 403.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/v1/larry.ts packages/ai/src/index.ts
git commit -m "feat(api): accept/dismiss dispatch timeline_* to executor with RBAC"
```

---

## Task 20: TimelineSuggestionPreview component

**Files:**
- Create: `apps/web/src/components/workspace/TimelineSuggestionPreview.tsx`
- Create: `apps/web/src/components/workspace/TimelineSuggestionPreview.test.tsx`

- [ ] **Step 1: Write failing component tests**

Create `TimelineSuggestionPreview.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TimelineSuggestionPreview } from "./TimelineSuggestionPreview";
import type { WorkspaceLarryEvent } from "@/app/dashboard/types";

const baseEvent: WorkspaceLarryEvent = {
  id: "e1", projectId: null as unknown as string, eventType: "suggested",
  actionType: "timeline_regroup",
  displayText: "Group 3 projects under Customer Onboarding",
  reasoning: "They share onboarding signals from last month.",
  payload: {
    displayText: "Group 3 projects under Customer Onboarding",
    reasoning: "They share onboarding signals from last month.",
    createCategories: [{ tempId: "cat_a", name: "Customer Onboarding", colour: "#5fb4d3" }],
    moveProjects: [
      { projectId: "p1", toCategoryTempId: "cat_a" },
      { projectId: "p2", toCategoryTempId: "cat_a" },
      { projectId: "p3", toCategoryTempId: "cat_a" },
    ],
  },
  createdAt: "2026-04-19T00:00:00Z",
  // other required fields — fill to match WorkspaceLarryEvent
} as unknown as WorkspaceLarryEvent;

describe("TimelineSuggestionPreview", () => {
  it("renders the suggested category name and colour swatch", () => {
    render(<TimelineSuggestionPreview event={baseEvent} />);
    expect(screen.getByText("Customer Onboarding")).toBeInTheDocument();
  });

  it("summarises the number of projects moved", () => {
    render(<TimelineSuggestionPreview event={baseEvent} />);
    expect(screen.getByText(/3 projects/i)).toBeInTheDocument();
  });

  it("shows the reasoning text", () => {
    render(<TimelineSuggestionPreview event={baseEvent} />);
    expect(screen.getByText(/onboarding signals/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npm --workspace apps/web exec -- vitest run src/components/workspace/TimelineSuggestionPreview.test.tsx`
Expected: FAIL — component missing.

- [ ] **Step 3: Implement the component**

Create `TimelineSuggestionPreview.tsx`:

```tsx
"use client";
import type { WorkspaceLarryEvent } from "@/app/dashboard/types";
import { CategoryDot } from "@/components/workspace/gantt/CategoryDot";

interface TimelinePayload {
  displayText: string;
  reasoning: string;
  createCategories?: Array<{ tempId: string; name: string; colour: string }>;
  moveProjects?: Array<{ projectId: string; toCategoryTempId?: string; toCategoryId?: string }>;
  recolourCategories?: Array<{ categoryId: string; colour: string }>;
}

export function TimelineSuggestionPreview({ event }: { event: WorkspaceLarryEvent }) {
  const payload = event.payload as unknown as TimelinePayload;
  const newCats = payload.createCategories ?? [];
  const moves = payload.moveProjects ?? [];
  const recolours = payload.recolourCategories ?? [];

  const movesByCatTemp = new Map<string, number>();
  for (const m of moves) {
    const key = m.toCategoryTempId ?? m.toCategoryId ?? "unknown";
    movesByCatTemp.set(key, (movesByCatTemp.get(key) ?? 0) + 1);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <p style={{ fontSize: 13, color: "var(--text-2)", margin: 0 }}>{event.reasoning}</p>

      {newCats.length > 0 && (
        <section>
          <h4 style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase",
                       letterSpacing: 1, margin: 0, marginBottom: 8, color: "var(--text-muted)" }}>
            New categories
          </h4>
          {newCats.map((c) => (
            <div key={c.tempId}
                 style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
              <CategoryDot colour={c.colour} />
              <span style={{ fontSize: 13, fontWeight: 500 }}>{c.name}</span>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {movesByCatTemp.get(c.tempId) ?? 0} projects
              </span>
            </div>
          ))}
        </section>
      )}

      {moves.length > 0 && (
        <section>
          <h4 style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase",
                       letterSpacing: 1, margin: 0, marginBottom: 4, color: "var(--text-muted)" }}>
            Project moves
          </h4>
          <p style={{ fontSize: 13, margin: 0 }}>
            {moves.length} {moves.length === 1 ? "project" : "projects"} will be moved.
          </p>
        </section>
      )}

      {recolours.length > 0 && (
        <section>
          <h4 style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase",
                       letterSpacing: 1, margin: 0, marginBottom: 4, color: "var(--text-muted)" }}>
            Colour changes
          </h4>
          <p style={{ fontSize: 13, margin: 0 }}>
            {recolours.length} {recolours.length === 1 ? "category" : "categories"} will be recoloured.
          </p>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

Run: `npm --workspace apps/web exec -- vitest run src/components/workspace/TimelineSuggestionPreview.test.tsx`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/workspace/TimelineSuggestionPreview.tsx apps/web/src/components/workspace/TimelineSuggestionPreview.test.tsx
git commit -m "feat(web): TimelineSuggestionPreview renders regroup diffs"
```

---

## Task 21: Route the preview into ActionDetailPreview

**Files:**
- Modify: `apps/web/src/components/workspace/ActionDetailPreview.tsx`

- [ ] **Step 1: Add the dispatch branch**

Open `ActionDetailPreview.tsx`. Inside the component function, at the top (before the existing branch logic), add:

```tsx
if (typeof event.actionType === "string" && event.actionType.startsWith("timeline_")) {
  return <TimelineSuggestionPreview event={event} />;
}
```

Add the import at the top of the file:

```tsx
import { TimelineSuggestionPreview } from "./TimelineSuggestionPreview";
```

- [ ] **Step 2: Type-check**

Run: `npm --workspace apps/web exec -- tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/workspace/ActionDetailPreview.tsx
git commit -m "feat(web): ActionDetailPreview routes timeline_* to dedicated preview"
```

---

## Task 22: Invalidate timeline caches on accept

**Files:**
- Modify: `apps/web/src/hooks/useLarryActionCentre.ts`

- [ ] **Step 1: Locate the accept mutation**

Open `useLarryActionCentre.ts`. Find the mutation that POSTs to the accept endpoint.

- [ ] **Step 2: Extend the onSuccess handler**

Inside the `onSuccess` callback of the accept mutation (before any existing invalidations), add:

```ts
const acceptedEvent = /* the event from the mutation variables */ ;
if (typeof acceptedEvent?.actionType === "string"
    && acceptedEvent.actionType.startsWith("timeline_")) {
  void qc.invalidateQueries({ queryKey: ["timeline", "org"] });
}
```

(If the mutation's variables don't include the event, either pass the full event in or check the response payload's shape.)

- [ ] **Step 3: Manual verification on dev**

With the dev suggestion inserted earlier, accept it via the UI. Navigate back to `/workspace/timeline` — confirm the new category is visible immediately, no hard refresh needed.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/hooks/useLarryActionCentre.ts
git commit -m "feat(web): invalidate timeline snapshot after timeline_* accept"
```

---

## Task 23: NotificationBell verification

**Files:**
- Read only: `apps/web/src/app/workspace/NotificationBell.tsx`

- [ ] **Step 1: Read the component**

Confirm it doesn't filter by `actionType` in a way that excludes the new types.

- [ ] **Step 2: If it filters by action type:**

Extend the whitelist to include `timeline_regroup`, `timeline_categorise`, `timeline_recolour`.

- [ ] **Step 3: Manual verification**

With the suggestion inserted earlier still `event_type='suggested'`, refresh `/workspace` — banner should appear with the `display_text`.

- [ ] **Step 4: Commit (if changed)**

```bash
git add apps/web/src/app/workspace/NotificationBell.tsx
git commit -m "feat(web): NotificationBell passes timeline_* actions through"
```

---

## Task 24: E2E test on prod preview

**Files:** (no code — validation)

- [ ] **Step 1: Push branch and get Vercel preview URL**

```bash
git push -u origin feat/timeline-larry-slice-2-feature
gh pr create --title "Slice 2: Larry timeline tools" --body-file - <<'EOF'
## Summary
- proposeTimelineRegroup tool emits suggestions into larry_events
- Org-wide intelligence pass, rate-limited to once/hour/tenant, skipped if 3+ pending
- Transactional executor with SELECT FOR UPDATE, tempId resolution, partial-apply, audit
- Accept/dismiss gated by owner/admin/pm role
- TimelineSuggestionPreview in Action Centre + banner
Spec: docs/superpowers/specs/2026-04-19-timeline-larry-integration-design.md §2
## Test plan
- [x] AI tool Zod schema: 4 unit tests
- [x] Executor: 8 unit tests
- [x] Org context builder: 4 unit tests
- [x] Preview component: 3 unit tests
- [x] Accept handler RBAC: manual dev verification
- [ ] Reviewer E2E on preview: see body below
🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
```

- [ ] **Step 2: Preview-URL E2E via Playwright MCP (BotID-safe per memory)**

Using the Playwright MCP server in this Claude Code session, drive:

```
1. Navigate to <preview-url>/login
2. Log in as launch-test-2026@larry-pm.com
3. Open SQL console on Railway preview DB and insert a seed suggestion
   for the test user's tenant (use the INSERT from Task 19 Step 4).
4. Navigate to /workspace — assert NotificationBell banner text matches displayText.
5. Click the banner → lands on /workspace/actions with the suggestion open
   in the preview pane.
6. Assert the preview shows the category name + project count.
7. Click Accept — assert success toast.
8. Navigate to /workspace/timeline — assert the new category exists and the
   projects are under it.
```

- [ ] **Step 3: Write-up the manual runbook into `docs/reports/2026-04-19-slice-2-e2e.md` with screenshots**

Capture before/after screenshots of:
- The banner
- The preview pane
- The timeline post-accept

---

## Task 25: Merge, deploy, and monitor

**Files:** (none)

- [ ] **Step 1: Merge the PR after review**

- [ ] **Step 2: Monitor Railway deploy logs for migration 027 idempotency + no errors**

- [ ] **Step 3: Monitor Vercel deploy**

- [ ] **Step 4: Insert a real seed suggestion on prod and accept it as owner**

Verify the full flow end-to-end on production. Record the five metrics from spec §2.13 (suggested, accepted, dismissed, rollback, skipped counters) show up in the logs.

- [ ] **Step 5: Update memory**

Add a `larry-timeline-larry-integration-shipped.md` memory entry noting which PRs shipped, migration number, and the known design follow-ups from spec §6 that are still open.

---

# Appendix — Spec traceability

| Spec section | Tasks |
|---|---|
| §1.1 Description field | Task 5, 6 |
| §1.2 Shared-hook cache | Tasks 2, 3, 4 |
| §1.3 Shared types | Task 1 |
| §1.4 Polish | Task 7 |
| §1.5 Testing | Tasks 1, 2, 5, 6 |
| §2.1 Migration 027 | Task 9 |
| §2.2 AI tool + org context | Tasks 15, 16, 17 |
| §2.3 Prompt additions | Tasks 16, 18 |
| §2.4 Executor | Tasks 11, 12, 13, 14 |
| §2.5 Accept handler + RBAC | Task 19 |
| §2.6 Preview component | Task 20, 21 |
| §2.7 NotificationBell | Task 23 |
| §2.8 Action-type tags | Task 10 |
| §2.9 Context builder | Task 16, 17 |
| §2.10 Cache invalidation | Task 22 |
| §2.11 Error handling | Tasks 11-14 (transactional), 19 (RBAC) |
| §2.12 Testing | Distributed across Tasks 11-16, 20, 24 |
| §2.13 Observability | Task 25 Step 4 |
| §3 Slice 3 roadmap | Deferred to separate plans |
| §6 Design follow-ups | Captured in memory at Task 25 Step 5 |
