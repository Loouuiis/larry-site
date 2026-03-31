"use client";

import { useCallback, useEffect, useState } from "react";
import type { WorkspaceLarryEvent } from "@/app/dashboard/types";
import {
  listLarryConversations,
  listLarryMessages,
  sendLarryChat,
  type LarryClarification,
  type LarryMessage as PersistedLarryMessage,
} from "@/lib/larry";

export interface LarryMessage {
  id: string;
  role: "user" | "larry";
  content: string;
  createdAt: string;
  actorUserId: string | null;
  actorDisplayName: string | null;
  linkedActions: WorkspaceLarryEvent[];
  actionsExecuted?: number;
  suggestionCount?: number;
  clarifications?: LarryClarification[];
}

interface ProactiveItem {
  id: string;
  message: string;
}

function normalizeMessage(
  message: PersistedLarryMessage,
  meta?: Pick<LarryMessage, "actionsExecuted" | "suggestionCount" | "clarifications">
): LarryMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
    actorUserId: message.actorUserId,
    actorDisplayName: message.actorDisplayName,
    linkedActions: message.linkedActions ?? [],
    actionsExecuted: meta?.actionsExecuted,
    suggestionCount: meta?.suggestionCount,
    clarifications: meta?.clarifications,
  };
}

function createLocalMessage(input: {
  id?: string;
  role: "user" | "larry";
  content: string;
  linkedActions?: WorkspaceLarryEvent[];
  actionsExecuted?: number;
  suggestionCount?: number;
}): LarryMessage {
  return {
    id: input.id ?? crypto.randomUUID(),
    role: input.role,
    content: input.content,
    createdAt: new Date().toISOString(),
    actorUserId: null,
    actorDisplayName: null,
    linkedActions: input.linkedActions ?? [],
    actionsExecuted: input.actionsExecuted,
    suggestionCount: input.suggestionCount,
  };
}

export function useLarryChat(projectId?: string) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<LarryMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [proactiveQueue, setProactiveQueue] = useState<ProactiveItem[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((openState) => !openState), []);

  const pushMessage = useCallback((text: string) => {
    const item: ProactiveItem = { id: crypto.randomUUID(), message: text };
    setProactiveQueue((queue) => [...queue, item]);
    setIsOpen(true);
  }, []);

  const dismissProactive = useCallback((id: string) => {
    setProactiveQueue((queue) => queue.filter((item) => item.id !== id));
  }, []);

  useEffect(() => {
    setConversationId(null);
    setMessages([]);
  }, [projectId]);

  useEffect(() => {
    if (!isOpen || !projectId) return;

    void (async () => {
      try {
        const conversations = await listLarryConversations(projectId);
        const existing = conversations[0];

        if (!existing) {
          setConversationId(null);
          setMessages([]);
          return;
        }

        setConversationId(existing.id);
        const history = await listLarryMessages(existing.id);
        setMessages(history.map((message) => normalizeMessage(message)));
      } catch {
        setConversationId(null);
        setMessages([]);
      }
    })();
  }, [isOpen, projectId]);

  const loadConversation = useCallback(async (id: string) => {
    setConversationId(id);
    setMessages([]);
    setIsOpen(true);

    try {
      const history = await listLarryMessages(id);
      setMessages(history.map((message) => normalizeMessage(message)));
    } catch {
      setMessages([]);
    }
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!projectId) {
        setMessages((previous) =>
          previous.concat(
            createLocalMessage({
              role: "larry",
              content:
                "I need a project to work with. Open a project and use the Larry section inside it to chat with me, or select a project from the sidebar first.",
            })
          )
        );
        return;
      }

      const optimisticUserId = `user-${crypto.randomUUID()}`;
      const processingId = "processing";

      setMessages((previous) =>
        previous
          .filter((message) => message.id !== processingId)
          .concat(
            createLocalMessage({ id: optimisticUserId, role: "user", content: text }),
            createLocalMessage({ id: processingId, role: "larry", content: "Processing..." })
          )
      );
      setBusy(true);

      try {
        const { response, data } = await sendLarryChat({
          projectId,
          message: text,
          conversationId: conversationId ?? undefined,
        });

        if (!response.ok) {
          setMessages((previous) =>
            previous
              .filter((message) => message.id !== processingId)
              .concat(
                createLocalMessage({
                  role: "larry",
                  content: data.error ?? "Something went wrong.",
                })
              )
          );
          return;
        }

        setConversationId(data.conversationId);

        const nextUserMessage = normalizeMessage(data.userMessage);
        const nextAssistantMessage = normalizeMessage(
          {
            ...data.assistantMessage,
            linkedActions:
              data.assistantMessage.linkedActions?.length > 0
                ? data.assistantMessage.linkedActions
                : data.linkedActions,
          },
          {
            actionsExecuted: data.actionsExecuted,
            suggestionCount: data.suggestionCount,
            clarifications: data.clarifications,
          }
        );

        setMessages((previous) =>
          previous
            .filter((message) => message.id !== optimisticUserId && message.id !== processingId)
            .concat(nextUserMessage, nextAssistantMessage)
        );

        if (
          (data.actionsExecuted ?? 0) > 0 ||
          (data.suggestionCount ?? 0) > 0 ||
          (data.linkedActions?.length ?? 0) > 0
        ) {
          window.dispatchEvent(new CustomEvent("larry:refresh-snapshot"));
        }
      } catch {
        setMessages((previous) =>
          previous
            .filter((message) => message.id !== processingId)
            .concat(
              createLocalMessage({
                role: "larry",
                content: "Network error. Please try again.",
              })
            )
        );
      } finally {
        setBusy(false);
      }
    },
    [conversationId, projectId]
  );

  const handleSubmit = useCallback(
    async (event?: React.FormEvent) => {
      event?.preventDefault();
      const text = input.trim();
      if (!text || busy) return;
      setInput("");
      await sendMessage(text);
    },
    [busy, input, sendMessage]
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
