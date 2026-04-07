"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronRight, ListChecks, Plus, Trash2 } from "lucide-react";
import type { WorkspaceTask } from "@/app/dashboard/types";

/* ── status → group mapping ─────────────────────────────── */

interface StatusGroup {
  id: string;
  label: string;
  dotColour: string;
  statuses: string[];
  collapsedByDefault: boolean;
}

const STATUS_GROUPS: StatusGroup[] = [
  {
    id: "not_started",
    label: "Not Started",
    dotColour: "#6c44f6",
    statuses: ["backlog", "not_started"],
    collapsedByDefault: false,
  },
  {
    id: "in_progress",
    label: "In Progress",
    dotColour: "#f59e0b",
    statuses: ["in_progress", "waiting"],
    collapsedByDefault: false,
  },
  {
    id: "blocked",
    label: "Blocked",
    dotColour: "#ef4444",
    statuses: ["blocked"],
    collapsedByDefault: false,
  },
  {
    id: "completed",
    label: "Completed",
    dotColour: "#22c55e",
    statuses: ["completed"],
    collapsedByDefault: true,
  },
];

/* ── priority badge colours ─────────────────────────────── */

const PRIORITY_COLOURS: Record<string, { fg: string; bg: string }> = {
  low: { fg: "#22c55e", bg: "rgba(34,197,94,0.1)" },
  medium: { fg: "#3b82f6", bg: "rgba(59,130,246,0.1)" },
  high: { fg: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
  critical: { fg: "#ef4444", bg: "rgba(239,68,68,0.1)" },
};

const STATUS_DOT_COLOURS: Record<string, string> = {
  backlog: "#6c44f6",
  not_started: "#6c44f6",
  in_progress: "#f59e0b",
  waiting: "#f59e0b",
  blocked: "#ef4444",
  completed: "#22c55e",
};

const STATUS_LABELS: Record<string, string> = {
  backlog: "Backlog",
  not_started: "Not Started",
  in_progress: "In Progress",
  waiting: "Waiting",
  blocked: "Blocked",
  completed: "Completed",
};

const ALL_STATUSES = ["backlog", "not_started", "in_progress", "waiting", "blocked", "completed"];

/* ── helpers ────────────────────────────────────────────── */

function parseDate(value: string): Date {
  // Handle both "YYYY-MM-DD" and ISO datetime strings like "2026-04-20T00:00:00.000Z"
  return value.includes("T") ? new Date(value) : new Date(value + "T00:00:00");
}

function formatDueDate(value: string | null): string {
  if (!value) return "—";
  const d = parseDate(value);
  if (isNaN(d.getTime())) return "—";
  const day = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleDateString("en-GB", { month: "short" });
  return `${day} ${month}`;
}

function dueDateColour(value: string | null, status: string): string {
  if (!value || status === "completed") return "var(--text-disabled)";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = parseDate(value);
  if (isNaN(d.getTime())) return "var(--text-disabled)";
  if (d < today) return "#ef4444";
  if (d.getTime() === today.getTime()) return "#f59e0b";
  return "var(--text-2)";
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ── component ──────────────────────────────────────────── */

interface TaskCenterProps {
  projectId: string;
  tasks: WorkspaceTask[];
  refresh: () => Promise<void>;
  openTaskId?: string | null;
}

/* ── status group → DB status mapping ──────────────────── */

const GROUP_TO_DB_STATUS: Record<string, string> = {
  not_started: "not_started",
  in_progress: "in_progress",
  blocked: "blocked",
  completed: "completed",
};

export function TaskCenter({ projectId, tasks, refresh, openTaskId }: TaskCenterProps) {
  const initialCollapsed = () => {
    const m: Record<string, boolean> = {};
    for (const g of STATUS_GROUPS) {
      m[g.id] = g.collapsedByDefault;
    }
    return m;
  };

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(initialCollapsed);

  /* ── inline creation state ─────────────────────────────── */

  const [creatingInGroup, setCreatingInGroup] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [newAssignee, setNewAssignee] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const dueDateInputRef = useRef<HTMLInputElement>(null);

  /* ── inline editing state ─────────────────────────────── */

  const [expandedTasks, setExpandedTasks] = useState<Record<string, boolean>>(
    openTaskId ? { [openTaskId]: true } : {}
  );
  const [editingTitle, setEditingTitle] = useState<string | null>(null);
  const [editTitleValue, setEditTitleValue] = useState("");
  const [openDropdown, setOpenDropdown] = useState<{ taskId: string; field: "status" | "priority" | "assignee"; rect: DOMRect } | null>(null);
  const [descriptions, setDescriptions] = useState<Record<string, string>>({});
  const [members, setMembers] = useState<Array<{ userId: string; name: string }>>([]);

  /* ── fetch project members ─────────────────────────────── */

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

  /* ── uncollapse group containing openTaskId when tasks load ── */

  useEffect(() => {
    if (!openTaskId || tasks.length === 0) return;
    const task = tasks.find((t) => t.id === openTaskId);
    if (!task) return;
    const group = STATUS_GROUPS.find((g) => g.statuses.includes(task.status));
    if (group) setCollapsed((prev) => ({ ...prev, [group.id]: false }));
  }, [openTaskId, tasks]);

  /* ── auto-focus title input when inline creation opens ── */

  useEffect(() => {
    if (creatingInGroup) titleInputRef.current?.focus();
  }, [creatingInGroup]);

  /* ── close dropdown on Escape key ────────────────────── */

  useEffect(() => {
    if (!openDropdown) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenDropdown(null);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [openDropdown]);

  /* ── creation helpers ──────────────────────────────────── */

  const startCreating = (groupId: string) => {
    setCreatingInGroup(groupId);
    setNewTitle("");
    setNewPriority("medium");
    setNewAssignee("");
    setNewDueDate("");
    setNewDescription("");
    setCollapsed((prev) => ({ ...prev, [groupId]: false }));
  };

  const cancelCreating = () => {
    setCreatingInGroup(null);
    setNewTitle("");
    setNewPriority("medium");
    setNewAssignee("");
    setNewDueDate("");
    setNewDescription("");
  };

  const patchTask = async (taskId: string, patch: Record<string, unknown>) => {
    try {
      const res = await fetch(`/api/workspace/tasks/${encodeURIComponent(taskId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) console.error("Failed to update task:", res.status);
      await refresh();
    } catch (err) {
      console.error("Error updating task:", err);
    }
  };

  const toggleExpand = (taskId: string) => {
    setExpandedTasks((prev) => ({ ...prev, [taskId]: !prev[taskId] }));
  };

  const saveTask = async () => {
    if (!newTitle.trim() || saving || !creatingInGroup) return;
    setSaving(true);
    try {
      const body: Record<string, string> = {
        projectId,
        title: newTitle.trim(),
        priority: newPriority,
      };
      if (newAssignee) body.assigneeUserId = newAssignee;
      const effectiveDueDate = dueDateInputRef.current?.value || newDueDate;
      if (effectiveDueDate) body.dueDate = effectiveDueDate;
      if (newDescription.trim()) body.description = newDescription.trim();

      const res = await fetch("/api/workspace/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        console.error("Failed to create task:", res.status);
        return;
      }

      const created = await res.json();

      /* If the target status differs from the API default, update it */
      const targetStatus = GROUP_TO_DB_STATUS[creatingInGroup];
      if (targetStatus && targetStatus !== "not_started" && created?.id) {
        const statusRes = await fetch(`/api/workspace/tasks/${encodeURIComponent(created.id)}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: targetStatus }),
        });
        if (!statusRes.ok) {
          console.error("Failed to update task status:", statusRes.status);
        }
      }

      cancelCreating();
      await refresh();
    } catch (err) {
      console.error("Error creating task:", err);
    } finally {
      setSaving(false);
    }
  };

  const deleteTask = async (taskId: string) => {
    try {
      await fetch(`/api/workspace/tasks/${encodeURIComponent(taskId)}`, { method: "DELETE" });
      await refresh();
    } catch (err) {
      console.error("Error deleting task:", err);
    }
  };

  const toggleGroup = (groupId: string) => {
    setCollapsed((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  /* ── group tasks ──────────────────────────────────────── */

  const grouped = STATUS_GROUPS.map((group) => ({
    ...group,
    tasks: tasks.filter((t) => group.statuses.includes(t.status)),
  }));

  /* ── empty state ──────────────────────────────────────── */

  if (tasks.length === 0 && creatingInGroup === null) {
    return (
      <div
        className="flex flex-col items-center justify-center px-6 py-14"
        style={{
          borderLeft: "3px solid var(--border-2)",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
        }}
      >
        <ListChecks size={32} style={{ color: "var(--text-disabled)", marginBottom: 10 }} />
        <p className="text-[14px] font-semibold" style={{ color: "var(--text-1)" }}>
          No tasks yet
        </p>
        <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
          Create your first task to start tracking work.
        </p>
        <button
          className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-[13px] font-semibold text-white"
          style={{ background: "var(--cta)", borderRadius: 3 }}
          onClick={() => startCreating("not_started")}
        >
          <Plus size={14} />
          New task
        </button>
      </div>
    );
  }

  /* ── main render ──────────────────────────────────────── */

  return (
    <div className="flex flex-col gap-4">
      {/* ── column headers ──────────────────────────────────── */}
      <div
        className="flex items-center gap-3 px-4"
        style={{
          height: 28,
          borderBottom: "1px solid var(--border)",
          background: "var(--surface-2, #f7f5ff)",
        }}
      >
        {/* chevron + status dot placeholders */}
        <span style={{ width: 18, flexShrink: 0 }} />
        <span style={{ width: 18, flexShrink: 0 }} />
        {/* Task */}
        <span className="flex-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#4b556b" }}>
          Task
        </span>
        {/* Priority */}
        <span className="w-[72px] text-right text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#4b556b", flexShrink: 0 }}>
          Priority
        </span>
        {/* Due */}
        <span className="w-[60px] text-right text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#4b556b", flexShrink: 0 }}>
          Due
        </span>
        {/* Assignee */}
        <span className="w-[110px] text-right text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#4b556b", flexShrink: 0 }}>
          Assignee
        </span>
      </div>

      {grouped.map((group) => {
        const isCollapsed = !!collapsed[group.id];

        return (
          <div
            key={group.id}
            style={{
              borderLeft: `3px solid ${group.dotColour}`,
              borderBottom: "1px solid var(--border)",
              background: "var(--surface)",
            }}
          >
            {/* ── group header ──────────────────────────── */}
            <div
              role="button"
              tabIndex={0}
              aria-expanded={!isCollapsed}
              onClick={() => toggleGroup(group.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggleGroup(group.id);
                }
              }}
              className="flex items-center gap-2 px-4 py-2.5 select-none"
              style={{
                cursor: "pointer",
                borderBottom: isCollapsed ? "none" : "1px solid var(--border)",
              }}
            >
              {isCollapsed ? (
                <ChevronRight size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
              ) : (
                <ChevronDown size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
              )}

              <span className="text-[13px] font-bold" style={{ color: "var(--text-1)" }}>
                {group.label}
              </span>

              {/* count */}
              <span
                className="text-[12px] font-medium"
                style={{ color: "var(--text-muted)" }}
              >
                {group.tasks.length}
              </span>

              <span className="flex-1" />

              {/* + New task button */}
              <button
                className="text-[12px] font-medium"
                style={{
                  color: "var(--text-muted)",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: "2px 4px",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  startCreating(group.id);
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-1)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
              >
                <Plus size={14} />
              </button>
            </div>

            {/* ── task rows ─────────────────────────────── */}
            {!isCollapsed && group.tasks.length > 0 && (
              <div>
                {group.tasks.map((task) => {
                  const pri = PRIORITY_COLOURS[task.priority] ?? PRIORITY_COLOURS.medium;

                  return (
                    <div key={task.id}>
                      {/* ── main row ─────────────────── */}
                      <div
                        className="flex items-center gap-3 px-4 py-2"
                        style={{
                          borderBottom: "1px solid var(--border-subtle, #faf8ff)",
                          cursor: "default",
                          minHeight: 38,
                        }}
                      >
                        {/* expand chevron */}
                        <button
                          onClick={() => toggleExpand(task.id)}
                          className="flex items-center justify-center"
                          style={{
                            width: 18,
                            height: 18,
                            flexShrink: 0,
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            color: "var(--text-muted)",
                          }}
                        >
                          {expandedTasks[task.id]
                            ? <ChevronDown size={13} />
                            : <ChevronRight size={13} />}
                        </button>

                        {/* status dot — click for dropdown */}
                        <div className="relative" style={{ flexShrink: 0 }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const rect = e.currentTarget.getBoundingClientRect();
                              setOpenDropdown(
                                openDropdown?.taskId === task.id && openDropdown?.field === "status"
                                  ? null
                                  : { taskId: task.id, field: "status", rect }
                              );
                            }}
                            style={{
                              width: 18,
                              height: 18,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              background: "transparent",
                              border: `1.5px solid ${STATUS_DOT_COLOURS[task.status] ?? group.dotColour}`,
                              cursor: "pointer",
                              borderRadius: "50%",
                            }}
                          >
                            {task.status === "completed" && (
                              <span
                                style={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: "50%",
                                  background: STATUS_DOT_COLOURS[task.status] ?? group.dotColour,
                                }}
                              />
                            )}
                          </button>

                          {openDropdown?.taskId === task.id && openDropdown?.field === "status" && createPortal(
                            <>
                              <div
                                className="fixed inset-0 z-[9998]"
                                onClick={() => setOpenDropdown(null)}
                              />
                              <div
                                className="fixed z-[9999] overflow-hidden"
                                style={{
                                  top: openDropdown.rect.bottom + 4,
                                  left: openDropdown.rect.left,
                                  minWidth: 160,
                                  borderRadius: 4,
                                  border: "1px solid var(--border)",
                                  background: "var(--surface)",
                                  boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
                                }}
                              >
                                {ALL_STATUSES.map((s) => (
                                  <button
                                    key={s}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOpenDropdown(null);
                                      if (s !== task.status) {
                                        void patchTask(task.id, { status: s });
                                      }
                                    }}
                                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12px] transition-colors"
                                    style={{
                                      color: "var(--text-1)",
                                      background: s === task.status ? "var(--surface-2)" : "transparent",
                                      cursor: "pointer",
                                      border: "none",
                                      borderBlockEnd: "1px solid var(--border)",
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-2)"; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.background = s === task.status ? "var(--surface-2)" : ""; }}
                                  >
                                    <span
                                      style={{
                                        width: 8,
                                        height: 8,
                                        borderRadius: "50%",
                                        background: STATUS_DOT_COLOURS[s] ?? "#888",
                                        flexShrink: 0,
                                      }}
                                    />
                                    {STATUS_LABELS[s] ?? s}
                                  </button>
                                ))}
                              </div>
                            </>,
                            document.body
                          )}
                        </div>

                        {/* title — click to edit */}
                        {editingTitle === task.id ? (
                          <input
                            type="text"
                            value={editTitleValue}
                            onChange={(e) => setEditTitleValue(e.target.value)}
                            onBlur={() => {
                              if (editTitleValue.trim() && editTitleValue.trim() !== task.title) {
                                void patchTask(task.id, { title: editTitleValue.trim() });
                              }
                              setEditingTitle(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                (e.target as HTMLInputElement).blur();
                              }
                              if (e.key === "Escape") {
                                setEditTitleValue(task.title);
                                setEditingTitle(null);
                              }
                            }}
                            autoFocus
                            className="flex-1 text-[13px] outline-none"
                            style={{
                              color: "var(--text-1)",
                              background: "var(--surface)",
                              border: "1px solid var(--brand)",
                              borderRadius: 2,
                              padding: "2px 4px",
                              minWidth: 0,
                            }}
                          />
                        ) : (
                          <span
                            className="flex-1 truncate text-[13px]"
                            style={{
                              color: "var(--text-1)",
                              cursor: "text",
                              padding: "2px 0",
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingTitle(task.id);
                              setEditTitleValue(task.title);
                            }}
                          >
                            {task.title}
                          </span>
                        )}

                        {/* priority badge — click for dropdown */}
                        <div className="relative flex justify-end" style={{ flexShrink: 0, width: 72 }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const rect = e.currentTarget.getBoundingClientRect();
                              setOpenDropdown(
                                openDropdown?.taskId === task.id && openDropdown?.field === "priority"
                                  ? null
                                  : { taskId: task.id, field: "priority", rect }
                              );
                            }}
                            className="inline-flex items-center px-2 py-0.5 text-[11px] font-semibold"
                            style={{
                              color: pri.fg,
                              background: pri.bg,
                              cursor: "pointer",
                              border: "none",
                              borderRadius: 3,
                            }}
                          >
                            {capitalize(task.priority)}
                          </button>

                          {openDropdown?.taskId === task.id && openDropdown?.field === "priority" && createPortal(
                            <>
                              <div
                                className="fixed inset-0 z-[9998]"
                                onClick={() => setOpenDropdown(null)}
                              />
                              <div
                                className="fixed z-[9999] overflow-hidden"
                                style={{
                                  top: openDropdown.rect.bottom + 4,
                                  left: openDropdown.rect.right,
                                  transform: "translateX(-100%)",
                                  minWidth: 130,
                                  borderRadius: 4,
                                  border: "1px solid var(--border)",
                                  background: "var(--surface)",
                                  boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
                                }}
                              >
                                {(["low", "medium", "high", "critical"] as const).map((p) => {
                                  const pc = PRIORITY_COLOURS[p];
                                  return (
                                    <button
                                      key={p}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOpenDropdown(null);
                                        if (p !== task.priority) {
                                          void patchTask(task.id, { priority: p });
                                        }
                                      }}
                                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12px] transition-colors"
                                      style={{
                                        color: "var(--text-1)",
                                        background: p === task.priority ? "var(--surface-2)" : "transparent",
                                        cursor: "pointer",
                                        border: "none",
                                        borderBlockEnd: "1px solid var(--border)",
                                      }}
                                      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-2)"; }}
                                      onMouseLeave={(e) => { e.currentTarget.style.background = p === task.priority ? "var(--surface-2)" : ""; }}
                                    >
                                      <span
                                        className="inline-flex items-center px-2 py-0.5 text-[10px] font-semibold"
                                        style={{ color: pc.fg, background: pc.bg, borderRadius: 3 }}
                                      >
                                        {capitalize(p)}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </>,
                            document.body
                          )}
                        </div>

                        {/* due date */}
                        <span
                          className="w-[60px] text-right text-[11px] font-medium tabular-nums"
                          style={{ color: dueDateColour(task.dueDate, task.status), flexShrink: 0 }}
                        >
                          {formatDueDate(task.dueDate)}
                        </span>

                        {/* assignee — click for dropdown */}
                        <div className="relative" style={{ flexShrink: 0 }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const rect = e.currentTarget.getBoundingClientRect();
                              setOpenDropdown(
                                openDropdown?.taskId === task.id && openDropdown?.field === "assignee"
                                  ? null
                                  : { taskId: task.id, field: "assignee", rect }
                              );
                            }}
                            className="w-[110px] truncate text-right text-[12px]"
                            style={{
                              color: task.assigneeName ? "var(--text-2)" : "var(--text-disabled)",
                              cursor: "pointer",
                              background: "transparent",
                              border: "none",
                              padding: "2px 0",
                            }}
                          >
                            {task.assigneeName ?? "\u2014"}
                          </button>

                          {openDropdown?.taskId === task.id && openDropdown?.field === "assignee" && createPortal(
                            <>
                              <div
                                className="fixed inset-0 z-[9998]"
                                onClick={() => setOpenDropdown(null)}
                              />
                              <div
                                className="fixed z-[9999] overflow-hidden"
                                style={{
                                  top: openDropdown.rect.bottom + 4,
                                  left: openDropdown.rect.right,
                                  transform: "translateX(-100%)",
                                  minWidth: 180,
                                  maxHeight: 240,
                                  overflowY: "auto",
                                  borderRadius: 4,
                                  border: "1px solid var(--border)",
                                  background: "var(--surface)",
                                  boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
                                }}
                              >
                                {/* Unassign option */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenDropdown(null);
                                    if (task.assigneeUserId) {
                                      void patchTask(task.id, { assigneeUserId: null });
                                    }
                                  }}
                                  className="flex w-full items-center px-3 py-2 text-left text-[12px] transition-colors"
                                  style={{
                                    color: "var(--text-disabled)",
                                    background: !task.assigneeUserId ? "var(--surface-2)" : "transparent",
                                    cursor: "pointer",
                                    border: "none",
                                    borderBlockEnd: "1px solid var(--border)",
                                    fontStyle: "italic",
                                  }}
                                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-2)"; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.background = !task.assigneeUserId ? "var(--surface-2)" : ""; }}
                                >
                                  Unassign
                                </button>
                                {members.map((m) => (
                                  <button
                                    key={m.userId}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOpenDropdown(null);
                                      if (m.userId !== task.assigneeUserId) {
                                        void patchTask(task.id, { assigneeUserId: m.userId });
                                      }
                                    }}
                                    className="flex w-full items-center px-3 py-2 text-left text-[12px] transition-colors"
                                    style={{
                                      color: "var(--text-1)",
                                      background: m.userId === task.assigneeUserId ? "var(--surface-2)" : "transparent",
                                      cursor: "pointer",
                                      border: "none",
                                      borderBlockEnd: "1px solid var(--border)",
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-2)"; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.background = m.userId === task.assigneeUserId ? "var(--surface-2)" : ""; }}
                                  >
                                    {m.name}
                                  </button>
                                ))}
                              </div>
                            </>,
                            document.body
                          )}
                        </div>

                      </div>

                      {/* ── expanded description ─────── */}
                      {expandedTasks[task.id] && (
                        <div
                          style={{
                            padding: "6px 16px 10px 48px",
                            borderBottom: "1px solid var(--border-subtle, #faf8ff)",
                          }}
                        >
                          <textarea
                            value={descriptions[task.id] ?? task.description ?? ""}
                            onChange={(e) =>
                              setDescriptions((prev) => ({ ...prev, [task.id]: e.target.value }))
                            }
                            onBlur={() => {
                              const val = descriptions[task.id];
                              if (val !== undefined && val !== (task.description ?? "")) {
                                void patchTask(task.id, { description: val });
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Escape") {
                                setDescriptions((prev) => {
                                  const next = { ...prev };
                                  delete next[task.id];
                                  return next;
                                });
                                (e.target as HTMLTextAreaElement).blur();
                              }
                            }}
                            placeholder="Add a description..."
                            maxLength={4000}
                            rows={3}
                            className="w-full text-[13px] outline-none resize-none transition-colors"
                            style={{
                              background: "var(--surface)",
                              border: "1px solid var(--border)",
                              borderRadius: 2,
                              color: "var(--text-2)",
                              padding: "8px 12px",
                            }}
                            onFocus={(e) => { e.currentTarget.style.borderColor = "var(--brand)"; e.currentTarget.style.borderStyle = "solid"; }}
                            onBlurCapture={(e) => { e.currentTarget.style.borderColor = "var(--border-2)"; e.currentTarget.style.borderStyle = "dashed"; }}
                          />
                          <div className="flex justify-start mt-2">
                            <button
                              onClick={() => deleteTask(task.id)}
                              className="inline-flex items-center gap-1.5 text-[12px]"
                              style={{
                                color: "#4b556b",
                                background: "transparent",
                                border: "none",
                                cursor: "pointer",
                                padding: "2px 4px",
                                borderRadius: 3,
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.color = "#ef4444"; }}
                              onMouseLeave={(e) => { e.currentTarget.style.color = "#4b556b"; }}
                            >
                              <Trash2 size={12} />
                              Delete task
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── inline creation row ──────────────────── */}
            {!isCollapsed && creatingInGroup === group.id && (
              <div>
                <div
                  className="flex items-center gap-3 px-4 py-2"
                  style={{
                    borderBottom: "1px solid var(--border)",
                    background: "rgba(108,68,246,0.03)",
                  }}
                >
                  {/* status dot */}
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: group.dotColour,
                      flexShrink: 0,
                    }}
                  />

                  {/* title input */}
                  <input
                    ref={titleInputRef}
                    type="text"
                    placeholder="Task title..."
                    aria-label="Task title"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); void saveTask(); }
                      if (e.key === "Escape") cancelCreating();
                    }}
                    disabled={saving}
                    className="flex-1 text-[13px]"
                    style={{
                      background: "transparent",
                      border: "none",
                      outline: "none",
                      color: "var(--text-1)",
                      padding: 0,
                      minWidth: 0,
                    }}
                  />

                  {/* priority select */}
                  <select
                    aria-label="Priority"
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as "low" | "medium" | "high" | "critical")}
                    onKeyDown={(e) => { if (e.key === "Escape") cancelCreating(); }}
                    disabled={saving}
                    className="text-[12px] px-1.5 py-0.5"
                    style={{
                      background: "var(--surface-2)",
                      border: "1px solid var(--border)",
                      color: "var(--text-2)",
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>

                  {/* assignee select */}
                  <select
                    aria-label="Assignee"
                    value={newAssignee}
                    onChange={(e) => setNewAssignee(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Escape") cancelCreating(); }}
                    disabled={saving}
                    className="w-[100px] truncate text-[12px] px-1.5 py-0.5"
                    style={{
                      background: "var(--surface-2)",
                      border: "1px solid var(--border)",
                      color: newAssignee ? "var(--text-2)" : "var(--text-disabled)",
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                  >
                    <option value="">Assign...</option>
                    {members.map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.name}
                      </option>
                    ))}
                  </select>

                  {/* due date input */}
                  <input
                    ref={dueDateInputRef}
                    type="date"
                    aria-label="Due date"
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                    onBlur={(e) => { if (e.target.value) setNewDueDate(e.target.value); }}
                    onKeyDown={(e) => { if (e.key === "Escape") cancelCreating(); }}
                    disabled={saving}
                    className="w-[130px] text-[12px]"
                    style={{
                      background: "var(--surface-2)",
                      border: "1px solid var(--border)",
                      borderRadius: 2,
                      color: "var(--text-2)",
                      padding: "2px 4px",
                      flexShrink: 0,
                    }}
                  />
                </div>

                {/* description for new task */}
                <div style={{ padding: "4px 16px 0" }}>
                  <textarea
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Escape") cancelCreating(); }}
                    disabled={saving}
                    placeholder="Add a description (optional)..."
                    maxLength={4000}
                    rows={2}
                    className="w-full text-[12px] outline-none resize-none transition-colors"
                    style={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 2,
                      color: "var(--text-2)",
                      padding: "6px 10px",
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = "var(--brand)"; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
                  />
                </div>

                {/* keyboard hints + action buttons */}
                <div className="flex items-center justify-between px-5 py-2">
                  <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    Enter to save &middot; Tab to next field &middot; Esc to cancel
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={cancelCreating}
                      disabled={saving}
                      className="px-3 py-1 text-[12px] font-medium"
                      style={{
                        color: "var(--text-2)",
                        border: "1px solid var(--border-2)",
                        background: "transparent",
                        cursor: "pointer",
                        borderRadius: 3,
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => void saveTask()}
                      disabled={saving || !newTitle.trim()}
                      className="px-3 py-1 text-[12px] font-semibold text-white"
                      style={{
                        background: saving || !newTitle.trim() ? "var(--text-disabled)" : "var(--cta)",
                        cursor: saving || !newTitle.trim() ? "not-allowed" : "pointer",
                        border: "none",
                        borderRadius: 3,
                      }}
                    >
                      {saving ? "Creating..." : "Create"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── empty group message ───────────────────── */}
            {!isCollapsed && group.tasks.length === 0 && creatingInGroup !== group.id && (
              <div className="px-4 py-3 text-[12px]" style={{ color: "var(--text-muted)" }}>
                No {group.label.toLowerCase()} tasks
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
