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
import { parseLarrySseStream } from "@/lib/larry-stream";
import {
  extractFileText,
  buildFileContextBlock,
} from "@/lib/extract-file-text";
import type { AttachedFile } from "@/components/larry/ChatInput";

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

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Pick the most recent conversation that matches the current chat scope.
 *
 * The API endpoint `/v1/larry/conversations` returns a mix of global and
 * project-scoped conversations for the same user (see
 * `listLarryConversationPreviews` in apps/api/src/lib/larry-ledger.ts). When
 * the FAB mounts in global scope we previously picked `convos[0]` — i.e. the
 * most recent conversation regardless of scope — which often turned out to be
 * a project conversation. Sending that project conversationId to the global
 * `/chat` endpoint causes the API to 409 with
 * "Global chat cannot reuse a project conversation.", and the FAB would loop
 * forever (bug B-001, 2026-04-20 E2E audit).
 *
 * Callers pass `projectId` = undefined for global scope and the concrete id
 * for project scope. We return the first conversation whose scope matches.
 */
export function pickLatestConversationForScope<T extends { projectId: string | null }>(
  conversations: T[],
  projectId?: string
): T | null {
  const wantProjectId = projectId ?? null;
  return (
    conversations.find((c) =>
      wantProjectId === null ? c.projectId === null : c.projectId === wantProjectId
    ) ?? null
  );
}

/**
 * Detect the scope-mismatch 409 so the client can clear its stale
 * conversationId and retry with null. Covers both direction wording emitted
 * by the API ("Global chat cannot reuse a project conversation." and
 * "Project chat cannot reuse a global conversation.").
 */
export function isScopeMismatchConflict(status: number, errorText?: string | null): boolean {
  if (status !== 409) return false;
  if (!errorText) return false;
  return /cannot reuse a (project|global) conversation/i.test(errorText);
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

  // Load conversations list + latest conversation when widget opens or project scope changes
  useEffect(() => {
    if (!isOpen) return;

    void (async () => {
      setConversationsLoading(true);
      try {
        const convos = await listLarryConversations(projectId);
        setConversations(convos);

        const existing = pickLatestConversationForScope(convos, projectId);
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
    // Defensive: bug B-002 (2026-04-20) left the FAB input permanently
    // disabled because an earlier send threw before reaching the `setBusy(false)`
    // cleanup. Resetting here guarantees the input is typable again whenever
    // the user clicks "New chat".
    setBusy(false);
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
    async (text: string, attachedFiles: AttachedFile[] = []) => {
      // Extract text from attached files and prepend as context
      let messageText = text;
      if (attachedFiles.length > 0) {
        try {
          const extracted = await Promise.all(
            attachedFiles.map((f) => extractFileText(f.file))
          );
          messageText = buildFileContextBlock(extracted) + text;
        } catch (err) {
          // If extraction fails for any file, show the error inline
          const errorMsg = err instanceof Error ? err.message : "Failed to read attached file.";
          messageText = `[File attachment error: ${errorMsg}]\n\n${text}`;
        }
      }

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

      let finalConversationId: string | null = null;
      let hadActions = false;

      try {
        // Attempt number: 0 = first try with whatever conversationId is in
        // state; 1 = retry with null conversationId after a scope-mismatch
        // 409 (bug B-001). Never loops beyond 1.
        for (let attempt = 0; attempt <= 1; attempt++) {
          const attemptConversationId =
            attempt === 0 ? (conversationId ?? undefined) : undefined;
          let didStream = false;
          let scopeMismatch = false;

          // ── Streaming path ───────────────────────────────────────────────
          try {
            const response = await streamLarryChat({
              projectId,
              message: messageText,
              conversationId: attemptConversationId,
            });

            if (response.ok && response.body) {
              didStream = true;

              for await (const event of parseLarrySseStream(response.body)) {
                switch (event.type) {
                  case "token":
                    updateStreamingMessage((prev) => ({ content: prev.content + event.delta }));
                    break;

                  case "tool_start": {
                    const chip = toolEventToChip(
                      event.id,
                      event.name,
                      event.displayText,
                      "suggested",
                      true
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
                      false
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
                      linkedActions:
                        (event.linkedActions?.length ?? 0) > 0
                          ? event.linkedActions
                          : prev.linkedActions,
                    }));
                    if ((event.actionsExecuted ?? 0) > 0 || (event.suggestionCount ?? 0) > 0) {
                      hadActions = true;
                    }
                    break;

                  case "error":
                    updateStreamingMessage((prev) => ({
                      content: prev.content || event.message,
                      streaming: false,
                    }));
                    break;
                }
              }
            } else if (attempt === 0 && response.status === 409) {
              const errorText = await response.text().catch(() => "");
              if (isScopeMismatchConflict(response.status, errorText)) {
                scopeMismatch = true;
                setConversationId(null);
              }
            }
          } catch {
            didStream = false;
          }

          // ── Fallback: non-streaming path ─────────────────────────────────
          if (!didStream && !scopeMismatch) {
            try {
              const { response, data } = await sendLarryChat({
                projectId,
                message: messageText,
                conversationId: attemptConversationId,
              });

              if (!response.ok) {
                if (
                  attempt === 0 &&
                  isScopeMismatchConflict(response.status, data.error)
                ) {
                  scopeMismatch = true;
                  setConversationId(null);
                } else {
                  updateStreamingMessage(() => ({
                    content: data.error ?? "Something went wrong.",
                    streaming: false,
                  }));
                  return;
                }
              } else {
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
              }
            } catch {
              updateStreamingMessage(() => ({
                content: "Network error. Please try again.",
                streaming: false,
              }));
              return;
            }
          }

          // Scope-mismatch retry loops once with conversationId=null;
          // anything else exits.
          if (!scopeMismatch) break;
        }

        if (finalConversationId) {
          await refreshConversations();
        }

        if (hadActions) {
          window.dispatchEvent(new CustomEvent("larry:refresh-snapshot"));
        }
      } finally {
        // Bug B-002 (2026-04-20): setBusy(false) used to live at the bottom
        // of the function. An early `return` on !response.ok (e.g. after
        // clicking "New chat" → the stale conversationId 409'd) skipped it
        // and the FAB input + send/attach/voice buttons stayed disabled
        // until a full page reload. The finally block guarantees the input
        // is usable again regardless of path taken.
        setBusy(false);
      }
    },
    [conversationId, projectId, refreshConversations]
  );

  const handleSubmit = useCallback(
    async (event?: React.FormEvent, files: AttachedFile[] = []) => {
      event?.preventDefault();
      const text = input.trim();
      if (!text || busy) return;
      setInput("");
      await sendMessage(text, files);
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
    sendMessage,
  };
}
