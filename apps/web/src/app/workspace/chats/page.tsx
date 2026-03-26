"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Bot,
  Clock3,
  FileText,
  LayoutGrid,
  ListChecks,
  MessageSquare,
  Plus,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import {
  buildLarryResponseText,
  createLarryConversation,
  type LarryConversation,
  type LarryIntent,
  type LarryMessage,
  listLarryConversations,
  listLarryMessages,
  readJson,
  saveLarryMessage,
  sendLarryCommand,
} from "@/lib/larry";

const INTENT_OPTIONS: Array<{
  value: LarryIntent;
  label: string;
  icon: React.ElementType;
}> = [
  { value: "freeform", label: "Ask", icon: WandSparkles },
  { value: "create_plan", label: "Plan", icon: ListChecks },
  { value: "update_scope", label: "Scope", icon: LayoutGrid },
  { value: "draft_follow_up", label: "Follow-up", icon: Bot },
  { value: "request_summary", label: "Summary", icon: FileText },
];

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
        className={[
          "max-w-[85%] rounded-[22px] px-4 py-3 text-[13px] leading-relaxed shadow-sm",
          isLarry
            ? "rounded-tl-md border border-[#d9e3f5] bg-[#f4f8ff] text-[var(--pm-text)]"
            : "rounded-tr-md bg-[#0f62fe] text-white",
        ].join(" ")}
      >
        {isProcessing ? (
          <span className="flex items-center gap-1 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-[#0f62fe] animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="h-1.5 w-1.5 rounded-full bg-[#0f62fe] animate-bounce" style={{ animationDelay: "120ms" }} />
            <span className="h-1.5 w-1.5 rounded-full bg-[#0f62fe] animate-bounce" style={{ animationDelay: "240ms" }} />
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
  const [intent, setIntent] = useState<LarryIntent>("freeform");
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
    setIntent("freeform");
  }

  function selectConversation(conversation: LarryConversation) {
    setSelectedConversationId(conversation.id);
    setDraftProjectId(conversation.projectId);
    setError(null);
  }

  async function handleSubmit(event?: React.FormEvent) {
    event?.preventDefault();
    const text = input.trim();
    if (busy || text.length < 3) return;

    setBusy(true);
    setError(null);
    setInput("");

    let conversationId = selectedConversationId;
    const projectId = activeProjectId ?? undefined;

    try {
      if (!conversationId) {
        const created = await createLarryConversation({
          projectId,
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

      const { response, data } = await sendLarryCommand({
        intent,
        input: text,
        projectId,
        mode: "execute",
      });

      const replyText = buildLarryResponseText(response, data);
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

      if (response.ok && data.runId) {
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
    <div className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top_left,_rgba(15,98,254,0.08),_transparent_32%),linear-gradient(180deg,_#f8fbff_0%,_#f3f5f9_100%)] p-6 lg:p-8">
      <div className="mx-auto flex min-h-full w-full max-w-[1440px] flex-col gap-6">
        <div className="flex flex-col gap-3 rounded-[28px] border border-[#d7dfec] bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#0f62fe]">
              Larry Chats
            </p>
            <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.03em] text-[var(--pm-text)]">
              Project-grouped chat history, plus a live thread whenever you need Larry.
            </h1>
            <p className="mt-2 max-w-3xl text-[14px] text-[var(--pm-text-secondary)]">
              Conversations are grouped by project so recent context stays easy to find, while the active pane keeps message history and commands in one place.
            </p>
          </div>
          <button
            type="button"
            onClick={() => startNewChat(activeProjectId)}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[#0f62fe] px-5 text-[13px] font-semibold text-white shadow-[0_12px_30px_rgba(15,98,254,0.24)] transition hover:bg-[#0043ce]"
          >
            <Plus size={14} />
            New Chat
          </button>
        </div>

        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700">
            {error}
          </div>
        )}

        <div className="grid min-h-[720px] gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col rounded-[28px] border border-[#d7dfec] bg-white/92 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
            <div className="flex items-center justify-between border-b border-[#e5ebf5] px-2 pb-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--pm-text-muted)]">
                  History
                </p>
                <p className="mt-1 text-[13px] text-[var(--pm-text-secondary)]">
                  {loading ? "Loading conversations..." : `${conversations.length} saved conversations`}
                </p>
              </div>
            </div>

            <div className="mt-4 min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
              {!loading && conversations.length === 0 && (
                <div className="rounded-[24px] border border-dashed border-[#d7dfec] bg-[#f8fbff] px-5 py-10 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e8f0ff] text-[#0f62fe]">
                    <Sparkles size={20} />
                  </div>
                  <p className="mt-4 text-[15px] font-semibold text-[var(--pm-text)]">
                    No saved chats yet
                  </p>
                  <p className="mt-2 text-[13px] leading-relaxed text-[var(--pm-text-secondary)]">
                    Start a conversation here and Larry will keep it in the right project lane.
                  </p>
                </div>
              )}

              {groupedConversations.map((group) => (
                <div key={group.key}>
                  <div className="mb-2 flex items-center gap-2 px-2">
                    <span className="h-2 w-2 rounded-full bg-[#0f62fe]" />
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--pm-text-muted)]">
                      {group.label}
                    </p>
                  </div>
                  <div className="space-y-2">
                    {group.conversations.map((conversation) => {
                      const active = conversation.id === selectedConversationId;
                      return (
                        <button
                          key={conversation.id}
                          type="button"
                          onClick={() => selectConversation(conversation)}
                          className={[
                            "w-full rounded-[22px] border px-4 py-3 text-left transition",
                            active
                              ? "border-[#0f62fe] bg-[#edf4ff] shadow-[0_12px_24px_rgba(15,98,254,0.12)]"
                              : "border-[#e1e8f3] bg-white hover:border-[#b8c9ea] hover:bg-[#f8fbff]",
                          ].join(" ")}
                        >
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#edf4ff] text-[#0f62fe]">
                              <MessageSquare size={16} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-3">
                                <p className="truncate text-[14px] font-semibold text-[var(--pm-text)]">
                                  {getConversationTitle(conversation)}
                                </p>
                                <span className="shrink-0 text-[11px] text-[var(--pm-text-muted)]">
                                  {formatDate(conversation.lastMessageAt ?? conversation.updatedAt)}
                                </span>
                              </div>
                              <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-[var(--pm-text-secondary)]">
                                {getConversationPreview(conversation)}
                              </p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </aside>

          <section className="flex min-h-0 flex-col overflow-hidden rounded-[32px] border border-[#d7dfec] bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            <div className="border-b border-[#e5ebf5] bg-[linear-gradient(135deg,_#0f62fe_0%,_#4589ff_100%)] px-6 py-5 text-white">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/16">
                  <Sparkles size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/75">
                    {activeProjectLabel}
                  </p>
                  <h2 className="truncate text-[22px] font-semibold tracking-[-0.03em]">
                    {activeConversation ? getConversationTitle(activeConversation) : "Fresh conversation"}
                  </h2>
                </div>
                <div className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-medium text-white/85">
                  {activeProjectId ? "Project context" : "General workspace"}
                </div>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,_#f8fbff_0%,_#ffffff_24%)]">
              <div className="flex flex-wrap gap-2 border-b border-[#e5ebf5] px-6 py-3">
                {INTENT_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  const active = intent === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setIntent(option.value)}
                      className={[
                        "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[11px] font-semibold transition",
                        active
                          ? "bg-[#0f62fe] text-white"
                          : "bg-[#eef2f8] text-[var(--pm-text-secondary)] hover:bg-[#e1e8f3]",
                      ].join(" ")}
                    >
                      <Icon size={12} />
                      {option.label}
                    </button>
                  );
                })}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                {messageLoading && (
                  <p className="text-[13px] text-[var(--pm-text-muted)]">Loading conversation...</p>
                )}

                {!messageLoading && messages.length === 0 && (
                  <div className="flex h-full flex-col items-center justify-center text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-[28px] bg-[#edf4ff] text-[#0f62fe]">
                      <Sparkles size={28} />
                    </div>
                    <p className="mt-4 text-[18px] font-semibold text-[var(--pm-text)]">
                      Start a new Larry thread
                    </p>
                    <p className="mt-2 max-w-md text-[13px] leading-relaxed text-[var(--pm-text-secondary)]">
                      Ask for plans, scope changes, follow-up drafts, or a quick summary. Larry will keep the thread under {activeProjectLabel.toLowerCase()} so the context stays easy to revisit.
                    </p>
                  </div>
                )}

                {!messageLoading && messages.length > 0 && (
                  <div className="space-y-4">
                    {messages.map((message) => (
                      <MessageBubble key={message.id} message={message} />
                    ))}
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              <div className="border-t border-[#e5ebf5] bg-white px-6 py-4">
                <form onSubmit={handleSubmit} className="space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-[12px] text-[var(--pm-text-secondary)]">
                      {activeProjectId ? `Sending with ${activeProjectLabel} context.` : "Sending without project context."}
                    </p>
                    <div className="inline-flex items-center gap-1 text-[11px] text-[var(--pm-text-muted)]">
                      <Clock3 size={12} />
                      History persists automatically
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-[#d7dfec] bg-[#f8fbff] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                    <textarea
                      value={input}
                      onChange={(event) => setInput(event.target.value)}
                      placeholder="Message Larry..."
                      disabled={busy}
                      aria-label="Message Larry"
                      rows={4}
                      className="w-full resize-none border-0 bg-transparent text-[14px] text-[var(--pm-text)] outline-none placeholder:text-[var(--pm-text-muted)]"
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => startNewChat(activeProjectId)}
                      className="inline-flex items-center gap-2 rounded-full border border-[#d7dfec] px-4 py-2 text-[12px] font-semibold text-[var(--pm-text-secondary)] transition hover:border-[#b8c9ea] hover:text-[var(--pm-text)]"
                    >
                      <Plus size={12} />
                      Start fresh thread
                    </button>
                    <button
                      type="submit"
                      disabled={busy || input.trim().length < 3}
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[#0f62fe] px-5 text-[13px] font-semibold text-white shadow-[0_12px_28px_rgba(15,98,254,0.22)] transition disabled:cursor-not-allowed disabled:opacity-60 hover:bg-[#0043ce]"
                    >
                      <Sparkles size={14} />
                      {busy ? "Sending..." : "Send to Larry"}
                    </button>
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
