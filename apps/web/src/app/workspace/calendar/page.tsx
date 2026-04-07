"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useCalendarEvents, type CalendarEvent } from "@/hooks/useCalendarEvents";

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
  const { events, loading: eventsLoading } = useCalendarEvents();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  function eventsForDate(date: Date): CalendarEvent[] {
    const key = date.toISOString().slice(0, 10);
    return events.filter((e) => e.date === key);
  }

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const grid = useMemo(() => getMonthGrid(year, month), [year, month]);

  const monthLabel = viewDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));
  const goToday = () => setViewDate(new Date(today.getFullYear(), today.getMonth(), 1));

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
          <button
            type="button"
            disabled
            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-4 text-[13px] font-medium text-white opacity-60 cursor-not-allowed"
            style={{ background: "var(--cta)" }}
          >
            <Plus size={14} />
            Add event
          </button>
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
                  return (
                    <div
                      key={di}
                      className="min-h-[80px] p-2 transition-colors cursor-pointer"
                      style={{
                        borderRight: di < 6 ? "1px solid var(--border)" : undefined,
                        background: isToday || (day ? day.toISOString().slice(0, 10) === selectedDate : false) ? "var(--surface-2)" : undefined,
                      }}
                      onClick={isCurrentMonth ? () => setSelectedDate(day!.toISOString().slice(0, 10)) : undefined}
                      onMouseEnter={(e) => {
                        const isSel = day ? day.toISOString().slice(0, 10) === selectedDate : false;
                        if (!isToday && !isSel) e.currentTarget.style.background = "var(--surface-2)";
                      }}
                      onMouseLeave={(e) => {
                        const isSel = day ? day.toISOString().slice(0, 10) === selectedDate : false;
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
                                {dayEvents.slice(0, 3).map((evt) => (
                                  <div
                                    key={evt.id}
                                    className="h-2.5 w-2.5 rounded-full"
                                    style={{ background: evt.color }}
                                    title={evt.title}
                                  />
                                ))}
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
                  {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                </h3>
                <button
                  type="button"
                  onClick={() => setSelectedDate(null)}
                  className="text-[12px]"
                  style={{ color: "var(--text-muted)" }}
                >
                  Close
                </button>
              </div>
              {dayEvents.length === 0 ? (
                <p className="mt-3 text-[13px]" style={{ color: "var(--text-disabled)" }}>
                  No events on this day.
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  {dayEvents.map((evt) => {
                    const href =
                      evt.kind === "meeting" && evt.meetingId
                        ? `/workspace/meetings?id=${evt.meetingId}`
                        : evt.kind === "deadline" && evt.projectId
                        ? `/workspace/projects/${evt.projectId}`
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
              )}
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
