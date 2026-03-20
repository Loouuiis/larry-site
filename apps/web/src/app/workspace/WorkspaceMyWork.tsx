"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { WorkspaceSnapshot, WorkspaceTask } from "@/app/dashboard/types";

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

export function WorkspaceMyWork() {
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [snapRes, meRes] = await Promise.all([
        fetch("/api/workspace/snapshot?includeProjectContext=false", { cache: "no-store" }),
        fetch("/api/auth/me", { cache: "no-store" }),
      ]);
      const snap = await readJson<WorkspaceSnapshot>(snapRes);
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

  const order = ["Past due", "Today", "This week", "Next week", "Later", "No date"];

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="border-b border-[var(--pm-border)] bg-[var(--pm-surface)] px-8 py-6">
        <h1 className="text-[22px] font-semibold text-[var(--pm-text)]">My work</h1>
        <p className="mt-1 text-[14px] text-[var(--pm-text-secondary)]">
          {userId
            ? "Tasks assigned to you across projects. If none are assigned yet, we show all workspace tasks."
            : "Cross-project tasks. Sign in with a full session to filter by assignee when available."}
        </p>
      </div>

      <div className="mx-auto max-w-4xl px-8 py-6">
        {error && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-[13px] text-amber-900">
            {error}
          </div>
        )}
        {loading ? (
          <p className="text-[14px] text-[var(--pm-text-muted)]">Loading…</p>
        ) : (
          <div className="space-y-6">
            {order.map((label) => {
              const items = grouped[label] ?? [];
              if (items.length === 0) return null;
              return (
                <section key={label}>
                  <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-[var(--pm-text-muted)]">
                    {label} ({items.length})
                  </h2>
                  <ul className="divide-y divide-[var(--pm-border)] rounded-xl border border-[var(--pm-border)] bg-white">
                    {items.map((task) => (
                      <li key={task.id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-[14px]">
                        <Link
                          href={`/workspace/projects/${task.projectId}`}
                          className="min-w-0 flex-1 font-medium text-[var(--pm-text)] hover:text-[#5b21b6]"
                        >
                          {task.title}
                        </Link>
                        <span className="text-[12px] text-[var(--pm-text-muted)]">
                          {projectNameById.get(task.projectId) ?? "Project"}
                        </span>
                        <span className="rounded-full bg-[var(--pm-gray-light)] px-2 py-0.5 text-[11px] text-[var(--pm-text-secondary)]">
                          {task.status.replace("_", " ")}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
            {filtered.length === 0 && (
              <p className="text-[14px] text-[var(--pm-text-secondary)]">No tasks in this workspace yet.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
