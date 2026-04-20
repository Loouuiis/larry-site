"use client";

import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { WorkspaceProjectActionCentre } from "@/app/dashboard/types";
import { getActionTypeTag } from "@/lib/action-types";

const EMPTY_ACTION_CENTRE: WorkspaceProjectActionCentre = {
  suggested: [],
  activity: [],
  conversations: [],
};
const DEFAULT_ACTION_CENTRE_REFRESH_MS = 30_000;
const ENV_ACTION_CENTRE_REFRESH_MS = Number(
  process.env.NEXT_PUBLIC_LARRY_ACTION_CENTRE_REFRESH_MS ?? "",
);
const ACTION_CENTRE_REFRESH_MS =
  Number.isFinite(ENV_ACTION_CENTRE_REFRESH_MS) && ENV_ACTION_CENTRE_REFRESH_MS > 0
    ? Math.floor(ENV_ACTION_CENTRE_REFRESH_MS)
    : DEFAULT_ACTION_CENTRE_REFRESH_MS;

async function noopMutate(): Promise<void> {}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return {} as T;
  }
}

export interface ActionError {
  eventId: string;
  message: string;
}

export function actionCentreQueryKey(projectId: string | undefined) {
  return ["actionCentre", projectId ?? "larry"] as const;
}

async function fetchActionCentre(
  projectId: string | undefined,
): Promise<WorkspaceProjectActionCentre> {
  const path = projectId
    ? `/api/workspace/projects/${encodeURIComponent(projectId)}/action-centre`
    : "/api/workspace/larry/action-centre";
  const response = await fetch(path, { cache: "no-store" });
  const payload = await readJson<WorkspaceProjectActionCentre>(response);
  if (!response.ok) throw new Error(payload.error ?? "Failed to load action centre.");
  return {
    suggested: Array.isArray(payload.suggested) ? payload.suggested : [],
    activity: Array.isArray(payload.activity) ? payload.activity : [],
    conversations: Array.isArray(payload.conversations) ? payload.conversations : [],
    error: payload.error,
  };
}

export function useLarryActionCentre({
  projectId,
  onMutate = noopMutate,
  onAccepted,
}: {
  projectId?: string;
  onMutate?: () => Promise<void>;
  onAccepted?: (toast: {
    actionType: string;
    actionLabel: string;
    actionColor: string;
    displayText: string;
    projectName: string | null;
    projectId: string;
  }) => void;
} = {}) {
  const qc = useQueryClient();
  const key = actionCentreQueryKey(projectId);

  const query = useQuery({
    queryKey: key,
    queryFn: () => fetchActionCentre(projectId),
    refetchInterval: ACTION_CENTRE_REFRESH_MS,
    refetchOnWindowFocus: true,
  });

  // Legacy bridge — other hooks still dispatch this event.
  useEffect(() => {
    function onRefresh() {
      void qc.invalidateQueries({ queryKey: key });
    }
    window.addEventListener("larry:refresh-snapshot", onRefresh);
    return () => window.removeEventListener("larry:refresh-snapshot", onRefresh);
  }, [qc, key]);

  const data = query.data ?? EMPTY_ACTION_CENTRE;

  // --- mutation state and callbacks temporarily retained from the pre-migration
  // implementation; Slice 5 replaces these with withOptimistic-driven mutations.
  const [accepting, setAccepting] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState<string | null>(null);
  const [modifying, _setModifying] = useState<string | null>(null);
  const [modifyingEventId, setModifyingEventId] = useState<string | null>(null);
  const [executing, setExecuting] = useState<string | null>(null);
  const [actionError, setActionError] = useState<ActionError | null>(null);

  const clearActionError = useCallback(() => setActionError(null), []);

  const removeSuggestedLocally = useCallback(
    (eventId: string) => {
      qc.setQueryData<WorkspaceProjectActionCentre>(key, (prev) =>
        prev ? { ...prev, suggested: prev.suggested.filter((e) => e.id !== eventId) } : prev,
      );
    },
    [qc, key],
  );

  const accept = useCallback(
    async (id: string) => {
      setAccepting(id);
      setActionError(null);
      try {
        const response = await fetch(`/api/workspace/larry/events/${id}/accept`, { method: "POST" });
        if (response.ok) {
          const body = await readJson<{
            accepted: boolean;
            event?: {
              actionType: string;
              displayText: string;
              projectName: string | null;
              projectId: string;
            };
          }>(response);
          removeSuggestedLocally(id);
          window.dispatchEvent(new CustomEvent("larry:refresh-snapshot"));
          await Promise.all([qc.invalidateQueries({ queryKey: key }), onMutate()]);
          if (body.event && onAccepted) {
            const tag = getActionTypeTag(body.event.actionType);
            onAccepted({
              actionType: body.event.actionType,
              actionLabel: tag.label,
              actionColor: tag.color,
              displayText: body.event.displayText,
              projectName: body.event.projectName,
              projectId: body.event.projectId,
            });
          }
        } else {
          const body = await readJson<{ message?: string; error?: string }>(response);
          setActionError({
            eventId: id,
            message: body.message || body.error || `Action failed (${response.status}).`,
          });
        }
      } finally {
        setAccepting(null);
      }
    },
    [qc, key, onMutate, onAccepted, removeSuggestedLocally],
  );

  const dismiss = useCallback(
    async (id: string) => {
      setDismissing(id);
      setActionError(null);
      try {
        const response = await fetch(`/api/workspace/larry/events/${id}/dismiss`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (response.ok) {
          removeSuggestedLocally(id);
          window.dispatchEvent(new CustomEvent("larry:refresh-snapshot"));
          await Promise.all([qc.invalidateQueries({ queryKey: key }), onMutate()]);
        } else {
          const body = await readJson<{ message?: string; error?: string }>(response);
          setActionError({
            eventId: id,
            message: body.message || body.error || `Dismiss failed (${response.status}).`,
          });
        }
      } finally {
        setDismissing(null);
      }
    },
    [qc, key, onMutate, removeSuggestedLocally],
  );

  const modify = useCallback((id: string): void => {
    setActionError(null);
    setModifyingEventId(id);
  }, []);

  const closeModify = useCallback((): void => {
    setModifyingEventId(null);
  }, []);

  const letLarryExecute = useCallback(
    async (id: string): Promise<boolean> => {
      setExecuting(id);
      setActionError(null);
      try {
        const response = await fetch(`/api/workspace/larry/events/${id}/let-larry-execute`, {
          method: "POST",
        });
        if (response.ok) {
          window.dispatchEvent(new CustomEvent("larry:refresh-snapshot"));
          await Promise.all([qc.invalidateQueries({ queryKey: key }), onMutate()]);
          return true;
        }
        const body = await readJson<{ message?: string; error?: string }>(response);
        setActionError({
          eventId: id,
          message: body.message || body.error || `Execution failed (${response.status}).`,
        });
        return false;
      } catch {
        return false;
      } finally {
        setExecuting(null);
      }
    },
    [qc, key, onMutate],
  );

  return {
    suggested: data.suggested,
    activity: data.activity,
    conversations: data.conversations,
    loading: query.isLoading,
    error:
      data.error ??
      (query.isError
        ? query.error instanceof Error
          ? query.error.message
          : "Failed to load action centre."
        : null),
    accepting,
    dismissing,
    modifying,
    modifyingEventId,
    executing,
    actionError,
    accept,
    dismiss,
    modify,
    closeModify,
    letLarryExecute,
    clearActionError,
    refresh: async () => {
      await query.refetch();
    },
  };
}
