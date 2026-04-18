"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { getTimezone } from "@/lib/timezone-context";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useCalendarEvents, type CalendarEvent } from "@/hooks/useCalendarEvents";
import { toLocalDateKey } from "@/lib/calendar-date";
import { PageState } from "@/components/PageState";

export const dynamic = "force-dynamic";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function CalendarGridSkeleton() {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-card)",
        background: "var(--surface)",
        overflow: "hidden",
      }}
    >
      {/* month nav shimmer */}
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="pm-shimmer" style={{ width: 28, height: 28, borderRadius: 6 }} />
        <div className="pm-shimmer" style={{ width: 140, height: 20, borderRadius: 4 }} />
        <div className="pm-shimmer" style={{ width: 28, height: 28, borderRadius: 6 }} />
      </div>
      {/* weekday headers */}
      <div className="grid grid-cols-7 gap-px px-2 py-2" style={{ borderBottom: "1px solid var(--border)" }}>
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex justify-center">
            <div className="pm-shimmer" style={{ width: 28, height: 14, borderRadius: 4 }} />
          </div>
        ))}
      </div>
      {/* day cells — 5 rows × 7 cols */}
      <div className="grid grid-cols-7 gap-px">
        {Array.from({ length: 35 }).map((_, i) => (
          <div
            key={i}
            style={{
              minHeight: 80,
              padding: "6px 8px",
              borderRight: "1px solid var(--border)",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <div className="pm-shimmer" style={{ width: 24, height: 24, borderRadius: "50%", marginBottom: 6 }} />
            {i % 5 === 0 && <div className="pm-shimmer" style={{ height: 12, borderRadius: 999, marginBottom: 3 }} />}
            {i % 7 === 2 && <div className="pm-shimmer" style={{ height: 12, width: "80%", borderRadius: 999 }} />}
          </div>
        ))}
      </div>
    </div>
  );
}

function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = [];
  const date = new Date(year, month, 1);
  while (date.getMonth() === month) {
    days.push(new Date(date));
    date.setDate(date.getDate() + 1);
  }
  return days;
}

function getMonthGrid(year: number, month: number): (Date | null)[][] {
  const days = getDaysInMonth(year, month);
  const firstDay = days[0].getDay();
  // Shift so Monday = 0
  const startOffset = firstDay === 0 ? 6 : firstDay - 1;

  const grid: (Date | null)[][] = [];
  let week: (Date | null)[] = Array(startOffset).fill(null);

  for (const day of days) {
    week.push(day);
    if (week.length === 7) {
      grid.push(week);
      week = [];
    }
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

export default function CalendarPage() {
  const today = useMemo(() => new Date(), []);
  const router = useRouter();
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const { events, loading: eventsLoading, error: eventsError, refresh } = useCalendarEvents();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [draggingEvent, setDraggingEvent] = useState<CalendarEvent | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);

  // Task creation state
  const [creating, setCreating] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskProject, setNewTaskProject] = useState("");
  const [taskSaving, setTaskSaving] = useState(false);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/workspace/projects", { cache: "no-store" })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.projects) setProjects(data.projects);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (creating) titleInputRef.current?.focus();
  }, [creating]);

  // Reset creation form when day changes
  useEffect(() => {
    setCreating(false);
    setNewTaskTitle("");
    setNewTaskProject("");
  }, [selectedDate]);

  function eventsForDate(date: Date): CalendarEvent[] {
    const key = toLocalDateKey(date);
    return events.filter((e) => e.date === key);
  }

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const grid = useMemo(() => getMonthGrid(year, month), [year, month]);

  const monthLabel = viewDate.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: getTimezone() });

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));
  const goToday = () => setViewDate(new Date(today.getFullYear(), today.getMonth(), 1));

  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTaskTitle.trim() || !newTaskProject || !selectedDate || taskSaving) return;
    setTaskSaving(true);
    try {
      await fetch("/api/workspace/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: newTaskProject, title: newTaskTitle.trim(), dueDate: selectedDate }),
      });
      await refresh();
      setCreating(false);
      setNewTaskTitle("");
      setNewTaskProject("");
    } catch {
      // ignore
    } finally {
      setTaskSaving(false);
    }
  }

  async function handleReschedule(event: CalendarEvent, newDate: string) {
    if (!event.taskId || event.date === newDate) return;
    try {
      await fetch(`/api/workspace/tasks/${event.taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dueDate: newDate }),
      });
      await refresh();
    } catch {
      // ignore
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto" style={{ background: "var(--page-bg)" }}>
      <div className="mx-auto max-w-[1000px] px-6 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[28px] font-semibold tracking-[-0.02em]" style={{ color: "var(--text-1)" }}>
              Calendar
            </h1>
            <p className="mt-1 text-[13px]" style={{ color: "var(--text-muted)" }}>
              Deadlines, meetings, and events across all projects.
            </p>
          </div>
        </div>

        {/* Error state */}
        {eventsError && (
          <PageState loading={false} error={eventsError} onRetry={refresh} empty={false}>{null}</PageState>
        )}

        {/* Calendar skeleton */}
        {eventsLoading && events.length === 0 && <CalendarGridSkeleton />}

        {/* Calendar card */}
        {(!eventsLoading || events.length > 0) && !eventsError && (
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
            className="flex items-center justify-between px-5 py-4"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={prevMonth}
                className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors"
                style={{ color: "var(--text-2)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "")}
              >
                <ChevronLeft size={18} />
              </button>
              <h2 className="text-[16px] font-semibold min-w-[180px] text-center" style={{ color: "var(--text-1)" }}>
                {monthLabel}
              </h2>
              <button
                type="button"
                onClick={nextMonth}
                className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors"
                style={{ color: "var(--text-2)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "")}
              >
                <ChevronRight size={18} />
              </button>
            </div>
            <button
              type="button"
              onClick={goToday}
              className="rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors"
              style={{
                borderColor: "var(--border)",
                color: "var(--text-2)",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "")}
            >
              Today
            </button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7" style={{ borderBottom: "1px solid var(--border)" }}>
            {WEEKDAYS.map((day) => (
              <div
                key={day}
                className="py-2 text-center text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--text-disabled)" }}
              >
                {day}
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
                  const dayKey = day ? toLocalDateKey(day) : null;
                  const isDragOver = isCurrentMonth && dragOverDate === dayKey && draggingEvent !== null;
                  return (
                    <div
                      key={di}
                      className="min-h-[80px] p-2 transition-colors cursor-pointer"
                      style={{
                        borderRight: di < 6 ? "1px solid var(--border)" : undefined,
                        background: isDragOver
                          ? "var(--brand-subtle, color-mix(in srgb, var(--brand) 12%, transparent))"
                          : isToday || (day ? toLocalDateKey(day) === selectedDate : false)
                          ? "var(--surface-2)"
                          : undefined,
                        outline: isDragOver ? "2px solid var(--brand)" : undefined,
                        outlineOffset: isDragOver ? "-2px" : undefined,
                      }}
                      onClick={isCurrentMonth ? () => setSelectedDate(toLocalDateKey(day!)) : undefined}
                      onMouseEnter={(e) => {
                        const isSel = day ? toLocalDateKey(day) === selectedDate : false;
                        if (!isToday && !isSel && !isDragOver) e.currentTarget.style.background = "var(--surface-2)";
                      }}
                      onMouseLeave={(e) => {
                        const isSel = day ? toLocalDateKey(day) === selectedDate : false;
                        if (!isToday && !isSel && !isDragOver) e.currentTarget.style.background = "";
                      }}
                      onDragOver={isCurrentMonth ? (e) => { e.preventDefault(); setDragOverDate(dayKey); } : undefined}
                      onDragLeave={isCurrentMonth ? () => setDragOverDate(null) : undefined}
                      onDrop={isCurrentMonth ? (e) => {
                        e.preventDefault();
                        setDragOverDate(null);
                        if (draggingEvent && dayKey) void handleReschedule(draggingEvent, dayKey);
                        setDraggingEvent(null);
                      } : undefined}
                    >
                      {isCurrentMonth && (
                        <>
                          <span
                            className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-medium"
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
                              <div className="mt-1 flex flex-col gap-1">
                                {dayEvents.slice(0, 3).map((evt) => (
                                  <div
                                    key={evt.id}
                                    className="flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium leading-tight truncate"
                                    style={{
                                      background: evt.color,
                                      color: "#fff",
                                      cursor: evt.kind === "deadline" ? "grab" : "default",
                                      opacity: draggingEvent?.id === evt.id ? 0.4 : 1,
                                      userSelect: "none",
                                    }}
                                    title={evt.title}
                                    draggable={evt.kind === "deadline"}
                                    onDragStart={evt.kind === "deadline" ? (e) => { e.stopPropagation(); setDraggingEvent(evt); } : undefined}
                                    onDragEnd={() => { setDraggingEvent(null); setDragOverDate(null); }}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <span className="truncate">{evt.title}</span>
                                  </div>
                                ))}
                                {dayEvents.length > 3 && (
                                  <span className="text-[9px] px-1" style={{ color: "var(--text-disabled)" }}>
                                    +{dayEvents.length - 3} more
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
        )}

        {/* Day detail panel */}
        {selectedDate && (() => {
          const dayEvents = events.filter((e) => e.date === selectedDate);
          const dateLabel = new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: getTimezone() });
          return (
            <div
              style={{
                borderRadius: "var(--radius-card)",
                border: "1px solid var(--border)",
                background: "var(--surface)",
                padding: "20px",
              }}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-[16px] font-semibold" style={{ color: "var(--text-1)" }}>
                  {dateLabel}
                </h3>
                <div className="flex items-center gap-3">
                  {!creating && (
                    <button
                      type="button"
                      onClick={() => setCreating(true)}
                      className="inline-flex items-center gap-1 text-[12px] font-medium"
                      style={{ color: "var(--cta)" }}
                    >
                      <Plus size={13} />
                      New task
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedDate(null)}
                    className="text-[12px]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Close
                  </button>
                </div>
              </div>

              {/* Inline task creation form */}
              {creating && (
                <form onSubmit={handleCreateTask} className="mt-3 flex flex-col gap-2">
                  <input
                    ref={titleInputRef}
                    type="text"
                    placeholder="Task title"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2 text-[13px] outline-none"
                    style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text-1)" }}
                    onKeyDown={(e) => { if (e.key === "Escape") setCreating(false); }}
                  />
                  <select
                    value={newTaskProject}
                    onChange={(e) => setNewTaskProject(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2 text-[13px] outline-none"
                    style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: newTaskProject ? "var(--text-1)" : "var(--text-disabled)" }}
                  >
                    <option value="">Select project…</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      disabled={!newTaskTitle.trim() || !newTaskProject || taskSaving}
                      className="rounded-lg px-4 py-1.5 text-[12px] font-medium text-white disabled:opacity-40"
                      style={{ background: "var(--cta)" }}
                    >
                      {taskSaving ? "Creating…" : "Create task"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCreating(false)}
                      className="text-[12px]"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {dayEvents.length === 0 && !creating ? (
                <p className="mt-3 text-[13px]" style={{ color: "var(--text-disabled)" }}>
                  No events on this day.
                </p>
              ) : dayEvents.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {dayEvents.map((evt) => {
                    const href =
                      evt.kind === "meeting" && evt.meetingId
                        ? `/workspace/meetings?id=${evt.meetingId}`
                        : evt.kind === "deadline" && evt.projectId
                        ? `/workspace/projects/${evt.projectId}?tab=tasks${evt.taskId ? `&task=${evt.taskId}` : ""}`
                        : null;
                    const inner = (
                      <>
                        <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: evt.color }} />
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-medium truncate" style={{ color: "var(--text-1)" }}>
                            {evt.title}
                          </p>
                          <p className="text-[11px]" style={{ color: "var(--text-disabled)" }}>
                            {evt.kind === "deadline" ? "Task deadline" : evt.kind === "meeting" ? "Meeting" : "Event"}
                          </p>
                        </div>
                      </>
                    );
                    const sharedClass = "flex items-center gap-3 rounded-lg border px-3 py-2";
                    const sharedStyle = {
                      borderColor: "var(--border)",
                      cursor: evt.kind === "deadline" ? "grab" : undefined,
                      opacity: draggingEvent?.id === evt.id ? 0.4 : 1,
                    };
                    const dragProps = evt.kind === "deadline" ? {
                      draggable: true as const,
                      onDragStart: (e: React.DragEvent) => { e.stopPropagation(); setDraggingEvent(evt); },
                      onDragEnd: () => { setDraggingEvent(null); setDragOverDate(null); },
                    } : {};
                    return href ? (
                      <Link key={evt.id} href={href} className={sharedClass} style={sharedStyle} {...dragProps}>
                        {inner}
                      </Link>
                    ) : (
                      <div key={evt.id} className={sharedClass} style={sharedStyle} {...dragProps}>
                        {inner}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })()}

        {/* Empty state hint */}
        {!eventsLoading && events.length === 0 && !eventsError && (
          <PageState
            loading={false}
            error={null}
            empty={true}
            emptyTitle="Connect your calendars"
            emptyBody="Link Google Calendar or Outlook to see meetings, deadlines, and project events in one place. Larry will automatically attach meeting notes to the right projects."
            emptyCta="Connect a calendar"
            onEmptyCta={() => router.push("/workspace/settings/connectors")}
          >
            {null}
          </PageState>
        )}
      </div>
    </div>
  );
}
