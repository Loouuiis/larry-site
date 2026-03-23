"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

function saveMessage(conversationId: string, role: "user" | "larry", content: string): void {
  // Fire-and-forget — persistence failures must not block the UI
  void fetch(`/api/workspace/larry/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role, content }),
  }).catch(() => undefined);
}

export function useLarryChat(projectId?: string) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<LarryMessage[]>([]);
  const [input, setInput] = useState("");
  const [intent, setIntent] = useState<LarryIntent>("freeform");
  const [busy, setBusy] = useState(false);
  const [proactiveQueue, setProactiveQueue] = useState<ProactiveItem[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);

  // Track which projectId we've already initialised for to avoid re-running
  const initializedForRef = useRef<string | undefined>(undefined);

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

  // Load or create a conversation and hydrate message history
  useEffect(() => {
    if (!isOpen) return;
    if (initializedForRef.current === (projectId ?? "")) return;
    initializedForRef.current = projectId ?? "";

    void (async () => {
      try {
        // Find the most recent conversation for this project (or global if no projectId)
        const listUrl = projectId
          ? `/api/workspace/larry/conversations?projectId=${encodeURIComponent(projectId)}`
          : "/api/workspace/larry/conversations";

        const listRes = await fetch(listUrl);
        const listData = await readJson<{ conversations?: { id: string }[] }>(listRes);
        const existing = listData.conversations?.[0];

        let convId: string;
        if (existing) {
          convId = existing.id;
        } else {
          // Create a fresh conversation
          const createRes = await fetch("/api/workspace/larry/conversations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectId: projectId ?? undefined }),
          });
          const created = await readJson<{ id?: string }>(createRes);
          if (!created.id) return;
          convId = created.id;
        }

        setConversationId(convId);

        // Load history
        const msgRes = await fetch(`/api/workspace/larry/conversations/${convId}/messages`);
        const msgData = await readJson<{ messages?: Array<{ id: string; role: string; content: string; reasoning: unknown; createdAt: string }> }>(msgRes);

        if (msgData.messages && msgData.messages.length > 0) {
          setMessages(
            msgData.messages.map((m) => ({
              id: m.id,
              role: m.role as "user" | "larry",
              text: m.content,
              reasoning: (m.reasoning as LarryMessage["reasoning"]) ?? undefined,
              createdAt: m.createdAt,
            }))
          );
        }
      } catch {
        // Non-fatal — chat still works without persistence
      }
    })();
  }, [isOpen, projectId]);

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

        // Persist both messages if we have a conversation
        if (conversationId) {
          saveMessage(conversationId, "user", text);
          saveMessage(conversationId, "larry", responseText);
        }

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
    [projectId, conversationId]
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
    conversationId,
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
