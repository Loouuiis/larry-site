// apps/web/src/hooks/useCalendarEvents.ts
import { useCallback, useEffect, useState } from "react";
import type { WorkspaceTask, WorkspaceMeeting } from "@/app/dashboard/types";
import { parseDateKey } from "@/lib/calendar-date";

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
  taskStatus?: string | null;
  color: string; // Larry palette hex
}

function taskPriorityColor(priority: string | null | undefined): string {
  if (priority === "critical") return "#ef4444";
  if (priority === "high") return "#f59e0b";
  if (priority === "medium") return "#3b82f6";
  return "#22c55e"; // low
}

const toDateStr = parseDateKey;

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
          taskStatus: task.status,
          color: taskPriorityColor(task.priority),
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
