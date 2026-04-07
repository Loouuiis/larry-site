"use client";

import { useEffect, useMemo, useState } from "react";
import type { WorkspaceTask, WorkspaceLarryEvent } from "@/app/dashboard/types";
import { formatRelative } from "./utils";

type InfoTab = "summary" | "activity" | "tasks";

const TABS: { id: InfoTab; label: string }[] = [
  { id: "summary", label: "AI Summary" },
  { id: "activity", label: "Recent Activity" },
  { id: "tasks", label: "My Tasks" },
];

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
              background: activeTab === tab.id ? "rgba(108,68,246,0.05)" : "transparent",
              border: "none",
              borderBottom: activeTab === tab.id ? "2px solid #6c44f6" : "2px solid transparent",
              cursor: "pointer",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{ padding: "16px 18px" }}>
        {activeTab === "summary" && (
          <p className="text-[13px] leading-[1.8]" style={{ color: "var(--text-2)" }}>
            {narrative?.trim()
              ? <>
                  {narrative.trim()}{" "}
                  {recentActivity.slice(0, 4).map((event, i, arr) => (
                    <span key={event.id}>
                      {event.displayText} ({formatRelative(event.executedAt ?? event.createdAt)}){i < arr.length - 1 ? " " : ""}
                    </span>
                  ))}
                </>
              : "Larry hasn't generated a summary yet. Once there's project activity, Larry will write a brief here — covering decisions made, deadline changes, new team members, and other notable updates."
            }
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
                    background: "none",
                    border: "none",
                    borderBottom: "1px solid var(--border)",
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
