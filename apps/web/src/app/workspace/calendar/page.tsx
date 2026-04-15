"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useCalendarEvents, type CalendarEvent } from "@/hooks/useCalendarEvents";
import { toLocalDateKey } from "@/lib/calendar-date";

export const dynamic = "force-dynamic";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const { events, loading: eventsLoading, refresh, moveEventLocally } = useCalendarEvents();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState(false);

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

  const monthLabel = viewDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));
  const goToday = () => setViewDate(new Date(today.getFullYear(), today.getMonth(), 1));

  const TASK_DRAG_MIME = "application/x-larry-task-id";

  function handleEventDragStart(evt: CalendarEvent) {
    return (e: React.DragEvent<HTMLDivElement>) => {
      if (evt.kind !== "deadline" || !evt.taskId) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", evt.id);
      e.dataTransfer.setData(TASK_DRAG_MIME, evt.taskId);
    };
  }

  function handleDayDragOver(dayKey: string) {
    return (e: React.DragEvent<HTMLDivElement>) => {
      if (!e.dataTransfer.types.includes(TASK_DRAG_MIME) && !e.dataTransfer.types.includes("text/plain")) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (dragOverKey !== dayKey) setDragOverKey(dayKey);
    };
  }

  function handleDayDragLeave() {
    setDragOverKey(null);
  }

  function handleDayDrop(day: Date) {
    return async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOverKey(null);
      const eventId = e.dataTransfer.getData("text/plain");
      const taskId = e.dataTransfer.getData(TASK_DRAG_MIME);
      if (!eventId || !taskId) return;
      const newKey = toLocalDateKey(day);
      const existing = events.find((evt) => evt.id === eventId);
      if (!existing || existing.date === newKey) return;
      const prevDate = existing.date;
      moveEventLocally(eventId, newKey);
      setRescheduling(true);
      try {
        const res = await fetch(`/api/workspace/tasks/${encodeURIComponent(taskId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dueDate: newKey }),
        });
        if (!res.ok) {
          moveEventLocally(eventId, prevDate);
        }
      } catch {
        moveEventLocally(eventId, prevDate);
      } finally {
        setRescheduling(false);
        void refresh();
      }
    };
  }

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
                  const isDragOver = dayKey !== null && dayKey === dragOverKey;
                  return (
                    <div
                      key={di}
                      className="min-h-[80px] p-2 transition-colors cursor-pointer"
                      style={{
                        borderRight: di < 6 ? "1px solid var(--border)" : undefined,
                        background: isDragOver
                          ? "var(--surface-3, var(--surface-2))"
                          : isToday || (day ? toLocalDateKey(day) === selectedDate : false)
                            ? "var(--surface-2)"
                            : undefined,
                        outline: isDragOver ? "2px dashed #6c44f6" : undefined,
                        outlineOffset: isDragOver ? "-2px" : undefined,
                      }}
                      onClick={isCurrentMonth ? () => setSelectedDate(toLocalDateKey(day!)) : undefined}
                      onDragOver={isCurrentMonth && dayKey ? handleDayDragOver(dayKey) : undefined}
                      onDragLeave={isCurrentMonth ? handleDayDragLeave : undefined}
                      onDrop={isCurrentMonth && day ? handleDayDrop(day) : undefined}
                      data-calendar-day={dayKey ?? undefined}
                      onMouseEnter={(e) => {
                        const isSel = day ? toLocalDateKey(day) === selectedDate : false;
                        if (!isToday && !isSel) e.currentTarget.style.background = "var(--surface-2)";
                      }}
                      onMouseLeave={(e) => {
                        const isSel = day ? toLocalDateKey(day) === selectedDate : false;
                        if (!isToday && !isSel) e.currentTarget.style.background = "";
                      }}
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
                              <div className="mt-1 flex flex-wrap gap-1">
                                {dayEvents.slice(0, 3).map((evt) => {
                                  const canDrag = evt.kind === "deadline" && !!evt.taskId;
                                  return (
                                    <div
                                      key={evt.id}
                                      className="h-2.5 w-2.5 rounded-full"
                                      style={{
                                        background: evt.color,
                                        cursor: canDrag ? "grab" : undefined,
                                        opacity: rescheduling ? 0.6 : 1,
                                      }}
                                      title={canDrag ? `${evt.title} — drag to reschedule` : evt.title}
                                      draggable={canDrag}
                                      onDragStart={canDrag ? handleEventDragStart(evt) : undefined}
                                      onClick={(e) => { if (canDrag) e.stopPropagation(); }}
                                      data-calendar-event-id={evt.id}
                                      data-calendar-event-kind={evt.kind}
                                    />
                                  );
                                })}
                                {dayEvents.length > 3 && (
                                  <span className="text-[9px]" style={{ color: "var(--text-disabled)" }}>
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
          const dateLabel = new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
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
                    const sharedStyle = { borderColor: "var(--border)" };
                    return href ? (
                      <Link key={evt.id} href={href} className={sharedClass} style={sharedStyle}>
                        {inner}
                      </Link>
                    ) : (
                      <div key={evt.id} className={sharedClass} style={sharedStyle}>
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
        {!eventsLoading && events.length === 0 && (
          <div
            className="text-center px-6 py-8"
            style={{
              borderRadius: "var(--radius-card)",
              border: "1px dashed var(--border-2)",
              background: "var(--surface)",
            }}
          >
            <p className="text-[14px] font-semibold" style={{ color: "var(--text-1)" }}>
              Connect your calendars
            </p>
            <p className="mt-2 text-[13px] leading-6 mx-auto max-w-md" style={{ color: "var(--text-2)" }}>
              Link Google Calendar or Outlook to see meetings, deadlines, and project events in one place.
              Larry will automatically attach meeting notes to the right projects.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
