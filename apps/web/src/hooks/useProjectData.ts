"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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

// Exposed so mutation handlers can invalidate this hook's cache by key.
export const projectOverviewQueryKey = (projectId: string) =>
  ["project", "overview", projectId] as const;

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
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: projectOverviewQueryKey(projectId),
    queryFn: async (): Promise<WorkspaceProjectOverview> => {
      const response = await fetch(
        `/api/workspace/projects/${encodeURIComponent(projectId)}/overview`,
        { cache: "no-store" },
      );
      const overview = await readJson<WorkspaceProjectOverview>(response);
      if (!response.ok) {
        throw new Error(overview.error ?? "Failed to load project workspace.");
      }
      return overview;
    },
  });

  // Legacy bridge — some parts of the app dispatch a custom
  // "larry:refresh-snapshot" event to force a manual refresh (e.g. after a
  // Larry chat action). Keep honouring it by invalidating this query.
  useEffect(() => {
    function onRefresh() {
      void qc.invalidateQueries({ queryKey: projectOverviewQueryKey(projectId) });
    }
    window.addEventListener("larry:refresh-snapshot", onRefresh);
    return () => window.removeEventListener("larry:refresh-snapshot", onRefresh);
  }, [qc, projectId]);

  const overview = query.data;

  return {
    project: overview?.project ?? null,
    tasks: Array.isArray(overview?.tasks) ? overview!.tasks : [],
    health: overview?.health ?? null,
    meetings: Array.isArray(overview?.meetings) ? overview!.meetings : [],
    timeline: overview?.timeline ?? null,
    outcomes: overview?.outcomes ?? null,
    loading: query.isLoading,
    error:
      overview?.error
      ?? (query.isError
        ? (query.error instanceof Error ? query.error.message : "Failed to load project data.")
        : null),
    refresh: async () => {
      // Force a fresh fetch. Use refetch so callers that await it are blocked
      // until the network round-trip completes (existing behaviour of the
      // legacy `refresh()`).
      await query.refetch();
    },
  };
}
