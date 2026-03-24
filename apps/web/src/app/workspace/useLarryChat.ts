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

async function persistMessage(conversationId: string, role: "user" | "larry", content: string) {
  try {
    await fetch(`/api/workspace/larry/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, content }),
    });
  } catch {
    // best-effort — don't block the UI
  }
}

export function useLarryChat(projectId?: string) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<LarryMessage[]>([]);
  const [input, setInput] = useState("");
  const [intent, setIntent] = useState<LarryIntent>("freeform");
  const [busy, setBusy] = useState(false);
  const [proactiveQueue, setProactiveQueue] = useState<ProactiveItem[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);

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

  const loadConversation = useCallback(async (id: string) => {
    setConversationId(id);
    setMessages([]);
    setIsOpen(true);
    try {
      const res = await fetch(`/api/workspace/larry/conversations/${id}/messages`);
      const data = await readJson<{
        items?: Array<{ id: string; role: "user" | "larry"; content: string; createdAt: string }>;
      }>(res);
      setMessages(
        (data.items ?? []).map((m) => ({
          id: m.id,
          role: m.role,
          text: m.content,
          createdAt: m.createdAt,
        }))
      );
    } catch {
      // ignore
    }
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
      setMessages((prev) => [
        ...prev,
        { id: "processing", role: "larry", text: "Processing…", createdAt: new Date().toISOString() },
      ]);

      // Create a conversation on the first message if we don't have one yet
      let convId = conversationId;
      if (!convId) {
        try {
          const res = await fetch("/api/workspace/larry/conversations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              projectId: projectId || undefined,
              title: text.slice(0, 80),
            }),
          });
          const data = await readJson<{ id?: string }>(res);
          if (data.id) {
            convId = data.id;
            setConversationId(data.id);
          }
        } catch {
          // continue without persistence
        }
      }

      if (convId) void persistMessage(convId, "user", text);

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

        const larryMsg: LarryMessage = {
          id: crypto.randomUUID(),
          role: "larry",
          text: responseText,
          createdAt: new Date().toISOString(),
        };

        setMessages((prev) => prev.filter((m) => m.id !== "processing").concat(larryMsg));

        if (convId) void persistMessage(convId, "larry", responseText);

        if (res.ok && data.runId) {
          window.dispatchEvent(new CustomEvent("larry:refresh-snapshot"));
        }
      } catch {
        setMessages((prev) =>
          prev.filter((m) => m.id !== "processing").concat({
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
    loadConversation,
    setInput,
    setIntent,
    handleSubmit,
  };
}
