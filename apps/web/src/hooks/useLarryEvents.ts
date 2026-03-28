"use client";

import { useCallback, useEffect, useState } from "react";

export interface LarryEvent {
  id: string;
  projectId: string;
  eventType: "auto_executed" | "suggested" | "accepted" | "dismissed";
  actionType: string;
  displayText: string;
  reasoning: string;
  payload: Record<string, unknown>;
  executedAt: string | null;
  triggeredBy: "schedule" | "login" | "chat" | "signal";
  chatMessage: string | null;
  createdAt: string;
}

interface UseLarryEventsState {
  suggested: LarryEvent[];
  activity: LarryEvent[];
  loading: boolean;
  error: string | null;
  accepting: string | null;
  dismissing: string | null;
  accept: (id: string) => Promise<void>;
  dismiss: (id: string) => Promise<void>;
}

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return {} as T;
  }
}

export function useLarryEvents(
  projectId: string,
  onMutate: () => Promise<void>
): UseLarryEventsState {
  const [suggested, setSuggested] = useState<LarryEvent[]>([]);
  const [activity, setActivity] = useState<LarryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sugRes, actRes] = await Promise.all([
        fetch(
          `/api/workspace/larry/events?projectId=${encodeURIComponent(projectId)}&eventType=suggested`,
          { cache: "no-store" }
        ),
        fetch(
          `/api/workspace/larry/events?projectId=${encodeURIComponent(projectId)}&eventType=auto_executed`,
          { cache: "no-store" }
        ),
      ]);

      const sugData = await readJson<{ events?: LarryEvent[] }>(sugRes);
      const actData = await readJson<{ events?: LarryEvent[] }>(actRes);

      setSuggested(Array.isArray(sugData.events) ? sugData.events : []);
      setActivity(
        Array.isArray(actData.events) ? actData.events.slice(0, 10) : []
      );
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load Larry events.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();

    function onRefresh() {
      void load();
    }

    window.addEventListener("larry:refresh-snapshot", onRefresh);
    return () => window.removeEventListener("larry:refresh-snapshot", onRefresh);
  }, [load]);

  const accept = useCallback(
    async (id: string) => {
      setAccepting(id);
      try {
        const res = await fetch(`/api/workspace/larry/events/${id}/accept`, {
          method: "POST",
        });
        if (res.ok) {
          setSuggested((prev) => prev.filter((e) => e.id !== id));
          window.dispatchEvent(new CustomEvent("larry:refresh-snapshot"));
          await onMutate();
        }
      } finally {
        setAccepting(null);
      }
    },
    [onMutate]
  );

  const dismiss = useCallback(
    async (id: string) => {
      setDismissing(id);
      try {
        const res = await fetch(`/api/workspace/larry/events/${id}/dismiss`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (res.ok) {
          setSuggested((prev) => prev.filter((e) => e.id !== id));
          window.dispatchEvent(new CustomEvent("larry:refresh-snapshot"));
          await onMutate();
        }
      } finally {
        setDismissing(null);
      }
    },
    [onMutate]
  );

  return { suggested, activity, loading, error, accepting, dismissing, accept, dismiss };
}
