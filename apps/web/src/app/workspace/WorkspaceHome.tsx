"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import type { WorkspaceHomeData, WorkspaceProject, WorkspaceTask } from "@/app/dashboard/types";

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

interface WorkspaceHomeProps {
  viewerEmail?: string | null;
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

function deriveGreetingName(email: string | null | undefined): string {
  if (email) {
    const local = email.split("@")[0] ?? "there";
    return titleCase(local);
  }
  return "there";
}

function buildProjectCard(
  project: WorkspaceProject,
  tasks: WorkspaceTask[],
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
      (projectTasks.length > 0
        ? "Live workspace with active delivery signals."
        : "Ready for the first task and meeting signal."),
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

export function WorkspaceHome({ viewerEmail }: WorkspaceHomeProps) {
  const router = useRouter();
  const [homeData, setHomeData] = useState<WorkspaceHomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const [briefing, setBriefing] = useState<LarryBriefingContent | null>(null);

  const loadWorkspace = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const homeResponse = await fetch("/api/workspace/home", { cache: "no-store" });
      const homePayload = await readJson<WorkspaceHomeData>(homeResponse);

      if (!homeResponse.ok) {
        throw new Error(homePayload.error ?? "Could not load the workspace.");
      }

      setHomeData(homePayload);
      setError(homePayload.error ?? null);

      fetch("/api/workspace/larry/briefing", { cache: "no-store" })
        .then((response) => (response.ok ? readJson<{ briefing: LarryBriefingContent }>(response) : null))
        .then((payload) => {
          if (payload?.briefing) {
            setBriefing(payload.briefing);
          }
        })
        .catch(() => {
          // Briefing is supplementary. Ignore failures here.
        });
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Could not load the workspace.",
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
    const projects = homeData?.projects ?? [];
    const tasks = homeData?.tasks ?? [];
    return projects.map((project) => buildProjectCard(project, tasks));
  }, [homeData]);

  const greetingName = deriveGreetingName(viewerEmail);
  const connectedCount = [
    homeData?.connectors?.slack?.connected,
    homeData?.connectors?.calendar?.connected,
    homeData?.connectors?.email?.connected,
  ].filter(Boolean).length;

  return (
    <div className="min-h-full overflow-y-auto" style={{ background: "var(--page-bg)" }}>
      <div className="mx-auto max-w-[960px] space-y-6 px-6 py-8">
        <header>
          <h1 className="text-display" style={{ color: "var(--text-1)" }}>
            {briefing?.greeting ?? `Welcome back, ${greetingName}.`}
          </h1>
          <p className="mt-1 text-body-sm">
            {briefing
              ? `${briefing.totalNeedsYou} project${briefing.totalNeedsYou !== 1 ? "s" : ""} need${briefing.totalNeedsYou === 1 ? "s" : ""} your attention · ${projectCards.length} active`
              : `${projectCards.length} active project${projectCards.length !== 1 ? "s" : ""}`}
          </p>
        </header>

        {briefing && briefing.projects.length > 0 && (
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-card)",
              background: "var(--surface)",
              overflow: "hidden",
            }}
          >
            {briefing.projects.map((bp, index) => (
              <div
                key={bp.projectId}
                style={{
                  padding: "14px 20px",
                  borderTop: index > 0 ? "1px solid var(--border)" : undefined,
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "12px",
                }}
              >
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

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold leading-snug" style={{ color: "var(--text-1)" }}>
                    {bp.name}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-body-sm" style={{ color: "var(--text-2)" }}>
                    {bp.summary}
                  </p>
                </div>

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

        {error && (
          <div
            className="flex items-start gap-3 rounded-lg px-4 py-3 text-[14px]"
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
                <p className="truncate text-[16px] font-semibold leading-snug" style={{ color: "var(--text-1)" }}>
                  {project.name}
                </p>
                <p className="mt-1 truncate text-body-sm">{project.description}</p>
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
                      background: "var(--cta)",
                    }}
                  />
                </div>
                <div className="mt-3 flex items-center justify-between text-body-sm">
                  <span>{project.progress}%</span>
                  <span>{project.openTasks} open tasks</span>
                  <span>Updated {formatRelativeTime(project.updatedAt)}</span>
                </div>
              </button>
            ))}
          </div>
        )}

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
              <Link href="/workspace/settings/connectors" className="font-semibold" style={{ color: "var(--cta)" }}>
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
    </div>
  );
}
