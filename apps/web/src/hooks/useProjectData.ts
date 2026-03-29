"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  WorkspaceHealth,
  WorkspaceMeeting,
  WorkspaceOutcomes,
  WorkspaceProject,
  WorkspaceProjectOverview,
  WorkspaceTask,
  WorkspaceTimeline,
} from "@/app/dashboard/types";

interface ProjectDataState {
  project: WorkspaceProject | null;
  tasks: WorkspaceTask[];
  health: WorkspaceHealth | null;
  meetings: WorkspaceMeeting[];
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
  const [meetings, setMeetings] = useState<WorkspaceMeeting[]>([]);
  const [timeline, setTimeline] = useState<WorkspaceTimeline | null>(null);
  const [outcomes, setOutcomes] = useState<WorkspaceOutcomes | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
    }

    try {
      const response = await fetch(
        `/api/workspace/projects/${encodeURIComponent(projectId)}/overview`,
        { cache: "no-store" },
      );

      const overview = await readJson<WorkspaceProjectOverview>(response);
      if (!response.ok) {
        throw new Error(overview.error ?? "Failed to load project workspace.");
      }

      setProject(overview.project ?? null);
      setTasks(Array.isArray(overview.tasks) ? overview.tasks : []);
      setHealth(overview.health ?? null);
      setTimeline(overview.timeline ?? null);
      setOutcomes(overview.outcomes ?? null);
      setMeetings(Array.isArray(overview.meetings) ? overview.meetings : []);
      setError(overview.error ?? null);
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
