"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TriangleAlert, Plus, Search, ChevronDown, ChevronRight, ArchiveRestore } from "lucide-react";
import type { WorkspaceProject, WorkspaceHomeData, WorkspaceTask } from "@/app/dashboard/types";
import { StartProjectFlow } from "@/components/dashboard/StartProjectFlow";
import { useWorkspaceChrome } from "./WorkspaceChromeContext";

interface LarryBriefingProject {
  projectId: string;
  name: string;
  statusLabel: "At Risk" | "Needs Attention" | "On Track";
  summary: string;
  actionsCount: number;
  needsYou: boolean;
  suggestionCount: number;
}

interface LarryBriefingContent {
  greeting: string;
  projects: LarryBriefingProject[];
  totalNeedsYou: number;
}

interface AuthMePayload {
  user?: {
    email?: string | null;
    displayName?: string | null;
  } | null;
}

interface ProjectCardModel {
  id: string;
  name: string;
  description: string;
  status: string;
  riskLevel: string;
  targetDate: string | null | undefined;
  updatedAt: string | null | undefined;
  progress: number;
  totalTasks: number;
  openTasks: number;
  blockedTasks: number;
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return {} as T;
  }
}

function formatRelativeTime(value: string | null | undefined): string {
  if (!value) return "just now";
  const delta = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(delta / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

const PROJECT_STATUS_LABEL: Record<string, string> = {
  active: "On track",
  on_track: "On track",
  at_risk: "At risk",
  overdue: "Overdue",
  completed: "Completed",
  not_started: "Not started",
};

function projectStatusLabel(status: string | undefined): string {
  return PROJECT_STATUS_LABEL[status ?? ""] ?? "Not started";
}

function projectStatusPillClass(status: string | undefined): string {
  const normalized = status === "active" ? "on_track" : status;
  switch (normalized) {
    case "completed": return "pm-pill-done";
    case "overdue":   return "pm-pill-stuck";
    case "on_track":  return "pm-pill-working";
    case "at_risk":   return "pm-pill-review";
    default: return "pm-pill-not-started";
  }
}

function titleCase(value: string): string {
  return value
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function deriveGreetingName(user: AuthMePayload["user"] | null | undefined): string {
  if (user?.displayName && user.displayName.trim().length > 0) {
    return user.displayName.trim().split(/\s+/)[0];
  }
  if (user?.email) {
    const local = user.email.split("@")[0] ?? "there";
    return titleCase(local);
  }
  return "there";
}

function buildProjectCard(
  project: WorkspaceProject,
  tasks: WorkspaceTask[]
): ProjectCardModel {
  const projectTasks = tasks.filter((task) => task.projectId === project.id);
  const completedTasks = projectTasks.filter((task) => task.status === "completed").length;
  const openTasks = projectTasks.filter((task) => task.status !== "completed").length;
  const blockedTasks = projectTasks.filter((task) => task.status === "overdue" || task.status === "at_risk").length;
  const progress =
    project.completionRate != null
      ? Math.round(Number(project.completionRate) * 100)
      : projectTasks.length > 0
        ? Math.round((completedTasks / projectTasks.length) * 100)
        : 0;

  return {
    id: project.id,
    name: project.name,
    description:
      project.description?.trim() ||
      (projectTasks.length > 0 ? "Live workspace with active delivery signals." : "Ready for the first task and meeting signal."),
    status: project.status,
    riskLevel: project.riskLevel ?? "low",
    targetDate: project.targetDate,
    updatedAt: project.updatedAt,
    progress,
    totalTasks: projectTasks.length,
    openTasks,
    blockedTasks,
  };
}

export function WorkspaceHome({ viewerEmail: _viewerEmail }: { viewerEmail?: string | null } = {}) {
  const router = useRouter();
  const chrome = useWorkspaceChrome();
  const [snapshot, setSnapshot] = useState<WorkspaceHomeData | null>(null);
  const [viewer, setViewer] = useState<AuthMePayload["user"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const [briefing, setBriefing] = useState<LarryBriefingContent | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const loadWorkspace = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [snapshotResponse, meResponse] = await Promise.all([
        fetch("/api/workspace/home", { cache: "no-store" }),
        fetch("/api/auth/me", { cache: "no-store" }),
      ]);

      const snapshotPayload = await readJson<WorkspaceHomeData>(snapshotResponse);
      const mePayload = await readJson<AuthMePayload>(meResponse);

      if (!snapshotResponse.ok) {
        throw new Error(snapshotPayload.error ?? "Could not load the workspace.");
      }

      setSnapshot(snapshotPayload);
      setViewer(meResponse.ok ? mePayload.user ?? null : null);

      // Fire-and-forget — briefing should not block the page render
      fetch("/api/workspace/larry/briefing", { cache: "no-store" })
        .then((r) => (r.ok ? readJson<{ briefing: LarryBriefingContent }>(r) : null))
        .then((payload) => { if (payload?.briefing) setBriefing(payload.briefing); })
        .catch(() => { /* non-critical, ignore */ });
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Could not load the workspace."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    function handleRefresh() {
      void loadWorkspace();
    }

    window.addEventListener("larry:refresh-snapshot", handleRefresh);
    return () => window.removeEventListener("larry:refresh-snapshot", handleRefresh);
  }, [loadWorkspace]);

  const projectCards = useMemo(() => {
    const projects = snapshot?.projects ?? [];
    const tasks = snapshot?.tasks ?? [];
    return projects.map((project) => buildProjectCard(project, tasks));
  }, [snapshot]);

  const archivedCards = useMemo(() => {
    const archived = snapshot?.archivedProjects ?? [];
    const tasks = snapshot?.tasks ?? [];
    return archived.map((project) => buildProjectCard(project, tasks));
  }, [snapshot]);

  const filteredCards = useMemo(() => {
    if (!searchQuery.trim()) return projectCards;
    const q = searchQuery.toLowerCase();
    return projectCards.filter(
      (p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q),
    );
  }, [projectCards, searchQuery]);

  const filteredArchived = useMemo(() => {
    if (!searchQuery.trim()) return archivedCards;
    const q = searchQuery.toLowerCase();
    return archivedCards.filter(
      (p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q),
    );
  }, [archivedCards, searchQuery]);

  const handleRestore = async (projectId: string) => {
    setRestoringId(projectId);
    try {
      const res = await fetch(`/api/workspace/projects/${encodeURIComponent(projectId)}/unarchive`, {
        method: "POST",
      });
      if (!res.ok) {
        const payload = await readJson<{ error?: string }>(res);
        throw new Error(payload.error ?? "Failed to restore project.");
      }
      await loadWorkspace();
      chrome?.refreshShell?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restore project.");
    } finally {
      setRestoringId(null);
    }
  };

  const greetingName = deriveGreetingName(viewer);
  const connectedCount = [
    snapshot?.connectors?.slack?.connected,
    snapshot?.connectors?.calendar?.connected,
    snapshot?.connectors?.email?.connected,
  ].filter(Boolean).length;

  return (
    <div
      className="min-h-full overflow-y-auto"
      style={{ background: "var(--page-bg)" }}
    >
      <div className="mx-auto max-w-[960px] px-6 py-8 space-y-6">

        {/* Header */}
        <header className="text-center">
          <h1 className="text-[2rem] font-bold leading-tight" style={{ color: "var(--text-1)" }}>
            Your projects
          </h1>
          <p className="text-[15px] mt-1" style={{ color: "var(--text-muted)" }}>
            Select a project to get started.
          </p>
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className="inline-flex items-center gap-1.5 text-[13px] font-medium transition-opacity hover:opacity-90"
              style={{
                height: "36px",
                padding: "0 16px",
                borderRadius: "var(--radius-btn)",
                background: "#f0edfa",
                color: "#6c44f6",
              }}
            >
              <Plus size={14} />
              New Project
            </button>
          </div>
        </header>

        {/* Search */}
        {!loading && projectCards.length > 0 && (
          <div className="relative">
            <Search
              size={15}
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-muted)",
                pointerEvents: "none",
              }}
            />
            <input
              type="text"
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-[13px] outline-none"
              style={{
                height: 38,
                paddingLeft: 36,
                paddingRight: 12,
                borderRadius: 4,
                border: "1px solid #f0edfa",
                background: "var(--surface)",
                color: "var(--text-1)",
              }}
            />
          </div>
        )}

        {/* Larry briefing — per-project summaries */}
        {briefing && briefing.projects.length > 0 && (
          <div
            style={{
              border: "1px solid #f0edfa",
              borderRadius: "var(--radius-card)",
              background: "var(--surface)",
              overflow: "hidden",
            }}
          >
            {briefing.projects.map((bp, i) => (
              <div
                key={bp.projectId}
                style={{
                  padding: "14px 20px",
                  borderTop: i > 0 ? "1px solid #f0edfa" : undefined,
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "12px",
                }}
              >
                {/* Status pill */}
                <span
                  className="shrink-0 text-[11px] font-semibold leading-none"
                  style={{
                    marginTop: "3px",
                    padding: "3px 7px",
                    borderRadius: "9999px",
                    background:
                      bp.statusLabel === "At Risk"
                        ? "var(--pm-red-light, #fff6f7)"
                        : bp.statusLabel === "Needs Attention"
                          ? "#FFF7ED"
                          : "var(--surface-2)",
                    color:
                      bp.statusLabel === "At Risk"
                        ? "var(--pm-red)"
                        : bp.statusLabel === "Needs Attention"
                          ? "#D97706"
                          : "var(--text-muted)",
                  }}
                >
                  {bp.statusLabel}
                </span>

                {/* Summary */}
                <div className="flex-1 min-w-0">
                  <p
                    className="text-[13px] font-semibold leading-snug truncate"
                    style={{ color: "var(--text-1)" }}
                  >
                    {bp.name}
                  </p>
                  <p className="text-body-sm mt-0.5 line-clamp-2" style={{ color: "var(--text-2)" }}>
                    {bp.summary}
                  </p>
                </div>

                {/* Needs you badge */}
                {bp.needsYou && (
                  <span
                    className="shrink-0 text-[11px] font-semibold leading-none"
                    style={{
                      marginTop: "3px",
                      padding: "3px 7px",
                      borderRadius: "9999px",
                      background: "var(--cta)",
                      color: "#fff",
                    }}
                  >
                    Needs you
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div
            className="flex items-start gap-3 px-4 py-3 rounded-lg text-[14px]"
            style={{
              background: "var(--pm-red-light, #fff6f7)",
              border: "1px solid var(--pm-red)",
              color: "var(--pm-red)",
              borderRadius: "var(--radius-btn)",
            }}
          >
            <TriangleAlert size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Project cards grid */}
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="pm-shimmer h-[180px]"
                style={{ borderRadius: "var(--radius-card)" }}
              />
            ))}
          </div>
        ) : filteredCards.length === 0 && !searchQuery.trim() ? (
          <div
            className="border border-dashed px-6 py-10 text-center"
            style={{
              borderColor: "var(--border-2)",
              borderRadius: "var(--radius-card)",
              background: "var(--surface)",
            }}
          >
            <p className="text-h1" style={{ color: "var(--text-1)" }}>
              No projects yet
            </p>
            <p
              className="mx-auto mt-2 max-w-[520px] text-[15px] leading-7"
              style={{ color: "var(--text-muted)" }}
            >
              Start with a live project so Larry can begin collecting task movement, meeting context, and approval-worthy actions in one place.
            </p>
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className="mt-5 inline-flex items-center justify-center gap-2 text-[14px] font-semibold text-white"
              style={{
                background: "var(--cta)",
                borderRadius: "var(--radius-btn)",
                height: "36px",
                padding: "0 16px",
              }}
            >
              Create the first project
            </button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {filteredCards.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => router.push(`/workspace/projects/${project.id}`)}
                className="group text-left transition-shadow hover:shadow-[var(--shadow-1)]"
                style={{
                  borderRadius: "var(--radius-card)",
                  border: "1px solid #f0edfa",
                  background: "var(--surface)",
                  padding: "20px",
                }}
              >
                {/* Project name + status */}
                <div className="flex items-center justify-between gap-2">
                  <p
                    className="text-[16px] font-semibold leading-snug truncate"
                    style={{ color: "var(--text-1)" }}
                  >
                    {project.name}
                  </p>
                  <span className={`pm-pill shrink-0 ${projectStatusPillClass(project.status)}`}>
                    {projectStatusLabel(project.status)}
                  </span>
                </div>

                {/* Description — 1 line truncated */}
                <p
                  className="text-body-sm mt-1 truncate"
                >
                  {project.description}
                </p>

                {/* Progress bar */}
                <div
                  className="mt-4 w-full overflow-hidden"
                  style={{
                    height: "3px",
                    borderRadius: "9999px",
                    background: "var(--surface-2)",
                  }}
                >
                  <div
                    style={{
                      width: `${Math.max(project.progress, 2)}%`,
                      height: "100%",
                      borderRadius: "9999px",
                      background: "linear-gradient(90deg, #6c44f6, #b29cf8)",
                    }}
                  />
                </div>

                {/* Footer row */}
                <div
                  className="mt-3 flex items-center justify-between text-body-sm"
                >
                  <span>{project.progress}%</span>
                  <span>{project.openTasks} open tasks</span>
                  <span>Updated {formatRelativeTime(project.updatedAt)}</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* No search results */}
        {searchQuery.trim() && filteredCards.length === 0 && filteredArchived.length === 0 && (
          <div
            className="px-6 py-8 text-center text-[13px]"
            style={{ color: "var(--text-muted)" }}
          >
            No projects matching &ldquo;{searchQuery}&rdquo;
          </div>
        )}

        {/* Archived projects section */}
        {!loading && archivedCards.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowArchived((v) => !v)}
              className="flex items-center gap-1.5 text-[13px] font-semibold"
              style={{ color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", padding: "4px 0" }}
            >
              {showArchived ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              Archived ({filteredArchived.length})
            </button>

            {showArchived && filteredArchived.length > 0 && (
              <div className="mt-3 grid gap-4 md:grid-cols-3">
                {filteredArchived.map((project) => (
                  <div
                    key={project.id}
                    className="relative text-left"
                    style={{
                      borderRadius: "var(--radius-card)",
                      border: "1px solid #f0edfa",
                      background: "var(--surface)",
                      padding: "20px",
                      opacity: 0.7,
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p
                        className="text-[16px] font-semibold leading-snug truncate"
                        style={{ color: "var(--text-1)" }}
                      >
                        {project.name}
                      </p>
                      <span
                        className="shrink-0 text-[11px] font-medium px-2 py-0.5"
                        style={{ color: "var(--text-muted)", background: "var(--surface-2)", borderRadius: 3 }}
                      >
                        Archived
                      </span>
                    </div>
                    <p className="text-body-sm mt-1 truncate">{project.description}</p>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-body-sm">
                        Updated {formatRelativeTime(project.updatedAt)}
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleRestore(project.id)}
                        disabled={restoringId === project.id}
                        className="inline-flex items-center gap-1 text-[12px] font-medium"
                        style={{
                          color: "var(--cta)",
                          background: "none",
                          border: "none",
                          cursor: restoringId === project.id ? "not-allowed" : "pointer",
                          opacity: restoringId === project.id ? 0.5 : 1,
                        }}
                      >
                        <ArchiveRestore size={13} />
                        {restoringId === project.id ? "Restoring..." : "Restore"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Connected inputs nudge — only when all connectors are disconnected */}
        {!nudgeDismissed && connectedCount === 0 && (
          <div
            className="flex items-center justify-between gap-4"
            style={{
              border: "1px solid #f0edfa",
              borderRadius: "var(--radius-card)",
              padding: "16px 20px",
              background: "var(--surface)",
            }}
          >
            <p className="text-[14px]" style={{ color: "var(--text-2)" }}>
              Connect Slack or Calendar to let Larry monitor signals automatically.{" "}
              <Link
                href="/workspace/settings/connectors"
                className="font-semibold"
                style={{ color: "var(--cta)" }}
              >
                Set up →
              </Link>
            </p>
            <button
              type="button"
              onClick={() => setNudgeDismissed(true)}
              className="shrink-0 text-[13px]"
              style={{ color: "var(--text-muted)" }}
              aria-label="Dismiss connector nudge"
            >
              Dismiss
            </button>
          </div>
        )}

      </div>

      {sheetOpen && (
        <StartProjectFlow
          onClose={() => setSheetOpen(false)}
          onCreated={(projectId) => {
            setSheetOpen(false);
            chrome?.refreshShell?.();
            router.push(`/workspace/projects/${projectId}`);
          }}
        />
      )}
    </div>
  );
}
