"use client";

import { useCallback, useEffect, useState } from "react";
import type { WorkspaceLarryEvent } from "@/app/dashboard/types";
import {
  listLarryConversations,
  listLarryMessages,
  sendLarryChat,
  streamLarryChat,
  type LarryClarification,
  type LarryConversation,
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
  /** True while Larry is actively generating tokens. Used to show a streaming cursor. */
  streaming?: boolean;
}

interface ProactiveItem {
  id: string;
  message: string;
}

// ── SSE event types mirroring packages/ai/src/chat.ts ───────────────────────

type ChatStreamEvent =
  | { type: "token"; delta: string }
  | { type: "tool_start"; id: string; name: string; displayText: string }
  | {
      type: "tool_done";
      id: string;
      name: string;
      success: boolean;
      actionId: string | null;
      eventType: "auto_executed" | "suggested" | "error";
      displayText: string;
      error?: string;
    }
  | {
      type: "done";
      conversationId: string;
      messageId: string;
      actionsExecuted: number;
      suggestionCount: number;
    }
  | { type: "error"; message: string };

// ── SSE stream parser ────────────────────────────────────────────────────────

async function* parseSseStream(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<ChatStreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by double newlines
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";

      for (const part of parts) {
        const dataLine = part.split("\n").find((l) => l.startsWith("data: "));
        if (!dataLine) continue;
        const jsonStr = dataLine.slice(6).trim();
        if (!jsonStr) continue;
        try {
          yield JSON.parse(jsonStr) as ChatStreamEvent;
        } catch {
          // Skip malformed events
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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
  streaming?: boolean;
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
    streaming: input.streaming,
  };
}

/** Convert a streaming tool event into a WorkspaceLarryEvent shape for chip display */
function toolEventToChip(
  id: string,
  name: string,
  displayText: string,
  eventType: WorkspaceLarryEvent["eventType"],
  streaming: boolean
): WorkspaceLarryEvent & { _streaming?: boolean } {
  return {
    id,
    projectId: "",
    projectName: null,
    eventType,
    actionType: name,
    displayText,
    reasoning: "",
    payload: {},
    executedAt: null,
    triggeredBy: "chat",
    chatMessage: null,
    createdAt: new Date().toISOString(),
    conversationId: null,
    requestMessageId: null,
    responseMessageId: null,
    requestedByUserId: null,
    requestedByName: null,
    approvedByUserId: null,
    approvedByName: null,
    approvedAt: null,
    dismissedByUserId: null,
    dismissedByName: null,
    dismissedAt: null,
    executedByKind: null,
    executedByUserId: null,
    executedByName: null,
    executionMode: eventType === "auto_executed" ? "auto" : "approval",
    sourceKind: "chat",
    sourceRecordId: null,
    _streaming: streaming,
  };
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useLarryChat(projectId?: string) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<LarryMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [proactiveQueue, setProactiveQueue] = useState<ProactiveItem[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<LarryConversation[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(false);

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

  // Reset on project change
  useEffect(() => {
    setConversationId(null);
    setMessages([]);
    setConversations([]);
  }, [projectId]);

  // Load conversations list + latest conversation when widget opens
  useEffect(() => {
    if (!isOpen) return;

    void (async () => {
      setConversationsLoading(true);
      try {
        const convos = await listLarryConversations(projectId);
        setConversations(convos);

        const existing = convos[0];
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
      } finally {
        setConversationsLoading(false);
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

  const startNewChat = useCallback(() => {
    setConversationId(null);
    setMessages([]);
    setInput("");
  }, []);

  const refreshConversations = useCallback(async () => {
    try {
      const convos = await listLarryConversations(projectId);
      setConversations(convos);
    } catch {
      // Keep existing list on error
    }
  }, [projectId]);

  const sendMessage = useCallback(
    async (text: string) => {
      const optimisticUserId = `user-${crypto.randomUUID()}`;
      const streamingLarryId = `streaming-${crypto.randomUUID()}`;

      setMessages((previous) =>
        previous
          .filter((message) => message.id !== "processing")
          .concat(
            createLocalMessage({ id: optimisticUserId, role: "user", content: text }),
            createLocalMessage({ id: streamingLarryId, role: "larry", content: "", streaming: true })
          )
      );
      setBusy(true);

      const updateStreamingMessage = (
        updater: (prev: LarryMessage) => Partial<LarryMessage>
      ) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === streamingLarryId ? { ...m, ...updater(m) } : m))
        );
      };

      // Track pending tool chips mid-stream
      const pendingChips = new Map<string, WorkspaceLarryEvent & { _streaming?: boolean }>();

      let didStream = false;
      let finalConversationId: string | null = null;
      let hadActions = false;

      // ── Attempt streaming path (project-scoped only) ─────────────────────
      if (projectId) {
        try {
          const response = await streamLarryChat({
            projectId,
            message: text,
            conversationId: conversationId ?? undefined,
          });

          if (response.ok && response.body) {
            didStream = true;

            for await (const event of parseSseStream(response.body)) {
              switch (event.type) {
                case "token":
                  updateStreamingMessage((prev) => ({ content: prev.content + event.delta }));
                  break;

                case "tool_start": {
                  const chip = toolEventToChip(
                    event.id,
                    event.name,
                    event.displayText,
                    "suggested", // pending — will update on tool_done
                    true         // _streaming: true = "Running…" badge
                  );
                  pendingChips.set(event.id, chip);
                  updateStreamingMessage((prev) => ({
                    linkedActions: [...prev.linkedActions, chip],
                  }));
                  break;
                }

                case "tool_done": {
                  const updatedChip = toolEventToChip(
                    event.id,
                    event.name,
                    event.displayText,
                    event.success
                      ? event.eventType === "auto_executed"
                        ? "auto_executed"
                        : "suggested"
                      : "suggested",
                    false // done streaming
                  );
                  pendingChips.set(event.id, updatedChip);
                  updateStreamingMessage((prev) => ({
                    linkedActions: prev.linkedActions.map((a) =>
                      a.id === event.id ? updatedChip : a
                    ),
                  }));
                  if (event.success) hadActions = true;
                  break;
                }

                case "done":
                  finalConversationId = event.conversationId;
                  setConversationId(event.conversationId);
                  updateStreamingMessage((prev) => ({
                    id: event.messageId,
                    streaming: false,
                    actionsExecuted: event.actionsExecuted,
                    suggestionCount: event.suggestionCount,
                  }));
                  // Remove the optimistic user message (real one is now in DB)
                  setMessages((prev) =>
                    prev.filter((m) => m.id !== optimisticUserId)
                  );
                  break;

                case "error":
                  // Show error inline if we haven't received any content yet
                  updateStreamingMessage((prev) => ({
                    content: prev.content || event.message,
                    streaming: false,
                  }));
                  break;
              }
            }
          } else {
            // Non-200 from stream endpoint — fall back below
            didStream = false;
          }
        } catch {
          // Network error on streaming path — fall back below
          didStream = false;
        }
      }

      // ── Fallback: non-streaming path (global chat or stream failure) ──────
      if (!didStream) {
        try {
          const { response, data } = await sendLarryChat({
            projectId,
            message: text,
            conversationId: conversationId ?? undefined,
          });

          if (!response.ok) {
            updateStreamingMessage(() => ({
              content: data.error ?? "Something went wrong.",
              streaming: false,
            }));
            return;
          }

          finalConversationId = data.conversationId;
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
              .filter((m) => m.id !== optimisticUserId && m.id !== streamingLarryId)
              .concat(nextUserMessage, nextAssistantMessage)
          );

          if ((data.actionsExecuted ?? 0) > 0 || (data.suggestionCount ?? 0) > 0) {
            hadActions = true;
          }
        } catch {
          updateStreamingMessage(() => ({
            content: "Network error. Please try again.",
            streaming: false,
          }));
        }
      }

      // ── Cleanup ───────────────────────────────────────────────────────────
      setBusy(false);

      if (finalConversationId) {
        await refreshConversations();
      }

      if (hadActions) {
        window.dispatchEvent(new CustomEvent("larry:refresh-snapshot"));
      }
    },
    [conversationId, projectId, refreshConversations]
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
    conversations,
    conversationsLoading,
    open,
    close,
    toggle,
    pushMessage,
    dismissProactive,
    loadConversation,
    startNewChat,
    setInput,
    handleSubmit,
  };
}
