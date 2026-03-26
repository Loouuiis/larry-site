"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BellRing,
  CalendarDays,
  Plus,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import type { WorkspaceAction, WorkspaceProject, WorkspaceSnapshot, WorkspaceTask } from "@/app/dashboard/types";
import { NotificationBell } from "./NotificationBell";
import { ProjectCreateSheet } from "./ProjectCreateSheet";

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
  pendingActions: number;
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

function formatShortDate(value: string | null | undefined): string {
  if (!value) return "No target";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
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

function statusTone(project: ProjectCardModel): string {
  if (project.blockedTasks > 0 || project.riskLevel === "high") {
    return "bg-[#ffe6ea] text-[#b42336]";
  }
  if (project.progress >= 100 || project.status === "completed") {
    return "bg-[#e8f8ef] text-[#067647]";
  }
  if (project.progress > 0) {
    return "bg-[#fff3df] text-[#9a6700]";
  }
  return "bg-[#e9eef5] text-[#465467]";
}

function buildProjectCard(
  project: WorkspaceProject,
  tasks: WorkspaceTask[],
  actions: WorkspaceAction[]
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
    pendingActions: actions.filter((action) => action.projectId === project.id).length,
  };
}

function ConnectorRow({
  label,
  connected,
  comingSoon = false,
}: {
  label: string;
  connected: boolean;
  comingSoon?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-[18px] border border-[#d7e0ea] bg-white px-4 py-3">
      <span className="text-[14px] font-medium text-[#1d2939]">{label}</span>
      <span
        className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${
          comingSoon
            ? "bg-[#eef2f6] text-[#637489]"
            : connected
              ? "bg-[#e8f8ef] text-[#067647]"
              : "bg-[#fff3df] text-[#9a6700]"
        }`}
      >
        {comingSoon ? "Coming soon" : connected ? "Connected" : "Not connected"}
      </span>
    </div>
  );
}

export function WorkspaceHome() {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [viewer, setViewer] = useState<AuthMePayload["user"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notifCount, setNotifCount] = useState(0);
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
    const actions = snapshot?.pendingActions ?? [];
    return projects.map((project) => buildProjectCard(project, tasks, actions));
  }, [snapshot]);

  const pendingCount = snapshot?.pendingActions?.length ?? 0;
  const greetingName = deriveGreetingName(viewer);
  const connectedCount = [
    snapshot?.connectors?.slack?.connected,
    snapshot?.connectors?.calendar?.connected,
    snapshot?.connectors?.email?.connected,
  ].filter(Boolean).length;

  return (
    <>
      <div className="min-h-full overflow-y-auto bg-[linear-gradient(180deg,#f5f8fb_0%,#edf2f7_100%)] px-6 py-6">
        <div className="mx-auto grid max-w-[1320px] gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-6">
            <header className="rounded-[32px] border border-[#dbe4ed] bg-white/90 p-6 shadow-[0_24px_80px_rgba(9,23,41,0.06)]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#73839a]">
                    Workspace home
                  </p>
                  <h1 className="mt-3 text-[40px] font-semibold tracking-[-0.05em] text-[#101828]">
                    Welcome back, {greetingName}.
                  </h1>
                  <p className="mt-3 max-w-[640px] text-[16px] leading-8 text-[#526276]">
                    Keep the execution surface tight: review approvals, watch blockers, and jump straight into the projects that still need movement.
                  </p>
                </div>

                <div className="flex items-center gap-3 self-start">
                  <div className="rounded-full border border-[#d6e0eb] bg-white">
                    <NotificationBell count={notifCount} onCountChange={setNotifCount} />
                  </div>
                  <button
                    type="button"
                    onClick={() => setSheetOpen(true)}
                    className="inline-flex h-11 items-center gap-2 rounded-full bg-[#0073EA] px-5 text-[14px] font-semibold text-white transition-transform hover:scale-[1.01]"
                  >
                    <Plus size={16} />
                    New Project
                  </button>
                </div>
              </div>
            </header>

            {error && (
              <div className="flex items-start gap-3 rounded-[24px] border border-[#f0c7cd] bg-[#fff6f7] px-5 py-4 text-[#b42336]">
                <TriangleAlert size={18} className="mt-0.5 shrink-0" />
                <span className="text-[14px]">{error}</span>
              </div>
            )}

            <section className="rounded-[32px] border border-[#dbe4ed] bg-white p-6 shadow-[0_18px_60px_rgba(9,23,41,0.05)]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-[560px]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#0073EA]">
                    Action centre
                  </p>
                  <h2 className="mt-4 text-[28px] font-semibold tracking-[-0.04em] text-[#101828]">
                    {pendingCount > 0
                      ? `${pendingCount} approval${pendingCount === 1 ? "" : "s"} waiting for review`
                      : "Action centre is clear right now"}
                  </h2>
                  <p className="mt-3 text-[15px] leading-7 text-[#526276]">
                    Larry is already watching the signal. Keep approvals flowing so the board reflects what is actually happening, not what was last summarised.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Link
                    href="/workspace/actions"
                    className="inline-flex h-11 items-center gap-2 rounded-full bg-[#0073EA] px-5 text-[14px] font-semibold text-white transition-transform hover:scale-[1.01]"
                  >
                    Review actions
                    <ArrowRight size={15} />
                  </Link>
                  <button
                    type="button"
                    onClick={() => setSheetOpen(true)}
                    className="inline-flex h-11 items-center gap-2 rounded-full border border-[#dbe4ed] bg-white px-5 text-[14px] font-semibold text-[#344054] transition-colors hover:bg-[#f8fafc]"
                  >
                    <Plus size={16} />
                    New Project
                  </button>
                </div>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-3">
                <div className="rounded-[20px] border border-[#e6edf3] bg-[#f5f8ff] p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#73839a]">
                    Pending approvals
                  </p>
                  <p className="mt-3 text-[28px] font-semibold tracking-[-0.04em] text-[#101828]">
                    {pendingCount}
                  </p>
                </div>
                <div className="rounded-[20px] border border-[#e6edf3] bg-[#f5f8ff] p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#73839a]">
                    Active projects
                  </p>
                  <p className="mt-3 text-[28px] font-semibold tracking-[-0.04em] text-[#101828]">
                    {projectCards.length}
                  </p>
                </div>
                <div className="rounded-[20px] border border-[#e6edf3] bg-[#f5f8ff] p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#73839a]">
                    Connected inputs
                  </p>
                  <p className="mt-3 text-[28px] font-semibold tracking-[-0.04em] text-[#101828]">
                    {connectedCount}
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-[32px] border border-[#dbe4ed] bg-white p-6 shadow-[0_18px_60px_rgba(9,23,41,0.05)]">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#73839a]">
                    Projects
                  </p>
                  <h2 className="mt-3 text-[32px] font-semibold tracking-[-0.04em] text-[#101828]">
                    Where delivery is moving
                  </h2>
                </div>
                <p className="max-w-[360px] text-[14px] leading-7 text-[#526276]">
                  Project cards are driven by the live snapshot, so progress and blocker counts update with the same data the rest of the workspace uses.
                </p>
              </div>

              {loading ? (
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div
                      key={index}
                      className="h-[250px] animate-pulse rounded-[28px] border border-[#e6edf3] bg-[#f4f7fb]"
                    />
                  ))}
                </div>
              ) : projectCards.length === 0 ? (
                <div className="mt-6 rounded-[28px] border border-dashed border-[#c7d4e2] bg-[#f7fafc] px-6 py-10 text-center">
                  <p className="text-[24px] font-semibold tracking-[-0.03em] text-[#101828]">
                    No projects yet
                  </p>
                  <p className="mx-auto mt-3 max-w-[520px] text-[15px] leading-7 text-[#526276]">
                    Start with a live project so Larry can begin collecting task movement, meeting context, and approval-worthy actions in one place.
                  </p>
                  <button
                    type="button"
                    onClick={() => setSheetOpen(true)}
                    className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-[#0073EA] px-5 text-[14px] font-semibold text-white transition-transform hover:scale-[1.01]"
                  >
                    <Plus size={16} />
                    Create the first project
                  </button>
                </div>
              ) : (
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  {projectCards.map((project) => (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => router.push(`/workspace/projects/${project.id}`)}
                      className="group rounded-[28px] border border-[#dbe4ed] bg-[linear-gradient(180deg,#ffffff_0%,#f7fafc_100%)] p-5 text-left shadow-[0_20px_70px_rgba(9,23,41,0.05)] transition-transform hover:-translate-y-0.5 hover:border-[#bfd0e0]"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-[24px] font-semibold tracking-[-0.04em] text-[#101828]">
                            {project.name}
                          </p>
                          <p className="mt-3 text-[14px] leading-7 text-[#526276]">
                            {project.description}
                          </p>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${statusTone(project)}`}>
                          {project.status}
                        </span>
                      </div>

                      <div className="mt-6 grid grid-cols-3 gap-3">
                        <div className="rounded-[20px] border border-[#e6edf3] bg-white px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#73839a]">
                            Progress
                          </p>
                          <p className="mt-3 text-[24px] font-semibold tracking-[-0.03em] text-[#101828]">
                            {project.progress}%
                          </p>
                        </div>
                        <div className="rounded-[20px] border border-[#e6edf3] bg-white px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#73839a]">
                            Open tasks
                          </p>
                          <p className="mt-3 text-[24px] font-semibold tracking-[-0.03em] text-[#101828]">
                            {project.openTasks}
                          </p>
                        </div>
                        <div className="rounded-[20px] border border-[#e6edf3] bg-white px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#73839a]">
                            Pending
                          </p>
                          <p className="mt-3 text-[24px] font-semibold tracking-[-0.03em] text-[#101828]">
                            {project.pendingActions}
                          </p>
                        </div>
                      </div>

                      <div className="mt-5 h-2 overflow-hidden rounded-full bg-[#dfe8f1]">
                        <div
                          className="h-full rounded-full bg-[linear-gradient(90deg,#0073EA_0%,#42A0FF_100%)]"
                          style={{ width: `${Math.max(project.progress, 6)}%` }}
                        />
                      </div>

                      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-[13px] text-[#526276]">
                        <div className="flex items-center gap-2">
                          <CalendarDays size={15} />
                          Target {formatShortDate(project.targetDate)}
                        </div>
                        <div className="flex items-center gap-2">
                          <ShieldCheck size={15} />
                          {project.blockedTasks} blocked
                        </div>
                        <div className="flex items-center gap-2">
                          <Sparkles size={15} />
                          Updated {formatRelativeTime(project.updatedAt)}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>

          <aside className="space-y-6">
            <section className="rounded-[32px] border border-[#dbe4ed] bg-white p-6 shadow-[0_18px_60px_rgba(9,23,41,0.05)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#73839a]">
                    Notifications
                  </p>
                  <h2 className="mt-3 text-[28px] font-semibold tracking-[-0.04em] text-[#101828]">
                    Inbox pulse
                  </h2>
                </div>
                <div className="rounded-full border border-[#dbe4ed] bg-[#f8fafc] px-3 py-1 text-[12px] font-semibold text-[#344054]">
                  {notifCount} unread
                </div>
              </div>
              <p className="mt-4 text-[14px] leading-7 text-[#526276]">
                Open the bell to review unread notifications and keep the workspace queue under control.
              </p>
              <div className="mt-5 rounded-[24px] border border-[#e6edf3] bg-[#f8fafc] p-4">
                <div className="flex items-center gap-3 text-[#344054]">
                  <BellRing size={18} />
                  <span className="text-[14px] font-medium">
                    The notification panel is live in the header.
                  </span>
                </div>
              </div>
            </section>

            <section className="rounded-[32px] border border-[#dbe4ed] bg-white p-6 shadow-[0_18px_60px_rgba(9,23,41,0.05)]">
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#73839a]">
                Connected inputs
              </p>
              <h2 className="mt-3 text-[28px] font-semibold tracking-[-0.04em] text-[#101828]">
                Launch stack
              </h2>
              <div className="mt-5 space-y-3">
                <ConnectorRow
                  label="Slack"
                  connected={Boolean(snapshot?.connectors?.slack?.connected)}
                />
                <ConnectorRow
                  label="Calendar"
                  connected={Boolean(snapshot?.connectors?.calendar?.connected)}
                />
                <ConnectorRow
                  label="Email"
                  connected={Boolean(snapshot?.connectors?.email?.connected)}
                  comingSoon={!snapshot?.connectors?.email?.connected}
                />
              </div>
            </section>
          </aside>
        </div>
      </div>

      <ProjectCreateSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onCreated={(projectId) => router.push(`/workspace/projects/${projectId}`)}
      />
    </>
  );
}
