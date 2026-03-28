"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface LarryMessage {
  id: string;
  role: "user" | "larry";
  text: string;
  actionsExecuted?: number;
  suggestionCount?: number;
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

        const msgRes = await fetch(`/api/workspace/larry/conversations/${convId}/messages`);
        const msgData = await readJson<{
          messages?: Array<{ id: string; role: string; content: string; createdAt: string }>;
        }>(msgRes);

        if (msgData.messages && msgData.messages.length > 0) {
          setMessages(
            msgData.messages.map((m) => ({
              id: m.id,
              role: m.role as "user" | "larry",
              text: m.content,
              createdAt: m.createdAt,
            }))
          );
        }
      } catch {
        // Non-fatal — chat still works without persistence
      }
    })();
  }, [isOpen, projectId]);

  const loadConversation = useCallback(async (id: string) => {
    setConversationId(id);
    setMessages([]);
    setIsOpen(true);
    initializedForRef.current = undefined;
    try {
      const res = await fetch(`/api/workspace/larry/conversations/${id}/messages`);
      const data = await readJson<{
        messages?: Array<{ id: string; role: "user" | "larry"; content: string; createdAt: string }>;
      }>(res);
      setMessages(
        (data.messages ?? []).map((m) => ({
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
    async (text: string) => {
      if (!projectId) {
        // Without a projectId we can't run intelligence — show a prompt
        const prompt: LarryMessage = {
          id: crypto.randomUUID(),
          role: "larry",
          text: "Open a project to chat with Larry about it.",
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, prompt]);
        return;
      }

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

      try {
        const res = await fetch("/api/workspace/larry/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, message: text }),
        });

        const data = await readJson<{
          message?: string;
          actionsExecuted?: number;
          suggestionCount?: number;
          error?: string;
        }>(res);

        const responseText = res.ok
          ? (data.message ?? "Done.")
          : (data.error ?? "Something went wrong.");

        const larryMsg: LarryMessage = {
          id: crypto.randomUUID(),
          role: "larry",
          text: responseText,
          actionsExecuted: data.actionsExecuted,
          suggestionCount: data.suggestionCount,
          createdAt: new Date().toISOString(),
        };

        setMessages((prev) => prev.filter((m) => m.id !== "processing").concat(larryMsg));

        if (convId) {
          saveMessage(convId, "user", text);
          saveMessage(convId, "larry", responseText);
        }

        if (res.ok && (data.actionsExecuted ?? 0) > 0) {
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
      if (!text || text.length < 1 || busy) return;
      setInput("");
      await sendMessage(text);
    },
    [input, busy, sendMessage]
  );

  return {
    isOpen,
    messages,
    input,
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
    handleSubmit,
  };
}
