"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TriangleAlert, Plus } from "lucide-react";
import type { WorkspaceProject, WorkspaceSnapshot, WorkspaceTask } from "@/app/dashboard/types";
import { ProjectCreateSheet } from "./ProjectCreateSheet";
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
  const blockedTasks = projectTasks.filter((task) => task.status === "blocked").length;
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

export function WorkspaceHome() {
  const router = useRouter();
  const chrome = useWorkspaceChrome();
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [viewer, setViewer] = useState<AuthMePayload["user"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const [briefing, setBriefing] = useState<LarryBriefingContent | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const loadWorkspace = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [snapshotResponse, meResponse] = await Promise.all([
        fetch("/api/workspace/snapshot?includeProjectContext=false", { cache: "no-store" }),
        fetch("/api/auth/me", { cache: "no-store" }),
      ]);

      const snapshotPayload = await readJson<WorkspaceSnapshot>(snapshotResponse);
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
          <h1 className="text-[2.5rem] font-bold leading-tight" style={{ color: "var(--text-1)" }}>
            Your projects
          </h1>
          <p className="text-body-sm mt-1" style={{ color: "var(--text-muted)" }}>
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
                background: "#e2d6fc",
                color: "#6c44f6",
              }}
            >
              <Plus size={14} />
              New Project
            </button>
          </div>
        </header>

        {/* Larry briefing — per-project summaries */}
        {briefing && briefing.projects.length > 0 && (
          <div
            style={{
              border: "1px solid var(--border)",
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
                  borderTop: i > 0 ? "1px solid var(--border)" : undefined,
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
        ) : projectCards.length === 0 ? (
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
            <Link
              href="/workspace/projects/new"
              className="mt-5 inline-flex items-center justify-center gap-2 text-[14px] font-semibold text-white"
              style={{
                background: "var(--cta)",
                borderRadius: "var(--radius-btn)",
                height: "36px",
                padding: "0 16px",
              }}
            >
              Create the first project
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {projectCards.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => router.push(`/workspace/projects/${project.id}`)}
                className="group text-left transition-shadow hover:shadow-[var(--shadow-1)]"
                style={{
                  borderRadius: "var(--radius-card)",
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  padding: "20px",
                }}
              >
                {/* Project name */}
                <p
                  className="text-[16px] font-semibold leading-snug truncate"
                  style={{ color: "var(--text-1)" }}
                >
                  {project.name}
                </p>

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
                    height: "4px",
                    borderRadius: "9999px",
                    background: "var(--surface-2)",
                  }}
                >
                  <div
                    style={{
                      width: `${Math.max(project.progress, 2)}%`,
                      height: "100%",
                      borderRadius: "9999px",
                      background: "#6c44f6",
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

        {/* Connected inputs nudge — only when all connectors are disconnected */}
        {!nudgeDismissed && connectedCount === 0 && (
          <div
            className="flex items-center justify-between gap-4"
            style={{
              border: "1px solid var(--border)",
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

      <ProjectCreateSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onCreated={() => {
          setSheetOpen(false);
          chrome?.refreshShell?.();
        }}
      />
    </div>
  );
}
