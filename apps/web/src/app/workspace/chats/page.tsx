"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Clock3,
  MessageSquare,
  Plus,
  Sparkles,
} from "lucide-react";
import {
  createLarryConversation,
  type LarryConversation,
  type LarryMessage,
  listLarryConversations,
  listLarryMessages,
  readJson,
  saveLarryMessage,
  sendLarryChat,
} from "@/lib/larry";

interface WorkspaceProject {
  id: string;
  name: string;
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "Just now";

  const value = new Date(dateStr);
  const diffMs = Date.now() - value.getTime();
  const diffMins = Math.max(0, Math.floor(diffMs / 60_000));

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffHours < 48) return "Yesterday";

  return value.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function getConversationTitle(conversation: LarryConversation): string {
  if (conversation.title?.trim()) return conversation.title.trim();
  if (conversation.lastMessagePreview?.trim()) {
    return conversation.lastMessagePreview.trim().slice(0, 56);
  }
  return "New conversation";
}

function getConversationPreview(conversation: LarryConversation): string {
  return conversation.lastMessagePreview?.trim() || "No messages yet.";
}

function buildProjectLabel(
  projectId: string | null | undefined,
  projectNameById: Map<string, string>
): string {
  if (!projectId) return "General";
  return projectNameById.get(projectId) ?? "Project";
}

function MessageBubble({ message }: { message: LarryMessage }) {
  const isLarry = message.role === "larry";
  const isProcessing = message.id === "processing";

  return (
    <div className={`flex ${isLarry ? "justify-start" : "justify-end"}`}>
      <div
        style={{
          maxWidth: "75%",
          borderRadius: "18px",
          padding: "10px 14px",
          fontSize: "14px",
          lineHeight: "1.55",
          ...(isLarry
            ? {
                background: "var(--surface-2)",
                color: "var(--text-1)",
                border: "1px solid var(--border)",
                borderTopLeftRadius: "4px",
              }
            : {
                background: "var(--cta)",
                color: "#ffffff",
                borderTopRightRadius: "4px",
              }),
        }}
      >
        {isProcessing ? (
          <span className="flex items-center gap-1 py-1">
            <span
              className="h-1.5 w-1.5 rounded-full animate-bounce"
              style={{ background: "var(--cta)", animationDelay: "0ms" }}
            />
            <span
              className="h-1.5 w-1.5 rounded-full animate-bounce"
              style={{ background: "var(--cta)", animationDelay: "120ms" }}
            />
            <span
              className="h-1.5 w-1.5 rounded-full animate-bounce"
              style={{ background: "var(--cta)", animationDelay: "240ms" }}
            />
          </span>
        ) : (
          <p>{message.content}</p>
        )}
      </div>
    </div>
  );
}

export default function ChatsPage() {
  const searchParams = useSearchParams();
  const preferredProjectId = searchParams.get("projectId");
  const draftFromQuery = searchParams.get("draft")?.trim() ?? "";

  const [projects, setProjects] = useState<WorkspaceProject[]>([]);
  const [conversations, setConversations] = useState<LarryConversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [draftProjectId, setDraftProjectId] = useState<string | null>(null);
  const [messages, setMessages] = useState<LarryMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [messageLoading, setMessageLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const initializedRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const projectNameById = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name])),
    [projects]
  );

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedConversationId) ?? null,
    [conversations, selectedConversationId]
  );

  const activeProjectId =
    activeConversation?.projectId ?? draftProjectId ?? preferredProjectId ?? null;
  const activeProjectLabel = buildProjectLabel(activeProjectId, projectNameById);

  const groupedConversations = useMemo(() => {
    const groups = new Map<string, { label: string; conversations: LarryConversation[] }>();

    for (const conversation of conversations) {
      const groupKey = conversation.projectId ?? "__general__";
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          label: buildProjectLabel(conversation.projectId, projectNameById),
          conversations: [],
        });
      }
      groups.get(groupKey)?.conversations.push(conversation);
    }

    return Array.from(groups.entries()).map(([key, value]) => ({
      key,
      label: value.label,
      conversations: value.conversations,
    }));
  }, [conversations, projectNameById]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [conversationItems, projectsResponse] = await Promise.all([
          listLarryConversations(),
          fetch("/api/workspace/projects", { cache: "no-store" }),
        ]);
        const projectsData = await readJson<{ items?: WorkspaceProject[]; error?: string }>(projectsResponse);

        if (cancelled) return;

        setConversations(conversationItems);
        setProjects(projectsResponse.ok ? projectsData.items ?? [] : []);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load Larry chats.");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loading || initializedRef.current) return;

    if (draftFromQuery) {
      setSelectedConversationId(null);
      setDraftProjectId(preferredProjectId);
      setMessages([]);
      setInput(draftFromQuery);
      initializedRef.current = true;
      return;
    }

    const preferredConversation = preferredProjectId
      ? conversations.find((conversation) => conversation.projectId === preferredProjectId)
      : null;

    if (preferredConversation) {
      setSelectedConversationId(preferredConversation.id);
      setDraftProjectId(preferredConversation.projectId);
      initializedRef.current = true;
      return;
    }

    if (conversations[0]) {
      setSelectedConversationId(conversations[0].id);
      setDraftProjectId(conversations[0].projectId);
      initializedRef.current = true;
      return;
    }

    if (preferredProjectId) {
      setDraftProjectId(preferredProjectId);
    }

    initializedRef.current = true;
  }, [conversations, draftFromQuery, loading, preferredProjectId]);

  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([]);
      setMessageLoading(false);
      return;
    }

    let cancelled = false;
    setMessageLoading(true);
    setError(null);

    void listLarryMessages(selectedConversationId)
      .then((items) => {
        if (!cancelled) {
          setMessages(items);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setMessages([]);
          setError(err instanceof Error ? err.message : "Failed to load chat history.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setMessageLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedConversationId]);

  async function refreshConversations(preferredId?: string | null) {
    const next = await listLarryConversations();
    setConversations(next);
    if (preferredId && next.some((conversation) => conversation.id === preferredId)) {
      setSelectedConversationId(preferredId);
    }
  }

  function startNewChat(projectId: string | null = preferredProjectId) {
    setSelectedConversationId(null);
    setDraftProjectId(projectId);
    setMessages([]);
    setError(null);
    setInput("");
  }

  function selectConversation(conversation: LarryConversation) {
    setSelectedConversationId(conversation.id);
    setDraftProjectId(conversation.projectId);
    setError(null);
  }

  async function handleSubmit(event?: React.FormEvent) {
    event?.preventDefault();
    const text = input.trim();
    if (busy || text.length < 1) return;
    if (!activeProjectId) {
      setError("Select a project to chat with Larry about it.");
      return;
    }

    setBusy(true);
    setError(null);
    setInput("");

    let conversationId = selectedConversationId;

    try {
      if (!conversationId) {
        const created = await createLarryConversation({
          projectId: activeProjectId,
          title: text.slice(0, 80),
        });
        conversationId = created.id;
        setSelectedConversationId(created.id);
      }

      const userMessage: LarryMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        createdAt: new Date().toISOString(),
      };

      setMessages((current) => [
        ...current,
        userMessage,
        {
          id: "processing",
          role: "larry",
          content: "Processing...",
          createdAt: new Date().toISOString(),
        },
      ]);

      await saveLarryMessage(conversationId, "user", text).catch(() => undefined);

      const { response, data } = await sendLarryChat({
        projectId: activeProjectId,
        message: text,
      });

      const replyText = response.ok ? (data.message ?? "Done.") : (data.error ?? "Something went wrong.");
      const larryReply: LarryMessage = {
        id: crypto.randomUUID(),
        role: "larry",
        content: replyText,
        createdAt: new Date().toISOString(),
      };

      setMessages((current) =>
        current.filter((message) => message.id !== "processing").concat(larryReply)
      );

      await saveLarryMessage(conversationId, "larry", replyText).catch(() => undefined);
      await refreshConversations(conversationId);

      if (response.ok && (data.actionsExecuted ?? 0) > 0) {
        window.dispatchEvent(new CustomEvent("larry:refresh-snapshot"));
      }
    } catch (err) {
      setMessages((current) =>
        current
          .filter((message) => message.id !== "processing")
          .concat({
            id: crypto.randomUUID(),
            role: "larry",
            content: "Network error. Please try again.",
            createdAt: new Date().toISOString(),
          })
      );
      setError(err instanceof Error ? err.message : "Failed to send message.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="min-h-0 flex-1 overflow-y-auto"
      style={{ background: "var(--page-bg)", padding: "24px" }}
    >
      <div style={{ display: "flex", minHeight: "100%", width: "100%", maxWidth: "1440px", margin: "0 auto", flexDirection: "column", gap: "20px" }}>
        {error && (
          <div
            style={{
              borderRadius: "var(--radius-card)",
              border: "1px solid #fecaca",
              background: "#fef2f2",
              padding: "12px 16px",
              fontSize: "13px",
              color: "#b91c1c",
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            display: "grid",
            minHeight: "720px",
            gap: "20px",
            gridTemplateColumns: "300px minmax(0,1fr)",
          }}
        >
          {/* Sidebar */}
          <aside
            style={{
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
              borderRadius: "var(--radius-card)",
              border: "1px solid var(--border)",
              background: "var(--surface)",
              overflow: "hidden",
            }}
          >
            {/* Sidebar header */}
            <div
              style={{
                padding: "16px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "8px",
              }}
            >
              <h2 className="text-h1">Chats</h2>
              <button
                type="button"
                onClick={() => startNewChat(activeProjectId)}
                className="pm-btn pm-btn-sm pm-btn-primary"
                style={{ height: "28px", display: "inline-flex", alignItems: "center", gap: "4px" }}
              >
                <Plus size={12} />
                New Chat
              </button>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "12px" }}>
              {!loading && conversations.length === 0 && (
                <div
                  style={{
                    borderRadius: "var(--radius-card)",
                    border: "1px dashed var(--border)",
                    background: "var(--surface-2)",
                    padding: "40px 20px",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      margin: "0 auto",
                      display: "flex",
                      height: "40px",
                      width: "40px",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: "10px",
                      background: "#e8f0ff",
                      color: "var(--cta)",
                    }}
                  >
                    <Sparkles size={18} />
                  </div>
                  <p
                    style={{
                      marginTop: "12px",
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "var(--text-1)",
                    }}
                  >
                    No saved chats yet
                  </p>
                  <p
                    style={{
                      marginTop: "6px",
                      fontSize: "12px",
                      lineHeight: "1.5",
                      color: "var(--text-muted)",
                    }}
                  >
                    Start a conversation and Larry will keep it grouped by project.
                  </p>
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {groupedConversations.map((group) => (
                  <div key={group.key}>
                    {/* Group header — caption style */}
                    <p
                      style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.12em",
                        color: "var(--text-disabled)",
                        padding: "0 4px",
                        marginBottom: "6px",
                      }}
                    >
                      {group.label}
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      {group.conversations.map((conversation) => {
                        const active = conversation.id === selectedConversationId;
                        return (
                          <button
                            key={conversation.id}
                            type="button"
                            onClick={() => selectConversation(conversation)}
                            style={{
                              width: "100%",
                              borderRadius: "var(--radius-btn)",
                              border: `1px solid ${active ? "var(--cta)" : "var(--border)"}`,
                              background: active ? "#EBF5FF" : "var(--surface)",
                              padding: "8px 10px",
                              textAlign: "left",
                              cursor: "pointer",
                              height: "60px",
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              transition: "border-color 0.15s, background 0.15s",
                            }}
                          >
                            <div
                              style={{
                                flexShrink: 0,
                                display: "flex",
                                height: "28px",
                                width: "28px",
                                alignItems: "center",
                                justifyContent: "center",
                                borderRadius: "6px",
                                background: active ? "var(--cta)" : "var(--surface-2)",
                                color: active ? "#fff" : "var(--text-muted)",
                              }}
                            >
                              <MessageSquare size={13} />
                            </div>
                            <div style={{ minWidth: 0, flex: 1, overflow: "hidden" }}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" }}>
                                <p
                                  style={{
                                    fontSize: "13px",
                                    fontWeight: 600,
                                    color: "var(--text-1)",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {getConversationTitle(conversation)}
                                </p>
                                <span
                                  style={{
                                    flexShrink: 0,
                                    fontSize: "11px",
                                    color: "var(--text-muted)",
                                  }}
                                >
                                  {formatDate(conversation.lastMessageAt ?? conversation.updatedAt)}
                                </span>
                              </div>
                              <p
                                style={{
                                  marginTop: "2px",
                                  fontSize: "12px",
                                  color: "var(--text-muted)",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {getConversationPreview(conversation)}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>

          {/* Active thread */}
          <section
            style={{
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
              overflow: "hidden",
              borderRadius: "var(--radius-card)",
              border: "1px solid var(--border)",
              background: "var(--surface)",
            }}
          >
            {/* Thread header — flat white, no gradient */}
            <div
              style={{
                borderBottom: "1px solid var(--border)",
                background: "var(--surface)",
                padding: "14px 20px",
                display: "flex",
                alignItems: "center",
                gap: "10px",
              }}
            >
              <div
                style={{
                  flexShrink: 0,
                  display: "flex",
                  height: "32px",
                  width: "32px",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "8px",
                  background: "var(--surface-2)",
                  color: "var(--brand)",
                }}
              >
                <Sparkles size={15} />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                {/* Project name chip */}
                <span
                  style={{
                    display: "inline-block",
                    fontSize: "11px",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    color: "var(--text-muted)",
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-badge)",
                    padding: "1px 8px",
                    marginBottom: "2px",
                  }}
                >
                  {activeProjectId ? activeProjectLabel : "General workspace"}
                </span>
                <h2
                  style={{
                    fontSize: "16px",
                    fontWeight: 600,
                    color: "var(--text-1)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {activeConversation ? getConversationTitle(activeConversation) : "Fresh conversation"}
                </h2>
              </div>
            </div>

            <div style={{ display: "flex", flex: 1, flexDirection: "column", minHeight: 0, background: "var(--page-bg)" }}>
              {/* Messages */}
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "20px 24px" }}>
                {messageLoading && (
                  <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>Loading conversation...</p>
                )}

                {!messageLoading && messages.length === 0 && (
                  <div
                    style={{
                      display: "flex",
                      height: "100%",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      textAlign: "center",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        height: "56px",
                        width: "56px",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: "var(--radius-card)",
                        background: "var(--surface-2)",
                        color: "var(--brand)",
                      }}
                    >
                      <Sparkles size={24} />
                    </div>
                    <p
                      style={{
                        marginTop: "16px",
                        fontSize: "16px",
                        fontWeight: 600,
                        color: "var(--text-1)",
                      }}
                    >
                      Start a new Larry thread
                    </p>
                    <p
                      style={{
                        marginTop: "8px",
                        maxWidth: "400px",
                        fontSize: "13px",
                        lineHeight: "1.5",
                        color: "var(--text-2)",
                      }}
                    >
                      Tell Larry what to do — it will act immediately and report back. Select a project to get started.
                    </p>
                  </div>
                )}

                {!messageLoading && messages.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {messages.map((message) => (
                      <MessageBubble key={message.id} message={message} />
                    ))}
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Input area */}
              <div
                style={{
                  borderTop: "1px solid var(--border)",
                  background: "var(--surface)",
                  padding: "16px 20px",
                }}
              >
                <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {/* Textarea */}
                  <div
                    style={{
                      borderRadius: "var(--radius-btn)",
                      border: "1px solid var(--border-2)",
                      background: "var(--surface-2)",
                      padding: "10px 12px",
                    }}
                  >
                    <textarea
                      value={input}
                      onChange={(event) => setInput(event.target.value)}
                      placeholder="Message Larry..."
                      disabled={busy}
                      aria-label="Message Larry"
                      rows={4}
                      style={{
                        width: "100%",
                        resize: "none",
                        border: 0,
                        background: "transparent",
                        fontSize: "14px",
                        color: "var(--text-1)",
                        outline: "none",
                      }}
                    />
                  </div>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                    <p style={{ fontSize: "12px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "4px" }}>
                      <Clock3 size={11} />
                      {activeProjectId ? `${activeProjectLabel} context` : "No project context"}
                    </p>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <button
                        type="button"
                        onClick={() => startNewChat(activeProjectId)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          borderRadius: "var(--radius-btn)",
                          border: "1px solid var(--border)",
                          background: "var(--surface)",
                          padding: "0 12px",
                          height: "34px",
                          fontSize: "12px",
                          fontWeight: 600,
                          color: "var(--text-2)",
                          cursor: "pointer",
                        }}
                      >
                        <Plus size={12} />
                        New thread
                      </button>
                      <button
                        type="submit"
                        disabled={busy || input.trim().length < 1 || !activeProjectId}
                        className="pm-btn pm-btn-primary"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          height: "34px",
                        }}
                      >
                        <Sparkles size={13} />
                        {busy ? "Sending..." : "Send to Larry"}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
