"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import type { WorkspaceTimelineTask, WorkspaceTimeline } from "@/app/dashboard/types";
import { TaskDetailPanel, type TaskPanelData, type TaskStatus as PanelStatus } from "@/components/dashboard/TaskDetailPanel";
import { TimelineToolbar } from "./TimelineToolbar";
import { TimelineGrid } from "./TimelineGrid";
import { GanttGroup } from "./TimelineSwimlane";
import { TimelineDependencyLines } from "./TimelineDependencyLines";
import { TimelineTooltip } from "./TimelineTooltip";
import { UnscheduledPanel } from "./UnscheduledPanel";
import { TimelineMobileList } from "./TimelineMobileList";
import {
  type ZoomLevel, type GroupBy, type ColourBy,
  computeTimelineRange, groupTasks, splitScheduled,
  STATUS_COLOURS, dateToPct, addDays,
} from "./timeline-utils";

/* ─── Status mapping (API types → panel types) ─────────────────────── */

const STATUS_TO_PANEL: Record<string, PanelStatus> = {
  not_started: "upcoming",
  on_track: "on-track",
  at_risk: "at-risk",
  overdue: "overdue",
  completed: "done",
};

function toTaskPanelData(task: WorkspaceTimelineTask): TaskPanelData {
  const fullName = task.assigneeName ?? null;
  const initials = fullName
    ? fullName.split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase()
    : "?";
  const rawDeadline = task.endDate ?? task.dueDate ?? "";
  const deadline = rawDeadline ? rawDeadline.slice(0, 10) : "";
  return {
    id: task.id,
    name: task.title,
    description: "",
    status: STATUS_TO_PANEL[task.status] ?? "upcoming",
    priority: task.priority,
    assignee: initials,
    assigneeFull: fullName ?? "Unassigned",
    project: task.category ?? "",
    deadline,
    progress: task.progressPercent ?? 0,
  };
}

/* ─── Add task modal ────────────────────────────────────────────────── */

interface Member { userId: string; name: string; }

function AddTaskModal({
  projectId,
  onSave,
  onClose,
}: {
  projectId: string;
  onSave: () => Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
    let cancelled = false;
    fetch(`/api/workspace/projects/${encodeURIComponent(projectId)}/members`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && Array.isArray(data?.members)) {
          setMembers(data.members.map((m: { userId: string; name?: string; email?: string }) => ({
            userId: m.userId,
            name: m.name || m.email || "Unknown",
          })));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [projectId]);

  const handleSave = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      const body: Record<string, string> = { projectId, title: title.trim(), priority };
      if (assigneeId) body.assigneeUserId = assigneeId;
      if (dueDate) body.dueDate = dueDate;
      if (startDate) body.startDate = startDate;
      if (description.trim()) body.description = description.trim();
      const res = await fetch("/api/workspace/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) return;
      await onSave();
      onClose();
    } catch {
      // silently fail
    } finally {
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    borderRadius: "6px",
    border: "1px solid var(--border)",
    background: "var(--surface-2)",
    color: "var(--text-1)",
    fontSize: "13px",
    outline: "none",
    boxSizing: "border-box",
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)", backdropFilter: "blur(2px)" }} />
      <div style={{
        position: "relative",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-card)",
        padding: "24px",
        width: "400px",
        maxHeight: "88vh",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 8px 32px rgba(0,0,0,0.16)",
      }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-[15px] font-bold" style={{ color: "var(--text-1)" }}>Add task</h3>
          <button type="button" onClick={onClose} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "6px", padding: "4px", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}>
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "14px" }}>
          {/* Title */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "var(--text-muted)" }}>Title *</p>
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleSave(); if (e.key === "Escape") onClose(); }}
              placeholder="Task title..."
              style={inputStyle}
            />
          </div>

          {/* Priority */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "var(--text-muted)" }}>Priority</p>
            <select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)} style={inputStyle}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>

          {/* Assignee */}
          {members.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "var(--text-muted)" }}>Assignee</p>
              <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} style={inputStyle}>
                <option value="">Unassigned</option>
                {members.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
              </select>
            </div>
          )}

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "var(--text-muted)" }}>Start date</p>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "var(--text-muted)" }}>Due date</p>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={inputStyle} />
            </div>
          </div>

          {/* Description */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "var(--text-muted)" }}>Description</p>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a description (optional)..."
              rows={3}
              style={{ ...inputStyle, resize: "none" }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 mt-5 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-[13px] font-medium rounded-lg"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-2)", cursor: "pointer" }}
          >
            Cancel
          </button>
          <button type="button" onClick={() => void handleSave()} disabled={!title.trim() || saving}
            className="px-4 py-2 text-[13px] font-medium rounded-lg"
            style={{ background: "#6c44f6", border: "none", color: "#fff", cursor: "pointer", opacity: (!title.trim() || saving) ? 0.5 : 1 }}
          >
            {saving ? "Adding..." : "Add task"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Component ────────────────────────────────────────────────────── */

interface ProjectTimelineProps {
  projectId: string;
  tasks: WorkspaceTimelineTask[];
  timeline: WorkspaceTimeline | null;
  refresh: () => Promise<void>;
}

export function ProjectTimeline({
  projectId, tasks: allTasks, timeline, refresh,
}: ProjectTimelineProps) {
  // Smart default zoom: pick based on task date span
  const defaultZoom = useMemo<ZoomLevel>(() => {
    const { totalDays } = computeTimelineRange(allTasks as WorkspaceTimelineTask[], "month");
    if (totalDays < 21) return "week";
    if (totalDays < 120) return "month";
    return "quarter";
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [zoom, setZoom] = useState<ZoomLevel>(defaultZoom);
  const [groupBy, setGroupBy] = useState<GroupBy>("assignee");
  const [colourBy, setColourBy] = useState<ColourBy>("status");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [allCollapsed, setAllCollapsed] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [addingTask, setAddingTask] = useState(false);

  const gridRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Responsive check
  useEffect(() => {
    function check() { setIsMobile(window.innerWidth < 1024); }
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Merge timeline.gantt tasks with allTasks so newly created tasks always appear.
  // Supplement gantt tasks with assigneeName from allTasks (gantt query omits the JOIN).
  // Synthesize startDate = today for tasks that only have dueDate so they appear as bars.
  const timelineTasks = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    const allTasksTyped = allTasks as WorkspaceTimelineTask[];
    const nameById = new Map(allTasksTyped.map((t) => [t.id, t.assigneeName ?? null]));

    function enrich(t: WorkspaceTimelineTask): WorkspaceTimelineTask {
      return {
        ...t,
        assigneeName: t.assigneeName ?? nameById.get(t.id) ?? null,
        startDate: t.startDate ?? (t.dueDate ? today : null),
      };
    }

    const ganttTasks = timeline?.gantt;
    if (!ganttTasks || ganttTasks.length === 0) return allTasksTyped.map(enrich);
    const ganttIds = new Set(ganttTasks.map((t) => t.id));
    const extra = allTasksTyped.filter((t) => !ganttIds.has(t.id));
    return [...ganttTasks.map(enrich), ...extra.map(enrich)];
  }, [timeline?.gantt, allTasks]);

  // Split scheduled / unscheduled
  const { scheduled, unscheduled } = useMemo(
    () => splitScheduled(timelineTasks),
    [timelineTasks],
  );

  // Filter by search
  const filteredTasks = useMemo(() => {
    if (!searchQuery.trim()) return scheduled;
    const q = searchQuery.toLowerCase();
    return scheduled.filter((t) => t.title.toLowerCase().includes(q));
  }, [scheduled, searchQuery]);

  // Dimmed set
  const dimmedTaskIds = useMemo(() => {
    if (!searchQuery.trim()) return new Set<string>();
    const matchIds = new Set(filteredTasks.map((t) => t.id));
    return new Set(scheduled.filter((t) => !matchIds.has(t.id)).map((t) => t.id));
  }, [scheduled, filteredTasks, searchQuery]);

  // Groups
  const groups = useMemo(
    () => groupTasks(scheduled, groupBy),
    [scheduled, groupBy],
  );

  // Auto-expand all groups on first render and when grouping changes
  useEffect(() => {
    setExpandedGroups(new Set(groups.map((g) => g.key)));
  }, [groupBy]); // eslint-disable-line react-hooks/exhaustive-deps

  // Timeline range
  const range = useMemo(
    () => computeTimelineRange(scheduled, zoom),
    [scheduled, zoom],
  );

  // Dependency highlights
  const deps = timeline?.dependencies ?? [];
  const highlightedTaskIds = useMemo(() => {
    if (!hoveredTaskId) return new Set<string>();
    const ids = new Set<string>();
    for (const d of deps) {
      if (d.taskId === hoveredTaskId || d.dependsOnTaskId === hoveredTaskId) {
        ids.add(d.taskId);
        ids.add(d.dependsOnTaskId);
      }
    }
    return ids;
  }, [hoveredTaskId, deps]);

  // Selected task for side panel
  const selectedTask = useMemo(
    () => timelineTasks.find((t) => t.id === selectedTaskId) ?? null,
    [timelineTasks, selectedTaskId],
  );

  // Keyboard shortcuts
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) return;

      switch (e.key.toLowerCase()) {
        case "w": setZoom("week"); break;
        case "m": setZoom("month"); break;
        case "q": setZoom("quarter"); break;
        case "t": jumpToToday(); break;
        case "escape": setSelectedTaskId(null); break;
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Jump to today
  const jumpToToday = useCallback(() => {
    if (!gridRef.current) return;
    const todayPct = dateToPct(new Date(), range);
    const scrollWidth = gridRef.current.scrollWidth;
    const viewportWidth = gridRef.current.clientWidth;
    const targetScroll = (todayPct / 100) * scrollWidth - viewportWidth / 2;
    gridRef.current.scrollTo({ left: Math.max(0, targetScroll), behavior: "smooth" });
  }, [range]);

  // Collapse all toggle
  const toggleCollapseAll = useCallback(() => {
    if (allCollapsed) {
      setExpandedGroups(new Set(groups.map((g) => g.key)));
      setAllCollapsed(false);
    } else {
      setExpandedGroups(new Set());
      setAllCollapsed(true);
    }
  }, [allCollapsed, groups]);

  // Toggle individual group
  const toggleGroup = useCallback((key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  // Schedule task (drag from unscheduled panel)
  const handleScheduleTask = useCallback(async (
    taskId: string, startDate: string, endDate: string,
  ) => {
    try {
      await fetch(`/api/workspace/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, endDate }),
      });
      window.dispatchEvent(new CustomEvent("larry:refresh-snapshot"));
      await refresh();
    } catch {
      // Error handled silently — task stays in unscheduled
    }
  }, [refresh]);

  // Drop handler for the grid area
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("text/plain");
    if (!taskId || !gridRef.current) return;

    const rect = gridRef.current.getBoundingClientRect();
    const scrollLeft = gridRef.current.scrollLeft;
    const x = e.clientX - rect.left + scrollLeft;
    const totalWidth = gridRef.current.scrollWidth;
    const dayOffset = Math.round((x / totalWidth) * range.totalDays);
    const dropDate = addDays(range.start, dayOffset);
    const endDate = addDays(dropDate, 7);

    handleScheduleTask(
      taskId,
      dropDate.toISOString().split("T")[0],
      endDate.toISOString().split("T")[0],
    );
  }, [range, handleScheduleTask]);

  // Task positions for dependency lines
  const taskPositions = useMemo(() => {
    const positions = new Map<string, number>();
    let y = 0;
    for (const group of groups) {
      y += 40; // group header height
      if (expandedGroups.has(group.key)) {
        for (const task of group.tasks) {
          y += 20; // mid-point of task row (40px / 2)
          positions.set(task.id, y);
          y += 20;
        }
      }
    }
    return positions;
  }, [groups, expandedGroups]);

  // Mobile fallback
  if (isMobile) {
    return (
      <TimelineMobileList
        tasks={timelineTasks}
        onSelectTask={setSelectedTaskId}
      />
    );
  }

  return (
    <div ref={containerRef} className="flex flex-1 flex-col" style={{ minHeight: 0 }}>
      {/* Toolbar */}
      <TimelineToolbar
        zoom={zoom}
        groupBy={groupBy}
        colourBy={colourBy}
        searchQuery={searchQuery}
        allCollapsed={allCollapsed}
        onZoomChange={setZoom}
        onGroupByChange={setGroupBy}
        onColourByChange={setColourBy}
        onSearchChange={setSearchQuery}
        onToggleCollapseAll={toggleCollapseAll}
        onJumpToToday={jumpToToday}
        onAddTask={() => setAddingTask(true)}
      />

      {/* Main timeline area */}
      <div
        className="relative flex overflow-hidden rounded-2xl border border-[var(--border)] bg-white"
        style={{ boxShadow: "var(--shadow-1)", minHeight: 300 }}
      >
        <TimelineGrid
          ref={gridRef}
          range={range}
          zoom={zoom}
          chartOverlay={
            <TimelineDependencyLines
              dependencies={deps}
              tasks={scheduled}
              range={range}
              hoveredTaskId={hoveredTaskId}
              taskPositions={taskPositions}
            />
          }
        >
          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
            onDrop={handleDrop}
          >
            {/* Gantt rows */}
            {groups.map((group) => (
              <GanttGroup
                key={group.key}
                group={group}
                range={range}
                colourBy={colourBy}
                isExpanded={expandedGroups.has(group.key)}
                selectedTaskId={selectedTaskId}
                highlightedTaskIds={highlightedTaskIds}
                dimmedTaskIds={dimmedTaskIds}
                onToggle={() => toggleGroup(group.key)}
                onSelectTask={setSelectedTaskId}
                onHoverTask={setHoveredTaskId}
              />
            ))}

            {/* Empty state */}
            {groups.length === 0 && (
              <div className="flex items-center justify-center py-16">
                <p className="text-[12px] text-[var(--text-disabled)]">
                  No scheduled tasks to display on the timeline
                </p>
              </div>
            )}
          </div>
        </TimelineGrid>

        {/* Task detail side panel */}
        <AnimatePresence>
          {selectedTask && (
            <TaskDetailPanel
              key={selectedTask.id}
              task={toTaskPanelData(selectedTask)}
              onClose={() => setSelectedTaskId(null)}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Unscheduled panel */}
      <UnscheduledPanel
        tasks={unscheduled}
        onScheduleTask={handleScheduleTask}
      />

      {/* Legend */}
      <div className="mt-1.5 flex flex-wrap items-center gap-3">
        {Object.entries(STATUS_COLOURS).map(([key, cfg]) => (
          <span key={key} className="flex items-center gap-1.5 text-[10px] text-[var(--text-disabled)]">
            <span className="h-2 w-2 rounded-full" style={{ background: cfg.dot }} />
            {cfg.label}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-[10px] text-[var(--text-disabled)] ml-auto">
          <span className="h-3 w-px" style={{ background: "rgba(108, 68, 246, 0.4)" }} />
          Today
        </span>
      </div>

      {/* Add task modal */}
      {addingTask && (
        <AddTaskModal
          projectId={projectId}
          onSave={async () => { await refresh(); }}
          onClose={() => setAddingTask(false)}
        />
      )}
    </div>
  );
}
