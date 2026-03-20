"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3 } from "lucide-react";
import type { WorkspaceActivityItem, WorkspaceProject, WorkspaceSnapshot } from "@/app/dashboard/types";
import { getRecentProjectIds, recordProjectVisit } from "@/lib/recent-projects";

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return { error: text } as T;
  }
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function WorkspaceHome() {
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [projectName, setProjectName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recentIds, setRecentIds] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/workspace/snapshot?includeProjectContext=false", { cache: "no-store" });
      const data = await readJson<WorkspaceSnapshot>(res);
      if (!res.ok) {
        setError("error" in data && typeof data.error === "string" ? data.error : "Failed to load workspace.");
        return;
      }
      setSnapshot(data);
    } catch {
      setError("Network error loading workspace.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    setRecentIds(getRecentProjectIds());
  }, [load]);

  const projectsById = useMemo(() => {
    const map = new Map<string, WorkspaceProject>();
    for (const p of snapshot?.projects ?? []) {
      map.set(p.id, p);
    }
    return map;
  }, [snapshot?.projects]);

  const recentProjects = useMemo(() => {
    const ordered: WorkspaceProject[] = [];
    for (const id of recentIds) {
      const p = projectsById.get(id);
      if (p) ordered.push(p);
    }
    for (const p of snapshot?.projects ?? []) {
      if (!recentIds.includes(p.id)) ordered.push(p);
    }
    return ordered.slice(0, 8);
  }, [recentIds, projectsById, snapshot?.projects]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = projectName.trim();
    if (!name) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/workspace/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body = await readJson<{ error?: string; id?: string }>(res);
      if (!res.ok) {
        setError(body.error ?? "Failed to create project.");
        return;
      }
      setProjectName("");
      if (body.id) {
        recordProjectVisit(body.id);
        window.location.href = `/workspace/projects/${body.id}`;
        return;
      }
      await load();
    } catch {
      setError("Create project failed.");
    } finally {
      setBusy(false);
    }
  };

  const activity: WorkspaceActivityItem[] = snapshot?.activity ?? [];

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="border-b border-[var(--pm-border)] bg-[var(--pm-surface)] px-8 py-8">
        <h1 className="text-[26px] font-semibold tracking-tight text-[var(--pm-text)]">
          {greeting()} — let’s drive execution
        </h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-[var(--pm-text-secondary)]">
          Larry keeps projects aligned as the coordination layer: signals in, structured work on the board, approvals in
          Action Center—so you focus on outcomes, not status chasing.
        </p>
      </div>

      <div className="mx-auto max-w-5xl px-8 py-8">
        {error && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-[13px] text-amber-900">
            {error}
          </div>
        )}

        <section className="mb-10">
          <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-[var(--pm-text-muted)]">
            Open a project
          </h2>
          {loading ? (
            <p className="text-[14px] text-[var(--pm-text-muted)]">Loading projects…</p>
          ) : recentProjects.length === 0 ? (
            <p className="text-[14px] text-[var(--pm-text-secondary)]">
              No projects yet. Create one below to get a board, timeline, and Action Center for this workspace.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {recentProjects.map((p) => (
                <Link
                  key={p.id}
                  href={`/workspace/projects/${p.id}`}
                  onClick={() => recordProjectVisit(p.id)}
                  className="group flex items-start gap-3 rounded-xl border border-[var(--pm-border)] bg-white p-4 shadow-sm transition hover:border-[#c4b5fd] hover:shadow-md"
                >
                  <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#f5f3ff] text-[#6366f1]">
                    <BarChart3 size={20} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold text-[var(--pm-text)] group-hover:text-[#5b21b6]">
                      {p.name}
                    </p>
                    <p className="text-[12px] text-[var(--pm-text-muted)]">Board · Table, Kanban, Timeline</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="mb-10">
          <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-[var(--pm-text-muted)]">
            Recent activity
          </h2>
          {activity.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[var(--pm-border)] bg-[var(--pm-surface)] px-4 py-6 text-[14px] text-[var(--pm-text-secondary)]">
              No activity yet. Connect Slack, Calendar, or Email—or run a meeting transcript—to feed the execution loop.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--pm-border)] rounded-xl border border-[var(--pm-border)] bg-white">
              {activity.slice(0, 12).map((item) => (
                <li key={item.id} className="px-4 py-3 text-[14px]">
                  <span className="font-medium text-[var(--pm-text)]">{item.title}</span>
                  {item.subtitle && (
                    <span className="text-[var(--pm-text-secondary)]"> — {item.subtitle}</span>
                  )}
                  <div className="mt-1 text-[12px] text-[var(--pm-text-muted)]">
                    {item.source && `${item.source} · `}
                    {item.createdAt?.slice(0, 10)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-[var(--pm-text-muted)]">
            New project
          </h2>
          <form onSubmit={handleCreateProject} className="flex max-w-lg flex-wrap items-center gap-2">
            <input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Project name"
              className="h-10 min-w-[200px] flex-1 rounded-lg border border-[var(--pm-border)] px-3 text-[14px] outline-none focus:border-[#6366f1]"
            />
            <button
              type="submit"
              disabled={busy || !projectName.trim()}
              className="h-10 rounded-lg bg-[#0073EA] px-5 text-[14px] font-medium text-white hover:bg-[#0060c2] disabled:opacity-50"
            >
              {busy ? "Creating…" : "Create"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
