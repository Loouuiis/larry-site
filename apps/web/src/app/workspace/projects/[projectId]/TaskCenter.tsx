"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, ListChecks, Plus } from "lucide-react";
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

/* ── helpers ────────────────────────────────────────────── */

function formatDueDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  const day = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleDateString("en-GB", { month: "short" });
  return `${day} ${month}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ── component ──────────────────────────────────────────── */

interface TaskCenterProps {
  projectId: string;
  tasks: WorkspaceTask[];
  refresh: () => Promise<void>;
}

export function TaskCenter({ projectId, tasks, refresh }: TaskCenterProps) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const startCreating = (_groupId: string) => {};

  const initialCollapsed = () => {
    const m: Record<string, boolean> = {};
    for (const g of STATUS_GROUPS) {
      m[g.id] = g.collapsedByDefault;
    }
    return m;
  };

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(initialCollapsed);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  const toggleGroup = (groupId: string) => {
    setCollapsed((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  /* ── group tasks ──────────────────────────────────────── */

  const grouped = STATUS_GROUPS.map((group) => ({
    ...group,
    tasks: tasks.filter((t) => group.statuses.includes(t.status)),
  }));

  /* ── empty state ──────────────────────────────────────── */

  if (tasks.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center px-6 py-16"
        style={{
          borderRadius: "var(--radius-card)",
          border: "1px dashed var(--border-2)",
          background: "var(--surface)",
        }}
      >
        <ListChecks size={36} style={{ color: "var(--text-disabled)", marginBottom: 12 }} />
        <p className="text-[15px] font-semibold" style={{ color: "var(--text-1)" }}>
          No tasks yet
        </p>
        <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
          Create your first task to start tracking work for this project.
        </p>
        <button
          className="mt-5 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-semibold text-white"
          style={{ background: "var(--cta)" }}
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
    <div className="flex flex-col gap-2">
      {grouped.map((group) => {
        const isCollapsed = !!collapsed[group.id];

        return (
          <div
            key={group.id}
            style={{
              borderRadius: "var(--radius-card)",
              border: "1px solid var(--border)",
              background: "var(--surface)",
              overflow: "hidden",
            }}
          >
            {/* ── group header ──────────────────────────── */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => toggleGroup(group.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggleGroup(group.id);
                }
              }}
              className="flex items-center gap-2 px-4 py-3 select-none"
              style={{
                cursor: "pointer",
                borderBottom: isCollapsed ? "none" : "1px solid var(--border)",
              }}
            >
              {isCollapsed ? (
                <ChevronRight size={16} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
              ) : (
                <ChevronDown size={16} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
              )}

              {/* status dot */}
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: group.dotColour,
                  flexShrink: 0,
                }}
              />

              <span className="text-[13px] font-semibold" style={{ color: "var(--text-1)" }}>
                {group.label}
              </span>

              {/* count badge */}
              <span
                className="ml-1 inline-flex items-center justify-center rounded-full px-2 text-[11px] font-medium"
                style={{
                  background: "var(--surface-2)",
                  color: "var(--text-2)",
                  minWidth: 20,
                  height: 20,
                }}
              >
                {group.tasks.length}
              </span>

              <span className="flex-1" />

              {/* + New task button */}
              <button
                className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[12px] font-medium"
                style={{
                  color: "var(--text-2)",
                  border: "1px solid var(--border-2)",
                  background: "transparent",
                  cursor: "pointer",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  startCreating(group.id);
                }}
              >
                <Plus size={12} />
                New task
              </button>
            </div>

            {/* ── task rows ─────────────────────────────── */}
            {!isCollapsed && group.tasks.length > 0 && (
              <div>
                {group.tasks.map((task) => {
                  const pri = PRIORITY_COLOURS[task.priority] ?? PRIORITY_COLOURS.medium;

                  return (
                    <div
                      key={task.id}
                      className="flex items-center gap-3 px-4 py-2.5"
                      style={{
                        borderBottom: "1px solid var(--border)",
                        background: hoveredRow === task.id ? "var(--surface-2)" : "transparent",
                        cursor: "default",
                      }}
                      onMouseEnter={() => setHoveredRow(task.id)}
                      onMouseLeave={() => setHoveredRow(null)}
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

                      {/* title */}
                      <span
                        className="flex-1 truncate text-[13px]"
                        style={{ color: "var(--text-1)" }}
                      >
                        {task.title}
                      </span>

                      {/* priority badge */}
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                        style={{
                          color: pri.fg,
                          background: pri.bg,
                          flexShrink: 0,
                        }}
                      >
                        {capitalize(task.priority)}
                      </span>

                      {/* assignee */}
                      <span
                        className="w-[100px] truncate text-right text-[12px]"
                        style={{ color: task.assigneeName ? "var(--text-2)" : "var(--text-disabled)", flexShrink: 0 }}
                      >
                        {task.assigneeName ?? "—"}
                      </span>

                      {/* due date */}
                      <span
                        className="w-[60px] text-right text-[12px]"
                        style={{ color: task.dueDate ? "var(--text-2)" : "var(--text-disabled)", flexShrink: 0 }}
                      >
                        {formatDueDate(task.dueDate)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── empty group message ───────────────────── */}
            {!isCollapsed && group.tasks.length === 0 && (
              <div className="px-4 py-4 text-center text-[12px]" style={{ color: "var(--text-muted)" }}>
                No {group.label.toLowerCase()} tasks
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
