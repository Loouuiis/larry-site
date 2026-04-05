"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import {
  Clock3,
  Plus,
  Sparkles,
} from "lucide-react";
import { StartProjectFlow } from "@/components/dashboard/StartProjectFlow";
import type { WorkspaceLarryEvent } from "@/app/dashboard/types";
import {
  type LarryConversation,
  type LarryMessage,
  listLarryConversations,
  listLarryMessages,
  readJson,
  sendLarryChat,
} from "@/lib/larry";
import { ChatInput, type AttachedFile } from "@/components/larry/ChatInput";
import { useSmartScroll } from "@/hooks/useSmartScroll";

interface WorkspaceProject {
  id: string;
  name: string;
}

/* ─── Helpers ────────────────────────────────────────────────────── */

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

function buildProjectLabel(
  projectId: string | null | undefined,
  projectNameById: Map<string, string>
): string {
  if (!projectId) return "General";
  return projectNameById.get(projectId) ?? "Project";
}

function getLaunchSourceLabel(sourceKind?: string | null): string {
  switch (sourceKind) {
    case "meeting": return "Meeting transcript";
    case "briefing": return "Login briefing";
    case "schedule": return "Scheduled scan";
    case "slack": return "Slack signal";
    case "email": return "Email signal";
    case "calendar": return "Calendar signal";
    case "chat": case null: case undefined: return "Larry chat";
    default: return sourceKind;
  }
}

function getLaunchEventLabel(eventType?: string | null): string | null {
  switch (eventType) {
    case "suggested": return "Pending approval";
    case "accepted": return "Accepted";
    case "auto_executed": return "Auto executed";
    case "dismissed": return "Dismissed";
    default: return null;
  }
}

/* ─── Action helpers ─────────────────────────────────────────────── */

function getActionTone(event: WorkspaceLarryEvent) {
  if (event.eventType === "suggested") {
    return { badge: { background: "#fff7ed", color: "#c2410c" }, border: "#fed7aa", label: "Pending approval" };
  }
  if (event.eventType === "accepted") {
    return { badge: { background: "#ecfdf3", color: "#15803d" }, border: "#bbf7d0", label: "Accepted" };
  }
  return { badge: { background: "#e8f0ff", color: "#1d4ed8" }, border: "#bfdbfe", label: "Auto executed" };
}

function getActionMeta(event: WorkspaceLarryEvent): string {
  const pieces = [event.requestedByName ? `Requested by ${event.requestedByName}` : "Requested from this chat"];
  if (event.eventType === "accepted" && event.approvedByName) pieces.push(`Accepted by ${event.approvedByName}`);
  else if (event.executionMode === "auto") pieces.push("Executed by Larry");
  return pieces.join(" · ");
}

/* ─── Sub-components ─────────────────────────────────────────────── */

function LinkedActionChips({
  actions,
  projectNameById,
}: {
  actions: WorkspaceLarryEvent[];
  projectNameById: Map<string, string>;
}) {
  if (actions.length === 0) return null;

  const grouped = new Map<string, { label: string; actions: WorkspaceLarryEvent[] }>();
  for (const action of actions) {
    const key = action.projectId || "__general__";
    if (!grouped.has(key)) {
      grouped.set(key, {
        label: action.projectName?.trim() || (action.projectId ? projectNameById.get(action.projectId) : undefined) || "General workspace",
        actions: [],
      });
    }
    grouped.get(key)?.actions.push(action);
  }

  const groupedEntries = Array.from(grouped.entries());
  const showGroupLabels = groupedEntries.length > 1;

  return (
    <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
      {groupedEntries.map(([groupKey, group]) => (
        <div key={groupKey} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {showGroupLabels && (
            <p style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)" }}>{group.label}</p>
          )}
          {group.actions.map((action) => {
            const tone = getActionTone(action);
            return (
              <div key={action.id} style={{ borderRadius: "14px", border: `1px solid ${tone.border}`, background: "#ffffff", padding: "10px 12px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px" }}>
                  <p style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-1)" }}>{action.displayText}</p>
                  <span style={{ flexShrink: 0, borderRadius: "999px", padding: "2px 8px", fontSize: "10px", fontWeight: 600, ...tone.badge }}>{tone.label}</span>
                </div>
                <p style={{ marginTop: "4px", fontSize: "11px", lineHeight: "1.5", color: "var(--text-muted)" }}>{getActionMeta(action)}</p>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function MessageBubble({
  message,
  projectNameById,
}: {
  message: LarryMessage;
  projectNameById: Map<string, string>;
}) {
  const isLarry = message.role === "larry";
  const isProcessing = message.id === "processing";
  const actorLabel =
    typeof message.actorDisplayName === "string" && message.actorDisplayName.trim().length > 0
      ? message.actorDisplayName.trim()
      : isLarry ? "Larry" : "You";
  const executedCount = message.linkedActions.filter((a) => a.eventType === "auto_executed" || a.eventType === "accepted").length;
  const suggestionCount = message.linkedActions.filter((a) => a.eventType === "suggested").length;

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
            ? { background: "var(--surface-2)", color: "var(--text-1)", border: "1px solid var(--border)", borderTopLeftRadius: "4px" }
            : { background: "#6c44f6", color: "#ffffff", borderTopRightRadius: "4px" }),
        }}
      >
        {isProcessing ? (
          <span className="flex items-center gap-2 py-1">
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full" style={{ background: "var(--cta)", animationDelay: "0ms" }} />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full" style={{ background: "var(--cta)", animationDelay: "120ms" }} />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full" style={{ background: "var(--cta)", animationDelay: "240ms" }} />
            </span>
            <span style={{ fontSize: "12px", color: "#8b7fc7" }}>Larry is thinking…</span>
          </span>
        ) : (
          <>
            <p style={{ marginBottom: "6px", fontSize: "11px", fontWeight: 600, color: isLarry ? "var(--text-muted)" : "rgba(255,255,255,0.85)" }}>{actorLabel}</p>
            <p style={{ whiteSpace: "pre-line" }}>{message.content}</p>
          </>
        )}
        {isLarry && !isProcessing && (executedCount > 0 || suggestionCount > 0) && (
          <p style={{ marginTop: "8px", fontSize: "11px", color: "#6c44f6" }}>
            {executedCount} action{executedCount !== 1 ? "s" : ""} taken
            {suggestionCount > 0 ? ` · ${suggestionCount} suggestion${suggestionCount !== 1 ? "s" : ""} pending` : ""}
          </p>
        )}
        {isLarry && !isProcessing && <LinkedActionChips actions={message.linkedActions ?? []} projectNameById={projectNameById} />}
      </div>
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────── */

export default function AskLarryPage() {
  const searchParams = useSearchParams();
  const preferredProjectId = searchParams.get("projectId");
  const preferredConversationId = searchParams.get("conversationId");
  const draftFromQuery = searchParams.get("draft")?.trim() ?? "";
  const launchContext = searchParams.get("launch");
  const launchSourceKind = searchParams.get("sourceKind");
  const launchEventType = searchParams.get("eventType");
  const launchedFromActionCentre = launchContext === "action-centre";
  const conversationScopeProjectId = preferredProjectId ?? undefined;

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
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [showNewProject, setShowNewProject] = useState(false);
  const initializedRef = useRef(false);

  const { containerRef, endRef, hasNewMessages, scrollToBottom } = useSmartScroll(messages);

  const projectNameById = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name])),
    [projects]
  );

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === selectedConversationId) ?? null,
    [conversations, selectedConversationId]
  );

  const activeProjectId = activeConversation?.projectId ?? draftProjectId ?? preferredProjectId ?? null;
  const activeProjectLabel = buildProjectLabel(activeProjectId, projectNameById);
  const contextLabel = activeProjectId
    ? `${activeProjectLabel} context`
    : "Global context (top 5 accessible projects)";
  const launchSourceLabel = getLaunchSourceLabel(launchSourceKind);
  const launchEventLabel = getLaunchEventLabel(launchEventType);

  const groupedConversations = useMemo(() => {
    const groups = new Map<string, { label: string; conversations: LarryConversation[] }>();
    for (const conversation of conversations) {
      const groupKey = conversation.projectId ?? "__general__";
      if (!groups.has(groupKey)) {
        groups.set(groupKey, { label: buildProjectLabel(conversation.projectId, projectNameById), conversations: [] });
      }
      groups.get(groupKey)?.conversations.push(conversation);
    }
    return Array.from(groups.entries()).map(([key, value]) => ({
      key,
      label: value.label,
      conversations: value.conversations,
    }));
  }, [conversations, projectNameById]);

  // Load initial data
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const projectsPath = preferredProjectId ? "/api/workspace/projects?status=all" : "/api/workspace/projects";
        const [conversationItems, projectsResponse] = await Promise.all([
          listLarryConversations(conversationScopeProjectId),
          fetch(projectsPath, { cache: "no-store" }),
        ]);
        const projectsData = await readJson<{ items?: WorkspaceProject[]; error?: string }>(projectsResponse);
        if (cancelled) return;
        setConversations(conversationItems);
        setProjects(projectsResponse.ok ? projectsData.items ?? [] : []);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load Larry chats.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [conversationScopeProjectId, preferredProjectId]);

  // Initialize selection
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

    const requestedConversation = preferredConversationId
      ? conversations.find((c) => c.id === preferredConversationId)
      : null;

    if (requestedConversation) {
      setSelectedConversationId(requestedConversation.id);
      setDraftProjectId(requestedConversation.projectId);
      initializedRef.current = true;
      return;
    }

    const preferredConversation = preferredProjectId
      ? conversations.find((c) => c.projectId === preferredProjectId)
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

    if (preferredProjectId) setDraftProjectId(preferredProjectId);
    initializedRef.current = true;
  }, [conversations, draftFromQuery, loading, preferredConversationId, preferredProjectId]);

  // Load messages for selected conversation
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
      .then((items) => { if (!cancelled) setMessages(items); })
      .catch((err) => { if (!cancelled) { setMessages([]); setError(err instanceof Error ? err.message : "Failed to load chat history."); } })
      .finally(() => { if (!cancelled) setMessageLoading(false); });
    return () => { cancelled = true; };
  }, [selectedConversationId]);

  async function refreshConversations(preferredId?: string | null) {
    const next = await listLarryConversations(conversationScopeProjectId);
    setConversations(next);
    if (preferredId && next.some((c) => c.id === preferredId)) setSelectedConversationId(preferredId);
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
    setBusy(true);
    setError(null);
    setInput("");
    const optimisticUserId = `user-${crypto.randomUUID()}`;
    const processingId = "processing";

    try {
      const userMessage: LarryMessage = {
        id: optimisticUserId, role: "user", content: text, createdAt: new Date().toISOString(),
        reasoning: null, actorUserId: null, actorDisplayName: null, linkedActions: [],
      };
      setMessages((current) => [
        ...current.filter((m) => m.id !== processingId),
        userMessage,
        { id: processingId, role: "larry", content: "Processing...", createdAt: new Date().toISOString(), reasoning: null, actorUserId: null, actorDisplayName: null, linkedActions: [] },
      ]);

      const { response, data } = await sendLarryChat({
        projectId: activeProjectId ?? undefined,
        message: text,
        conversationId: selectedConversationId ?? undefined,
      });

      if (!response.ok) {
        setMessages((current) =>
          current.filter((m) => m.id !== processingId).concat({
            id: crypto.randomUUID(), role: "larry", content: data.error ?? "Something went wrong.",
            createdAt: new Date().toISOString(), reasoning: null, actorUserId: null, actorDisplayName: null, linkedActions: [],
          })
        );
        return;
      }

      setSelectedConversationId(data.conversationId);
      setMessages((current) =>
        current
          .filter((m) => m.id !== optimisticUserId && m.id !== processingId)
          .concat(data.userMessage, {
            ...data.assistantMessage,
            linkedActions: data.assistantMessage.linkedActions?.length > 0 ? data.assistantMessage.linkedActions : data.linkedActions,
          })
      );

      await refreshConversations(data.conversationId);

      if ((data.actionsExecuted ?? 0) > 0 || (data.suggestionCount ?? 0) > 0 || (data.linkedActions?.length ?? 0) > 0) {
        window.dispatchEvent(new CustomEvent("larry:refresh-snapshot"));
      }
    } catch (err) {
      setMessages((current) =>
        current.filter((m) => m.id !== processingId).concat({
          id: crypto.randomUUID(), role: "larry", content: "Network error. Please try again.",
          createdAt: new Date().toISOString(), reasoning: null, actorUserId: null, actorDisplayName: null, linkedActions: [],
        })
      );
      setError(err instanceof Error ? err.message : "Failed to send message.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-0 overflow-hidden" style={{ background: "var(--page-bg)", padding: "24px", height: "100%" }}>
      <div style={{ display: "flex", height: "100%", width: "100%", maxWidth: "1440px", margin: "0 auto", flexDirection: "column", gap: "20px" }}>
        {error && (
          <div style={{ borderRadius: "var(--radius-card)", border: "1px solid #fecaca", background: "#fef2f2", padding: "12px 16px", fontSize: "13px", color: "#b91c1c" }}>
            {error}
          </div>
        )}
        {launchedFromActionCentre && (
          <div style={{ borderRadius: "var(--radius-card)", border: "1px solid #bfdbfe", background: "#eff6ff", padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
            <div>
              <p style={{ fontSize: "14px", fontWeight: 600, color: "#1d4ed8" }}>Opened from Workspace Action Centre</p>
              <p style={{ marginTop: "4px", fontSize: "12px", color: "#1e3a8a" }}>
                Project: {activeProjectId ? activeProjectLabel : "General workspace"} | Source: {launchSourceLabel}
                {launchEventLabel ? ` | Event: ${launchEventLabel}` : ""}
              </p>
            </div>
            <Link href="/workspace/actions" style={{ fontSize: "12px", fontWeight: 600, color: "#1d4ed8" }}>Back to Workspace Action Centre</Link>
          </div>
        )}

        <div style={{ display: "grid", flex: 1, minHeight: 0, gap: "20px", gridTemplateColumns: "280px minmax(0,1fr)" }}>
          {/* ── Sidebar: Conversation List (Claude-style minimalist) ── */}
          <aside style={{ display: "flex", flexDirection: "column", minHeight: 0, borderRadius: "var(--radius-card)", border: "1px solid var(--border)", background: "var(--surface)", overflow: "hidden" }}>
            <div style={{ padding: "16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
              <h2 style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-1)" }}>Larry Chats</h2>
              <button
                type="button"
                onClick={() => startNewChat(activeProjectId)}
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

            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px" }}>
              {!loading && conversations.length === 0 && (
                <div style={{ padding: "40px 16px", textAlign: "center" }}>
                  <Sparkles size={24} style={{ margin: "0 auto", color: "#6c44f6", opacity: 0.4 }} />
                  <p style={{ marginTop: "12px", fontSize: "13px", fontWeight: 600, color: "var(--text-1)" }}>No chats yet</p>
                  <p style={{ marginTop: "6px", fontSize: "12px", lineHeight: "1.5", color: "var(--text-muted)" }}>
                    Start a conversation with Larry.
                  </p>
                </div>
              )}

              {groupedConversations.map((group) => (
                <div key={group.key} style={{ marginBottom: "12px" }}>
                  <p style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-disabled)", padding: "4px 10px", marginBottom: "4px" }}>
                    {group.label}
                  </p>
                  {group.conversations.map((conversation) => {
                    const active = conversation.id === selectedConversationId;
                    return (
                      <button
                        key={conversation.id}
                        type="button"
                        onClick={() => selectConversation(conversation)}
                        style={{
                          width: "100%",
                          borderRadius: "8px",
                          border: "none",
                          background: active ? "rgba(108,68,246,0.12)" : "transparent",
                          padding: "8px 10px",
                          textAlign: "left",
                          cursor: "pointer",
                          display: "block",
                          transition: "background 0.15s",
                        }}
                        onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "rgba(108,68,246,0.06)"; }}
                        onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                          <p style={{
                            fontSize: "13px", fontWeight: 500,
                            color: active ? "#6c44f6" : "var(--text-1)",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>
                            {getConversationTitle(conversation)}
                          </p>
                          <span style={{ flexShrink: 0, fontSize: "10px", color: "var(--text-muted)" }}>
                            {formatDate(conversation.lastMessageAt ?? conversation.updatedAt)}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </aside>

          {/* ── Active Thread ── */}
          <section style={{ display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden", borderRadius: "var(--radius-card)", border: "1px solid var(--border)", background: "var(--surface)" }}>
            {/* Thread header */}
            <div style={{ borderBottom: "1px solid var(--border)", background: "var(--surface)", padding: "14px 20px", display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ flexShrink: 0, display: "flex", height: "32px", width: "32px", alignItems: "center", justifyContent: "center", borderRadius: "8px", background: "var(--surface-2)", color: "#6c44f6" }}>
                <Sparkles size={15} />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <h2 style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {activeConversation ? getConversationTitle(activeConversation) : "Fresh conversation"}
                  </h2>
                  <span style={{ color: "var(--text-disabled)", fontSize: "13px" }}>·</span>
                  {!activeConversation ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <select
                        value={draftProjectId ?? ""}
                        onChange={(e) => {
                          if (e.target.value === "__new__") {
                            setShowNewProject(true);
                            e.target.value = draftProjectId ?? "";
                            return;
                          }
                          setDraftProjectId(e.target.value || null);
                        }}
                        style={{
                          fontSize: "12px",
                          color: "var(--text-muted)",
                          background: "none",
                          border: "1px solid var(--border)",
                          borderRadius: "6px",
                          padding: "2px 8px",
                          height: "24px",
                          outline: "none",
                          cursor: "pointer",
                          maxWidth: "200px",
                        }}
                      >
                        <option value="">Global workspace</option>
                        {projects.map((project) => (
                          <option key={project.id} value={project.id}>{project.name}</option>
                        ))}
                        <option value="__new__">＋ New project</option>
                      </select>
                    </div>
                  ) : (
                    <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                      {activeProjectId ? activeProjectLabel : "Global workspace"}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", flex: 1, flexDirection: "column", minHeight: 0, background: "var(--page-bg)" }}>
              {/* Messages */}
              <div ref={containerRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "20px 24px" }}>
                {messageLoading && (
                  <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>Loading conversation...</p>
                )}

                {!messageLoading && messages.length === 0 && (
                  <div style={{ display: "flex", height: "100%", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
                    <div style={{ display: "flex", height: "56px", width: "56px", alignItems: "center", justifyContent: "center", borderRadius: "var(--radius-card)", background: "var(--surface-2)", color: "#6c44f6" }}>
                      <Sparkles size={24} />
                    </div>
                    <p style={{ marginTop: "16px", fontSize: "16px", fontWeight: 600, color: "var(--text-1)" }}>Start a new Larry thread</p>
                    <p style={{ marginTop: "8px", maxWidth: "400px", fontSize: "13px", lineHeight: "1.5", color: "var(--text-2)" }}>
                      Tell Larry what to do — it will act immediately and report back. Add a project for focused context or leave this in global mode.
                    </p>
                  </div>
                )}

                {!messageLoading && messages.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {messages.map((message) => (
                      <MessageBubble key={message.id} message={message} projectNameById={projectNameById} />
                    ))}
                  </div>
                )}

                <div ref={endRef} />
              </div>

              {/* New messages indicator */}
              {hasNewMessages && (
                <div style={{ display: "flex", justifyContent: "center", borderTop: "1px solid var(--border)", background: "var(--surface-2)", padding: "4px" }}>
                  <button
                    type="button"
                    onClick={scrollToBottom}
                    style={{ display: "flex", alignItems: "center", gap: "4px", padding: "4px 12px", fontSize: "11px", fontWeight: 500, color: "#6c44f6", background: "none", border: "none", cursor: "pointer" }}
                  >
                    New messages
                  </button>
                </div>
              )}

              {/* Context label */}
              <div style={{ padding: "0 20px" }}>
                <p style={{ fontSize: "11px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "4px", padding: "4px 0" }}>
                  <Clock3 size={11} />
                  {contextLabel}
                </p>
              </div>

              {/* Input */}
              <ChatInput
                value={input}
                onChange={setInput}
                onSubmit={handleSubmit}
                disabled={busy}
                busy={busy}
                placeholder="Message Larry..."
                files={files}
                onFilesChange={setFiles}
                variant="full"
              />
            </div>
          </section>
        </div>
      </div>

      <AnimatePresence>
        {showNewProject && (
          <StartProjectFlow
            onClose={() => setShowNewProject(false)}
            onCreated={async (projectId) => {
              setShowNewProject(false);
              setDraftProjectId(projectId);
              try {
                const res = await fetch("/api/workspace/projects", { cache: "no-store" });
                const data = await readJson<{ items?: WorkspaceProject[]; error?: string }>(res);
                if (res.ok && data.items) setProjects(data.items);
              } catch { /* keep existing projects list */ }
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
