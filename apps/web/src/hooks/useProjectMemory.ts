"use client";

import { useCallback, useEffect, useState } from "react";
import type { WorkspaceProjectMemoryEntry } from "@/app/dashboard/types";

interface ProjectMemoryResponse {
  items?: WorkspaceProjectMemoryEntry[];
  error?: string;
}

interface ProjectMemoryState {
  entries: WorkspaceProjectMemoryEntry[];
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

export function useProjectMemory(
  projectId: string,
  sourceKind: string | null
): ProjectMemoryState {
  const [entries, setEntries] = useState<WorkspaceProjectMemoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
    }

    try {
      const query = new URLSearchParams();
      if (sourceKind?.trim()) {
        query.set("sourceKind", sourceKind.trim());
      }
      query.set("limit", "30");
      const suffix = query.toString();

      const response = await fetch(
        `/api/workspace/projects/${encodeURIComponent(projectId)}/memory${suffix ? `?${suffix}` : ""}`,
        { cache: "no-store" }
      );
      const payload = await readJson<ProjectMemoryResponse>(response);
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load project memory.");
      }

      setEntries(Array.isArray(payload.items) ? payload.items : []);
      setError(payload.error ?? null);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : "Failed to load project memory.";
      setEntries([]);
      setError(message);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [projectId, sourceKind]);

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
    entries,
    loading,
    error,
    refresh: async () => {
      await load();
    },
  };
}
