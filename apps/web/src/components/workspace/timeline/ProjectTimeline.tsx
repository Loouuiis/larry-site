"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { AnimatePresence } from "framer-motion";
import type { WorkspaceTimelineTask, WorkspaceTimeline } from "@/app/dashboard/types";
import { TaskDetailPanel, type TaskPanelData, type TaskStatus as PanelStatus } from "@/components/dashboard/TaskDetailPanel";
import { TimelineToolbar } from "./TimelineToolbar";
import { TimelineGrid } from "./TimelineGrid";
import { TimelineSwimlane } from "./TimelineSwimlane";
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
  const initials = (task.assigneeName ?? task.assigneeUserId ?? "?")
    .split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return {
    id: task.id,
    name: task.title,
    description: "",
    status: STATUS_TO_PANEL[task.status] ?? "upcoming",
    priority: task.priority,
    assignee: initials,
    assigneeFull: task.assigneeName ?? task.assigneeUserId ?? "Unassigned",
    project: task.category ?? "",
    deadline: task.endDate ?? task.dueDate ?? "",
    progress: task.progressPercent ?? 0,
  };
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
  const [groupBy, setGroupBy] = useState<GroupBy>("phase");
  const [colourBy, setColourBy] = useState<ColourBy>("status");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [allCollapsed, setAllCollapsed] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  const gridRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Responsive check
  useEffect(() => {
    function check() { setIsMobile(window.innerWidth < 1024); }
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Use timeline.gantt tasks if available, fall back to allTasks
  const timelineTasks = useMemo(() => {
    const ganttTasks = timeline?.gantt;
    if (ganttTasks && ganttTasks.length > 0) return ganttTasks;
    return allTasks as WorkspaceTimelineTask[];
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
    let y = 18;
    for (const group of groups) {
      y += 36;
      if (expandedGroups.has(group.key)) {
        for (const task of group.tasks) {
          y += 20;
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
        >
          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
            onDrop={handleDrop}
          >
            {/* Dependency lines */}
            <TimelineDependencyLines
              dependencies={deps}
              tasks={scheduled}
              range={range}
              hoveredTaskId={hoveredTaskId}
              taskPositions={taskPositions}
            />

            {/* Swimlanes */}
            {groups.map((group) => (
              <TimelineSwimlane
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
    </div>
  );
}
