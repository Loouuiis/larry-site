"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { WorkspaceHomeData, WorkspaceTask } from "@/app/dashboard/types";

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return { error: text } as T;
  }
}

type MeResponse = { user?: { id?: string | null } | null };

function dueBucket(due: string | null, now: Date): string {
  if (!due) return "No date";
  const d = new Date(due + "T12:00:00");
  if (Number.isNaN(d.getTime())) return "No date";
  const day = 86_400_000;
  const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t1 = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((t1 - t0) / day);
  if (diff < 0) return "Past due";
  if (diff === 0) return "Today";
  if (diff > 0 && diff <= 7) return "This week";
  if (diff > 7 && diff <= 14) return "Next week";
  return "Later";
}

function isOverdue(due: string | null, now: Date): boolean {
  if (!due) return false;
  const d = new Date(due + "T12:00:00");
  if (Number.isNaN(d.getTime())) return false;
  const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t1 = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return t1 < t0;
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
  const [snapshot, setSnapshot] = useState<WorkspaceHomeData | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [groupBy, setGroupBy] = useState("By due date");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [snapRes, meRes] = await Promise.all([
        fetch("/api/workspace/home", { cache: "no-store" }),
        fetch("/api/auth/me", { cache: "no-store" }),
      ]);
      const snap = await readJson<WorkspaceHomeData>(snapRes);
      if (!snapRes.ok) {
        setError("error" in snap && typeof snap.error === "string" ? snap.error : "Failed to load tasks.");
        return;
      }
      setSnapshot(snap);
      if (meRes.ok) {
        const me = await readJson<MeResponse>(meRes);
        setUserId(me.user?.id ?? null);
      }
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const projectNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of snapshot?.projects ?? []) {
      m.set(p.id, p.name);
    }
    return m;
  }, [snapshot?.projects]);

  const filtered = useMemo(() => {
    const tasks = snapshot?.tasks ?? [];
    if (!userId) return tasks;
    const mine = tasks.filter((t) => t.assigneeUserId === userId);
    return mine.length > 0 ? mine : tasks;
  }, [snapshot?.tasks, userId]);

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
    for (const t of filtered) {
      const b = dueBucket(t.dueDate, now);
      const key = b in buckets ? b : "Later";
      buckets[key].push(t);
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
      {/* Header */}
      <div
        style={{
          padding: "24px 32px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
        }}
      >
        <h1 className="text-h1">My Work</h1>
        {/* Group toggle */}
        <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
          {GROUP_ACTIVE_OPTS.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setGroupBy(opt)}
              style={{
                background: "none",
                border: "none",
                padding: "2px 0",
                fontSize: "13px",
                fontWeight: groupBy === opt ? 600 : 400,
                color: groupBy === opt ? "var(--cta)" : "var(--text-muted)",
                cursor: "pointer",
                transition: "color 0.15s",
              }}
            >
              {opt}
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
          <p className="text-body-sm">Loading…</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {BUCKET_ORDER.map((label) => {
              const items = grouped[label] ?? [];
              if (items.length === 0) return null;
              const isCollapsed = collapsed.has(label);
              const groupStyle = GROUP_STYLE[label] ?? {};

              return (
                <section key={label}>
                  {/* Section header */}
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
                    <span
                      style={{
                        fontSize: "11px",
                        color: "var(--text-disabled)",
                        marginLeft: "auto",
                      }}
                    >
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
                      {/* Table header */}
                      <div
                        className="pm-table-header"
                        style={{ gridTemplateColumns: "minmax(0,1fr) 140px 120px 100px" }}
                      >
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
                            {/* Task name */}
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

                            {/* Project */}
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

                            {/* Status */}
                            <span>
                              <span
                                className="pm-pill"
                                style={
                                  task.status === "completed"
                                    ? { background: "#e6f9f0", color: "#00854d" }
                                    : task.status === "on_track"
                                    ? { background: "#EBF5FF", color: "var(--cta)" }
                                    : {}
                                }
                              >
                                {task.status.replace(/_/g, " ").toLowerCase()}
                              </span>
                            </span>

                            {/* Due date */}
                            <span
                              className="text-body-sm"
                              style={overdue ? { color: "var(--pm-red)", fontWeight: 500 } : {}}
                            >
                              {task.dueDate
                                ? new Date(task.dueDate + "T12:00:00").toLocaleDateString("en-GB", {
                                    day: "numeric",
                                    month: "short",
                                  })
                                : "—"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}

            {filtered.length === 0 && (
              <p className="text-body-sm">No tasks in this workspace yet.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
