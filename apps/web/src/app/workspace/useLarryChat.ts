"use client";

import { useCallback, useState } from "react";

export type LarryIntent = "freeform" | "create_plan" | "update_scope" | "draft_follow_up" | "request_summary";

export interface LarryMessage {
  id: string;
  role: "user" | "larry";
  text: string;
  reasoning?: {
    why?: string;
    signals?: string[];
    threshold?: string;
  };
  createdAt: string;
}

interface ProactiveItem {
  id: string;
  message: string;
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return { error: text } as T;
  }
}

export function useLarryChat(projectId?: string) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<LarryMessage[]>([]);
  const [input, setInput] = useState("");
  const [intent, setIntent] = useState<LarryIntent>("freeform");
  const [busy, setBusy] = useState(false);
  const [proactiveQueue, setProactiveQueue] = useState<ProactiveItem[]>([]);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((o) => !o), []);

  const pushMessage = useCallback((text: string) => {
    const item: ProactiveItem = { id: crypto.randomUUID(), message: text };
    setProactiveQueue((q) => [...q, item]);
    setIsOpen(true);
  }, []);

  const dismissProactive = useCallback((id: string) => {
    setProactiveQueue((q) => q.filter((i) => i.id !== id));
  }, []);

  const sendMessage = useCallback(
    async (text: string, selectedIntent: LarryIntent) => {
      const userMsg: LarryMessage = {
        id: crypto.randomUUID(),
        role: "user",
        text,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setBusy(true);

      const processingMsg: LarryMessage = {
        id: "processing",
        role: "larry",
        text: "Processing…",
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, processingMsg]);

      try {
        const res = await fetch("/api/workspace/larry/commands", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            intent: selectedIntent,
            projectId: projectId || undefined,
            input: text,
            mode: "execute",
          }),
        });

        const data = await readJson<{
          summary?: { narrative?: string };
          runId?: string;
          message?: string;
          error?: string;
        }>(res);

        const responseText = res.ok
          ? (data.summary?.narrative ?? data.message ?? (data.runId ? "Got it — I've queued that. Head to the Action Center to review any proposed actions." : "Done."))
          : (data.error ?? "Something went wrong.");

        setMessages((prev) =>
          prev
            .filter((m) => m.id !== "processing")
            .concat({
              id: crypto.randomUUID(),
              role: "larry",
              text: responseText,
              createdAt: new Date().toISOString(),
            })
        );

        if (res.ok && data.runId) {
          window.dispatchEvent(new CustomEvent("larry:refresh-snapshot"));
        }
      } catch {
        setMessages((prev) =>
          prev
            .filter((m) => m.id !== "processing")
            .concat({
              id: crypto.randomUUID(),
              role: "larry",
              text: "Network error. Please try again.",
              createdAt: new Date().toISOString(),
            })
        );
      } finally {
        setBusy(false);
      }
    },
    [projectId]
  );

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      const text = input.trim();
      if (!text || text.length < 3 || busy) return;
      setInput("");
      await sendMessage(text, intent);
    },
    [input, intent, busy, sendMessage]
  );

  return {
    isOpen,
    messages,
    input,
    intent,
    busy,
    proactiveQueue,
    open,
    close,
    toggle,
    pushMessage,
    dismissProactive,
    setInput,
    setIntent,
    handleSubmit,
  };
}
