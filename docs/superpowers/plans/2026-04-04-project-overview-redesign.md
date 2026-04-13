# Project Overview Tab Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the project Overview tab to show a curated project snapshot with description, tabbed info card (AI Summary / Recent Activity / My Tasks), progress + action boxes, and status cards with donut chart. Add Larry chat icon and action bell with badge to the header.

**Architecture:** Extract the Overview tab's ~400 lines of inline JSX from `ProjectWorkspaceView.tsx` into a new `ProjectOverviewTab` component that orchestrates 6 focused sub-components. Add two icon buttons to the existing header. All data comes from existing hooks — no new API endpoints.

**Tech Stack:** React 18 (client components), Next.js 16 App Router, TypeScript, inline styles with CSS variables (matching existing codebase pattern), lucide-react icons.

**Spec:** `docs/superpowers/specs/2026-04-04-project-overview-redesign.md`

---

## File Structure

| File | Purpose |
|------|---------|
| `apps/web/src/app/workspace/projects/[projectId]/overview/ProjectOverviewTab.tsx` | **New.** Orchestrator — renders all overview sub-components. |
| `apps/web/src/app/workspace/projects/[projectId]/overview/ProjectDescriptionCard.tsx` | **New.** Static project description card. |
| `apps/web/src/app/workspace/projects/[projectId]/overview/ProjectInfoTabs.tsx` | **New.** Tabbed card: AI Summary, Recent Activity, My Tasks. |
| `apps/web/src/app/workspace/projects/[projectId]/overview/ProgressBox.tsx` | **New.** Progress bar with area/employee filters. |
| `apps/web/src/app/workspace/projects/[projectId]/overview/ActionBox.tsx` | **New.** Pending action count + link. |
| `apps/web/src/app/workspace/projects/[projectId]/overview/StatusBreakdown.tsx` | **New.** 5 status cards + donut chart. |
| `apps/web/src/app/workspace/projects/[projectId]/overview/ActionBellDropdown.tsx` | **New.** Bell icon dropdown overlay. |
| `apps/web/src/app/workspace/projects/[projectId]/ProjectWorkspaceView.tsx` | **Modify.** Import new components, replace overview inline JSX, add header icons. |

---

### Task 1: Create ProjectDescriptionCard

**Files:**
- Create: `apps/web/src/app/workspace/projects/[projectId]/overview/ProjectDescriptionCard.tsx`

- [ ] **Step 1: Create the component file**

```tsx
// apps/web/src/app/workspace/projects/[projectId]/overview/ProjectDescriptionCard.tsx
"use client";

export function ProjectDescriptionCard({ description }: { description?: string | null }) {
  return (
    <div
      style={{
        borderRadius: "var(--radius-card)",
        border: "1px solid rgba(108,68,246,0.15)",
        background: "rgba(108,68,246,0.06)",
        padding: "14px 18px",
      }}
    >
      <p
        className="text-[10px] font-semibold uppercase tracking-[0.8px]"
        style={{ color: "#6c44f6", marginBottom: "6px" }}
      >
        Project Description
      </p>
      <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-2)" }}>
        {description?.trim() || "No description set. Add one in project settings."}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Verify it renders**

Open the dev server (`npm run web:dev`). We can't see it yet because it's not wired in — just verify the file compiles without TypeScript errors by checking the terminal for build errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/workspace/projects/\[projectId\]/overview/ProjectDescriptionCard.tsx
git commit -m "feat(overview): add ProjectDescriptionCard component"
```

---

### Task 2: Create ActionBox

**Files:**
- Create: `apps/web/src/app/workspace/projects/[projectId]/overview/ActionBox.tsx`

- [ ] **Step 1: Create the component file**

```tsx
// apps/web/src/app/workspace/projects/[projectId]/overview/ActionBox.tsx
"use client";

export function ActionBox({
  pendingCount,
  onGoToActionCenter,
}: {
  pendingCount: number;
  onGoToActionCenter: () => void;
}) {
  const hasActions = pendingCount > 0;

  return (
    <div
      style={{
        borderRadius: "var(--radius-card)",
        border: "1px solid var(--border)",
        background: "var(--surface)",
        padding: "14px 18px",
        minWidth: "160px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
      }}
    >
      <p
        className="text-[36px] font-extrabold"
        style={{ color: hasActions ? "#f59e0b" : "#22c55e" }}
      >
        {pendingCount}
      </p>
      <p className="text-[12px] font-semibold" style={{ color: "var(--text-1)" }}>
        {hasActions ? "Actions Pending" : "All Clear"}
      </p>
      <button
        type="button"
        onClick={onGoToActionCenter}
        className="mt-1.5 text-[11px] font-semibold"
        style={{ color: "#6c44f6", background: "none", border: "none", cursor: "pointer", padding: 0 }}
      >
        Go to Action Center →
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/workspace/projects/\[projectId\]/overview/ActionBox.tsx
git commit -m "feat(overview): add ActionBox component"
```

---

### Task 3: Create ProgressBox

**Files:**
- Create: `apps/web/src/app/workspace/projects/[projectId]/overview/ProgressBox.tsx`

- [ ] **Step 1: Create the component file**

This component shows the overall progress bar with optional area and employee filter dropdowns. "Areas" come from the `category` field on timeline tasks. When filters are active, the progress bar recalculates from the filtered subset.

```tsx
// apps/web/src/app/workspace/projects/[projectId]/overview/ProgressBox.tsx
"use client";

import { useMemo, useState } from "react";
import type {
  WorkspaceTask,
  WorkspaceTimeline,
  WorkspaceProjectMember,
} from "@/app/dashboard/types";

interface ProgressBoxProps {
  tasks: WorkspaceTask[];
  timeline: WorkspaceTimeline | null;
  targetDate?: string | null;
  members?: WorkspaceProjectMember[];
}

export function ProgressBox({ tasks, timeline, targetDate, members }: ProgressBoxProps) {
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [areaDropdownOpen, setAreaDropdownOpen] = useState(false);
  const [employeeDropdownOpen, setEmployeeDropdownOpen] = useState(false);

  // Derive areas from timeline task categories
  const areas = useMemo(() => {
    const cats = new Set<string>();
    for (const t of timeline?.gantt ?? []) {
      if (t.category) cats.add(t.category);
    }
    return Array.from(cats).sort();
  }, [timeline]);

  // Build a set of timeline task IDs per category for filtering
  const taskIdsByCategory = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const t of timeline?.gantt ?? []) {
      if (t.category) {
        if (!map.has(t.category)) map.set(t.category, new Set());
        map.get(t.category)!.add(t.id);
      }
    }
    return map;
  }, [timeline]);

  // Filter tasks based on selected areas and employees
  const filteredTasks = useMemo(() => {
    let result = tasks;
    if (selectedAreas.length > 0) {
      const allowedIds = new Set<string>();
      for (const area of selectedAreas) {
        const ids = taskIdsByCategory.get(area);
        if (ids) ids.forEach((id) => allowedIds.add(id));
      }
      result = result.filter((t) => allowedIds.has(t.id));
    }
    if (selectedEmployees.length > 0) {
      result = result.filter(
        (t) => t.assigneeUserId && selectedEmployees.includes(t.assigneeUserId),
      );
    }
    return result;
  }, [tasks, selectedAreas, selectedEmployees, taskIdsByCategory]);

  const completed = filteredTasks.filter((t) => t.status === "completed").length;
  const total = filteredTasks.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const toggleArea = (area: string) => {
    setSelectedAreas((prev) =>
      prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area],
    );
  };

  const toggleEmployee = (userId: string) => {
    setSelectedEmployees((prev) =>
      prev.includes(userId) ? prev.filter((e) => e !== userId) : [...prev, userId],
    );
  };

  const formatTarget = (date?: string | null) => {
    if (!date) return null;
    return new Date(date).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  };

  return (
    <div
      style={{
        borderRadius: "var(--radius-card)",
        border: "1px solid var(--border)",
        background: "var(--surface)",
        padding: "14px 18px",
        flex: 1,
      }}
    >
      <div className="flex items-center justify-between" style={{ marginBottom: "10px" }}>
        <p
          className="text-[10px] font-semibold uppercase tracking-[0.8px]"
          style={{ color: "#b8a0ff" }}
        >
          Overall Progress
        </p>
        <div className="flex gap-1.5">
          {/* Area filter */}
          {areas.length > 0 && (
            <div style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => {
                  setAreaDropdownOpen((v) => !v);
                  setEmployeeDropdownOpen(false);
                }}
                className="text-[10px]"
                style={{
                  color: selectedAreas.length > 0 ? "#6c44f6" : "var(--text-muted)",
                  padding: "3px 8px",
                  background: "var(--surface-2)",
                  borderRadius: "4px",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Area{selectedAreas.length > 0 ? ` (${selectedAreas.length})` : ""} ▾
              </button>
              {areaDropdownOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    right: 0,
                    marginTop: "4px",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    padding: "4px",
                    zIndex: 20,
                    minWidth: "160px",
                    boxShadow: "var(--shadow-1)",
                  }}
                >
                  {areas.map((area) => (
                    <button
                      key={area}
                      type="button"
                      onClick={() => toggleArea(area)}
                      className="flex w-full items-center gap-2 rounded px-3 py-1.5 text-[11px]"
                      style={{
                        background: selectedAreas.includes(area)
                          ? "rgba(108,68,246,0.1)"
                          : "transparent",
                        color: "var(--text-1)",
                        border: "none",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <span
                        style={{
                          width: "14px",
                          height: "14px",
                          borderRadius: "3px",
                          border: selectedAreas.includes(area)
                            ? "2px solid #6c44f6"
                            : "2px solid var(--border)",
                          background: selectedAreas.includes(area) ? "#6c44f6" : "transparent",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "9px",
                          color: "#fff",
                          flexShrink: 0,
                        }}
                      >
                        {selectedAreas.includes(area) ? "✓" : ""}
                      </span>
                      {area}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {/* Employee filter */}
          {members && members.length > 0 && (
            <div style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => {
                  setEmployeeDropdownOpen((v) => !v);
                  setAreaDropdownOpen(false);
                }}
                className="text-[10px]"
                style={{
                  color: selectedEmployees.length > 0 ? "#6c44f6" : "var(--text-muted)",
                  padding: "3px 8px",
                  background: "var(--surface-2)",
                  borderRadius: "4px",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Employee{selectedEmployees.length > 0 ? ` (${selectedEmployees.length})` : ""} ▾
              </button>
              {employeeDropdownOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    right: 0,
                    marginTop: "4px",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    padding: "4px",
                    zIndex: 20,
                    minWidth: "180px",
                    boxShadow: "var(--shadow-1)",
                  }}
                >
                  {members.map((m) => (
                    <button
                      key={m.userId}
                      type="button"
                      onClick={() => toggleEmployee(m.userId)}
                      className="flex w-full items-center gap-2 rounded px-3 py-1.5 text-[11px]"
                      style={{
                        background: selectedEmployees.includes(m.userId)
                          ? "rgba(108,68,246,0.1)"
                          : "transparent",
                        color: "var(--text-1)",
                        border: "none",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <span
                        style={{
                          width: "14px",
                          height: "14px",
                          borderRadius: "3px",
                          border: selectedEmployees.includes(m.userId)
                            ? "2px solid #6c44f6"
                            : "2px solid var(--border)",
                          background: selectedEmployees.includes(m.userId) ? "#6c44f6" : "transparent",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "9px",
                          color: "#fff",
                          flexShrink: 0,
                        }}
                      >
                        {selectedEmployees.includes(m.userId) ? "✓" : ""}
                      </span>
                      {m.name || m.email}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3.5">
        <p className="text-[28px] font-extrabold" style={{ color: "#6c44f6" }}>
          {pct}%
        </p>
        <div style={{ flex: 1 }}>
          <div
            className="w-full overflow-hidden"
            style={{ height: "12px", borderRadius: "6px", background: "var(--surface-2)" }}
          >
            <div
              style={{
                width: `${Math.max(pct, 2)}%`,
                height: "100%",
                borderRadius: "6px",
                background: "linear-gradient(90deg, #6c44f6, #9b7aff)",
                transition: "width 0.4s ease",
              }}
            />
          </div>
          <div
            className="mt-1 flex items-center justify-between text-[10px]"
            style={{ color: "var(--text-muted)" }}
          >
            <span>{completed} of {total} tasks completed</span>
            {targetDate && <span>Target: {formatTarget(targetDate)}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/workspace/projects/\[projectId\]/overview/ProgressBox.tsx
git commit -m "feat(overview): add ProgressBox component with area/employee filters"
```

---

### Task 4: Create StatusBreakdown (status cards + donut chart)

**Files:**
- Create: `apps/web/src/app/workspace/projects/[projectId]/overview/StatusBreakdown.tsx`

- [ ] **Step 1: Create the component file**

This component renders 5 semantic status count cards and an SVG donut chart. The donut logic is adapted from the existing `DonutChart` in `dashboard/ProjectDashboard.tsx` (lines 42–102) but uses the new semantic colour palette.

```tsx
// apps/web/src/app/workspace/projects/[projectId]/overview/StatusBreakdown.tsx
"use client";

import { useMemo } from "react";
import type { WorkspaceTask } from "@/app/dashboard/types";

const STATUS_CONFIG = [
  { key: "completed",   label: "Completed",   color: "#22c55e", bg: "rgba(34,197,94,0.08)",   border: "rgba(34,197,94,0.2)" },
  { key: "not_started", label: "Not Started",  color: "#9ca3af", bg: "rgba(156,163,175,0.08)", border: "rgba(156,163,175,0.2)" },
  { key: "on_track",    label: "In Progress",  color: "#6c44f6", bg: "rgba(108,68,246,0.08)",  border: "rgba(108,68,246,0.2)" },
  { key: "at_risk",     label: "At Risk",      color: "#f59e0b", bg: "rgba(245,158,11,0.08)",  border: "rgba(245,158,11,0.2)" },
  { key: "overdue",     label: "Delayed",      color: "#ef4444", bg: "rgba(239,68,68,0.08)",   border: "rgba(239,68,68,0.2)" },
] as const;

// Map data-model statuses to the display buckets above
function bucketStatus(status: string): string {
  if (status === "backlog") return "not_started";
  if (status === "in_progress" || status === "waiting") return "on_track";
  if (status === "blocked") return "at_risk";
  return status;
}

export function StatusBreakdown({ tasks }: { tasks: WorkspaceTask[] }) {
  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const cfg of STATUS_CONFIG) map[cfg.key] = 0;
    for (const t of tasks) {
      const bucket = bucketStatus(t.status);
      if (bucket in map) map[bucket]++;
    }
    return map;
  }, [tasks]);

  const total = tasks.length;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "16px", alignItems: "start" }}>
      {/* Status number cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "10px" }}>
        {STATUS_CONFIG.map((cfg) => (
          <div
            key={cfg.key}
            style={{
              background: cfg.bg,
              border: `1px solid ${cfg.border}`,
              borderRadius: "var(--radius-card)",
              padding: "14px 8px",
              textAlign: "center",
            }}
          >
            <p className="text-[24px] font-extrabold" style={{ color: cfg.color }}>
              {counts[cfg.key]}
            </p>
            <p className="text-[10px]" style={{ color: "var(--text-muted)", marginTop: "4px" }}>
              {cfg.label}
            </p>
          </div>
        ))}
      </div>

      {/* Donut chart */}
      <DonutChart counts={counts} total={total} />
    </div>
  );
}

function DonutChart({ counts, total }: { counts: Record<string, number>; total: number }) {
  const segments = useMemo(() => {
    const entries = STATUS_CONFIG.filter((cfg) => counts[cfg.key] > 0);
    const safeTotal = total || 1;
    let cumAngle = -90;
    return entries.map((cfg) => {
      const angle = (counts[cfg.key] / safeTotal) * 360;
      const startAngle = cumAngle;
      cumAngle += angle;
      return { ...cfg, count: counts[cfg.key], angle, startAngle };
    });
  }, [counts, total]);

  const R = 56;
  const innerR = 36;
  const cx = 70;
  const cy = 70;

  const polarToXY = (r: number, angleDeg: number) => {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };

  return (
    <div style={{ width: "140px", textAlign: "center" }}>
      <svg width={140} height={140} viewBox="0 0 140 140">
        {total === 0 ? (
          <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--border)" strokeWidth={R - innerR} />
        ) : (
          segments.map((seg) => {
            if (seg.angle <= 0) return null;
            const start = polarToXY(R, seg.startAngle);
            const end = polarToXY(R, seg.startAngle + seg.angle);
            const large = seg.angle > 180 ? 1 : 0;
            const innerStart = polarToXY(innerR, seg.startAngle + seg.angle);
            const innerEnd = polarToXY(innerR, seg.startAngle);
            const d = [
              `M ${start.x} ${start.y}`,
              `A ${R} ${R} 0 ${large} 1 ${end.x} ${end.y}`,
              `L ${innerStart.x} ${innerStart.y}`,
              `A ${innerR} ${innerR} 0 ${large} 0 ${innerEnd.x} ${innerEnd.y}`,
              "Z",
            ].join(" ");
            return <path key={seg.key} d={d} fill={seg.color} />;
          })
        )}
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize={18} fontWeight={800} fill="var(--text-1)">
          {total}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" fontSize={9} fill="var(--text-muted)">
          total
        </text>
      </svg>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/workspace/projects/\[projectId\]/overview/StatusBreakdown.tsx
git commit -m "feat(overview): add StatusBreakdown with status cards and donut chart"
```

---

### Task 5: Create ProjectInfoTabs

**Files:**
- Create: `apps/web/src/app/workspace/projects/[projectId]/overview/ProjectInfoTabs.tsx`

- [ ] **Step 1: Create the component file**

This is the most complex new component. It renders a tabbed card with three tabs: AI Summary, Recent Activity (scrollable list of up to 20 items), and My Tasks (current user's assigned tasks). It needs the current user ID to filter tasks — fetched from `/api/auth/me`.

```tsx
// apps/web/src/app/workspace/projects/[projectId]/overview/ProjectInfoTabs.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import type { WorkspaceTask, WorkspaceLarryEvent } from "@/app/dashboard/types";

type InfoTab = "summary" | "activity" | "tasks";

const TABS: { id: InfoTab; label: string }[] = [
  { id: "summary", label: "AI Summary" },
  { id: "activity", label: "Recent Activity" },
  { id: "tasks", label: "My Tasks" },
];

// Status dot colours matching the semantic palette
const STATUS_DOT: Record<string, string> = {
  completed: "#22c55e",
  not_started: "#9ca3af",
  backlog: "#9ca3af",
  on_track: "#6c44f6",
  in_progress: "#6c44f6",
  waiting: "#6c44f6",
  at_risk: "#f59e0b",
  blocked: "#f59e0b",
  overdue: "#ef4444",
};

const PRIORITY_BADGE: Record<string, { fg: string; bg: string }> = {
  low: { fg: "#22c55e", bg: "rgba(34,197,94,0.1)" },
  medium: { fg: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
  high: { fg: "#ef4444", bg: "rgba(239,68,68,0.1)" },
  critical: { fg: "#ef4444", bg: "rgba(239,68,68,0.15)" },
};

interface ProjectInfoTabsProps {
  narrative: string | null | undefined;
  activity: WorkspaceLarryEvent[];
  tasks: WorkspaceTask[];
  onNavigateToTaskCenter: () => void;
}

export function ProjectInfoTabs({
  narrative,
  activity,
  tasks,
  onNavigateToTaskCenter,
}: ProjectInfoTabsProps) {
  const [activeTab, setActiveTab] = useState<InfoTab>("summary");
  const [userId, setUserId] = useState<string | null>(null);

  // Fetch current user ID for "My Tasks" filter
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.user?.id) setUserId(data.user.id);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const myTasks = useMemo(() => {
    if (!userId) return [];
    return tasks
      .filter((t) => t.assigneeUserId === userId && t.status !== "completed")
      .sort((a, b) => {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      });
  }, [tasks, userId]);

  const recentActivity = activity.slice(0, 20);

  return (
    <div
      style={{
        borderRadius: "var(--radius-card)",
        border: "1px solid var(--border)",
        background: "var(--surface)",
        overflow: "hidden",
      }}
    >
      {/* Tab header */}
      <div
        className="flex"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className="text-[11px] font-semibold"
            style={{
              padding: "10px 18px",
              color: activeTab === tab.id ? "#6c44f6" : "var(--text-muted)",
              borderBottom: activeTab === tab.id ? "2px solid #6c44f6" : "2px solid transparent",
              background: activeTab === tab.id ? "rgba(108,68,246,0.05)" : "transparent",
              border: "none",
              borderBottomStyle: "solid",
              borderBottomWidth: "2px",
              borderBottomColor: activeTab === tab.id ? "#6c44f6" : "transparent",
              cursor: "pointer",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ padding: "16px 18px" }}>
        {activeTab === "summary" && (
          <p className="text-[13px] leading-[1.7]" style={{ color: "var(--text-2)" }}>
            {narrative?.trim() || "Larry hasn't generated a summary yet."}
          </p>
        )}

        {activeTab === "activity" && (
          <div style={{ maxHeight: "300px", overflowY: "auto" }}>
            {recentActivity.length === 0 ? (
              <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                No recent activity.
              </p>
            ) : (
              recentActivity.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center justify-between"
                  style={{
                    padding: "6px 0",
                    borderBottom: "1px solid var(--border)",
                    fontSize: "12px",
                  }}
                >
                  <span style={{ color: "var(--text-2)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginRight: "12px" }}>
                    {event.displayText}
                  </span>
                  <span
                    className="shrink-0 text-[10px]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {formatRelative(event.executedAt ?? event.createdAt)}
                  </span>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "tasks" && (
          <div style={{ maxHeight: "300px", overflowY: "auto" }}>
            {myTasks.length === 0 ? (
              <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                {userId ? "No tasks assigned to you in this project." : "Loading..."}
              </p>
            ) : (
              myTasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={onNavigateToTaskCenter}
                  className="flex w-full items-center gap-2"
                  style={{
                    padding: "6px 0",
                    borderBottom: "1px solid var(--border)",
                    background: "none",
                    border: "none",
                    borderBottomStyle: "solid",
                    borderBottomWidth: "1px",
                    borderBottomColor: "var(--border)",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <span
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: STATUS_DOT[task.status] ?? "#9ca3af",
                      flexShrink: 0,
                    }}
                  />
                  <span
                    className="text-[12px]"
                    style={{
                      color: "var(--text-1)",
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {task.title}
                  </span>
                  {task.priority && PRIORITY_BADGE[task.priority] && (
                    <span
                      className="shrink-0 rounded text-[10px] font-semibold"
                      style={{
                        padding: "2px 6px",
                        color: PRIORITY_BADGE[task.priority].fg,
                        background: PRIORITY_BADGE[task.priority].bg,
                      }}
                    >
                      {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                    </span>
                  )}
                  {task.dueDate && (
                    <span className="shrink-0 text-[10px]" style={{ color: "var(--text-muted)" }}>
                      Due {new Date(task.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function formatRelative(value?: string | null): string {
  if (!value) return "Just now";
  const delta = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(delta / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/workspace/projects/\[projectId\]/overview/ProjectInfoTabs.tsx
git commit -m "feat(overview): add ProjectInfoTabs with AI Summary, Activity, My Tasks"
```

---

### Task 6: Create ActionBellDropdown

**Files:**
- Create: `apps/web/src/app/workspace/projects/[projectId]/overview/ActionBellDropdown.tsx`

- [ ] **Step 1: Create the component file**

Renders a bell icon with a red badge. Clicking toggles a dropdown showing pending action headlines. Clicking an item navigates to the Action Center tab.

```tsx
// apps/web/src/app/workspace/projects/[projectId]/overview/ActionBellDropdown.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import type { WorkspaceLarryEvent } from "@/app/dashboard/types";

interface ActionBellDropdownProps {
  suggested: WorkspaceLarryEvent[];
  onNavigateToAction: () => void;
}

export function ActionBellDropdown({ suggested, onNavigateToAction }: ActionBellDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const count = suggested.length;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center justify-center"
        style={{
          width: "36px",
          height: "36px",
          borderRadius: "10px",
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          cursor: "pointer",
          position: "relative",
        }}
        title={`${count} pending action${count !== 1 ? "s" : ""}`}
      >
        <Bell size={16} style={{ color: "var(--text-2)" }} />
        {count > 0 && (
          <span
            style={{
              position: "absolute",
              top: "-4px",
              right: "-4px",
              background: "#ef4444",
              color: "#fff",
              fontSize: "9px",
              fontWeight: 700,
              width: "18px",
              height: "18px",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            width: "320px",
            maxHeight: "340px",
            overflowY: "auto",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "12px",
            boxShadow: "var(--shadow-1)",
            zIndex: 50,
          }}
        >
          <div
            className="text-[11px] font-semibold uppercase tracking-[0.1em]"
            style={{
              padding: "10px 14px 6px",
              color: "var(--text-muted)",
              borderBottom: "1px solid var(--border)",
            }}
          >
            Pending Actions ({count})
          </div>
          {count === 0 ? (
            <p
              className="text-[12px]"
              style={{ padding: "16px 14px", color: "var(--text-muted)", textAlign: "center" }}
            >
              No pending actions
            </p>
          ) : (
            suggested.map((event) => (
              <button
                key={event.id}
                type="button"
                onClick={() => {
                  setOpen(false);
                  onNavigateToAction();
                }}
                className="flex w-full items-start gap-3 text-left"
                style={{
                  padding: "10px 14px",
                  borderBottom: "1px solid var(--border)",
                  background: "none",
                  border: "none",
                  borderBottomStyle: "solid",
                  borderBottomWidth: "1px",
                  borderBottomColor: "var(--border)",
                  cursor: "pointer",
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p
                    className="text-[12px] font-semibold"
                    style={{
                      color: "var(--text-1)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {event.displayText}
                  </p>
                  <p className="mt-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                    {formatRelative(event.createdAt)}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function formatRelative(value?: string | null): string {
  if (!value) return "Just now";
  const delta = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(delta / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/workspace/projects/\[projectId\]/overview/ActionBellDropdown.tsx
git commit -m "feat(overview): add ActionBellDropdown component"
```

---

### Task 7: Create ProjectOverviewTab orchestrator

**Files:**
- Create: `apps/web/src/app/workspace/projects/[projectId]/overview/ProjectOverviewTab.tsx`

- [ ] **Step 1: Create the orchestrator component**

This component assembles all the sub-components. It receives data from the parent and passes it down.

```tsx
// apps/web/src/app/workspace/projects/[projectId]/overview/ProjectOverviewTab.tsx
"use client";

import type {
  WorkspaceProject,
  WorkspaceTask,
  WorkspaceLarryEvent,
  WorkspaceTimeline,
  WorkspaceOutcomes,
  WorkspaceProjectMember,
} from "@/app/dashboard/types";
import { ProjectDescriptionCard } from "./ProjectDescriptionCard";
import { ProjectInfoTabs } from "./ProjectInfoTabs";
import { ProgressBox } from "./ProgressBox";
import { ActionBox } from "./ActionBox";
import { StatusBreakdown } from "./StatusBreakdown";

interface ProjectOverviewTabProps {
  project: WorkspaceProject;
  tasks: WorkspaceTask[];
  timeline: WorkspaceTimeline | null;
  outcomes: WorkspaceOutcomes | null;
  suggested: WorkspaceLarryEvent[];
  activity: WorkspaceLarryEvent[];
  members: WorkspaceProjectMember[];
  onNavigateToTab: (tab: string) => void;
}

export function ProjectOverviewTab({
  project,
  tasks,
  timeline,
  outcomes,
  suggested,
  activity,
  members,
  onNavigateToTab,
}: ProjectOverviewTabProps) {
  return (
    <div className="space-y-4">
      {/* Project description */}
      <ProjectDescriptionCard description={project.description} />

      {/* Tabbed info card: AI Summary | Recent Activity | My Tasks */}
      <ProjectInfoTabs
        narrative={outcomes?.narrative}
        activity={activity}
        tasks={tasks}
        onNavigateToTaskCenter={() => onNavigateToTab("tasks")}
      />

      {/* Progress box + Action box side by side */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "12px" }}>
        <ProgressBox
          tasks={tasks}
          timeline={timeline}
          targetDate={project.targetDate}
          members={members}
        />
        <ActionBox
          pendingCount={suggested.length}
          onGoToActionCenter={() => onNavigateToTab("actions")}
        />
      </div>

      {/* Status cards + Donut chart */}
      <StatusBreakdown tasks={tasks} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/workspace/projects/\[projectId\]/overview/ProjectOverviewTab.tsx
git commit -m "feat(overview): add ProjectOverviewTab orchestrator"
```

---

### Task 8: Wire into ProjectWorkspaceView — Header icons

**Files:**
- Modify: `apps/web/src/app/workspace/projects/[projectId]/ProjectWorkspaceView.tsx`

- [ ] **Step 1: Add import for ActionBellDropdown**

At the top of the file (after the existing imports around line 42), add:

```tsx
import { ActionBellDropdown } from "./overview/ActionBellDropdown";
```

- [ ] **Step 2: Add the bell icon and Larry chat icon to the header**

Find the header action buttons section (lines 1378–1396). The current code is:

```tsx
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={startProjectChat}
                className="inline-flex h-9 items-center gap-2 rounded-full px-4 text-[13px] font-semibold text-white"
                style={{ background: "var(--cta)" }}
              >
                <Sparkles size={14} />
                Ask Larry
              </button>
              <Link
                href={`/workspace/larry?projectId=${projectId}`}
                className="inline-flex h-9 items-center gap-2 rounded-full border px-4 text-[13px] font-semibold"
                style={{ borderColor: "var(--border)", color: "var(--text-2)" }}
              >
                <MessageSquare size={14} />
                Full chat history
              </Link>
            </div>
```

Replace it with:

```tsx
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={startProjectChat}
                className="inline-flex h-9 items-center gap-2 rounded-full px-4 text-[13px] font-semibold text-white"
                style={{ background: "var(--cta)" }}
              >
                <Sparkles size={14} />
                Ask Larry
              </button>
              <Link
                href={`/workspace/larry?projectId=${projectId}`}
                className="inline-flex h-9 items-center justify-center"
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "10px",
                  background: "rgba(108,68,246,0.15)",
                  border: "none",
                }}
                title="Project chat history"
              >
                <MessageSquare size={16} style={{ color: "#6c44f6" }} />
              </Link>
              <ActionBellDropdown
                suggested={suggested}
                onNavigateToAction={() => setActiveTab("actions")}
              />
            </div>
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/workspace/projects/\[projectId\]/ProjectWorkspaceView.tsx
git commit -m "feat(overview): add action bell and Larry chat icon to project header"
```

---

### Task 9: Wire into ProjectWorkspaceView — Replace Overview tab content

**Files:**
- Modify: `apps/web/src/app/workspace/projects/[projectId]/ProjectWorkspaceView.tsx`

- [ ] **Step 1: Add imports for ProjectOverviewTab and member types**

At the top of the file (with the other imports), add:

```tsx
import { ProjectOverviewTab } from "./overview/ProjectOverviewTab";
import type { WorkspaceProjectMember } from "@/app/dashboard/types";
```

- [ ] **Step 2: Add members fetch**

Inside the `ProjectWorkspaceView` component, after the existing hook calls (around line 1198), add a state + effect to fetch project members (needed for the ProgressBox employee filter):

```tsx
  const [overviewMembers, setOverviewMembers] = useState<WorkspaceProjectMember[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/workspace/projects/${encodeURIComponent(projectId)}/members`, { cache: "no-store" })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!cancelled && data?.members) setOverviewMembers(data.members);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [projectId]);
```

- [ ] **Step 3: Replace the entire Overview tab block**

Find the overview tab section. It starts at line 1549 with the comment `{/* ── Tab: Overview ────` and ends at line 1951 with `</>)}`. This is a large block (~400 lines) containing:
- Stat cards grid (lines 1551–1578)
- Two-column section: progress + Larry Summary on left, Action Centre sidebar on right (lines 1580–1852)
- Task breakdown buckets (lines 1854–1891)
- Task distribution bar chart (lines 1893–1950)

Replace the entire block from `{/* ── Tab: Overview ────────────────────────────── */}` through `</>)}` (lines 1549–1951) with:

```tsx
        {/* ── Tab: Overview ────────────────────────────── */}
        {activeTab === "overview" && (
          <ProjectOverviewTab
            project={project}
            tasks={tasks}
            timeline={timeline}
            outcomes={outcomes}
            suggested={suggested}
            activity={activity}
            members={overviewMembers}
            onNavigateToTab={(tab) => setActiveTab(tab as ProjectTab)}
          />
        )}
```

- [ ] **Step 4: Clean up unused state and variables**

After removing the inline overview, the following are no longer used *only* by the overview tab. Check each one — if it's still used elsewhere in the component keep it, otherwise remove:

- `summaryOpen` / `setSummaryOpen` state (line 1201) — only used in the old Larry Summary section. **Remove.**
- `actionCentreOpen` / `setActionCentreOpen` state (line 1168) — check if Action Center tab uses it. If only overview used it, remove. (The Action Center tab at `activeTab === "actions"` has its own UI — check and remove if safe.)

- [ ] **Step 5: Verify the build compiles**

Run: `cd /c/Dev/larry/site-deploys/larry-site && npm run web:dev`

Check the terminal for TypeScript/build errors. Fix any type mismatches.

- [ ] **Step 6: Visual verification**

Open `http://localhost:3000` in the browser. Navigate to a project. Verify:
1. Header shows Larry chat icon (purple chat bubble) and action bell with badge
2. Overview tab shows: project description card, tabbed info card, progress + action box, status cards + donut
3. Click through the three info tabs (AI Summary, Recent Activity, My Tasks)
4. Click the bell icon — dropdown opens with pending actions
5. Click "Go to Action Center" — switches to Action Center tab
6. Check responsive behaviour: resize browser to tablet/mobile widths

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/workspace/projects/\[projectId\]/ProjectWorkspaceView.tsx
git commit -m "feat(overview): wire new ProjectOverviewTab, replace inline overview content"
```

---

### Task 10: Responsive polish

**Files:**
- Modify: `apps/web/src/app/workspace/projects/[projectId]/overview/ProjectOverviewTab.tsx`
- Modify: `apps/web/src/app/workspace/projects/[projectId]/overview/StatusBreakdown.tsx`

- [ ] **Step 1: Add responsive grid to the Progress + Action row**

In `ProjectOverviewTab.tsx`, update the Progress + Action grid to stack on mobile:

Replace:
```tsx
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "12px" }}>
```

With:
```tsx
      <div className="grid gap-3" style={{ gridTemplateColumns: "minmax(0, 1fr) auto" }}>
```

And wrap it in a responsive container. Since we're using inline styles, add a CSS class. The simplest approach matching the existing pattern is to use Tailwind responsive classes:

```tsx
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
```

- [ ] **Step 2: Make status cards responsive**

In `StatusBreakdown.tsx`, update the outer grid and the status cards grid to be responsive:

Replace the outer grid:
```tsx
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "16px", alignItems: "start" }}>
```

With:
```tsx
    <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-[1fr_auto]">
```

Replace the status cards grid:
```tsx
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "10px" }}>
```

With:
```tsx
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-5">
```

- [ ] **Step 3: Verify responsive layout**

Open the browser, resize to mobile width (<768px). Verify:
- Progress box and Action box stack vertically
- Status cards wrap to 2-across on mobile, 3 on tablet, 5 on desktop
- Donut chart moves below status cards on mobile

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/workspace/projects/\[projectId\]/overview/ProjectOverviewTab.tsx apps/web/src/app/workspace/projects/\[projectId\]/overview/StatusBreakdown.tsx
git commit -m "feat(overview): add responsive breakpoints for mobile/tablet"
```

---

## Verification Checklist

After all tasks are complete, verify:

- [ ] Project header shows Larry chat icon (purple) and action bell (with red badge count)
- [ ] Bell dropdown opens on click, lists pending action headlines, click navigates to Action Center tab
- [ ] Overview tab shows project description card with purple tint
- [ ] Tabbed info card switches between AI Summary, Recent Activity, My Tasks
- [ ] AI Summary shows `outcomes.narrative` or fallback text
- [ ] Recent Activity shows up to 20 events with relative timestamps
- [ ] My Tasks shows current user's tasks with priority badges and due dates
- [ ] Progress box shows completion % with animated bar
- [ ] Area filter dropdown appears if timeline has categories
- [ ] Employee filter dropdown shows project members
- [ ] Filtering recalculates the progress bar correctly
- [ ] Action box shows pending count, "All Clear" when 0
- [ ] 5 status cards show correct counts with semantic colours
- [ ] Donut chart segments match status card colours and counts
- [ ] Layout is responsive: stacks on mobile, side-by-side on desktop
- [ ] No TypeScript errors in the build
- [ ] Other tabs (Timeline, Task Center, Dashboard, etc.) still work correctly
