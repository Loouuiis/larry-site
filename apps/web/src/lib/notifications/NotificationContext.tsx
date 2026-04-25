"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Notification } from "@larry/shared";

interface Ctx {
  items: Notification[];
  unreadCount: number;
  notify: (n: Notification) => void;
  markRead: (ids: string[] | "all") => Promise<void>;
  dismiss: (ids: string[]) => Promise<void>;
  bannerQueue: Notification[];
  consumeBanner: (id: string) => void;
}

const NotificationContext = createContext<Ctx | null>(null);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Notification[]>([]);
  const [bannerQueue, setBannerQueue] = useState<Notification[]>([]);
  const seenIds = useRef<Set<string>>(new Set());
  const lastFetched = useRef<string | null>(null);

  const apply = useCallback((fresh: Notification[]) => {
    const newOnes: Notification[] = [];
    setItems((prev) => {
      const map = new Map(prev.map((n) => [n.id, n]));
      for (const n of fresh) {
        if (!map.has(n.id)) newOnes.push(n);
        map.set(n.id, n);
      }
      return Array.from(map.values()).sort(
        (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)
      );
    });
    setBannerQueue((q) => [
      ...q,
      ...newOnes.filter((n) => !seenIds.current.has(n.id)),
    ]);
    for (const n of newOnes) seenIds.current.add(n.id);
  }, []);

  const fetchOnce = useCallback(async () => {
    const url = lastFetched.current
      ? `/api/workspace/notifications/feed?since=${encodeURIComponent(lastFetched.current)}`
      : `/api/workspace/notifications/feed`;
    let res: Response;
    try {
      res = await fetch(url, { credentials: "include", cache: "no-store" });
    } catch {
      return;
    }
    if (!res.ok) return;
    const data = (await res.json()) as {
      items?: Notification[];
      serverTime?: string;
    };
    if (Array.isArray(data.items)) apply(data.items);
    if (typeof data.serverTime === "string") lastFetched.current = data.serverTime;
  }, [apply]);

  useEffect(() => {
    let interval: number | undefined;
    const start = () => {
      void fetchOnce();
      interval = window.setInterval(() => {
        void fetchOnce();
      }, 20_000);
    };
    const stop = () => {
      if (interval) window.clearInterval(interval);
      interval = undefined;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchOnce]);

  const notify = useCallback(
    (n: Notification) => {
      apply([n]);
    },
    [apply]
  );

  const markRead = useCallback(async (ids: string[] | "all") => {
    const body = ids === "all" ? { all: true } : { ids };
    try {
      await fetch("/api/workspace/notifications/read", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      return;
    }
    setItems((prev) =>
      prev.map((n) =>
        ids === "all" || (Array.isArray(ids) && ids.includes(n.id))
          ? { ...n, readAt: n.readAt ?? new Date().toISOString() }
          : n
      )
    );
  }, []);

  const dismiss = useCallback(async (ids: string[]) => {
    try {
      await fetch("/api/workspace/notifications/dismiss", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids }),
      });
    } catch {
      return;
    }
    setItems((prev) => prev.filter((n) => !ids.includes(n.id)));
  }, []);

  const consumeBanner = useCallback((id: string) => {
    setBannerQueue((q) => q.filter((n) => n.id !== id));
  }, []);

  const unreadCount = useMemo(
    () => items.filter((n) => !n.readAt && !n.dismissedAt).length,
    [items]
  );

  const value = useMemo<Ctx>(
    () => ({ items, unreadCount, notify, markRead, dismiss, bannerQueue, consumeBanner }),
    [items, unreadCount, notify, markRead, dismiss, bannerQueue, consumeBanner]
  );

  return (
    <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
  );
}

export function useNotifications(): Ctx {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error("useNotifications must be used within NotificationProvider");
  }
  return ctx;
}
