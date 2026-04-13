# Task Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Task Center placeholder with a fully functional task management view featuring 4 collapsible status groups and per-group inline row creation.

**Architecture:** New standalone `TaskCenter.tsx` component receives `tasks`, `projectId`, and `refresh` from `ProjectWorkspaceView`. It groups tasks into 4 status sections, renders task rows, and handles inline creation via the existing `POST /api/workspace/tasks` proxy. No new API routes, hooks, or database changes needed.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, lucide-react icons, CSS variables from existing design system.

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `apps/web/src/app/workspace/projects/[projectId]/TaskCenter.tsx` | Task center component: status groups, task rows, inline creation, empty state |
| Modify | `apps/web/src/app/workspace/projects/[projectId]/ProjectWorkspaceView.tsx` (lines 811-823) | Replace Task Center placeholder with `<TaskCenter>` component |

---

### Task 1: Create TaskCenter component — static group rendering

**Files:**
- Create: `apps/web/src/app/workspace/projects/[projectId]/TaskCenter.tsx`

- [ ] **Step 1: Create the TaskCenter component with status group definitions and props**

Create the file with the full component structure. This step renders task groups with collapsible sections and task rows — no inline creation yet.

```tsx
"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, ListChecks, Plus } from "lucide-react";
import type { WorkspaceTask } from "@/app/dashboard/types";

/* ── Status‑group definitions ─────────────────────────── */

interface StatusGroup {
  id: string;
  label: string;
  /** DB status values that belong in this group */
  statuses: string[];
  dotColour: string;
  defaultCollapsed: boolean;
}

const STATUS_GROUPS: StatusGroup[] = [
  { id: "not_started", label: "Not Started", statuses: ["backlog", "not_started"], dotColour: "#6c44f6", defaultCollapsed: false },
  { id: "in_progress", label: "In Progress", statuses: ["in_progress", "waiting"], dotColour: "#f59e0b", defaultCollapsed: false },
  { id: "blocked",     label: "Blocked",     statuses: ["blocked"],                dotColour: "#ef4444", defaultCollapsed: false },
  { id: "completed",   label: "Completed",   statuses: ["completed"],              dotColour: "#22c55e", defaultCollapsed: true },
];

const PRIORITY_COLOURS: Record<string, { color: string; bg: string }> = {
  low:      { color: "#22c55e", bg: "rgba(34,197,94,0.1)" },
  medium:   { color: "#3b82f6", bg: "rgba(59,130,246,0.1)" },
  high:     { color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
  critical: { color: "#ef4444", bg: "rgba(239,68,68,0.1)" },
};

function formatShortDate(value?: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function formatPriority(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/* ── Props ────────────────────────────────────────────── */

interface TaskCenterProps {
  projectId: string;
  tasks: WorkspaceTask[];
  refresh: () => Promise<void>;
}

/* ── Component ────────────────────────────────────────── */

export function TaskCenter({ projectId, tasks, refresh }: TaskCenterProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(STATUS_GROUPS.map((g) => [g.id, g.defaultCollapsed]))
  );

  const grouped = useMemo(() => {
    const map: Record<string, WorkspaceTask[]> = {};
    for (const group of STATUS_GROUPS) {
      map[group.id] = [];
    }
    for (const task of tasks) {
      const group = STATUS_GROUPS.find((g) => g.statuses.includes(task.status));
      if (group) {
        map[group.id].push(task);
      } else {
        // Fallback: put unknown statuses in "not_started"
        map["not_started"].push(task);
      }
    }
    return map;
  }, [tasks]);

  const toggleCollapse = (groupId: string) => {
    setCollapsed((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  /* ── Empty state ──────────────────────────────────── */

  if (tasks.length === 0) {
    return (
      <div
        className="text-center px-6 py-12"
        style={{
          borderRadius: "var(--radius-card)",
          border: "1px dashed var(--border-2)",
          background: "var(--surface)",
        }}
      >
        <ListChecks size={32} className="mx-auto mb-3" style={{ color: "var(--text-disabled)" }} />
        <p className="text-[14px] font-semibold" style={{ color: "var(--text-1)" }}>No tasks yet</p>
        <p className="mt-2 text-[13px]" style={{ color: "var(--text-2)" }}>
          Create your first task to start tracking work for this project.
        </p>
      </div>
    );
  }

  /* ── Main render ──────────────────────────────────── */

  return (
    <div
      style={{
        borderRadius: "var(--radius-card)",
        border: "1px solid var(--border)",
        background: "var(--surface)",
        overflow: "hidden",
      }}
    >
      {STATUS_GROUPS.map((group) => {
        const groupTasks = grouped[group.id];
        const isCollapsed = collapsed[group.id];

        return (
          <div key={group.id} style={{ borderBottom: "1px solid var(--border)" }}>
            {/* Group header */}
            <div
              className="flex items-center justify-between px-5 py-3 cursor-pointer select-none"
              onClick={() => toggleCollapse(group.id)}
              role="button"
              aria-expanded={!isCollapsed}
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleCollapse(group.id); } }}
            >
              <div className="flex items-center gap-2">
                {isCollapsed
                  ? <ChevronRight size={14} style={{ color: group.dotColour }} />
                  : <ChevronDown size={14} style={{ color: group.dotColour }} />
                }
                <span className="text-[13px] font-semibold" style={{ color: "var(--text-1)" }}>
                  {group.label}
                </span>
                <span
                  className="text-[11px] px-2 rounded-full"
                  style={{ color: "var(--text-muted)", background: "var(--surface-2)" }}
                >
                  {groupTasks.length}
                </span>
              </div>

              {/* "+ New task" button — stop propagation so it doesn't toggle collapse */}
              <button
                type="button"
                className="flex items-center gap-1 text-[12px] font-medium"
                style={{ color: "var(--cta)" }}
                onClick={(e) => {
                  e.stopPropagation();
                  // Inline creation will be added in Task 2
                }}
              >
                <Plus size={12} />
                New task
              </button>
            </div>

            {/* Task rows */}
            {!isCollapsed && (
              <div className="px-5 pb-3 space-y-1">
                {groupTasks.length === 0 && (
                  <p className="text-[12px] py-2 px-2.5" style={{ color: "var(--text-muted)" }}>
                    No tasks
                  </p>
                )}
                {groupTasks.map((task) => {
                  const priorityStyle = PRIORITY_COLOURS[task.priority] ?? PRIORITY_COLOURS.medium;
                  return (
                    <div
                      key={task.id}
                      className="flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors"
                      style={{ border: "1px solid var(--border)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                    >
                      <span
                        style={{
                          width: 6, height: 6, borderRadius: "50%",
                          background: group.dotColour, flexShrink: 0,
                        }}
                      />
                      <span className="flex-1 text-[13px] truncate" style={{ color: "var(--text-1)" }}>
                        {task.title}
                      </span>
                      <span
                        className="text-[11px] px-2 py-0.5 rounded whitespace-nowrap"
                        style={{ color: priorityStyle.color, background: priorityStyle.bg }}
                      >
                        {formatPriority(task.priority)}
                      </span>
                      <span className="text-[11px] w-[70px] truncate" style={{ color: "var(--text-muted)" }}>
                        {task.assigneeName ?? "—"}
                      </span>
                      <span className="text-[11px] w-[60px] text-right" style={{ color: "var(--text-muted)" }}>
                        {formatShortDate(task.dueDate)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify the file compiles**

Run:
```bash
cd C:/Dev/larry/site-deploys/larry-site && npx tsc --noEmit --project apps/web/tsconfig.json 2>&1 | head -20
```

Expected: No errors related to `TaskCenter.tsx`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/workspace/projects/\[projectId\]/TaskCenter.tsx
git commit -m "feat(task-center): add TaskCenter component with status groups and task rows"
```

---

### Task 2: Wire TaskCenter into ProjectWorkspaceView

**Files:**
- Modify: `apps/web/src/app/workspace/projects/[projectId]/ProjectWorkspaceView.tsx` (lines 811-823)

- [ ] **Step 1: Add the import**

At the top of `ProjectWorkspaceView.tsx`, after the existing `ProjectNotesPanel` import (line 35), add:

```tsx
import { TaskCenter } from "./TaskCenter";
```

- [ ] **Step 2: Replace the Task Center placeholder**

Replace lines 811-823 (the `{activeTab === "tasks" && (...)}` block) with:

```tsx
        {activeTab === "tasks" && (
          <TaskCenter projectId={projectId} tasks={tasks} refresh={refresh} />
        )}
```

- [ ] **Step 3: Verify it compiles**

Run:
```bash
cd C:/Dev/larry/site-deploys/larry-site && npx tsc --noEmit --project apps/web/tsconfig.json 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/workspace/projects/\[projectId\]/ProjectWorkspaceView.tsx
git commit -m "feat(task-center): wire TaskCenter into project workspace tabs"
```

---

### Task 3: Add inline task creation

**Files:**
- Modify: `apps/web/src/app/workspace/projects/[projectId]/TaskCenter.tsx`

This is the core interaction: clicking "+ New task" in a group opens an inline row with title input, priority dropdown, assignee dropdown, and due date picker. Enter saves, Esc cancels.

- [ ] **Step 1: Add creation state and member-fetching logic**

At the top of the `TaskCenter` component function body (after the `collapsed` state), add:

```tsx
  /* ── Inline creation state ────────────────────────── */

  const [creatingInGroup, setCreatingInGroup] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [newAssignee, setNewAssignee] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  /* ── Fetch project members for assignee dropdown ──── */

  const [members, setMembers] = useState<Array<{ userId: string; name: string }>>([]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/workspace/projects/${encodeURIComponent(projectId)}/members`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && Array.isArray(data?.members)) {
          setMembers(
            data.members.map((m: { userId: string; name?: string; email?: string }) => ({
              userId: m.userId,
              name: m.name || m.email || "Unknown",
            }))
          );
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [projectId]);

  /* ── Creation handlers ────────────────────────────── */

  const startCreating = (groupId: string) => {
    setCreatingInGroup(groupId);
    setNewTitle("");
    setNewPriority("medium");
    setNewAssignee("");
    setNewDueDate("");
    // Ensure group is expanded
    setCollapsed((prev) => ({ ...prev, [groupId]: false }));
    // Focus the title input after render
    setTimeout(() => titleInputRef.current?.focus(), 0);
  };

  const cancelCreating = () => {
    setCreatingInGroup(null);
    setNewTitle("");
  };

  const saveTask = async () => {
    const title = newTitle.trim();
    if (!title || saving) return;

    const group = STATUS_GROUPS.find((g) => g.id === creatingInGroup);
    if (!group) return;

    // Map group ID to the DB status to send
    const statusMap: Record<string, string> = {
      not_started: "not_started",
      in_progress: "in_progress",
      blocked: "blocked",
      completed: "completed",
    };

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        projectId,
        title,
        priority: newPriority,
      };
      if (newAssignee) body.assigneeUserId = newAssignee;
      if (newDueDate) body.dueDate = newDueDate;

      const response = await fetch("/api/workspace/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        console.error("Failed to create task:", err);
        return;
      }

      // If the target status isn't "not_started" (the API default), update it
      const created = await response.json();
      const targetStatus = statusMap[creatingInGroup!];
      if (targetStatus && targetStatus !== "not_started" && created?.id) {
        await fetch(`/api/workspace/tasks/${encodeURIComponent(created.id)}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: targetStatus }),
        });
      }

      cancelCreating();
      await refresh();
    } catch (err) {
      console.error("Task creation failed:", err);
    } finally {
      setSaving(false);
    }
  };
```

Also update the imports at the top of the file — change:

```tsx
import { useMemo, useState } from "react";
```

to:

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
```

- [ ] **Step 2: Update the "+ New task" button to call startCreating**

In the group header, replace the `onClick` handler of the "+ New task" button:

```tsx
                onClick={(e) => {
                  e.stopPropagation();
                  // Inline creation will be added in Task 2
                }}
```

with:

```tsx
                onClick={(e) => {
                  e.stopPropagation();
                  startCreating(group.id);
                }}
```

- [ ] **Step 3: Add the inline creation row after task rows**

Inside the `{!isCollapsed && (...)}` block, after the `{groupTasks.map(...)}` block and before the closing `</div>` of `px-5 pb-3 space-y-1`, add:

```tsx
                {/* Inline creation row */}
                {creatingInGroup === group.id && (
                  <div
                    className="flex items-center gap-3 rounded-lg px-2.5 py-2"
                    style={{ border: "1px dashed var(--cta)", background: "rgba(108,68,246,0.04)" }}
                  >
                    <span
                      style={{
                        width: 6, height: 6, borderRadius: "50%",
                        background: group.dotColour, flexShrink: 0,
                      }}
                    />
                    {/* Title input */}
                    <input
                      ref={titleInputRef}
                      type="text"
                      placeholder="Task title..."
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      disabled={saving}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); void saveTask(); }
                        if (e.key === "Escape") { cancelCreating(); }
                      }}
                      className="flex-1 text-[13px] bg-transparent outline-none"
                      style={{ color: "var(--text-1)", minWidth: 0 }}
                    />
                    {/* Priority dropdown */}
                    <select
                      value={newPriority}
                      onChange={(e) => setNewPriority(e.target.value as "low" | "medium" | "high" | "critical")}
                      disabled={saving}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") { cancelCreating(); }
                      }}
                      className="text-[11px] bg-transparent outline-none cursor-pointer rounded px-1 py-0.5"
                      style={{ color: "var(--cta)", border: "1px solid var(--border)" }}
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                    {/* Assignee dropdown */}
                    <select
                      value={newAssignee}
                      onChange={(e) => setNewAssignee(e.target.value)}
                      disabled={saving}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") { cancelCreating(); }
                      }}
                      className="text-[11px] bg-transparent outline-none cursor-pointer rounded px-1 py-0.5 w-[80px] truncate"
                      style={{ color: "var(--cta)", border: "1px solid var(--border)" }}
                    >
                      <option value="">Assign...</option>
                      {members.map((m) => (
                        <option key={m.userId} value={m.userId}>{m.name}</option>
                      ))}
                    </select>
                    {/* Due date */}
                    <input
                      type="date"
                      value={newDueDate}
                      onChange={(e) => setNewDueDate(e.target.value)}
                      disabled={saving}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") { cancelCreating(); }
                      }}
                      className="text-[11px] bg-transparent outline-none cursor-pointer rounded px-1 py-0.5"
                      style={{ color: "var(--cta)", border: "1px solid var(--border)", width: 100 }}
                    />
                  </div>
                )}
                {creatingInGroup === group.id && (
                  <div className="flex items-center gap-3 px-2.5 pt-1">
                    <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                      Enter to save · Tab to next field · Esc to cancel
                    </span>
                    <div className="flex-1" />
                    <button
                      type="button"
                      onClick={cancelCreating}
                      disabled={saving}
                      className="text-[11px] px-2 py-0.5 rounded"
                      style={{ color: "var(--text-2)", border: "1px solid var(--border)" }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveTask()}
                      disabled={saving || !newTitle.trim()}
                      className="text-[11px] px-2 py-0.5 rounded font-medium text-white"
                      style={{
                        background: !newTitle.trim() || saving ? "var(--text-disabled)" : "var(--cta)",
                      }}
                    >
                      {saving ? "Saving..." : "Create"}
                    </button>
                  </div>
                )}
```

- [ ] **Step 4: Verify the task status update proxy route exists**

Check if `apps/web/src/app/api/workspace/tasks/[id]/status/route.ts` exists and supports PATCH. Read the file to confirm.

Run:
```bash
cat "C:/Dev/larry/site-deploys/larry-site/apps/web/src/app/api/workspace/tasks/[id]/status/route.ts"
```

If it exists and proxies PATCH to the backend, proceed. If not, create the proxy route (see Step 4b).

- [ ] **Step 4b (conditional): Create status update proxy if missing**

Only if the file doesn't exist, create `apps/web/src/app/api/workspace/tasks/[id]/status/route.ts`:

```tsx
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = await request.text();

  const result = await proxyApiRequest(
    session,
    `/v1/tasks/${encodeURIComponent(id)}/status`,
    { method: "PATCH", body },
  );

  if (result.session) {
    await persistSession(result.session);
  }

  return NextResponse.json(result.body, { status: result.status });
}
```

- [ ] **Step 5: Verify it compiles**

Run:
```bash
cd C:/Dev/larry/site-deploys/larry-site && npx tsc --noEmit --project apps/web/tsconfig.json 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/workspace/projects/\[projectId\]/TaskCenter.tsx
git add apps/web/src/app/api/workspace/tasks/  # if status route was created
git commit -m "feat(task-center): add inline task creation with per-group status, assignee, and due date"
```

---

### Task 4: Add "+ New task" to empty state

**Files:**
- Modify: `apps/web/src/app/workspace/projects/[projectId]/TaskCenter.tsx`

- [ ] **Step 1: Update the empty state to include a creation button**

Replace the empty state return block (the `if (tasks.length === 0)` block) with:

```tsx
  if (tasks.length === 0 && creatingInGroup === null) {
    return (
      <div
        className="text-center px-6 py-12"
        style={{
          borderRadius: "var(--radius-card)",
          border: "1px dashed var(--border-2)",
          background: "var(--surface)",
        }}
      >
        <ListChecks size={32} className="mx-auto mb-3" style={{ color: "var(--text-disabled)" }} />
        <p className="text-[14px] font-semibold" style={{ color: "var(--text-1)" }}>No tasks yet</p>
        <p className="mt-2 text-[13px]" style={{ color: "var(--text-2)" }}>
          Create your first task to start tracking work for this project.
        </p>
        <button
          type="button"
          onClick={() => startCreating("not_started")}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-semibold text-white"
          style={{ background: "var(--cta)" }}
        >
          <Plus size={14} />
          New task
        </button>
      </div>
    );
  }
```

When `creatingInGroup` is set (user clicked "New task" from empty state), the component falls through to the main render which shows the groups — the "Not Started" group will have the inline creation row visible even though there are 0 tasks.

- [ ] **Step 2: Verify it compiles**

Run:
```bash
cd C:/Dev/larry/site-deploys/larry-site && npx tsc --noEmit --project apps/web/tsconfig.json 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/workspace/projects/\[projectId\]/TaskCenter.tsx
git commit -m "feat(task-center): add New task button to empty state"
```

---

### Task 5: Manual smoke test

- [ ] **Step 1: Start the dev environment**

Ensure Docker is running (Postgres + Redis), then:

```bash
cd C:/Dev/larry/site-deploys/larry-site
npm run web:dev
```

- [ ] **Step 2: Test in browser**

1. Navigate to `http://localhost:3000/workspace`, log in with `sarah@larry.local` / `DevPass123!`
2. Open any project → click the "Task center" tab
3. Verify: if tasks exist, they appear grouped into Not Started / In Progress / Blocked / Completed
4. Verify: click a group header to collapse/expand it
5. Verify: "Completed" starts collapsed
6. Verify: click "+ New task" in the "Not Started" group — inline row appears
7. Type a title, press Enter → task is created, list refreshes, task appears in the group
8. Verify: tab through priority, assignee, due date fields
9. Verify: press Esc → creation row disappears
10. Verify: overview tab still shows correct task counts
11. If project has no tasks: verify empty state with "New task" button

- [ ] **Step 3: Final commit (if any cleanup needed)**

```bash
git add -A
git commit -m "fix(task-center): cleanup from smoke test"
```
