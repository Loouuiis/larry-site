"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  FolderKanban,
  MessageSquare,
  Sparkles,
  LayoutList,
  ListChecks,
  FileText,
  Users,
  Settings,
  Layers,
  Star,
} from "lucide-react";
import { useWorkspaceChrome } from "@/app/workspace/WorkspaceChromeContext";
import { triggerBoundedWorkspaceRefresh } from "@/app/workspace/refresh";
import type {
  WorkspaceConversationPreview,
  WorkspaceLarryEvent,
  WorkspaceProjectMemoryEntry,
} from "@/app/dashboard/types";
import { useProjectData } from "@/hooks/useProjectData";
import { useProjectActionCentre } from "@/hooks/useProjectActionCentre";
import { useProjectMemory } from "@/hooks/useProjectMemory";
import { useCalendarEvents, type CalendarEvent } from "@/hooks/useCalendarEvents";
import { CollaboratorsPanel } from "./CollaboratorsPanel";
import { ProjectNotesPanel } from "./ProjectNotesPanel";
import { TaskCenter } from "./TaskCenter";

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return {} as T;
  }
}

function formatDate(value?: string | null): string {
  if (!value) return "No date set";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatRelativeTime(value?: string | null): string {
  if (!value) return "Just now";
  const delta = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(delta / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(value);
}

function formatStatus(value?: string | null): string {
  if (!value) return "Unknown";
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatPercent(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return "0%";
  return `${Math.round(value)}%`;
}

function getConversationTitle(conversation: WorkspaceConversationPreview): string {
  if (conversation.title?.trim()) return conversation.title.trim();
  if (conversation.lastMessagePreview?.trim()) return conversation.lastMessagePreview.trim().slice(0, 56);
  return "New conversation";
}

function getRiskTone(riskLevel?: string | null) {
  if (riskLevel === "high") {
    return { background: "#fff1f2", color: "#be123c", border: "#fecdd3" };
  }
  if (riskLevel === "medium") {
    return { background: "#fff7ed", color: "#c2410c", border: "#fdba74" };
  }
  return { background: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" };
}

const PROJECT_STATUS_LABEL: Record<string, string> = {
  active: "On track",
  on_track: "On track",
  at_risk: "At risk",
  overdue: "Overdue",
  completed: "Completed",
  not_started: "Not started",
  archived: "Archived",
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
    case "archived":  return "pm-pill-backlog";
    default:          return "pm-pill-not-started";
  }
}

function getProjectStatusTone(status?: string | null) {
  switch (status) {
    case "completed":
      return { background: "#b8d9b4", color: "#245820", border: "#90c08a", label: "Completed" };
    case "on_track":
    case "active":
      return { background: "#a8c0e0", color: "#1a3f70", border: "#80a0c8", label: status === "active" ? "Active" : "On track" };
    case "at_risk":
      return { background: "#ece4a0", color: "#705800", border: "#d4cc70", label: "At risk" };
    case "overdue":
      return { background: "#ecaaaa", color: "#701818", border: "#d07070", label: "Overdue" };
    case "archived":
      return { background: "#e8e8e8", color: "#505050", border: "#c8c8c8", label: "Archived" };
    default:
      return { background: "#ebebeb", color: "#606060", border: "#d0d0d0", label: status ? formatStatus(status) : "Not started" };
  }
}

function getEventTone(event: WorkspaceLarryEvent) {
  if (event.eventType === "suggested") {
    return { background: "#fff7ed", color: "#c2410c", border: "#fdba74", label: "Pending approval" };
  }
  if (event.eventType === "accepted") {
    return { background: "#ecfdf3", color: "#15803d", border: "#bbf7d0", label: "Accepted" };
  }
  return { background: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe", label: "Auto executed" };
}

function getEventOriginLabel(sourceKind?: string | null): string {
  switch (sourceKind) {
    case "meeting":
      return "Meeting transcript";
    case "briefing":
      return "Login briefing";
    case "schedule":
      return "Scheduled scan";
    case "slack":
      return "Slack signal";
    case "email":
      return "Email signal";
    case "calendar":
      return "Calendar signal";
    case "chat":
    case null:
    case undefined:
      return "Larry chat";
    default:
      return formatStatus(sourceKind);
  }
}

function getMemorySourceLabel(sourceKind?: string | null): string {
  switch (sourceKind) {
    case "chat":
      return "Larry chat";
    case "action":
      return "Accepted action";
    case "meeting":
      return "Meeting";
    case "slack":
      return "Slack";
    case "email":
      return "Email";
    case "calendar":
      return "Calendar";
    case "briefing":
      return "Briefing";
    case "schedule":
      return "Schedule";
    default:
      return sourceKind?.trim() ? formatStatus(sourceKind) : "General";
  }
}

function getEventSourceMeta(sourceKind?: string | null): string {
  switch (sourceKind) {
    case "meeting":
      return "Captured from meeting transcript";
    case "briefing":
      return "Generated during login briefing";
    case "schedule":
      return "Generated by scheduled scan";
    case "slack":
      return "Generated from Slack signal";
    case "email":
      return "Generated from email signal";
    case "calendar":
      return "Generated from calendar signal";
    case "chat":
    case null:
    case undefined:
      return "Requested from Larry chat";
    default:
      return `Generated from ${formatStatus(sourceKind)}`;
  }
}

function getEventMeta(event: WorkspaceLarryEvent): string {
  const pieces = [
    formatStatus(event.actionType),
    event.requestedByName ? `Requested by ${event.requestedByName}` : getEventSourceMeta(event.sourceKind),
  ];

  if (event.eventType === "accepted" && event.approvedByName) {
    pieces.push(`Accepted by ${event.approvedByName}`);
  } else if (event.executionMode === "auto") {
    pieces.push("Executed by Larry");
  } else if (event.executedByName) {
    pieces.push(`Executed by ${event.executedByName}`);
  }

  return pieces.join(" · ");
}

const MEMORY_FILTERS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All sources" },
  { value: "chat", label: "Chat turns" },
  { value: "action", label: "Accepted actions" },
  { value: "meeting", label: "Meetings" },
  { value: "slack", label: "Slack" },
  { value: "email", label: "Email" },
  { value: "calendar", label: "Calendar" },
];

function getMemoryMeta(entry: WorkspaceProjectMemoryEntry): string {
  const pieces = [getMemorySourceLabel(entry.sourceKind)];
  if (entry.source?.trim()) {
    pieces.push(entry.source.trim());
  }
  return pieces.join(" - ");
}

type ProjectTab = "overview" | "timeline" | "tasks" | "actions" | "calendar" | "dashboard" | "files" | "team" | "settings" | "extra";

const PROJECT_TABS: { id: ProjectTab; label: string; icon: React.ElementType }[] = [
  { id: "overview",  label: "Overview",       icon: FolderKanban },
  { id: "timeline",  label: "Timeline",       icon: LayoutList },
  { id: "tasks",     label: "Task center",    icon: ListChecks },
  { id: "actions",   label: "Action center",  icon: CheckCircle2 },
  { id: "calendar",  label: "Calendar",       icon: CalendarDays },
  { id: "dashboard", label: "Dashboard",      icon: Activity },
  { id: "files",     label: "Files",          icon: FileText },
  { id: "team",      label: "Team",           icon: Users },
  { id: "settings",  label: "Settings",       icon: Settings },
  { id: "extra",     label: "Extra",          icon: Layers },
];

function ProjectCalendar({ projectId }: { projectId: string }) {
  const today = useMemo(() => new Date(), []);
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const { events, loading } = useCalendarEvents(projectId);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  function getDaysInMonth(y: number, m: number): Date[] {
    const days: Date[] = [];
    const d = new Date(y, m, 1);
    while (d.getMonth() === m) {
      days.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    return days;
  }

  function getMonthGrid(y: number, m: number): (Date | null)[][] {
    const days = getDaysInMonth(y, m);
    const firstDay = days[0].getDay();
    const startOffset = firstDay === 0 ? 6 : firstDay - 1;
    const grid: (Date | null)[][] = [];
    let week: (Date | null)[] = Array(startOffset).fill(null);
    for (const day of days) {
      week.push(day);
      if (week.length === 7) { grid.push(week); week = []; }
    }
    if (week.length > 0) {
      while (week.length < 7) week.push(null);
      grid.push(week);
    }
    return grid;
  }

  function isSameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function eventsForDate(date: Date): CalendarEvent[] {
    const key = date.toISOString().slice(0, 10);
    return events.filter((e) => e.date === key);
  }

  const grid = useMemo(() => getMonthGrid(year, month), [year, month]);
  const monthLabel = viewDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div className="space-y-4">
      {/* Calendar card */}
      <div
        style={{
          borderRadius: "var(--radius-card)",
          border: "1px solid var(--border)",
          background: "var(--surface)",
          overflow: "hidden",
        }}
      >
        {/* Month nav */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setViewDate(new Date(year, month - 1, 1))}
              className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors"
              style={{ color: "var(--text-2)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "")}
            >
              <ChevronLeft size={16} />
            </button>
            <h3 className="text-[14px] font-semibold min-w-[160px] text-center" style={{ color: "var(--text-1)" }}>
              {monthLabel}
            </h3>
            <button
              type="button"
              onClick={() => setViewDate(new Date(year, month + 1, 1))}
              className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors"
              style={{ color: "var(--text-2)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "")}
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <button
            type="button"
            onClick={() => setViewDate(new Date(today.getFullYear(), today.getMonth(), 1))}
            className="rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors"
            style={{ borderColor: "var(--border)", color: "var(--text-2)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "")}
          >
            Today
          </button>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7" style={{ borderBottom: "1px solid var(--border)" }}>
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              className="py-1.5 text-center text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--text-disabled)" }}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Day grid */}
        <div>
          {grid.map((week, wi) => (
            <div
              key={wi}
              className="grid grid-cols-7"
              style={{ borderBottom: wi < grid.length - 1 ? "1px solid var(--border)" : undefined }}
            >
              {week.map((day, di) => {
                const isToday = day && isSameDay(day, today);
                const isCurrentMonth = day !== null;
                return (
                  <div
                    key={di}
                    className="min-h-[60px] p-1.5 transition-colors cursor-pointer"
                    style={{
                      borderRight: di < 6 ? "1px solid var(--border)" : undefined,
                      background: isToday ? "var(--surface-2)" : undefined,
                    }}
                    onClick={isCurrentMonth ? () => setSelectedDate(day!.toISOString().slice(0, 10)) : undefined}
                    onMouseEnter={(e) => { if (!isToday) e.currentTarget.style.background = "var(--surface-2)"; }}
                    onMouseLeave={(e) => { if (!isToday) e.currentTarget.style.background = ""; }}
                  >
                    {isCurrentMonth && (
                      <>
                        <span
                          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-medium"
                          style={{
                            background: isToday ? "var(--brand)" : undefined,
                            color: isToday ? "#fff" : "var(--text-2)",
                          }}
                        >
                          {day.getDate()}
                        </span>
                        {(() => {
                          const dayEvents = eventsForDate(day!);
                          if (dayEvents.length === 0) return null;
                          return (
                            <div className="mt-0.5 flex flex-wrap gap-0.5">
                              {dayEvents.slice(0, 3).map((evt) => (
                                <div
                                  key={evt.id}
                                  className="h-1 w-1 rounded-full"
                                  style={{ background: evt.color }}
                                  title={evt.title}
                                />
                              ))}
                              {dayEvents.length > 3 && (
                                <span className="text-[8px]" style={{ color: "var(--text-disabled)" }}>
                                  +{dayEvents.length - 3}
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Day detail panel */}
      {selectedDate && (() => {
        const dayEvents = events.filter((e) => e.date === selectedDate);
        return (
          <div
            style={{
              borderRadius: "var(--radius-card)",
              border: "1px solid var(--border)",
              background: "var(--surface)",
              padding: "16px",
            }}
          >
            <div className="flex items-center justify-between">
              <h4 className="text-[14px] font-semibold" style={{ color: "var(--text-1)" }}>
                {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              </h4>
              <button
                type="button"
                onClick={() => setSelectedDate(null)}
                className="text-[11px]"
                style={{ color: "var(--text-muted)" }}
              >
                Close
              </button>
            </div>
            {dayEvents.length === 0 ? (
              <p className="mt-2 text-[12px]" style={{ color: "var(--text-disabled)" }}>
                No events on this day.
              </p>
            ) : (
              <div className="mt-2 space-y-1.5">
                {dayEvents.map((evt) => (
                  <div
                    key={evt.id}
                    className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <div className="h-2 w-2 shrink-0 rounded-full" style={{ background: evt.color }} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-medium truncate" style={{ color: "var(--text-1)" }}>
                        {evt.title}
                      </p>
                      <p className="text-[10px]" style={{ color: "var(--text-disabled)" }}>
                        {evt.kind === "deadline" ? "Task deadline" : evt.kind === "meeting" ? "Meeting" : "Event"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* Empty state */}
      {!loading && events.length === 0 && (
        <div
          className="text-center px-4 py-6"
          style={{ borderRadius: "var(--radius-card)", border: "1px dashed var(--border-2)", background: "var(--surface)" }}
        >
          <CalendarDays size={24} className="mx-auto mb-2" style={{ color: "var(--text-disabled)" }} />
          <p className="text-[13px] font-semibold" style={{ color: "var(--text-1)" }}>No calendar events</p>
          <p className="mt-1 text-[12px]" style={{ color: "var(--text-2)" }}>
            Task deadlines and meetings for this project will appear here.
          </p>
        </div>
      )}
    </div>
  );
}

export function ProjectWorkspaceView({ projectId }: { projectId: string }) {
  const chrome = useWorkspaceChrome();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ProjectTab>("overview");
  const [memorySourceFilter, setMemorySourceFilter] = useState("all");
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [statusBusy, setStatusBusy] = useState<"archive" | "unarchive" | null>(null);
  const [statusNotice, setStatusNotice] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const archiveConfirmButtonRef = useRef<HTMLButtonElement>(null);
  const activeMemorySource = memorySourceFilter === "all" ? null : memorySourceFilter;
  const { project, tasks, health, meetings, outcomes, timeline, loading, error, refresh } = useProjectData(projectId);
  const {
    suggested,
    activity,
    conversations,
    loading: actionCentreLoading,
    error: actionCentreError,
    accepting,
    dismissing,
    accept,
    dismiss,
    refresh: refreshActionCentre,
  } = useProjectActionCentre(projectId, refresh);
  const {
    entries: memoryEntries,
    loading: memoryLoading,
    error: memoryError,
    refresh: refreshMemory,
  } = useProjectMemory(projectId, activeMemorySource);

  const [isFavorited, setIsFavorited] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("larry:favorite-projects");
      const favs: string[] = stored ? (JSON.parse(stored) as string[]) : [];
      setIsFavorited(favs.includes(projectId));
    } catch { /* ignore */ }
  }, [projectId]);

  const toggleFavorite = () => {
    try {
      const stored = localStorage.getItem("larry:favorite-projects");
      const favs: string[] = stored ? (JSON.parse(stored) as string[]) : [];
      const next = isFavorited ? favs.filter((id) => id !== projectId) : [...favs, projectId];
      localStorage.setItem("larry:favorite-projects", JSON.stringify(next));
      setIsFavorited(!isFavorited);
      window.dispatchEvent(new CustomEvent("larry:favorites-changed"));
    } catch { /* ignore */ }
  };

  const completionRate = useMemo(() => {
    if (health?.completionRate != null) return Number(health.completionRate);
    if (tasks.length === 0) return 0;
    const completed = tasks.filter((task) => task.status === "completed").length;
    return (completed / tasks.length) * 100;
  }, [health?.completionRate, tasks]);

  const openTasks = tasks.filter((task) => task.status !== "completed").length;
  const blockedTasks = tasks.filter((task) => task.status === "at_risk").length;
  const recentTasks = (timeline?.gantt ?? tasks).slice(0, 6);
  const riskTone = getRiskTone(project?.riskLevel ?? health?.riskLevel ?? "low");
  const isArchived = project?.status === "archived";

  useEffect(() => {
    if (!archiveDialogOpen) return;

    archiveConfirmButtonRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setArchiveDialogOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [archiveDialogOpen]);

  function openLarry() {
    chrome?.openLarry();
  }

  function openConversation(conversationId: string) {
    chrome?.openLarry();
    window.dispatchEvent(new CustomEvent("larry:load-conversation", { detail: conversationId }));
  }

  function startProjectChat() {
    chrome?.openLarry();
    window.dispatchEvent(
      new CustomEvent("larry:prefill", {
        detail: "Review this project and suggest the next actions worth taking.",
      }),
    );
  }

  async function updateProjectArchiveState(nextStatus: "active" | "archived") {
    const action = nextStatus === "archived" ? "archive" : "unarchive";
    setStatusBusy(action);
    setStatusNotice(null);

    try {
      const response = await fetch(
        `/api/workspace/projects/${encodeURIComponent(projectId)}/${action}`,
        { method: "POST" },
      );
      const payload = await readJson<{ error?: string }>(response);

      if (!response.ok) {
        throw new Error(payload.error ?? `Failed to ${action} project.`);
      }

      setArchiveDialogOpen(false);
      setStatusNotice({
        tone: "success",
        message:
          action === "archive"
            ? "Project archived. It stays readable here and moves out of active workspace lists."
            : "Project restored to active workspace lists.",
      });

      await refresh();
      chrome?.refreshShell();
      triggerBoundedWorkspaceRefresh();
    } catch (updateError) {
      setStatusNotice({
        tone: "error",
        message:
          updateError instanceof Error
            ? updateError.message
            : `Failed to ${action} project.`,
      });
    } finally {
      setStatusBusy(null);
    }
  }

  if (loading && !project) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--color-brand)] border-t-transparent" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto" style={{ background: "var(--page-bg)" }}>
        <div className="mx-auto max-w-[1100px] px-6 py-8">
          <div
            style={{
              borderRadius: "var(--radius-card)",
              border: "1px solid var(--border)",
              background: "var(--surface)",
              padding: "24px",
            }}
          >
            <p className="text-[18px] font-semibold" style={{ color: "var(--text-1)" }}>
              Project unavailable
            </p>
            <p className="mt-2 text-[14px]" style={{ color: "var(--text-2)" }}>
              {error ?? "This project could not be found on the new workspace data path."}
            </p>
            <Link href="/workspace" className="mt-5 inline-flex items-center gap-2 text-[14px] font-semibold" style={{ color: "var(--cta)" }}>
              Back to workspace
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto" style={{ background: "var(--page-bg)" }}>
      <div className="mx-auto max-w-[1200px] space-y-6 px-6 py-8">
        <section
          style={{
            borderRadius: "var(--radius-card)",
            border: "1px solid var(--border)",
            background: "var(--surface)",
            padding: "24px",
          }}
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <h1 className="text-[24px] font-semibold tracking-[-0.04em]" style={{ color: "var(--text-1)" }}>
                {project.name}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className={`pm-pill ${projectStatusPillClass(project.status)}`}>
                  {projectStatusLabel(project.status)}
                </span>
                <span
                  className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-semibold"
                  style={{
                    background: riskTone.background,
                    color: riskTone.color,
                    borderColor: riskTone.border,
                  }}
                >
                  <CircleAlert size={12} />
                  {formatStatus(project.riskLevel ?? health?.riskLevel ?? "low")} risk
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={startProjectChat}
                className="inline-flex h-9 items-center gap-2 rounded-full px-4 text-[13px] font-semibold text-white"
                style={{ background: "var(--cta)" }}
              >
                <Sparkles size={14} />
                Ask Larry
              </button>
              <Link
                href={`/workspace/chats?projectId=${projectId}`}
                className="inline-flex h-9 items-center gap-2 rounded-full border px-4 text-[13px] font-semibold"
                style={{ borderColor: "var(--border)", color: "var(--text-2)" }}
              >
                <MessageSquare size={14} />
                Full chat history
              </Link>
            </div>
          </div>
          {statusNotice && (
            <div
              role={statusNotice.tone === "error" ? "alert" : "status"}
              aria-live="polite"
              className="mt-4 rounded-[16px] px-4 py-3 text-[13px]"
              style={{
                border: `1px solid ${statusNotice.tone === "error" ? "#fecaca" : "#bbf7d0"}`,
                background: statusNotice.tone === "error" ? "#fef2f2" : "#f0fdf4",
                color: statusNotice.tone === "error" ? "#b91c1c" : "#166534",
              }}
            >
              {statusNotice.message}
            </div>
          )}
        </section>

        {/* ── Project tab bar ──────────────────────────── */}
        <nav
          className="flex items-center gap-1 overflow-x-auto scrollbar-hide"
          style={{
            borderRadius: "var(--radius-card)",
            border: "1px solid var(--border)",
            background: "var(--surface)",
            padding: "4px",
          }}
        >
          {PROJECT_TABS.map(({ id, label, icon: Icon }) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  if (id === "dashboard") {
                    router.push(`/workspace/projects/${projectId}/dashboard`);
                  } else {
                    setActiveTab(id);
                  }
                }}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150"
                style={{
                  background: isActive ? "var(--surface-2)" : "transparent",
                  color: isActive ? "var(--text-1)" : "var(--text-muted)",
                }}
              >
                <Icon size={14} />
                {label}
              </button>
            );
          })}
        </nav>

        {/* ── Tab: Timeline (placeholder) ──────────────── */}
        {activeTab === "timeline" && (
          <div
            className="text-center px-6 py-12"
            style={{ borderRadius: "var(--radius-card)", border: "1px dashed var(--border-2)", background: "var(--surface)" }}
          >
            <LayoutList size={32} className="mx-auto mb-3" style={{ color: "var(--text-disabled)" }} />
            <p className="text-[14px] font-semibold" style={{ color: "var(--text-1)" }}>Timeline view</p>
            <p className="mt-2 text-[13px]" style={{ color: "var(--text-2)" }}>
              A visual timeline of tasks, milestones, and dependencies is coming in the next phase.
            </p>
          </div>
        )}

        {/* ── Tab: Task center ──────────────────────────── */}
        {activeTab === "tasks" && (
          <TaskCenter projectId={projectId} tasks={tasks} refresh={refresh} />
        )}

        {/* ── Tab: Calendar ──────────────── */}
        {activeTab === "calendar" && (
          <ProjectCalendar projectId={projectId} />
        )}

        {/* ── Tab: Files (placeholder) ──────────────────── */}
        {activeTab === "files" && (
          <div
            className="text-center px-6 py-12"
            style={{ borderRadius: "var(--radius-card)", border: "1px dashed var(--border-2)", background: "var(--surface)" }}
          >
            <FileText size={32} className="mx-auto mb-3" style={{ color: "var(--text-disabled)" }} />
            <p className="text-[14px] font-semibold" style={{ color: "var(--text-1)" }}>Project files</p>
            <p className="mt-2 text-[13px]" style={{ color: "var(--text-2)" }}>
              A document store for project-related files is coming in the next phase.
            </p>
          </div>
        )}

        {/* ── Tab: Settings ──────────────────────────── */}
        {activeTab === "settings" && (
          <div
            style={{ borderRadius: "var(--radius-card)", border: "1px solid var(--border)", background: "var(--surface)", padding: "24px" }}
          >
            <p className="text-[14px] font-semibold" style={{ color: "var(--text-1)" }}>Project settings</p>
            <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
              Project-level settings for reminders, reports, and permissions are coming in the next phase.
            </p>

            {/* Favourite */}
            <div className="mt-6 border-t pt-6" style={{ borderColor: "var(--border)" }}>
              <p className="text-[13px] font-semibold" style={{ color: "var(--text-1)" }}>Sidebar pin</p>
              <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
                Favourite this project to pin it in the sidebar for quick access.
              </p>
              <button
                type="button"
                onClick={toggleFavorite}
                className="mt-4 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[13px] font-semibold transition-colors"
                style={{
                  borderColor: isFavorited ? "#f59e0b" : "var(--border)",
                  background: isFavorited ? "#fefce8" : "var(--surface)",
                  color: isFavorited ? "#b45309" : "var(--text-2)",
                }}
              >
                <Star size={14} fill={isFavorited ? "#f59e0b" : "none"} stroke={isFavorited ? "#f59e0b" : "currentColor"} />
                {isFavorited ? "Favourited — click to remove" : "Add to favourites"}
              </button>
            </div>

            <div className="mt-6 border-t pt-6" style={{ borderColor: "var(--border)" }}>
              <p className="text-[13px] font-semibold" style={{ color: "var(--text-1)" }}>Danger zone</p>
              <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
                {isArchived
                  ? "This project is archived. It stays readable by direct link but no longer appears in active workspace lists."
                  : "Archiving removes this project from active workspace lists. It can be restored at any time."}
              </p>
              <div className="mt-4">
                {isArchived ? (
                  <button
                    type="button"
                    onClick={() => void updateProjectArchiveState("active")}
                    disabled={statusBusy !== null}
                    className="inline-flex h-9 items-center gap-2 rounded-full border px-4 text-[13px] font-semibold"
                    style={{
                      borderColor: "var(--border)",
                      color: "var(--text-2)",
                      background: "var(--surface)",
                      opacity: statusBusy !== null ? 0.7 : 1,
                    }}
                  >
                    {statusBusy === "unarchive" ? "Restoring..." : "Restore to active"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setArchiveDialogOpen(true)}
                    disabled={statusBusy !== null}
                    className="inline-flex h-9 items-center gap-2 rounded-full border px-4 text-[13px] font-semibold"
                    style={{
                      borderColor: "#fecdd3",
                      color: "#be123c",
                      background: "#fff1f2",
                      opacity: statusBusy !== null ? 0.7 : 1,
                    }}
                  >
                    Archive project
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Tab: Overview ────────────────────────────── */}
        {activeTab === "overview" && (<>
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Completion", value: formatPercent(completionRate), detail: `${openTasks} still open` },
            { label: "Blocked", value: String(blockedTasks), detail: "Tasks needing attention" },
            { label: "Pending Actions", value: String(suggested.length), detail: "Awaiting review" },
            { label: "Recent Meetings", value: String(meetings.length), detail: "Project context inputs" },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{
                borderRadius: "var(--radius-card)",
                border: "1px solid var(--border)",
                background: "var(--surface)",
                padding: "18px 20px",
              }}
            >
              <p className="text-[12px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--text-muted)" }}>
                {stat.label}
              </p>
              <p className="mt-3 text-[28px] font-semibold tracking-[-0.04em]" style={{ color: "var(--text-1)" }}>
                {stat.value}
              </p>
              <p className="mt-2 text-[13px]" style={{ color: "var(--text-2)" }}>
                {stat.detail}
              </p>
            </div>
          ))}
        </section>

        {/* ── Two-column: progress+AI vs action centre ── */}
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(360px,1fr)]" style={{ alignItems: "stretch" }}>
          <div className="flex flex-col gap-6">
            {/* Progress bar */}
            {(() => {
              const pct = Math.round(completionRate);
              return (
                <div
                  style={{
                    borderRadius: "var(--radius-card)",
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                    padding: "20px",
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[15px] font-semibold" style={{ color: "var(--text-1)" }}>Progress</p>
                    <span className="text-[13px] font-semibold" style={{ color: "var(--text-2)" }}>{pct}%</span>
                  </div>
                  <div
                    className="mt-3 w-full overflow-hidden"
                    style={{ height: "6px", borderRadius: "9999px", background: "var(--surface-2)" }}
                  >
                    <div
                      style={{
                        width: `${Math.max(pct, 2)}%`,
                        height: "100%",
                        borderRadius: "9999px",
                        background: "#6c44f6",
                        transition: "width 0.4s ease",
                      }}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[12px]" style={{ color: "var(--text-muted)" }}>
                    <span>{tasks.filter((t) => t.status === "completed").length} of {tasks.length} tasks complete</span>
                    <span>{openTasks} remaining</span>
                  </div>
                </div>
              );
            })()}

            {/* AI Summary — flex-1 fills remaining height to match action centre */}
            <div
              style={{
                flex: 1,
                borderRadius: "var(--radius-card)",
                border: "1px solid var(--border)",
                background: "var(--surface)",
                padding: "20px",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[15px] font-semibold" style={{ color: "var(--text-1)" }}>AI Summary</p>
                <span
                  className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
                >
                  Coming soon
                </span>
              </div>
              <div
                style={{
                  flex: 1,
                  marginTop: "12px",
                  borderRadius: "var(--radius-btn)",
                  background: "var(--surface-2)",
                  padding: "14px",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <p className="text-[14px] leading-7 italic" style={{ color: "var(--text-muted)" }}>
                  Larry will summarise the health, risks, and recent momentum of this project here once AI analysis is connected.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div
              style={{
                borderRadius: "var(--radius-card)",
                border: "1px solid var(--border)",
                background: "var(--surface)",
                padding: "20px",
              }}
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[18px] font-semibold" style={{ color: "var(--text-1)" }}>
                    Action Centre
                  </p>
                  <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
                    Project-scoped Larry actions and conversations now load from one action-centre contract.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    void Promise.all([refresh(), refreshActionCentre(), refreshMemory()]);
                  }}
                  className="text-[12px] font-semibold"
                  style={{ color: "var(--cta)" }}
                >
                  Refresh
                </button>
              </div>

              <div className="mt-5 space-y-4">
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>
                    Pending review
                  </p>
                  <div className="mt-3 space-y-3">
                    {actionCentreLoading && suggested.length === 0 ? (
                      <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>
                        Loading suggested actions...
                      </p>
                    ) : suggested.length === 0 ? (
                      <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>
                        No pending Larry actions for this project.
                      </p>
                    ) : (
                      suggested.map((event) => (
                        <div
                          key={event.id}
                          className="rounded-xl border px-4 py-4"
                          style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              <p className="text-[14px] font-semibold" style={{ color: "var(--text-1)" }}>
                                {event.displayText}
                              </p>
                              <p className="mt-2 text-[13px] leading-6" style={{ color: "var(--text-2)" }}>
                                {event.reasoning || "Larry proposed this action from current project context."}
                              </p>
                            </div>
                            <span
                              className="shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold"
                              style={{
                                background: getEventTone(event).background,
                                color: getEventTone(event).color,
                                borderColor: getEventTone(event).border,
                              }}
                            >
                              {getEventTone(event).label}
                            </span>
                          </div>
                          <p className="mt-3 text-[12px]" style={{ color: "var(--text-muted)" }}>
                            {getEventMeta(event)} · {formatRelativeTime(event.createdAt)}
                          </p>
                          {(event.responseMessagePreview || event.requestMessagePreview) && (
                            <p className="mt-2 rounded-[14px] border px-3 py-2 text-[12px] leading-5" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                              {(event.responseMessagePreview ?? event.requestMessagePreview)?.trim()}
                            </p>
                          )}
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                            {event.conversationId ? (
                              <button
                                type="button"
                                onClick={() => openConversation(event.conversationId!)}
                                className="text-[12px] font-semibold"
                                style={{ color: "var(--cta)" }}
                              >
                                Open linked chat
                              </button>
                            ) : (
                              <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                                Origin: {getEventOriginLabel(event.sourceKind)}
                              </span>
                            )}
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => void dismiss(event.id)}
                                disabled={dismissing === event.id}
                                className="rounded-full border px-3 py-1.5 text-[12px] font-semibold"
                                style={{ borderColor: "var(--border)", color: "var(--text-2)" }}
                              >
                                {dismissing === event.id ? "Dismissing..." : "Dismiss"}
                              </button>
                              <button
                                type="button"
                                onClick={() => void accept(event.id)}
                                disabled={accepting === event.id}
                                className="rounded-full px-3 py-1.5 text-[12px] font-semibold text-white"
                                style={{ background: "var(--cta)" }}
                              >
                                {accepting === event.id ? "Accepting..." : "Accept"}
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>
                    Recent activity
                  </p>
                  <div className="mt-3 space-y-3">
                    {activity.length === 0 ? (
                      <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>
                        No recent Larry activity logged yet.
                      </p>
                    ) : (
                      activity.map((event) => (
                        <div key={event.id} className="rounded-xl border px-4 py-3" style={{ borderColor: "var(--border)" }}>
                          <div className="flex items-start gap-3">
                            <CheckCircle2 size={16} className="mt-0.5 shrink-0" style={{ color: "var(--cta)" }} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-3">
                                <p className="text-[13px] font-semibold" style={{ color: "var(--text-1)" }}>
                                  {event.displayText}
                                </p>
                                <span
                                  className="shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold"
                                  style={{
                                    background: getEventTone(event).background,
                                    color: getEventTone(event).color,
                                    borderColor: getEventTone(event).border,
                                  }}
                                >
                                  {getEventTone(event).label}
                                </span>
                              </div>
                              <p className="mt-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
                                {getEventMeta(event)} · {formatRelativeTime(event.executedAt ?? event.createdAt)}
                              </p>
                              {event.responseMessagePreview && (
                                <p className="mt-2 line-clamp-2 text-[12px] leading-5" style={{ color: "var(--text-2)" }}>
                                  {event.responseMessagePreview}
                                </p>
                              )}
                              {event.conversationId && (
                                <button
                                  type="button"
                                  onClick={() => openConversation(event.conversationId!)}
                                  className="mt-2 text-[12px] font-semibold"
                                  style={{ color: "var(--cta)" }}
                                >
                                  Jump to chat
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>

          </div>
        </section>

        {/* ── Task breakdown — full width ───────────────── */}
        {(() => {
          const STATUS_BUCKETS: { key: string[]; label: string; pillClass: string }[] = [
            { key: ["not_started", "backlog"], label: "Not started", pillClass: "pm-pill-not-started" },
            { key: ["in_progress"],            label: "In progress",  pillClass: "pm-pill-working"     },
            { key: ["waiting"],                label: "Waiting",      pillClass: "pm-pill-review"      },
            { key: ["blocked"],                label: "Blocked",      pillClass: "pm-pill-stuck"       },
            { key: ["completed"],              label: "Completed",    pillClass: "pm-pill-done"        },
          ];
          const buckets = STATUS_BUCKETS.map((b) => ({
            ...b,
            count: tasks.filter((t) => b.key.includes(t.status)).length,
          }));
          return (
            <div
              style={{
                borderRadius: "var(--radius-card)",
                border: "1px solid var(--border)",
                background: "var(--surface)",
                padding: "20px",
              }}
            >
              <p className="text-[15px] font-semibold" style={{ color: "var(--text-1)" }}>Task breakdown</p>
              <div className="mt-4 grid grid-cols-5 gap-3">
                {buckets.map((b) => (
                  <div
                    key={b.label}
                    className="flex flex-col items-center gap-2 rounded-xl py-5 px-2"
                    style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
                  >
                    <span className={`pm-pill ${b.pillClass} text-[11px]`}>{b.label}</span>
                    <span className="text-[26px] font-bold" style={{ color: "var(--text-1)" }}>{b.count}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* ── Task distribution bar chart — full width ──── */}
        {(() => {
          const CHART_ITEMS: { key: string[]; label: string; bg: string }[] = [
            { key: ["not_started", "backlog"], label: "Not started", bg: "var(--status-todo-bg)"   },
            { key: ["in_progress"],            label: "In progress",  bg: "var(--status-wip-bg)"    },
            { key: ["waiting"],                label: "Waiting",      bg: "var(--status-review-bg)" },
            { key: ["blocked"],                label: "Blocked",      bg: "var(--status-stuck-bg)"  },
            { key: ["completed"],              label: "Completed",    bg: "var(--status-done-bg)"   },
          ];
          const segments = CHART_ITEMS.map((s) => ({
            ...s,
            count: tasks.filter((t) => s.key.includes(t.status)).length,
          }));
          const maxCount = Math.max(...segments.map((s) => s.count), 1);
          const BAR_HEIGHT = 160;
          return (
            <div
              style={{
                borderRadius: "var(--radius-card)",
                border: "1px solid var(--border)",
                background: "var(--surface)",
                padding: "20px",
              }}
            >
              <p className="text-[15px] font-semibold" style={{ color: "var(--text-1)" }}>Task distribution</p>
              {tasks.length === 0 ? (
                <p className="mt-3 text-[13px]" style={{ color: "var(--text-muted)" }}>No tasks yet.</p>
              ) : (
                <>
                  <div className="mt-5 flex items-end gap-4" style={{ height: `${BAR_HEIGHT}px` }}>
                    {segments.map((s) => (
                      <div key={s.label} className="flex flex-1 flex-col items-center gap-1">
                        <span className="text-[13px] font-semibold" style={{ color: "var(--text-2)" }}>{s.count}</span>
                        <div
                          title={`${s.label}: ${s.count}`}
                          style={{
                            width: "100%",
                            height: `${Math.max((s.count / maxCount) * (BAR_HEIGHT - 28), s.count > 0 ? 4 : 0)}px`,
                            background: s.bg,
                            borderRadius: "6px 6px 0 0",
                            transition: "height 0.4s ease",
                          }}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="mt-1 flex gap-4">
                    {segments.map((s) => (
                      <div key={s.label} className="flex flex-1 justify-center">
                        <span className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>{s.label}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })()}
        </>)}

        {/* ── Tab: Extra ────────────────────────────────── */}
        {activeTab === "extra" && (
          <div className="space-y-6">
            {/* Project Larry Chat */}
            <div
              style={{
                borderRadius: "var(--radius-card)",
                border: "1px solid var(--border)",
                background: "var(--surface)",
                padding: "20px",
              }}
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[18px] font-semibold" style={{ color: "var(--text-1)" }}>Project Larry Chat</p>
                  <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>Project-specific conversations and history.</p>
                </div>
                <button type="button" onClick={openLarry} className="text-[12px] font-semibold" style={{ color: "var(--cta)" }}>
                  Open panel
                </button>
              </div>
              <div className="mt-5 space-y-3">
                {actionCentreError && (
                  <div className="rounded-xl border px-4 py-3 text-[13px]" style={{ borderColor: "#fecaca", background: "#fef2f2", color: "#b91c1c" }}>
                    {actionCentreError}
                  </div>
                )}
                {actionCentreLoading && conversations.length === 0 ? (
                  <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>Loading conversation history...</p>
                ) : conversations.length === 0 ? (
                  <div className="rounded-xl border border-dashed px-4 py-6 text-center" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                    <p className="text-[14px] font-semibold" style={{ color: "var(--text-1)" }}>No project chats yet</p>
                    <button
                      type="button"
                      onClick={startProjectChat}
                      className="mt-4 inline-flex h-10 items-center gap-2 rounded-full px-4 text-[13px] font-semibold text-white"
                      style={{ background: "var(--cta)" }}
                    >
                      <Sparkles size={14} />
                      Start project chat
                    </button>
                  </div>
                ) : (
                  conversations.map((conversation) => (
                    <button
                      key={conversation.id}
                      type="button"
                      onClick={() => openConversation(conversation.id)}
                      className="flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left"
                      style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
                    >
                      <MessageSquare size={16} className="mt-0.5 shrink-0" style={{ color: "var(--cta)" }} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold" style={{ color: "var(--text-1)" }}>{getConversationTitle(conversation)}</p>
                        <p className="mt-1 line-clamp-2 text-[12px] leading-5" style={{ color: "var(--text-2)" }}>
                          {conversation.lastMessagePreview?.trim() || "No messages saved yet."}
                        </p>
                      </div>
                      <span className="shrink-0 text-[12px]" style={{ color: "var(--text-muted)" }}>
                        {formatRelativeTime(conversation.lastMessageAt ?? conversation.updatedAt)}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Project Notes */}
            <ProjectNotesPanel projectId={projectId} />

            {/* Project Context */}
            <div
              style={{
                borderRadius: "var(--radius-card)",
                border: "1px solid var(--border)",
                background: "var(--surface)",
                padding: "20px",
              }}
            >
              <p className="text-[18px] font-semibold" style={{ color: "var(--text-1)" }}>Project Context</p>
              <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>Workspace-native project summary and context feed.</p>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div style={{ borderRadius: "var(--radius-btn)", border: "1px solid var(--border)", background: "var(--surface-2)", padding: "16px" }}>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>Health Summary</p>
                  <p className="mt-3 text-[14px] leading-7" style={{ color: "var(--text-2)" }}>
                    Completion {formatPercent(health?.completionRate ?? completionRate)} with {blockedTasks} blocked tasks and average risk score {Math.round(health?.avgRiskScore ?? 0)}.
                  </p>
                </div>
                <div style={{ borderRadius: "var(--radius-btn)", border: "1px solid var(--border)", background: "var(--surface-2)", padding: "16px" }}>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>Larry Narrative</p>
                  <p className="mt-3 text-[14px] leading-7" style={{ color: "var(--text-2)" }}>
                    {outcomes?.narrative?.trim() || "Larry narrative will deepen here as we consolidate project memory and action provenance in later phases."}
                  </p>
                </div>
              </div>
            </div>

            {/* Project Context Timeline */}
            <div
              style={{
                borderRadius: "var(--radius-card)",
                border: "1px solid var(--border)",
                background: "var(--surface)",
                padding: "20px",
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[18px] font-semibold" style={{ color: "var(--text-1)" }}>Project Context Timeline</p>
                  <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
                    Durable memory from chat, accepted actions, and worker-processed signals.
                  </p>
                </div>
                <label className="text-[12px] font-semibold" style={{ color: "var(--text-muted)" }}>
                  Source
                  <select
                    value={memorySourceFilter}
                    onChange={(event) => setMemorySourceFilter(event.target.value)}
                    className="ml-2 rounded-full border px-3 py-1.5 text-[12px] font-medium"
                    style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text-1)" }}
                  >
                    {MEMORY_FILTERS.map((filter) => (
                      <option key={filter.value} value={filter.value}>{filter.label}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="mt-5 space-y-3">
                {memoryError && (
                  <div className="rounded-xl border px-4 py-3 text-[13px]" style={{ borderColor: "#fecaca", background: "#fef2f2", color: "#b91c1c" }}>
                    {memoryError}
                  </div>
                )}
                {memoryLoading && memoryEntries.length === 0 ? (
                  <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>Loading project memory...</p>
                ) : memoryEntries.length === 0 ? (
                  <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>No memory entries yet for this source filter.</p>
                ) : (
                  memoryEntries.map((entry) => (
                    <div key={entry.id} className="rounded-xl border px-4 py-3" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-[13px] font-semibold" style={{ color: "var(--text-1)" }}>{getMemoryMeta(entry)}</p>
                        <span className="shrink-0 text-[12px]" style={{ color: "var(--text-muted)" }}>{formatRelativeTime(entry.createdAt)}</span>
                      </div>
                      <p className="mt-2 text-[13px] leading-6" style={{ color: "var(--text-2)" }}>{entry.content}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Active Work */}
            <div
              style={{
                borderRadius: "var(--radius-card)",
                border: "1px solid var(--border)",
                background: "var(--surface)",
                padding: "20px",
              }}
            >
              <p className="text-[18px] font-semibold" style={{ color: "var(--text-1)" }}>Active Work</p>
              <div className="mt-5 space-y-3">
                {recentTasks.length === 0 ? (
                  <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>No tasks yet for this project.</p>
                ) : (
                  recentTasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-start justify-between gap-4 rounded-xl border px-4 py-3"
                      style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-semibold" style={{ color: "var(--text-1)" }}>{task.title}</p>
                        <p className="mt-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
                          {formatStatus(task.status)} · Due {formatDate(task.dueDate)}
                        </p>
                      </div>
                      <span
                        className="shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold"
                        style={{ borderColor: "var(--border)", color: "var(--text-2)", background: "var(--surface)" }}
                      >
                        {formatStatus(task.priority)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Recent Meetings */}
            <div
              style={{
                borderRadius: "var(--radius-card)",
                border: "1px solid var(--border)",
                background: "var(--surface)",
                padding: "20px",
              }}
            >
              <p className="text-[18px] font-semibold" style={{ color: "var(--text-1)" }}>Recent Meetings</p>
              <div className="mt-5 space-y-3">
                {meetings.length === 0 ? (
                  <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>No meetings linked to this project yet.</p>
                ) : (
                  meetings.slice(0, 4).map((meeting) => (
                    <div key={meeting.id} className="rounded-xl border px-4 py-3" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                      <div className="flex items-center justify-between gap-4">
                        <p className="truncate text-[14px] font-semibold" style={{ color: "var(--text-1)" }}>
                          {meeting.title?.trim() || "Untitled meeting"}
                        </p>
                        <span className="shrink-0 text-[12px]" style={{ color: "var(--text-muted)" }}>
                          {formatDate(meeting.meetingDate ?? meeting.createdAt)}
                        </span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-[13px] leading-6" style={{ color: "var(--text-2)" }}>
                        {meeting.summary?.trim() || `${meeting.actionCount} extracted action${meeting.actionCount === 1 ? "" : "s"}.`}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Tab: Actions — re-uses existing action centre content ─ */}
        {activeTab === "actions" && (<>
          <section
            style={{
              borderRadius: "var(--radius-card)",
              border: "1px solid var(--border)",
              background: "var(--surface)",
              padding: "20px",
            }}
          >
            <p className="text-[18px] font-semibold" style={{ color: "var(--text-1)" }}>
              Project Action Centre
            </p>
            <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
              Review and manage Larry actions for this project.
            </p>
            <div className="mt-4">
              {suggested.length === 0 ? (
                <p className="text-[13px] py-4" style={{ color: "var(--text-muted)" }}>
                  No pending actions. New suggestions will appear as Larry processes signals.
                </p>
              ) : (
                <div className="space-y-3">
                  {suggested.map((event) => (
                    <div
                      key={event.id}
                      className="rounded-xl border px-4 py-3"
                      style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
                    >
                      <p className="text-[14px] font-semibold" style={{ color: "var(--text-1)" }}>
                        {event.displayText}
                      </p>
                      <p className="mt-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
                        {getEventMeta(event)}
                      </p>
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void dismiss(event.id)}
                          disabled={dismissing === event.id}
                          className="rounded-lg border px-3 py-1.5 text-[12px] font-semibold"
                          style={{ borderColor: "var(--border)", color: "var(--text-2)" }}
                        >
                          {dismissing === event.id ? "Dismissing..." : "Dismiss"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void accept(event.id)}
                          disabled={accepting === event.id}
                          className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white"
                          style={{ background: "var(--cta)" }}
                        >
                          {accepting === event.id ? "Accepting..." : "Accept"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </>)}

        {/* ── Tab: Team — re-uses existing collaborators panel ──── */}
        {activeTab === "team" && (
          <CollaboratorsPanel projectId={projectId} />
        )}
      </div>
      {archiveDialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: "rgba(15, 23, 42, 0.45)" }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="archive-project-title"
            aria-describedby="archive-project-description"
            className="w-full max-w-[480px]"
            style={{
              borderRadius: "var(--radius-card)",
              border: "1px solid var(--border)",
              background: "var(--surface)",
              padding: "24px",
              boxShadow: "var(--shadow-1)",
            }}
          >
            <p id="archive-project-title" className="text-[20px] font-semibold" style={{ color: "var(--text-1)" }}>
              Archive this project?
            </p>
            <p id="archive-project-description" className="mt-3 text-[14px] leading-7" style={{ color: "var(--text-2)" }}>
              Active workspace lists will hide this project, but direct links, meetings, tasks, chats, and notes will still be readable here.
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => setArchiveDialogOpen(false)}
                disabled={statusBusy !== null}
                className="inline-flex h-10 items-center rounded-full border px-4 text-[13px] font-semibold"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--text-2)",
                  background: "var(--surface)",
                  opacity: statusBusy !== null ? 0.7 : 1,
                }}
              >
                Cancel
              </button>
              <button
                ref={archiveConfirmButtonRef}
                type="button"
                onClick={() => void updateProjectArchiveState("archived")}
                disabled={statusBusy !== null}
                className="inline-flex h-10 items-center rounded-full px-4 text-[13px] font-semibold text-white"
                style={{
                  background: "#b91c1c",
                  opacity: statusBusy !== null ? 0.7 : 1,
                }}
              >
                {statusBusy === "archive" ? "Archiving..." : "Archive project"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
