"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  WorkspaceProjectNote,
  WorkspaceProjectNotesResponse,
  WorkspaceProjectNoteVisibility,
} from "@/app/dashboard/types";

export type ProjectNoteFilter = "all" | WorkspaceProjectNoteVisibility;

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return {} as T;
  }
}

export function useProjectNotes(projectId: string, filter: ProjectNoteFilter = "all") {
  const [notes, setNotes] = useState<WorkspaceProjectNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ visibility: filter });
      const response = await fetch(
        `/api/workspace/projects/${encodeURIComponent(projectId)}/notes?${query.toString()}`,
        { cache: "no-store" }
      );
      const payload = await readJson<WorkspaceProjectNotesResponse>(response);
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load project notes.");
      }

      setNotes(Array.isArray(payload.notes) ? payload.notes : []);
      setError(payload.error ?? null);
    } catch (fetchError) {
      setNotes([]);
      setError(fetchError instanceof Error ? fetchError.message : "Failed to load project notes.");
    } finally {
      setLoading(false);
    }
  }, [filter, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = useCallback(
    async (input: {
      visibility: WorkspaceProjectNoteVisibility;
      content: string;
      recipientUserId?: string | null;
    }) => {
      setCreating(true);
      try {
        const response = await fetch(
          `/api/workspace/projects/${encodeURIComponent(projectId)}/notes`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              visibility: input.visibility,
              content: input.content,
              recipientUserId:
                input.visibility === "personal" ? input.recipientUserId ?? null : undefined,
            }),
          }
        );

        const payload = await readJson<{ note?: WorkspaceProjectNote; error?: string }>(response);
        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to create note.");
        }

        await load();
        return payload.note ?? null;
      } finally {
        setCreating(false);
      }
    },
    [load, projectId]
  );

  return {
    notes,
    loading,
    error,
    creating,
    create,
    refresh: load,
  };
}
