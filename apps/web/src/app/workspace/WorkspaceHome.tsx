"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, BarChart3, ChevronRight } from "lucide-react";
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

function riskBadge(level: string | null | undefined) {
  if (level === "high") return { label: "High", cls: "bg-[#ffe9ec] text-[#E2445C]" };
  if (level === "medium") return { label: "Medium", cls: "bg-[#fff3e0] text-[#b87900]" };
  return { label: "Low", cls: "bg-[#e6f9f0] text-[#00854d]" };
}

function statusBadge(status: string) {
  if (status === "active") return { label: "Active", cls: "bg-[#e6f0ff] text-[#0073EA]" };
  if (status === "completed") return { label: "Done", cls: "bg-[#e6f9f0] text-[#00854d]" };
  if (status === "on_hold") return { label: "On Hold", cls: "bg-[#f0f1f5] text-[#676879]" };
  return { label: status, cls: "bg-[#f0f1f5] text-[#676879]" };
}

function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
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

  const projects = snapshot?.projects ?? [];

  const sortedProjects = useMemo(() => {
    const byRecent = new Map<string, number>();
    recentIds.forEach((id, i) => byRecent.set(id, i));
    return [...projects].sort((a, b) => {
      const ra = byRecent.get(a.id) ?? 999;
      const rb = byRecent.get(b.id) ?? 999;
      return ra - rb;
    });
  }, [projects, recentIds]);

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
      {/* Hero */}
      <div className="border-b border-[var(--pm-border)] bg-[var(--pm-surface)] px-8 py-8">
        <h1 className="text-[26px] font-semibold tracking-tight text-[var(--pm-text)]">
          {greeting()} — let's drive execution
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

        {/* Projects table */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[var(--pm-text-muted)]">
              Projects
            </h2>
            <span className="text-[12px] text-[var(--pm-text-muted)]">
              {sortedProjects.length} project{sortedProjects.length !== 1 ? "s" : ""}
            </span>
          </div>

          {loading ? (
            <p className="text-[14px] text-[var(--pm-text-muted)]">Loading projects…</p>
          ) : sortedProjects.length === 0 ? (
            <p className="text-[14px] text-[var(--pm-text-secondary)]">
              No projects yet. Create one below to get a board, timeline, and Action Center for this workspace.
            </p>
          ) : (
            <div className="rounded-xl border border-[var(--pm-border)] overflow-hidden bg-white">
              {/* Table header */}
              <div className="grid grid-cols-[minmax(0,2fr)_120px_100px_100px_120px_120px_40px] border-b border-[var(--pm-border)] bg-[#f8f9fb] px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--pm-text-muted)]">
                <span>Project</span>
                <span>Status</span>
                <span>Risk</span>
                <span>Progress</span>
                <span>Target</span>
                <span>Last activity</span>
                <span />
              </div>

              {sortedProjects.map((p) => {
                const risk = riskBadge(p.riskLevel);
                const status = statusBadge(p.status);
                const pct = p.completionRate ?? 0;
                return (
                  <Link
                    key={p.id}
                    href={`/workspace/projects/${p.id}`}
                    onClick={() => recordProjectVisit(p.id)}
                    className="group grid grid-cols-[minmax(0,2fr)_120px_100px_100px_120px_120px_40px] items-center border-b border-[var(--pm-border)] px-4 py-3 last:border-0 hover:bg-[#f5f6f8] transition-colors"
                  >
                    {/* Name */}
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#f5f3ff]">
                        <BarChart3 size={15} className="text-[#6366f1]" />
                      </span>
                      <span className="truncate text-[14px] font-medium text-[var(--pm-text)] group-hover:text-[#5b21b6]">
                        {p.name}
                      </span>
                    </div>

                    {/* Status */}
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold w-fit ${status.cls}`}>
                      {status.label}
                    </span>

                    {/* Risk */}
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold w-fit ${risk.cls}`}>
                      {risk.label}
                    </span>

                    {/* Progress */}
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-[var(--pm-gray-light)] overflow-hidden max-w-[60px]">
                        <div className="h-full rounded-full bg-[#0073EA]" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[12px] text-[var(--pm-text-muted)]">{pct.toFixed(0)}%</span>
                    </div>

                    {/* Target date */}
                    <span className="text-[13px] text-[var(--pm-text-secondary)]">
                      {p.targetDate?.slice(0, 10) ?? "—"}
                    </span>

                    {/* Last activity */}
                    <span className="text-[13px] text-[var(--pm-text-muted)]">
                      {timeAgo(p.updatedAt)}
                    </span>

                    <ChevronRight size={16} className="text-[var(--pm-text-muted)] group-hover:text-[#5b21b6]" />
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* Recent activity */}
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

        {/* New project */}
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
