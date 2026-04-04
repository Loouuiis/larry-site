"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MessageSquare, Plus, Users, User, Layers } from "lucide-react";
import {
  type ColleagueConversation,
  type ColleagueMessage,
  listConversations,
  listMessages,
  sendMessage,
} from "@/lib/colleague-chat";
import { ChatInput, type AttachedFile } from "@/components/larry/ChatInput";

/* ─── Helpers ──────────────────────────────────────────────────── */

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "";
  const value = new Date(dateStr);
  const diffMs = Date.now() - value.getTime();
  const diffMins = Math.max(0, Math.floor(diffMs / 60_000));
  if (diffMins < 1) return "Now";
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  if (diffHours < 48) return "Yesterday";
  return value.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function conversationDisplayName(c: ColleagueConversation): string {
  if (c.type === "group" && c.name) return c.name;
  return c.members.map((m) => m.name.split(" ")[0]).join(", ") || "New chat";
}

function senderInitials(name: string): string {
  const parts = name.split(" ");
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/* ─── Page ─────────────────────────────────────────────────────── */

export default function ColleagueChatsPage() {
  const [conversations, setConversations] = useState<ColleagueConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ColleagueMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId],
  );

  // Load conversations
  useEffect(() => {
    let cancelled = false;
    void listConversations()
      .then((items) => {
        if (cancelled) return;
        setConversations(items);
        if (items.length > 0 && !selectedId) setSelectedId(items[0].id);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load messages when selection changes
  useEffect(() => {
    if (!selectedId) { setMessages([]); return; }
    let cancelled = false;
    setMessagesLoading(true);
    void listMessages(selectedId)
      .then((items) => { if (!cancelled) setMessages(items); })
      .finally(() => { if (!cancelled) setMessagesLoading(false); });
    return () => { cancelled = true; };
  }, [selectedId]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSubmit() {
    const text = input.trim();
    if (busy || text.length < 1 || !selectedId) return;
    setBusy(true);
    setInput("");
    try {
      const result = await sendMessage(selectedId, text);
      setMessages((prev) => [
        ...prev,
        result.userMessage,
        ...(result.larryMessage ? [result.larryMessage] : []),
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="min-h-0 overflow-hidden"
      style={{ background: "var(--page-bg)", padding: "24px", height: "100%" }}
    >
      <div style={{ display: "flex", height: "100%", width: "100%", maxWidth: "1440px", margin: "0 auto" }}>
        <div style={{ display: "grid", flex: 1, minHeight: 0, gap: "20px", gridTemplateColumns: "280px minmax(0,1fr)" }}>

          {/* ── Left panel: Conversation list ── */}
          <aside
            style={{
              display: "flex", flexDirection: "column", minHeight: 0,
              borderRadius: "var(--radius-card)", border: "1px solid var(--border)",
              background: "var(--surface)", overflow: "hidden",
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: "16px", borderBottom: "1px solid var(--border)",
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px",
              }}
            >
              <h2 style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-1)" }}>Chats</h2>
              <button
                type="button"
                style={{
                  width: "28px", height: "28px", borderRadius: "8px", background: "#6c44f6",
                  color: "white", display: "flex", alignItems: "center", justifyContent: "center",
                  border: "none", cursor: "pointer",
                }}
                title="New chat"
              >
                <Plus size={14} />
              </button>
            </div>

            {/* Conversation list */}
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px" }}>
              {!loading && conversations.length === 0 && (
                <div style={{ padding: "40px 16px", textAlign: "center" }}>
                  <MessageSquare size={24} style={{ margin: "0 auto", color: "#6c44f6", opacity: 0.4 }} />
                  <p style={{ marginTop: "12px", fontSize: "13px", fontWeight: 600, color: "var(--text-1)" }}>No conversations yet</p>
                  <p style={{ marginTop: "6px", fontSize: "12px", lineHeight: "1.5", color: "var(--text-muted)" }}>
                    Start a chat with a colleague.
                  </p>
                </div>
              )}

              {conversations.map((c) => {
                const active = c.id === selectedId;
                const ConvIcon = c.type === "group" ? Users : User;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    style={{
                      width: "100%", borderRadius: "8px", border: "none",
                      background: active ? "rgba(108,68,246,0.12)" : "transparent",
                      padding: "10px", textAlign: "left", cursor: "pointer",
                      display: "flex", alignItems: "center", gap: "10px",
                      transition: "background 0.15s", marginBottom: "2px",
                    }}
                    onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "rgba(108,68,246,0.06)"; }}
                    onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
                  >
                    <div
                      style={{
                        flexShrink: 0, width: "36px", height: "36px", borderRadius: "10px",
                        background: active ? "#6c44f6" : "var(--surface-2)",
                        color: active ? "#fff" : "var(--text-muted)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >
                      <ConvIcon size={16} />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" }}>
                        <p style={{
                          fontSize: "13px", fontWeight: 500,
                          color: active ? "#6c44f6" : "var(--text-1)",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {conversationDisplayName(c)}
                        </p>
                        <span style={{ flexShrink: 0, fontSize: "10px", color: "var(--text-muted)" }}>
                          {formatDate(c.lastMessageAt)}
                        </span>
                      </div>
                      {c.lastMessage && (
                        <p style={{
                          marginTop: "2px", fontSize: "12px", color: "var(--text-muted)",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {c.lastMessage}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* ── Right panel: Active thread ── */}
          <section
            style={{
              display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden",
              borderRadius: "var(--radius-card)", border: "1px solid var(--border)",
              background: "var(--surface)",
            }}
          >
            {/* Thread header */}
            <div
              style={{
                borderBottom: "1px solid var(--border)", background: "var(--surface)",
                padding: "14px 20px", display: "flex", alignItems: "center", gap: "10px",
              }}
            >
              {activeConversation ? (
                <>
                  <div
                    style={{
                      flexShrink: 0, display: "flex", height: "32px", width: "32px",
                      alignItems: "center", justifyContent: "center", borderRadius: "8px",
                      background: "var(--surface-2)", color: "var(--text-muted)",
                    }}
                  >
                    {activeConversation.type === "group" ? <Users size={15} /> : <User size={15} />}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <h2 style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-1)" }}>
                      {conversationDisplayName(activeConversation)}
                    </h2>
                    {activeConversation.type === "group" && (
                      <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                        {activeConversation.members.length} members
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <h2 style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-muted)" }}>
                  Select a conversation
                </h2>
              )}
            </div>

            {/* Messages */}
            <div style={{ display: "flex", flex: 1, flexDirection: "column", minHeight: 0, background: "var(--page-bg)" }}>
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "20px 24px" }}>
                {messagesLoading && (
                  <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>Loading...</p>
                )}

                {!messagesLoading && !selectedId && (
                  <div style={{ display: "flex", height: "100%", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
                    <MessageSquare size={32} style={{ color: "var(--text-disabled)" }} />
                    <p style={{ marginTop: "12px", fontSize: "14px", color: "var(--text-muted)" }}>
                      Pick a conversation to start chatting
                    </p>
                  </div>
                )}

                {!messagesLoading && selectedId && messages.length === 0 && (
                  <div style={{ display: "flex", height: "100%", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
                    <MessageSquare size={32} style={{ color: "var(--text-disabled)" }} />
                    <p style={{ marginTop: "12px", fontSize: "14px", color: "var(--text-muted)" }}>
                      No messages yet — say hello!
                    </p>
                  </div>
                )}

                {!messagesLoading && messages.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {messages.map((msg) => {
                      const isSelf = msg.senderId === "self";
                      const isLarry = msg.role === "larry";

                      return (
                        <div key={msg.id} className={`flex ${isSelf ? "justify-end" : "justify-start"}`}>
                          <div style={{ display: "flex", alignItems: "flex-end", gap: "8px", maxWidth: "75%" }}>
                            {/* Avatar for others */}
                            {!isSelf && (
                              <div
                                style={{
                                  flexShrink: 0, width: "28px", height: "28px", borderRadius: "8px",
                                  background: isLarry ? "#6c44f6" : "var(--surface-2)",
                                  color: isLarry ? "#fff" : "var(--text-muted)",
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                  fontSize: "10px", fontWeight: 600,
                                }}
                              >
                                {isLarry ? <Layers size={13} /> : senderInitials(msg.senderName)}
                              </div>
                            )}

                            {/* Bubble */}
                            <div
                              style={{
                                borderRadius: "18px",
                                padding: "10px 14px",
                                fontSize: "14px",
                                lineHeight: "1.55",
                                ...(isSelf
                                  ? { background: "#6c44f6", color: "#ffffff", borderTopRightRadius: "4px" }
                                  : isLarry
                                    ? { background: "#f3f0ff", color: "var(--text-1)", border: "1px solid #e5e0fa", borderTopLeftRadius: "4px" }
                                    : { background: "var(--surface-2)", color: "var(--text-1)", border: "1px solid var(--border)", borderTopLeftRadius: "4px" }),
                              }}
                            >
                              {!isSelf && (
                                <p style={{ marginBottom: "4px", fontSize: "11px", fontWeight: 600, color: isLarry ? "#6c44f6" : "var(--text-muted)" }}>
                                  {msg.senderName}
                                </p>
                              )}
                              <p>{msg.content}</p>
                              <p style={{ marginTop: "4px", fontSize: "10px", textAlign: isSelf ? "right" : "left", color: isSelf ? "rgba(255,255,255,0.6)" : "var(--text-disabled)" }}>
                                {formatDate(msg.createdAt)}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* @Larry hint */}
              {selectedId && (
                <div style={{ padding: "0 20px" }}>
                  <p style={{ fontSize: "11px", color: "var(--text-disabled)", padding: "4px 0", display: "flex", alignItems: "center", gap: "4px" }}>
                    <Layers size={10} />
                    Type <span style={{ fontWeight: 600, color: "var(--text-muted)" }}>@Larry</span> to ask Larry in this chat
                  </p>
                </div>
              )}

              {/* Input */}
              {selectedId && (
                <ChatInput
                  value={input}
                  onChange={setInput}
                  onSubmit={handleSubmit}
                  disabled={busy}
                  busy={busy}
                  placeholder="Message..."
                  files={files}
                  onFilesChange={setFiles}
                  variant="full"
                />
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
