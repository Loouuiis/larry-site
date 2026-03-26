"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  WorkspaceAction,
  WorkspaceHealth,
  WorkspaceOutcomes,
  WorkspaceProject,
  WorkspaceSnapshot,
  WorkspaceTask,
  WorkspaceTimeline,
} from "@/app/dashboard/types";

export interface ProjectMeeting {
  id: string;
  title: string | null;
  summary: string | null;
  actionCount: number;
  meetingDate: string | null;
  createdAt: string;
  projectId: string | null;
  agentRunId: string | null;
  agentRunState: string | null;
}

interface ProjectDataState {
  project: WorkspaceProject | null;
  tasks: WorkspaceTask[];
  health: WorkspaceHealth | null;
  actions: WorkspaceAction[];
  meetings: ProjectMeeting[];
  timeline: WorkspaceTimeline | null;
  outcomes: WorkspaceOutcomes | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
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

export function useProjectData(projectId: string): ProjectDataState {
  const [project, setProject] = useState<WorkspaceProject | null>(null);
  const [tasks, setTasks] = useState<WorkspaceTask[]>([]);
  const [health, setHealth] = useState<WorkspaceHealth | null>(null);
  const [actions, setActions] = useState<WorkspaceAction[]>([]);
  const [meetings, setMeetings] = useState<ProjectMeeting[]>([]);
  const [timeline, setTimeline] = useState<WorkspaceTimeline | null>(null);
  const [outcomes, setOutcomes] = useState<WorkspaceOutcomes | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
    }

    try {
      const [snapshotResponse, meetingsResponse] = await Promise.all([
        fetch(`/api/workspace/snapshot?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store" }),
        fetch(`/api/workspace/meetings?projectId=${encodeURIComponent(projectId)}&limit=20`, { cache: "no-store" }),
      ]);

      const snapshot = await readJson<WorkspaceSnapshot>(snapshotResponse);
      const meetingsPayload = await readJson<{ meetings?: ProjectMeeting[] }>(meetingsResponse);

      if (!snapshotResponse.ok) {
        throw new Error(snapshot.error ?? "Failed to load project workspace.");
      }

      setProject(snapshot.projects.find((item) => item.id === projectId) ?? null);
      setTasks((snapshot.tasks ?? []).filter((item) => item.projectId === projectId));
      setHealth(snapshot.health ?? null);
      setActions((snapshot.pendingActions ?? []).filter((item) => item.projectId === projectId));
      setTimeline(snapshot.timeline ?? null);
      setOutcomes(snapshot.outcomes ?? null);
      setMeetings(
        Array.isArray(meetingsPayload.meetings)
          ? meetingsPayload.meetings.filter((item) => item.projectId === projectId)
          : []
      );
      setError(snapshot.error ?? null);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : "Failed to load project data.";
      setError(message);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [projectId]);

  useEffect(() => {
    void load();

    const interval = window.setInterval(() => {
      void load(true);
    }, 30_000);

    function onRefresh() {
      void load(true);
    }

    window.addEventListener("larry:refresh-snapshot", onRefresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("larry:refresh-snapshot", onRefresh);
    };
  }, [load]);

  return {
    project,
    tasks,
    health,
    actions,
    meetings,
    timeline,
    outcomes,
    loading,
    error,
    refresh: async () => {
      await load();
    },
  };
}
