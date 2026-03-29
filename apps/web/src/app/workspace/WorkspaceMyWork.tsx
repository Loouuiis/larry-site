"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { WorkspaceMyWorkData, WorkspaceTask } from "@/app/dashboard/types";

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return { error: text } as T;
  }
}

function dueBucket(due: string | null, now: Date): string {
  if (!due) return "No date";
  const date = new Date(`${due}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "No date";
  const day = 86_400_000;
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dueStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diff = Math.round((dueStart - todayStart) / day);
  if (diff < 0) return "Past due";
  if (diff === 0) return "Today";
  if (diff <= 7) return "This week";
  if (diff <= 14) return "Next week";
  return "Later";
}

function isOverdue(due: string | null, now: Date): boolean {
  if (!due) return false;
  const date = new Date(`${due}T12:00:00`);
  if (Number.isNaN(date.getTime())) return false;
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dueStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return dueStart < todayStart;
}

const GROUP_STYLE: Record<string, React.CSSProperties> = {
  "Past due": {
    background: "#FFF0F0",
    border: "1px solid #FECACA",
    borderRadius: "8px",
  },
  Today: {
    background: "#FFF7ED",
    border: "1px solid #FED7AA",
    borderRadius: "8px",
  },
};

const BUCKET_ORDER = ["Past due", "Today", "This week", "Next week", "Later", "No date"];
const GROUP_ACTIVE_OPTS = ["By project", "By status", "By due date"];

export function WorkspaceMyWork() {
  const [data, setData] = useState<WorkspaceMyWorkData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [groupBy, setGroupBy] = useState("By due date");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/workspace/my-work", { cache: "no-store" });
      const payload = await readJson<WorkspaceMyWorkData>(response);
      if (!response.ok) {
        setError(payload.error ?? "Failed to load tasks.");
        return;
      }
      setData(payload);
      setError(payload.error ?? "");
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    function onRefresh() {
      void load();
    }

    window.addEventListener("larry:refresh-snapshot", onRefresh);
    return () => window.removeEventListener("larry:refresh-snapshot", onRefresh);
  }, [load]);

  const projectNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const project of data?.projects ?? []) {
      map.set(project.id, project.name);
    }
    return map;
  }, [data?.projects]);

  const filtered = useMemo(() => {
    const tasks = data?.tasks ?? [];
    const viewerUserId = data?.viewerUserId;
    if (!viewerUserId) return tasks;
    const mine = tasks.filter((task) => task.assigneeUserId === viewerUserId);
    return mine.length > 0 ? mine : tasks;
  }, [data?.tasks, data?.viewerUserId]);

  const now = useMemo(() => new Date(), []);

  const grouped = useMemo(() => {
    const buckets: Record<string, WorkspaceTask[]> = {
      "Past due": [],
      Today: [],
      "This week": [],
      "Next week": [],
      Later: [],
      "No date": [],
    };

    for (const task of filtered) {
      const bucket = dueBucket(task.dueDate, now);
      const key = bucket in buckets ? bucket : "Later";
      buckets[key].push(task);
    }

    return buckets;
  }, [filtered, now]);

  function toggleCollapsed(label: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div
        style={{
          padding: "24px 32px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
        }}
      >
        <h1 className="text-h1">My Work</h1>
        <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
          {GROUP_ACTIVE_OPTS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setGroupBy(option)}
              style={{
                background: "none",
                border: "none",
                padding: "2px 0",
                fontSize: "13px",
                fontWeight: groupBy === option ? 600 : 400,
                color: groupBy === option ? "var(--cta)" : "var(--text-muted)",
                cursor: "pointer",
                transition: "color 0.15s",
              }}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: "896px", margin: "0 auto", padding: "24px 32px" }}>
        {error && (
          <div
            style={{
              marginBottom: "16px",
              borderRadius: "var(--radius-btn)",
              border: "1px solid #fde68a",
              background: "#fffbeb",
              padding: "10px 14px",
              fontSize: "13px",
              color: "#92400e",
            }}
          >
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-body-sm">Loading...</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {BUCKET_ORDER.map((label) => {
              const items = grouped[label] ?? [];
              if (items.length === 0) return null;
              const isCollapsed = collapsed.has(label);
              const groupStyle = GROUP_STYLE[label] ?? {};

              return (
                <section key={label}>
                  <button
                    type="button"
                    onClick={() => toggleCollapsed(label)}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      background: "none",
                      border: "none",
                      padding: "6px 0",
                      marginBottom: "6px",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "13px",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        color: label === "Past due" ? "var(--pm-red)" : "var(--text-muted)",
                      }}
                    >
                      {label}
                    </span>
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 500,
                        color: "var(--text-disabled)",
                        background: "var(--surface-2)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-badge)",
                        padding: "1px 7px",
                      }}
                    >
                      {items.length}
                    </span>
                    <span style={{ fontSize: "11px", color: "var(--text-disabled)", marginLeft: "auto" }}>
                      {isCollapsed ? "Show" : "Hide"}
                    </span>
                  </button>

                  {!isCollapsed && (
                    <div
                      style={{
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-card)",
                        overflow: "hidden",
                        background: "var(--surface)",
                        ...(label === "Past due" || label === "Today" ? groupStyle : {}),
                      }}
                    >
                      <div className="pm-table-header" style={{ gridTemplateColumns: "minmax(0,1fr) 140px 120px 100px" }}>
                        <span>Task</span>
                        <span>Project</span>
                        <span>Status</span>
                        <span>Due</span>
                      </div>

                      {items.map((task) => {
                        const overdue = isOverdue(task.dueDate, now);
                        return (
                          <div
                            key={task.id}
                            className="pm-table-row"
                            style={{
                              gridTemplateColumns: "minmax(0,1fr) 140px 120px 100px",
                              borderLeft: overdue ? "3px solid var(--pm-red)" : "3px solid transparent",
                            }}
                          >
                            <Link
                              href={`/workspace/projects/${task.projectId}`}
                              className="text-h3"
                              style={{
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                color: "var(--text-1)",
                                textDecoration: "none",
                              }}
                            >
                              {task.title}
                            </Link>

                            <span
                              className="text-body-sm"
                              style={{
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {projectNameById.get(task.projectId) ?? "Project"}
                            </span>

                            <span>
                              <span
                                className="pm-pill"
                                style={
                                  task.status === "completed"
                                    ? { background: "#e6f9f0", color: "#00854d" }
                                    : task.status === "in_progress"
                                      ? { background: "#EBF5FF", color: "var(--cta)" }
                                      : {}
                                }
                              >
                                {task.status.replace(/_/g, " ").toLowerCase()}
                              </span>
                            </span>

                            <span className="text-body-sm" style={overdue ? { color: "var(--pm-red)", fontWeight: 500 } : {}}>
                              {task.dueDate
                                ? new Date(`${task.dueDate}T12:00:00`).toLocaleDateString("en-GB", {
                                    day: "numeric",
                                    month: "short",
                                  })
                                : "-"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}

            {filtered.length === 0 && <p className="text-body-sm">No tasks in this workspace yet.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
