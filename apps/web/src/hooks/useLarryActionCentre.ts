"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceProjectActionCentre } from "@/app/dashboard/types";
import { getActionTypeTag } from "@/lib/action-types";

const EMPTY_ACTION_CENTRE: WorkspaceProjectActionCentre = {
  suggested: [],
  activity: [],
  conversations: [],
};
const DEFAULT_ACTION_CENTRE_REFRESH_MS = 30_000;
const ENV_ACTION_CENTRE_REFRESH_MS = Number(process.env.NEXT_PUBLIC_LARRY_ACTION_CENTRE_REFRESH_MS ?? "");
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

export function useLarryActionCentre({
  projectId,
  onMutate = noopMutate,
  onAccepted,
}: {
  projectId?: string;
  onMutate?: () => Promise<void>;
  onAccepted?: (toast: { actionType: string; actionLabel: string; actionColor: string; displayText: string; projectName: string | null; projectId: string }) => void;
} = {}) {
  const [data, setData] = useState<WorkspaceProjectActionCentre>(EMPTY_ACTION_CENTRE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState<string | null>(null);
  const [modifying, setModifying] = useState<string | null>(null);
  const [modifyingEventId, setModifyingEventId] = useState<string | null>(null);
  const [executing, setExecuting] = useState<string | null>(null);
  const [actionError, setActionError] = useState<ActionError | null>(null);
  const loadInFlightRef = useRef<Promise<void> | null>(null);

  const clearActionError = useCallback(() => setActionError(null), []);

  const load = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (loadInFlightRef.current) {
        return loadInFlightRef.current;
      }

      const run = (async () => {
        if (!silent) {
          setLoading(true);
        }
        try {
          const path = projectId
            ? `/api/workspace/projects/${encodeURIComponent(projectId)}/action-centre`
            : "/api/workspace/larry/action-centre";
          const response = await fetch(path, { cache: "no-store" });
          const payload = await readJson<WorkspaceProjectActionCentre>(response);
          if (!response.ok) {
            throw new Error(payload.error ?? "Failed to load action centre.");
          }
          setData({
            suggested: Array.isArray(payload.suggested) ? payload.suggested : [],
            activity: Array.isArray(payload.activity) ? payload.activity : [],
            conversations: Array.isArray(payload.conversations) ? payload.conversations : [],
            error: payload.error,
          });
          setError(payload.error ?? null);
        } catch (loadError) {
          setData(EMPTY_ACTION_CENTRE);
          setError(loadError instanceof Error ? loadError.message : "Failed to load action centre.");
        } finally {
          if (!silent) {
            setLoading(false);
          }
          loadInFlightRef.current = null;
        }
      })();

      loadInFlightRef.current = run;
      return run;
    },
    [projectId]
  );

  useEffect(() => {
    void load();

    function onRefresh() {
      void load({ silent: true });
    }

    function onFocus() {
      void load({ silent: true });
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        void load({ silent: true });
      }
    }

    const interval = window.setInterval(() => {
      void load({ silent: true });
    }, ACTION_CENTRE_REFRESH_MS);

    window.addEventListener("larry:refresh-snapshot", onRefresh);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("larry:refresh-snapshot", onRefresh);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [load]);

  // QA-2026-04-12 §3a: Accept double-click 409 race. Pre-fix the
  // suggestion stayed in `data.suggested` until the post-accept reload
  // returned, leaving the button visible for a few hundred ms after the
  // POST succeeded. A second click against the same event then hit the
  // server, by which time event_type was already "accepted" — 409. Clear
  // the suggestion from local state the moment the API returns 200 so
  // the row disappears immediately.
  const removeSuggestedLocally = useCallback((eventId: string) => {
    setData((current) => ({
      ...current,
      suggested: current.suggested.filter((event) => event.id !== eventId),
    }));
  }, []);

  const accept = useCallback(
    async (id: string) => {
      setAccepting(id);
      setActionError(null);
      try {
        const response = await fetch(`/api/workspace/larry/events/${id}/accept`, { method: "POST" });
        if (response.ok) {
          const body = await readJson<{
            accepted: boolean;
            event?: { actionType: string; displayText: string; projectName: string | null; projectId: string };
          }>(response);
          removeSuggestedLocally(id);
          // If the accepted event was a timeline_* suggestion, the tree of
          // categories and project moves just changed — refresh both Gantt surfaces.
          const actionType = body.event?.actionType;
          if (typeof actionType === "string" && actionType.startsWith("timeline_")) {
            window.dispatchEvent(new CustomEvent("larry:refresh-timeline"));
          }
          window.dispatchEvent(new CustomEvent("larry:refresh-snapshot"));
          await Promise.all([load(), onMutate()]);
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
    [load, onMutate, onAccepted, removeSuggestedLocally]
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
          // Same optimistic-clear treatment as accept (QA §3a) so a fast
          // dismiss → click loop can't re-fire on the same row.
          removeSuggestedLocally(id);
          window.dispatchEvent(new CustomEvent("larry:refresh-snapshot"));
          await Promise.all([load(), onMutate()]);
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
    [load, onMutate, removeSuggestedLocally]
  );

  // Opens the inline Modify panel for an event. The panel itself (ModifyPanel +
  // useModifyPanel) fetches the editable snapshot from /api/workspace/larry/events/
  // [id]/modify, so this callback just toggles the UI.
  // Spec: 2026-04-15-modify-action-design.md.
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
        const response = await fetch(`/api/workspace/larry/events/${id}/let-larry-execute`, { method: "POST" });
        if (response.ok) {
          window.dispatchEvent(new CustomEvent("larry:refresh-snapshot"));
          await Promise.all([load(), onMutate()]);
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
    [load, onMutate],
  );

  return {
    suggested: data.suggested,
    activity: data.activity,
    conversations: data.conversations,
    loading,
    error,
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
    refresh: load,
  };
}
