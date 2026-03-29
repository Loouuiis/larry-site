"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceProjectActionCentre } from "@/app/dashboard/types";

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

export function useLarryActionCentre({
  projectId,
  onMutate = noopMutate,
}: {
  projectId?: string;
  onMutate?: () => Promise<void>;
} = {}) {
  const [data, setData] = useState<WorkspaceProjectActionCentre>(EMPTY_ACTION_CENTRE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState<string | null>(null);
  const loadInFlightRef = useRef<Promise<void> | null>(null);

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

  const accept = useCallback(
    async (id: string) => {
      setAccepting(id);
      try {
        const response = await fetch(`/api/workspace/larry/events/${id}/accept`, { method: "POST" });
        if (response.ok) {
          window.dispatchEvent(new CustomEvent("larry:refresh-snapshot"));
          await Promise.all([load(), onMutate()]);
        }
      } finally {
        setAccepting(null);
      }
    },
    [load, onMutate]
  );

  const dismiss = useCallback(
    async (id: string) => {
      setDismissing(id);
      try {
        const response = await fetch(`/api/workspace/larry/events/${id}/dismiss`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (response.ok) {
          window.dispatchEvent(new CustomEvent("larry:refresh-snapshot"));
          await Promise.all([load(), onMutate()]);
        }
      } finally {
        setDismissing(null);
      }
    },
    [load, onMutate]
  );

  return {
    suggested: data.suggested,
    activity: data.activity,
    conversations: data.conversations,
    loading,
    error,
    accepting,
    dismissing,
    accept,
    dismiss,
    refresh: load,
  };
}
