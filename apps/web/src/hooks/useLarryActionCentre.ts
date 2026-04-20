"use client";

import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { WorkspaceProjectActionCentre } from "@/app/dashboard/types";
import { getActionTypeTag } from "@/lib/action-types";
import { withOptimistic } from "@/lib/optimistic";

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

type AcceptEventBody = {
  actionType: string;
  displayText: string;
  projectName: string | null;
  projectId: string;
};

type AcceptResponse = {
  accepted?: boolean;
  event?: AcceptEventBody;
};

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

  // UI state unrelated to network calls — kept as useState.
  const [modifying, _setModifying] = useState<string | null>(null);
  const [modifyingEventId, setModifyingEventId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<ActionError | null>(null);

  const clearActionError = useCallback(() => setActionError(null), []);

  // --- Accept -------------------------------------------------------------

  const acceptMutation = useMutation<AcceptResponse, Error, string>({
    mutationFn: async (id) => {
      const response = await fetch(`/api/workspace/larry/events/${id}/accept`, {
        method: "POST",
      });
      const body = await readJson<AcceptResponse & { message?: string; error?: string }>(response);
      if (!response.ok) {
        throw new Error(body.message || body.error || `Action failed (${response.status}).`);
      }
      return body;
    },
    scope: { id: "actionCentre-event" },
    ...withOptimistic<string, AcceptResponse>(qc, {
      affects: () => [key],
      optimistic: (c, id) =>
        c.setQueryData<WorkspaceProjectActionCentre>(key, (prev) =>
          prev ? { ...prev, suggested: prev.suggested.filter((e) => e.id !== id) } : prev,
        ),
      reconcile: (c, _id, body) => {
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
        window.dispatchEvent(new CustomEvent("larry:refresh-snapshot"));
        c.invalidateQueries({ queryKey: key });
        void onMutate();
      },
      onRollback: (err, id) => {
        setActionError({
          eventId: id,
          message: err instanceof Error ? err.message : "Action failed.",
        });
      },
    }),
  });

  // --- Dismiss ------------------------------------------------------------

  const dismissMutation = useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const response = await fetch(`/api/workspace/larry/events/${id}/dismiss`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        const body = await readJson<{ message?: string; error?: string }>(response);
        throw new Error(body.message || body.error || `Dismiss failed (${response.status}).`);
      }
    },
    scope: { id: "actionCentre-event" },
    ...withOptimistic<string, void>(qc, {
      affects: () => [key],
      optimistic: (c, id) =>
        c.setQueryData<WorkspaceProjectActionCentre>(key, (prev) =>
          prev ? { ...prev, suggested: prev.suggested.filter((e) => e.id !== id) } : prev,
        ),
      reconcile: (c) => {
        window.dispatchEvent(new CustomEvent("larry:refresh-snapshot"));
        c.invalidateQueries({ queryKey: key });
        void onMutate();
      },
      onRollback: (err, id) => {
        setActionError({
          eventId: id,
          message: err instanceof Error ? err.message : "Dismiss failed.",
        });
      },
    }),
  });

  // --- Let Larry Execute --------------------------------------------------

  const executeMutation = useMutation<boolean, Error, string>({
    mutationFn: async (id) => {
      const response = await fetch(`/api/workspace/larry/events/${id}/let-larry-execute`, {
        method: "POST",
      });
      if (!response.ok) {
        const body = await readJson<{ message?: string; error?: string }>(response);
        throw new Error(body.message || body.error || `Execution failed (${response.status}).`);
      }
      return true;
    },
    scope: { id: "actionCentre-event" },
    ...withOptimistic<string, boolean>(qc, {
      affects: () => [key],
      optimistic: (c, id) =>
        c.setQueryData<WorkspaceProjectActionCentre>(key, (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            suggested: prev.suggested.map((e) =>
              e.id === id ? { ...e, executing: true } : e,
            ),
          };
        }),
      reconcile: (c) => {
        window.dispatchEvent(new CustomEvent("larry:refresh-snapshot"));
        c.invalidateQueries({ queryKey: key });
        void onMutate();
      },
      onRollback: (err, id) => {
        setActionError({
          eventId: id,
          message: err instanceof Error ? err.message : "Execution failed.",
        });
      },
    }),
  });

  // --- Public callbacks + derived pending flags --------------------------

  const accept = useCallback(
    (id: string) => {
      setActionError(null);
      acceptMutation.mutate(id);
    },
    [acceptMutation],
  );

  const dismiss = useCallback(
    (id: string) => {
      setActionError(null);
      dismissMutation.mutate(id);
    },
    [dismissMutation],
  );

  const letLarryExecute = useCallback(
    async (id: string): Promise<boolean> => {
      setActionError(null);
      try {
        await executeMutation.mutateAsync(id);
        return true;
      } catch {
        return false;
      }
    },
    [executeMutation],
  );

  const modify = useCallback((id: string): void => {
    setActionError(null);
    setModifyingEventId(id);
  }, []);

  const closeModify = useCallback((): void => {
    setModifyingEventId(null);
  }, []);

  const accepting = acceptMutation.isPending ? acceptMutation.variables ?? null : null;
  const dismissing = dismissMutation.isPending ? dismissMutation.variables ?? null : null;
  const executing = executeMutation.isPending ? executeMutation.variables ?? null : null;

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
