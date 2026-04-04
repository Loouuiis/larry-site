"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { BoardTaskRow, TaskGroup } from "@/app/dashboard/types";

interface TaskTableProps {
  groups: TaskGroup[];
  onTaskClick: (task: BoardTaskRow) => void;
  onOpenAddTask: (group: TaskGroup) => void;
  onAddGroup: () => void;
  onStatusChange?: (taskId: string, newStatus: string) => void;
}

const ALL_STATUSES: Array<{ value: string; label: string; pillClass: string }> = [
  { value: "not_started", label: "Not started",  pillClass: "pm-pill pm-pill-not-started" },
  { value: "on_track",    label: "On track",     pillClass: "pm-pill pm-pill-working" },
  { value: "at_risk",     label: "At risk",      pillClass: "pm-pill pm-pill-review" },
  { value: "overdue",     label: "Overdue",      pillClass: "pm-pill pm-pill-stuck" },
  { value: "completed",   label: "Completed",    pillClass: "pm-pill pm-pill-done" },
];

function statusPillClass(status: string): string {
  switch (status) {
    case "completed":  return "pm-pill pm-pill-done";
    case "on_track":   return "pm-pill pm-pill-working";
    case "overdue":    return "pm-pill pm-pill-stuck";
    case "at_risk":    return "pm-pill pm-pill-review";
    default:           return "pm-pill pm-pill-not-started";
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "completed":  return "Completed";
    case "on_track":   return "On track";
    case "overdue":    return "Overdue";
    case "at_risk":    return "At risk";
    case "not_started": return "Not started";
    default: return status;
  }
}

function priorityDotStyle(priority: string | null | undefined): React.CSSProperties {
  switch (priority) {
    case "critical": return { background: "var(--status-stuck-bg)" };
    case "high": return { background: "var(--status-wip-bg)" };
    case "medium": return { background: "var(--cta)" };
    default: return { background: "#98A2B3" };
  }
}

function formatDueDate(value: string | null): string {
  if (!value) return "No date";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function isPastDue(value: string | null): boolean {
  if (!value) return false;
  return new Date(value) < new Date();
}

function getInitials(name?: string | null): string {
  if (!name) return "UN";
  const parts = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) return "UN";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function getAvatarTone(name?: string | null): string {
  const palette = [
    "bg-[#dbeafe] text-[#1e3a8a]",
    "bg-[#ede9fe] text-[#5b21b6]",
    "bg-[#dcfce7] text-[#166534]",
    "bg-[#ffedd5] text-[#9a3412]",
  ];
  const key = name ?? "unassigned";
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash + key.charCodeAt(index)) % palette.length;
  }
  return palette[hash];
}

function groupAccentClass(key: TaskGroup["key"]): string {
  switch (key) {
    case "on_track":  return "pm-group-accent-progress";
    case "overdue":   return "pm-group-accent-blocked";
    case "completed": return "pm-group-accent-done";
    default:          return "pm-group-accent-todo";
  }
}

function GroupProgressStrip({ tasks }: { tasks: BoardTaskRow[] }) {
  const total = tasks.length || 1;
  const completed = tasks.filter((t) => t.status === "completed").length;
  const onTrack = tasks.filter((t) => t.status === "on_track").length;
  const overdue = tasks.filter((t) => t.status === "overdue").length;
  const other = tasks.length - completed - onTrack - overdue;

  return (
    <div className="pm-summary-bar" style={{ height: 3 }}>
      <span style={{ width: `${(completed / total) * 100}%`, background: "var(--pm-green)" }} />
      <span style={{ width: `${(onTrack / total) * 100}%`, background: "var(--pm-orange)" }} />
      <span style={{ width: `${(overdue / total) * 100}%`, background: "var(--pm-red)" }} />
      <span style={{ width: `${(other / total) * 100}%`, background: "var(--surface-2)" }} />
    </div>
  );
}

const GRID_COLS = "grid-cols-[20px_minmax(0,1fr)_40px_48px_110px_90px_32px]";

export function TaskTable({ groups, onTaskClick, onOpenAddTask, onAddGroup, onStatusChange }: TaskTableProps) {
  const defaultCollapsed = useMemo(
    () => Object.fromEntries(
      groups.map((group) => [group.key, group.key === "completed" && group.tasks.length > 3])
    ) as Record<TaskGroup["key"], boolean>,
    [groups]
  );

  const [collapsed, setCollapsed] = useState<Record<TaskGroup["key"], boolean>>(defaultCollapsed);
  const [statusOpen, setStatusOpen] = useState<string | null>(null);

  useEffect(() => {
    setCollapsed((previous) => ({
      not_started: previous.not_started ?? defaultCollapsed.not_started,
      on_track: previous.on_track ?? defaultCollapsed.on_track,
      at_risk: previous.at_risk ?? defaultCollapsed.at_risk,
      overdue: previous.overdue ?? defaultCollapsed.overdue,
      completed: previous.completed ?? defaultCollapsed.completed,
    }));
  }, [defaultCollapsed]);

  // Close status dropdown on outside click
  useEffect(() => {
    if (!statusOpen) return;
    function handleClick() { setStatusOpen(null); }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [statusOpen]);

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-card)",
        overflow: "hidden",
        background: "var(--surface)",
      }}
    >
      {/* Column header */}
      <div className={`pm-table-header grid ${GRID_COLS}`}>
        <span />
        <span>Task</span>
        <span>Priority</span>
        <span>Owner</span>
        <span>Status</span>
        <span>Due</span>
        <span />
      </div>

      {groups.map((group) => {
        const isCollapsed = collapsed[group.key] ?? false;

        return (
          <section key={group.key}>
            {/* Group header */}
            <div
              className={`pm-group-header ${groupAccentClass(group.key)}`}
              style={{ cursor: "pointer" }}
              onClick={() => setCollapsed((prev) => ({ ...prev, [group.key]: !isCollapsed }))}
            >
              <ChevronDown
                size={14}
                style={{
                  color: "var(--text-muted)",
                  transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
                  transition: "transform 0.15s",
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-1)" }}>
                {group.label}
              </span>
              <span
                style={{
                  fontSize: "12px",
                  color: "var(--text-muted)",
                  background: "var(--surface-2)",
                  borderRadius: "var(--radius-badge)",
                  padding: "1px 8px",
                }}
              >
                {group.tasks.length} tasks
              </span>
            </div>

            {!isCollapsed && (
              <>
                {group.tasks.map((task) => (
                  <div
                    key={task.id}
                    className={`pm-table-row grid ${GRID_COLS}`}
                    style={{ position: "relative" }}
                  >
                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded"
                      onClick={(e) => e.stopPropagation()}
                    />

                    {/* Task name */}
                    <button
                      type="button"
                      onClick={() => onTaskClick(task)}
                      style={{
                        fontSize: "14px",
                        fontWeight: 400,
                        color: "var(--text-1)",
                        textAlign: "left",
                        background: "none",
                        border: "none",
                        padding: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        cursor: "pointer",
                      }}
                    >
                      {task.title}
                    </button>

                    {/* Priority dot */}
                    <div style={{ display: "flex", alignItems: "center" }}>
                      <span
                        style={{
                          width: "8px",
                          height: "8px",
                          borderRadius: "50%",
                          flexShrink: 0,
                          ...priorityDotStyle(task.priority),
                        }}
                        title={task.priority ?? "low"}
                      />
                    </div>

                    {/* Owner avatar */}
                    <div style={{ display: "flex", alignItems: "center" }}>
                      <span
                        className={`inline-flex items-center justify-center rounded-full text-[10px] font-semibold ${getAvatarTone(task.assigneeName)}`}
                        style={{ width: "28px", height: "28px", flexShrink: 0 }}
                        title={task.assigneeName ?? "Unassigned"}
                      >
                        {getInitials(task.assigneeName)}
                      </span>
                    </div>

                    {/* Status pill — clickable */}
                    <div style={{ position: "relative" }}>
                      <button
                        type="button"
                        className={statusPillClass(task.status)}
                        onClick={(e) => {
                          e.stopPropagation();
                          setStatusOpen((prev) => (prev === task.id ? null : task.id));
                        }}
                        style={{ cursor: "pointer" }}
                      >
                        <span style={{
                          width: 6, height: 6, borderRadius: "50%",
                          background: task.status === "completed" ? "#34d399"
                            : task.status === "on_track" ? "#6c44f6"
                            : task.status === "overdue" ? "#ef4444"
                            : task.status === "at_risk" ? "#f59e0b"
                            : "#94a3b8",
                          flexShrink: 0,
                        }} />
                        {statusLabel(task.status)}
                      </button>

                      {statusOpen === task.id && (
                        <div
                          onMouseDown={(e) => e.stopPropagation()}
                          style={{
                            position: "absolute",
                            top: "calc(100% + 4px)",
                            left: 0,
                            zIndex: 50,
                            background: "var(--surface)",
                            border: "1px solid var(--border)",
                            borderRadius: "var(--radius-card)",
                            boxShadow: "var(--shadow-2)",
                            minWidth: "140px",
                            overflow: "hidden",
                          }}
                        >
                          {ALL_STATUSES.map((s) => (
                            <button
                              key={s.value}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onStatusChange?.(task.id, s.value);
                                setStatusOpen(null);
                              }}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                width: "100%",
                                padding: "8px 12px",
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                textAlign: "left",
                              }}
                              className="hover:bg-[var(--surface-2)]"
                            >
                              <span className={s.pillClass}>{s.label}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Due date */}
                    <span
                      style={{
                        fontSize: "14px",
                        color: isPastDue(task.dueDate) ? "var(--pm-red)" : "var(--text-muted)",
                      }}
                    >
                      {formatDueDate(task.dueDate)}
                    </span>

                    {/* Empty last col */}
                    <span />
                  </div>
                ))}

                {/* Inline add task row */}
                <div
                  className={`pm-table-row grid ${GRID_COLS}`}
                  style={{ cursor: "pointer", color: "var(--text-muted)" }}
                  onClick={() => onOpenAddTask(group)}
                >
                  <span />
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: "13px",
                    }}
                  >
                    <Plus size={13} />
                    Add task
                  </span>
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </div>

                {/* Progress strip */}
                <div style={{ padding: "6px 16px 8px" }}>
                  <GroupProgressStrip tasks={group.tasks} />
                </div>
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}
