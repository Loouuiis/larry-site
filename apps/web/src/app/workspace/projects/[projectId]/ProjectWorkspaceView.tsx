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
  FolderKanban,
  MessageSquare,
  Layers,
  Sparkles,
  LayoutList,
  ListChecks,
  FileText,
  Users,
  Settings,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import { useWorkspaceChrome } from "@/app/workspace/WorkspaceChromeContext";
import { triggerBoundedWorkspaceRefresh } from "@/app/workspace/refresh";
import type {
  WorkspaceConversationPreview,
  WorkspaceLarryEvent,
  WorkspaceProjectMemoryEntry,
  WorkspaceProjectMember,
  WorkspaceTimelineTask,
} from "@/app/dashboard/types";
import { useProjectData } from "@/hooks/useProjectData";
import { useProjectActionCentre } from "@/hooks/useProjectActionCentre";
import { useProjectMemory } from "@/hooks/useProjectMemory";
import { useCalendarEvents, type CalendarEvent } from "@/hooks/useCalendarEvents";
import { CollaboratorsPanel } from "./CollaboratorsPanel";
import { ProjectNotesPanel } from "./ProjectNotesPanel";
import { TaskCenter } from "./TaskCenter";
import { ProjectDashboard } from "./dashboard/ProjectDashboard";
import { ProjectDashboardExtra } from "./dashboard/ProjectDashboardExtra";
import { ProjectTimeline } from "@/components/workspace/timeline/ProjectTimeline";
import { getActionTypeTag, getAllActionTypes } from "@/lib/action-types";
import { useToast } from "@/components/toast/ToastContext";
import { ActionDetailPreview } from "@/components/workspace/ActionDetailPreview";
import { ActionBellDropdown } from "./overview/ActionBellDropdown";
import { ProjectOverviewTab } from "./overview/ProjectOverviewTab";
import { ProjectDescriptionCard } from "./overview/ProjectDescriptionCard";

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

// ── Project Files Tab ─────────────────────────────────────────────────────────

type LarryDocType = "email_draft" | "letter" | "memo" | "report" | "note" | "other";
type LarryDocState = "draft" | "final" | "sent";

interface ProjectLarryDocument {
  id: string;
  projectId: string | null;
  larryEventId: string | null;
  title: string;
  docType: LarryDocType;
  content: string;
  emailRecipient: string | null;
  emailSubject: string | null;
  emailSentAt: string | null;
  state: LarryDocState;
  createdAt: string;
  updatedAt: string;
}

const DOC_TYPE_LABELS: Record<LarryDocType, string> = {
  email_draft: "Email draft",
  letter: "Letter",
  memo: "Memo",
  report: "Report",
  note: "Note",
  other: "Other",
};

const DOC_STATE_COLORS: Record<LarryDocState, { color: string; bg: string }> = {
  draft: { color: "var(--text-2)", bg: "var(--surface-2)" },
  final: { color: "#15803d", bg: "#ecfdf3" },
  sent: { color: "#1d4ed8", bg: "#eff6ff" },
};

function formatFilesDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function ProjectFilesTab({ projectId }: { projectId: string }) {
  const [docs, setDocs] = useState<ProjectLarryDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/workspace/larry/documents?projectId=${encodeURIComponent(projectId)}&limit=50`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((data: { items?: ProjectLarryDocument[] }) => {
        setDocs(data.items ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) {
    return (
      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-card)",
          background: "var(--surface)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0,1fr) 110px 80px 120px",
            padding: "10px 16px",
            borderBottom: "1px solid var(--border)",
            background: "var(--surface-2)",
            fontSize: "11px",
            fontWeight: 600,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          <span>Document</span>
          <span>Type</span>
          <span>Status</span>
          <span>Date</span>
        </div>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0,1fr) 110px 80px 120px",
              padding: "12px 16px",
              borderBottom: "1px solid var(--border)",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div className="pm-shimmer" style={{ width: "28px", height: "28px", borderRadius: "6px", flexShrink: 0 }} />
              <div className="pm-shimmer" style={{ height: "13px", width: "180px", borderRadius: "4px" }} />
            </div>
            <div className="pm-shimmer" style={{ height: "18px", width: "70px", borderRadius: "var(--radius-badge)" }} />
            <div className="pm-shimmer" style={{ height: "18px", width: "50px", borderRadius: "var(--radius-badge)" }} />
            <div className="pm-shimmer" style={{ height: "13px", width: "90px", borderRadius: "4px" }} />
          </div>
        ))}
      </div>
    );
  }

  if (docs.length === 0) {
    return (
      <div
        style={{
          padding: "48px",
          textAlign: "center",
          borderRadius: "var(--radius-card)",
          border: "1px solid var(--border)",
          background: "var(--surface)",
        }}
      >
        <div
          style={{
            margin: "0 auto 12px",
            display: "flex",
            height: "48px",
            width: "48px",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "var(--radius-card)",
            background: "var(--surface-2)",
          }}
        >
          <FileText size={20} style={{ color: "var(--text-muted)" }} />
        </div>
        <p style={{ fontSize: "15px", fontWeight: 500, color: "var(--text-1)", marginBottom: "6px" }}>
          No documents yet
        </p>
        <p style={{ fontSize: "13px", color: "var(--text-2)" }}>
          Documents generated by Larry for this project will appear here.
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-card)",
        background: "var(--surface)",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) 110px 80px 120px",
          padding: "10px 16px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface-2)",
          fontSize: "11px",
          fontWeight: 600,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        <span>Document</span>
        <span>Type</span>
        <span>Status</span>
        <span>Date</span>
      </div>

      {docs.map((doc, idx) => {
        const isExpanded = expandedId === doc.id;
        const stateStyle = DOC_STATE_COLORS[doc.state];
        return (
          <div key={doc.id} style={{ borderBottom: idx < docs.length - 1 ? "1px solid var(--border)" : "none" }}>
            {/* Row */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0,1fr) 110px 80px 120px",
                padding: "12px 16px",
                alignItems: "center",
                cursor: "pointer",
                background: isExpanded ? "var(--surface-2)" : undefined,
                transition: "background 0.1s",
              }}
              onClick={() => setExpandedId(isExpanded ? null : doc.id)}
            >
              <span style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                <div
                  style={{
                    flexShrink: 0,
                    display: "flex",
                    height: "28px",
                    width: "28px",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "6px",
                    background: isExpanded ? "var(--surface)" : "var(--surface-2)",
                  }}
                >
                  <FileText size={13} style={{ color: "var(--text-muted)" }} />
                </div>
                <span
                  style={{
                    fontSize: "13px",
                    fontWeight: 500,
                    color: "var(--text-1)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {doc.title}
                </span>
              </span>

              <span>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "var(--text-2)",
                    background: "var(--surface-2)",
                    borderRadius: "var(--radius-badge)",
                    padding: "2px 7px",
                    whiteSpace: "nowrap",
                  }}
                >
                  {DOC_TYPE_LABELS[doc.docType]}
                </span>
              </span>

              <span>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    color: stateStyle.color,
                    background: stateStyle.bg,
                    borderRadius: "var(--radius-badge)",
                    padding: "2px 7px",
                    textTransform: "capitalize",
                    whiteSpace: "nowrap",
                  }}
                >
                  {doc.state}
                </span>
              </span>

              <span style={{ fontSize: "13px", color: "var(--text-2)" }}>
                {formatFilesDate(doc.createdAt)}
              </span>
            </div>

            {/* Expanded content preview */}
            {isExpanded && (
              <div
                style={{
                  padding: "0 16px 16px 52px",
                  fontSize: "13px",
                  color: "var(--text-2)",
                  lineHeight: "1.6",
                }}
              >
                {doc.emailRecipient && (
                  <p style={{ marginBottom: "4px", color: "var(--text-muted)", fontSize: "12px" }}>
                    To: {doc.emailRecipient}
                    {doc.emailSubject ? ` · Subject: ${doc.emailSubject}` : ""}
                  </p>
                )}
                <p
                  style={{
                    whiteSpace: "pre-wrap",
                    maxHeight: "200px",
                    overflowY: "auto",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-btn)",
                    padding: "10px 12px",
                    fontSize: "12px",
                    fontFamily: "inherit",
                    margin: 0,
                  }}
                >
                  {doc.content}
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Project Action Centre Tab ─────────────────────────────────────── */

const ACTION_CENTRE_SELECT_STYLE: React.CSSProperties = {
  height: "36px",
  padding: "0 10px",
  borderRadius: "var(--radius-btn, 8px)",
  border: "1px solid var(--border)",
  background: "var(--surface-2)",
  color: "var(--text-1)",
  fontSize: "13px",
  cursor: "pointer",
  outline: "none",
};

function ActionTypeBadge({ actionType }: { actionType: string }) {
  const tag = getActionTypeTag(actionType);
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
      style={{ background: `${tag.color}18`, color: tag.color, border: `1px solid ${tag.color}30` }}
    >
      {tag.label}
    </span>
  );
}

type ActionSortOrder = "newest" | "oldest" | "type";

function matchesActionSearch(event: WorkspaceLarryEvent, query: string): boolean {
  const q = query.toLowerCase();
  return (
    (event.displayText ?? "").toLowerCase().includes(q) ||
    (event.reasoning ?? "").toLowerCase().includes(q) ||
    (event.actionType ?? "").toLowerCase().includes(q)
  );
}

function filterAndSortEvents(
  events: WorkspaceLarryEvent[],
  search: string,
  filterActionType: string,
  sortOrder: ActionSortOrder,
): WorkspaceLarryEvent[] {
  let result = [...events];
  if (search.trim()) result = result.filter((e) => matchesActionSearch(e, search));
  if (filterActionType) result = result.filter((e) => e.actionType === filterActionType);
  result.sort((a, b) => {
    if (sortOrder === "oldest") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (sortOrder === "type") return (a.actionType ?? "").localeCompare(b.actionType ?? "");
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
  return result;
}

function ProjectActionCentreTab({
  suggested,
  activity,
  accepting,
  dismissing,
  modifying,
  actionError,
  accept,
  dismiss,
  modify,
  clearActionError,
  onOpenConversation,
}: {
  suggested: WorkspaceLarryEvent[];
  activity: WorkspaceLarryEvent[];
  accepting: string | null;
  dismissing: string | null;
  modifying: string | null;
  actionError: { eventId: string; message: string } | null;
  accept: (id: string) => Promise<void>;
  dismiss: (id: string) => Promise<void>;
  modify: (id: string) => Promise<string | null>;
  clearActionError: () => void;
  onOpenConversation: (conversationId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [filterActionType, setFilterActionType] = useState("");
  const [sortOrder, setSortOrder] = useState<ActionSortOrder>("newest");

  const filteredSuggested = useMemo(
    () => filterAndSortEvents(suggested, search, filterActionType, sortOrder),
    [suggested, search, filterActionType, sortOrder],
  );
  const filteredActivity = useMemo(
    () => filterAndSortEvents(activity, search, filterActionType, sortOrder),
    [activity, search, filterActionType, sortOrder],
  );

  const hasFilters = search.trim() !== "" || filterActionType !== "";

  return (
    <div className="space-y-4">
      {/* Header */}
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
      </section>

      {/* Toolbar */}
      <section
        style={{
          display: "flex",
          gap: "8px",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            height: "36px",
            padding: "0 10px",
            borderRadius: "var(--radius-btn, 8px)",
            border: "1px solid var(--border)",
            background: "var(--surface-2)",
            flex: "1 1 200px",
            maxWidth: "320px",
          }}
        >
          <Search size={13} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
          <input
            placeholder="Search actions…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1,
              background: "none",
              border: "none",
              outline: "none",
              fontSize: "13px",
              color: "var(--text-1)",
            }}
          />
        </div>
        <select
          value={filterActionType}
          onChange={(e) => setFilterActionType(e.target.value)}
          style={ACTION_CENTRE_SELECT_STYLE}
        >
          <option value="">All types</option>
          {getAllActionTypes().map((tag) => (
            <option key={tag.key} value={tag.key}>{tag.label}</option>
          ))}
        </select>
        <select
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value as ActionSortOrder)}
          style={ACTION_CENTRE_SELECT_STYLE}
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="type">Action type A–Z</option>
        </select>
        {hasFilters && (
          <button
            type="button"
            onClick={() => { setSearch(""); setFilterActionType(""); }}
            style={{ color: "var(--cta)", fontSize: "12px", fontWeight: 600, background: "none", border: "none", cursor: "pointer" }}
          >
            Clear filters
          </button>
        )}
      </section>

      {/* Side-by-side: Pending review + Actions completed */}
      <section className="grid gap-6 md:grid-cols-2">
        <div
          style={{
            borderRadius: "var(--radius-card)",
            border: "1px solid var(--border)",
            background: "var(--surface)",
            padding: "20px",
            maxHeight: "calc(100vh - 120px)",
            overflowY: "auto",
          }}
        >
          <p className="text-[18px] font-semibold" style={{ color: "var(--text-1)" }}>
            Pending review
          </p>
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
            Approval-required Larry actions for this project.
          </p>
          <div className="mt-5 space-y-3">
            {filteredSuggested.length === 0 ? (
              <div
                className="rounded-xl border border-dashed px-4 py-6 text-center"
                style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
              >
                <p className="text-[14px] font-semibold" style={{ color: "var(--text-1)" }}>
                  {hasFilters ? "No suggestions match your filters" : "Nothing waiting for review"}
                </p>
                <p className="mt-2 text-[13px] leading-6" style={{ color: "var(--text-2)" }}>
                  {hasFilters
                    ? "Try adjusting your search or filter criteria."
                    : "New Larry suggestions will appear here as signals flow into the ledger."}
                </p>
              </div>
            ) : (
              filteredSuggested.map((event) => (
                <div
                  key={event.id}
                  className="rounded-xl border px-4 py-4"
                  style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold"
                          style={{
                            background: getEventTone(event).background,
                            color: getEventTone(event).color,
                            borderColor: getEventTone(event).border,
                          }}
                        >
                          {getEventTone(event).label}
                        </span>
                        <ActionTypeBadge actionType={event.actionType} />
                      </div>
                      <p className="mt-3 text-[15px] font-semibold" style={{ color: "var(--text-1)" }}>
                        {event.displayText}
                      </p>
                      <p className="mt-2 text-[13px] leading-6" style={{ color: "var(--text-2)" }}>
                        {event.reasoning || "Larry proposed this action from current project context."}
                      </p>
                    </div>
                  </div>

                  <ActionDetailPreview event={event} />

                  <p className="mt-3 text-[12px]" style={{ color: "var(--text-muted)" }}>
                    {getEventMeta(event)} | {formatRelativeTime(event.createdAt)}
                  </p>

                  {(event.responseMessagePreview || event.requestMessagePreview) && (
                    <p
                      className="mt-3 rounded-[14px] border px-3 py-2 text-[12px] leading-5"
                      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
                    >
                      {(event.responseMessagePreview ?? event.requestMessagePreview)?.trim()}
                    </p>
                  )}

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {event.conversationId ? (
                        <button
                          type="button"
                          onClick={() => onOpenConversation(event.conversationId!)}
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
                    </div>

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
                        onClick={async () => {
                          const conversationId = await modify(event.id);
                          if (conversationId) {
                            window.dispatchEvent(new CustomEvent("larry:open"));
                            window.dispatchEvent(new CustomEvent("larry:load-conversation", { detail: conversationId }));
                          }
                        }}
                        disabled={modifying === event.id}
                        className="rounded-full border px-3 py-1.5 text-[12px] font-semibold"
                        style={{ borderColor: "var(--cta)", color: "var(--cta)" }}
                      >
                        {modifying === event.id ? "Opening..." : "Modify"}
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

                  {actionError?.eventId === event.id && (
                    <div
                      className="mt-2 flex items-start justify-between gap-2 rounded-lg px-3 py-2 text-[12px]"
                      style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b" }}
                    >
                      <span>{actionError.message}</span>
                      <button
                        type="button"
                        onClick={clearActionError}
                        className="shrink-0 font-semibold hover:underline"
                        style={{ color: "#991b1b" }}
                      >
                        Dismiss
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <div
          style={{
            borderRadius: "var(--radius-card)",
            border: "1px solid var(--border)",
            background: "var(--surface)",
            padding: "20px",
            maxHeight: "calc(100vh - 120px)",
            overflowY: "auto",
          }}
        >
          <div className="flex items-center gap-3">
            <CheckCircle2 size={18} style={{ color: "var(--cta)" }} />
            <div>
              <p className="text-[18px] font-semibold" style={{ color: "var(--text-1)" }}>
                Actions completed
              </p>
              <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
                Accepted and auto-executed changes for this project.
              </p>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {filteredActivity.length === 0 ? (
              <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>
                {hasFilters ? "No activity matches your filters." : "No completed actions yet."}
              </p>
            ) : (
              filteredActivity.map((event) => {
                const completedByLarry = event.executedByKind === "larry" && event.payload?._selfExecutable === true;
                return (
                <div
                  key={event.id}
                  className="rounded-xl border px-4 py-4"
                  style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
                >
                  <div className="flex items-start gap-3">
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0" style={{ color: "var(--cta)" }} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold"
                          style={{
                            background: getEventTone(event).background,
                            color: getEventTone(event).color,
                            borderColor: getEventTone(event).border,
                          }}
                        >
                          {getEventTone(event).label}
                        </span>
                        <ActionTypeBadge actionType={event.actionType} />
                        {completedByLarry && (
                          <span
                            className="inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold"
                            style={{ background: "#ecfdf3", color: "#15803d", borderColor: "#bbf7d0" }}
                          >
                            Completed by Larry
                          </span>
                        )}
                      </div>
                      <p className="mt-3 text-[14px] font-semibold" style={{ color: "var(--text-1)" }}>
                        {event.displayText}
                      </p>
                      <ActionDetailPreview event={event} />
                      <p className="mt-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
                        {getEventMeta(event)} | {formatRelativeTime(event.executedAt ?? event.createdAt)}
                      </p>
                      {event.responseMessagePreview && (
                        <p className="mt-2 line-clamp-2 text-[12px] leading-5" style={{ color: "var(--text-2)" }}>
                          {event.responseMessagePreview}
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        {event.conversationId ? (
                          <button
                            type="button"
                            onClick={() => onOpenConversation(event.conversationId!)}
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
                      </div>
                    </div>
                  </div>
                </div>
                );
              })
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

export function ProjectWorkspaceView({ projectId }: { projectId: string }) {
  const chrome = useWorkspaceChrome();
  const { pushToast } = useToast();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ProjectTab>("overview");
  const [memorySourceFilter, setMemorySourceFilter] = useState("all");
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [statusBusy, setStatusBusy] = useState<"archive" | "unarchive" | "delete" | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
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
    modifying,
    executing,
    actionError,
    accept,
    dismiss,
    modify,
    letLarryExecute,
    clearActionError,
    refresh: refreshActionCentre,
  } = useProjectActionCentre(projectId, refresh, (toast: { actionType: string; actionLabel: string; actionColor: string; displayText: string; projectName: string | null; projectId: string }) => pushToast(toast));
  const {
    entries: memoryEntries,
    loading: memoryLoading,
    error: memoryError,
    refresh: refreshMemory,
  } = useProjectMemory(projectId, activeMemorySource);

  const [overviewMembers, setOverviewMembers] = useState<WorkspaceProjectMember[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/workspace/projects/${encodeURIComponent(projectId)}/members`, { cache: "no-store" })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!cancelled && data?.members) setOverviewMembers(data.members);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [projectId]);

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

  async function deleteProject() {
    if (!project || deleteConfirmName !== project.name) return;
    setStatusBusy("delete");

    try {
      const response = await fetch(
        `/api/workspace/projects/${encodeURIComponent(projectId)}/delete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmProjectName: deleteConfirmName }),
        },
      );
      const payload = await readJson<{ error?: string }>(response);

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to delete project.");
      }

      chrome?.refreshShell();
      triggerBoundedWorkspaceRefresh();
      router.push("/workspace");
    } catch (deleteError) {
      setStatusNotice({
        tone: "error",
        message:
          deleteError instanceof Error
            ? deleteError.message
            : "Failed to delete project.",
      });
      setDeleteDialogOpen(false);
      setDeleteConfirmName("");
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
      <div className="mx-auto max-w-[1200px] space-y-3 px-6 pt-1 pb-4">
        <section
          style={{
            borderRadius: "var(--radius-card)",
            border: "1px solid var(--border)",
            background: "var(--surface)",
            padding: "14px 20px",
          }}
        >
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <h1 className="text-[20px] font-semibold tracking-[-0.04em]" style={{ color: "var(--text-1)" }}>
                {project.name}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className={`pm-pill ${projectStatusPillClass(project.status)}`} style={{ height: "18px", fontSize: "10px", minWidth: "76px", padding: "0 8px" }}>
                  {projectStatusLabel(project.status)}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
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
                href={`/workspace/larry?projectId=${projectId}`}
                className="inline-flex h-9 items-center justify-center"
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "10px",
                  background: "rgba(108,68,246,0.15)",
                  border: "none",
                }}
                title="Project chat history"
              >
                <MessageSquare size={16} style={{ color: "#6c44f6" }} />
              </Link>
              <ActionBellDropdown
                suggested={suggested}
                onNavigateToAction={() => setActiveTab("actions")}
              />
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
                onClick={() => setActiveTab(id)}
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

        {/* ── Tab: Dashboard ────────────────────────────── */}
        {activeTab === "dashboard" && (
          <ProjectDashboard
            projectId={projectId}
            tasks={tasks}
            timeline={timeline}
            members={overviewMembers}
          />
        )}

        {/* ── Tab: Timeline ──────────────────────────────── */}
        {activeTab === "timeline" && (
          <ProjectTimeline
            projectId={projectId}
            tasks={tasks as unknown as WorkspaceTimelineTask[]}
            timeline={timeline}
            refresh={refresh}
          />
        )}

        {/* ── Tab: Task center ──────────────────────────── */}
        {activeTab === "tasks" && (
          <TaskCenter projectId={projectId} tasks={tasks} refresh={refresh} />
        )}

        {/* ── Tab: Calendar ──────────────── */}
        {activeTab === "calendar" && (
          <ProjectCalendar projectId={projectId} />
        )}

        {/* ── Tab: Files ──────────────────────────────── */}
        {activeTab === "files" && (
          <ProjectFilesTab projectId={projectId} />
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
              <div className="mt-4 flex flex-wrap gap-3">
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
                <button
                  type="button"
                  onClick={() => { setDeleteConfirmName(""); setDeleteDialogOpen(true); }}
                  disabled={statusBusy !== null}
                  className="inline-flex h-9 items-center gap-2 rounded-full border px-4 text-[13px] font-semibold"
                  style={{
                    borderColor: "#fecdd3",
                    color: "#be123c",
                    background: "#fff1f2",
                    opacity: statusBusy !== null ? 0.7 : 1,
                  }}
                >
                  <Trash2 size={14} />
                  Delete permanently
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Tab: Overview ────────────────────────────── */}
        {activeTab === "overview" && (
          <ProjectOverviewTab
            project={project}
            tasks={tasks}
            timeline={timeline}
            outcomes={outcomes}
            suggested={suggested}
            activity={activity}
            members={overviewMembers}
            onNavigateToTab={(tab) => setActiveTab(tab as ProjectTab)}
          />
        )}

        {/* ── Tab: Extra ────────────────────────────────── */}
        {activeTab === "extra" && (
          <div className="space-y-6">
            {/* Project description (moved from Overview) */}
            <ProjectDescriptionCard description={project.description} />

            {/* Analytics widgets moved from Dashboard */}
            <ProjectDashboardExtra projectId={projectId} />

            {/* All tenant members info */}
            <div
              style={{
                width: "33%",
                marginLeft: "auto",
                borderRadius: "var(--radius-card)",
                border: "1px solid var(--border)",
                background: "var(--surface)",
                padding: "10px 14px",
              }}
            >
              <p className="text-[12px] font-semibold" style={{ color: "var(--text-1)" }}>Team membership</p>
              <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                All tenant members are already added to this project.
              </p>
            </div>

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
                    {(() => {
                      const pct = formatPercent(health?.completionRate ?? completionRate);
                      const risk = Math.round(health?.avgRiskScore ?? 0);
                      const riskLabel = risk >= 70 ? "high" : risk >= 35 ? "medium" : "low";
                      const total = tasks.length;
                      const completed = tasks.filter(t => t.status === "completed").length;
                      if (total === 0) return "No tasks have been added to this project yet.";
                      const parts: string[] = [];
                      parts.push(`The project is ${pct} complete — ${completed} of ${total} tasks done.`);
                      if (blockedTasks > 0) parts.push(`${blockedTasks} task${blockedTasks > 1 ? "s are" : " is"} currently at risk.`);
                      parts.push(`Overall risk is ${riskLabel}.`);
                      return parts.join(" ");
                    })()}
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

        {/* ── Tab: Actions — project action centre with filter/search ─ */}
        {activeTab === "actions" && (<ProjectActionCentreTab
          suggested={suggested}
          activity={activity}
          accepting={accepting}
          dismissing={dismissing}
          modifying={modifying}
          actionError={actionError}
          accept={accept}
          dismiss={dismiss}
          modify={modify}
          clearActionError={clearActionError}
          onOpenConversation={openConversation}
        />)}

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
      {deleteDialogOpen && project && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: "rgba(15, 23, 42, 0.45)" }}
          onKeyDown={(e) => { if (e.key === "Escape" && statusBusy !== "delete") { setDeleteDialogOpen(false); setDeleteConfirmName(""); } }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-project-title"
            aria-describedby="delete-project-description"
            className="w-full max-w-[480px]"
            style={{
              borderRadius: "var(--radius-card)",
              border: "1px solid var(--border)",
              background: "var(--surface)",
              padding: "24px",
              boxShadow: "var(--shadow-1)",
            }}
          >
            <p id="delete-project-title" className="text-[20px] font-semibold" style={{ color: "var(--text-1)" }}>
              Delete this project permanently?
            </p>
            <p id="delete-project-description" className="mt-3 text-[14px] leading-7" style={{ color: "var(--text-2)" }}>
              This will permanently delete <strong>{project.name}</strong> and all its tasks, meetings, notes, documents, and conversations. This cannot be undone.
            </p>
            <label className="mt-4 block text-[13px] font-medium" style={{ color: "var(--text-2)" }}>
              Type <strong>{project.name}</strong> to confirm
            </label>
            <input
              type="text"
              value={deleteConfirmName}
              onChange={(e) => setDeleteConfirmName(e.target.value)}
              disabled={statusBusy === "delete"}
              placeholder={project.name}
              autoFocus
              className="mt-2 w-full rounded-lg border px-3 py-2 text-[14px] outline-none"
              style={{
                borderColor: "var(--border)",
                background: "var(--surface)",
                color: "var(--text-1)",
              }}
            />
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => { setDeleteDialogOpen(false); setDeleteConfirmName(""); }}
                disabled={statusBusy === "delete"}
                className="inline-flex h-10 items-center rounded-full border px-4 text-[13px] font-semibold"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--text-2)",
                  background: "var(--surface)",
                  opacity: statusBusy === "delete" ? 0.7 : 1,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void deleteProject()}
                disabled={deleteConfirmName !== project.name || statusBusy === "delete"}
                className="inline-flex h-10 items-center rounded-full px-4 text-[13px] font-semibold text-white"
                style={{
                  background: deleteConfirmName === project.name ? "#b91c1c" : "#d4d4d8",
                  opacity: statusBusy === "delete" ? 0.7 : 1,
                  cursor: deleteConfirmName !== project.name ? "not-allowed" : "pointer",
                }}
              >
                {statusBusy === "delete" ? "Deleting..." : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
