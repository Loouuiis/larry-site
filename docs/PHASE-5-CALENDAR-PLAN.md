# Phase 5: Full Monthly Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-ready monthly calendar view (global + per-project) that pulls events from connected calendars (Google/Outlook), shows task deadlines, and links meeting notes to calendar entries.

**Architecture:** The calendar page already exists as a static monthly grid at `/workspace/calendar`. This plan extends it with real data from the existing connector APIs, adds per-project calendar as a tab, and wires up meeting notes post-meeting. The backend already has Google Calendar and Outlook Calendar connectors in `ConnectorsPage.tsx` and API routes at `/api/workspace/connectors/`. We build on those, not replace them.

**Tech Stack:** Next.js App Router, React (client components), existing workspace proxy API layer, Lucide icons, CSS custom properties (Larry design tokens)

---

## Context: What Already Exists

Before starting, read these files to understand the current state:

- `apps/web/src/app/workspace/calendar/page.tsx` — Static monthly grid (built in Phase 3). Has month nav, today highlight, weekday headers. No data fetching.
- `apps/web/src/app/workspace/settings/connectors/ConnectorsPage.tsx` — Shows connected state for Slack, Google Calendar, Outlook Calendar, Email. Has install URLs.
- `apps/web/src/app/api/workspace/connectors/calendar/project-link/route.ts` — API for linking a calendar to a project.
- `apps/web/src/app/api/workspace/connectors/[connector]/install/route.ts` — API for installing connectors.
- `apps/web/src/app/api/workspace/meetings/route.ts` — Returns meetings list.
- `apps/web/src/app/api/workspace/meetings/[id]/route.ts` — Returns single meeting detail.
- `apps/web/src/app/api/workspace/tasks/route.ts` — Returns tasks (have `dueDate` field).
- `apps/web/src/app/dashboard/types.ts` — All shared types (`WorkspaceTask`, `WorkspaceMeeting`, etc.)

---

## Task 1: Create Calendar Data Hook

**Files:**
- Create: `apps/web/src/hooks/useCalendarEvents.ts`
- Read: `apps/web/src/app/dashboard/types.ts`

This hook fetches and merges three data sources into a unified calendar event list:
1. Tasks with `dueDate` — shown as deadline markers
2. Meetings — shown as meeting blocks
3. (Future) External calendar events from Google/Outlook API

- [ ] **Step 1: Define the CalendarEvent type and hook**

```typescript
// apps/web/src/hooks/useCalendarEvents.ts
import { useCallback, useEffect, useState } from "react";
import type { WorkspaceTask, WorkspaceMeeting } from "@/app/dashboard/types";

export type CalendarEventKind = "deadline" | "meeting" | "external";

export interface CalendarEvent {
  id: string;
  kind: CalendarEventKind;
  title: string;
  date: string; // YYYY-MM-DD
  time?: string | null; // HH:MM (optional)
  projectId?: string | null;
  projectName?: string | null;
  meetingId?: string | null;
  taskId?: string | null;
  color: string; // Larry palette hex
}

function toDateStr(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new Date(value).toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

export function useCalendarEvents(projectId?: string) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tasksRes, meetingsRes] = await Promise.all([
        fetch(projectId ? `/api/workspace/tasks?projectId=${projectId}` : "/api/workspace/tasks", { cache: "no-store" }),
        fetch(projectId ? `/api/workspace/meetings?projectId=${projectId}` : "/api/workspace/meetings", { cache: "no-store" }),
      ]);

      const tasksData = tasksRes.ok ? await tasksRes.json() : {};
      const meetingsData = meetingsRes.ok ? await meetingsRes.json() : {};

      const tasks: WorkspaceTask[] = tasksData.items ?? [];
      const meetings: WorkspaceMeeting[] = meetingsData.items ?? meetingsData.meetings ?? [];

      const calEvents: CalendarEvent[] = [];

      for (const task of tasks) {
        const dateStr = toDateStr(task.dueDate);
        if (!dateStr) continue;
        calEvents.push({
          id: `task-${task.id}`,
          kind: "deadline",
          title: task.title,
          date: dateStr,
          projectId: task.projectId,
          taskId: task.id,
          color: "#bfd2ff", // Larry 7.0 — accent blue for deadlines
        });
      }

      for (const meeting of meetings) {
        const dateStr = toDateStr(meeting.meetingDate ?? meeting.createdAt);
        if (!dateStr) continue;
        calEvents.push({
          id: `meeting-${meeting.id}`,
          kind: "meeting",
          title: meeting.title ?? "Meeting",
          date: dateStr,
          projectId: meeting.projectId,
          meetingId: meeting.id,
          color: "#6c44f6", // Larry 1.0 — brand purple for meetings
        });
      }

      setEvents(calEvents);
    } catch {
      // Keep empty on error
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { events, loading, refresh: load };
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd apps/web && npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/hooks/useCalendarEvents.ts
git commit -m "feat: add useCalendarEvents hook merging tasks and meetings into calendar events"
```

---

## Task 2: Upgrade Calendar Page with Real Data

**Files:**
- Modify: `apps/web/src/app/workspace/calendar/page.tsx`
- Read: `apps/web/src/hooks/useCalendarEvents.ts`

Replace the static grid with a data-driven calendar that shows event dots and a day-detail panel.

- [ ] **Step 1: Import the hook and wire it up**

At the top of the file, add:
```typescript
import { useCalendarEvents, type CalendarEvent } from "@/hooks/useCalendarEvents";
```

Inside the component, add after the `viewDate` state:
```typescript
const { events, loading: eventsLoading } = useCalendarEvents();
```

- [ ] **Step 2: Add a selected-day state and day detail panel**

Add state:
```typescript
const [selectedDate, setSelectedDate] = useState<string | null>(null);
```

Create a helper to get events for a given date:
```typescript
function eventsForDate(date: Date): CalendarEvent[] {
  const key = date.toISOString().slice(0, 10);
  return events.filter((e) => e.date === key);
}
```

- [ ] **Step 3: Add event dots inside each day cell**

In the day cell render, after the date number `<span>`, add:
```tsx
{(() => {
  const dayEvents = eventsForDate(day);
  if (dayEvents.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {dayEvents.slice(0, 3).map((evt) => (
        <div
          key={evt.id}
          className="h-1.5 w-1.5 rounded-full"
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
```

- [ ] **Step 4: Add click handler on day cells**

On the day cell `<div>`, add:
```tsx
onClick={() => setSelectedDate(day.toISOString().slice(0, 10))}
```

- [ ] **Step 5: Add day detail sidebar/panel**

After the calendar card, before the empty state hint, add a detail panel that shows when a day is selected:
```tsx
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
          {dayEvents.map((evt) => (
            <div
              key={evt.id}
              className="flex items-center gap-3 rounded-lg border px-3 py-2"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: evt.color }} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium truncate" style={{ color: "var(--text-1)" }}>
                  {evt.title}
                </p>
                <p className="text-[11px]" style={{ color: "var(--text-disabled)" }}>
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
```

- [ ] **Step 6: Only show the "connect calendars" nudge when no connectors are linked**

Wrap the existing empty state hint in a condition that checks if events are empty and loading is done.

- [ ] **Step 7: Build and verify**

Run: `cd apps/web && npx next build 2>&1 | tail -5`

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/workspace/calendar/page.tsx
git commit -m "feat: wire calendar page to real task/meeting data with event dots and day detail panel"
```

---

## Task 3: Add Per-Project Calendar Tab

**Files:**
- Modify: `apps/web/src/app/workspace/projects/[projectId]/ProjectWorkspaceView.tsx`

- [ ] **Step 1: Replace the calendar placeholder tab**

Find the `{activeTab === "calendar"` block that currently shows a "coming soon" placeholder. Replace it with an inline calendar component that uses `useCalendarEvents(projectId)`.

The inline calendar should be a simplified version of the global calendar — same monthly grid, same event dots, same day detail — but scoped to the current project's tasks and meetings only.

Import `useCalendarEvents` at the top and render a `<ProjectCalendar projectId={projectId} />` component (defined in the same file or extracted to a new file).

- [ ] **Step 2: Build and verify**

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/workspace/projects/[projectId]/ProjectWorkspaceView.tsx
git commit -m "feat: add per-project calendar tab with scoped task deadlines and meetings"
```

---

## Task 4: Link Meeting Notes to Calendar Entries

**Files:**
- Modify: `apps/web/src/app/workspace/calendar/page.tsx` (day detail panel)

- [ ] **Step 1: Add meeting note links**

In the day detail panel, when an event has `kind === "meeting"` and `meetingId`, render a link to view the meeting:

```tsx
{evt.kind === "meeting" && evt.meetingId && (
  <Link
    href={`/workspace/meetings?id=${evt.meetingId}`}
    className="text-[11px] font-medium"
    style={{ color: "var(--cta)" }}
  >
    View meeting notes
  </Link>
)}
```

For deadline events with `taskId` and `projectId`:
```tsx
{evt.kind === "deadline" && evt.projectId && (
  <Link
    href={`/workspace/projects/${evt.projectId}`}
    className="text-[11px] font-medium"
    style={{ color: "var(--cta)" }}
  >
    Open project
  </Link>
)}
```

- [ ] **Step 2: Build and verify**

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/workspace/calendar/page.tsx
git commit -m "feat: add meeting notes and project links to calendar day detail panel"
```

---

## Task 5: Final Polish

- [ ] **Step 1:** Verify the calendar route appears in the sidebar and navigates correctly
- [ ] **Step 2:** Verify the project tab "Calendar" shows scoped events
- [ ] **Step 3:** Test with no connectors (should show connect nudge)
- [ ] **Step 4:** Test with no events (should show empty day state)
- [ ] **Step 5:** Verify build passes: `npx next build`
- [ ] **Step 6:** Final commit with any polish fixes
