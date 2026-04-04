"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Layers, Menu, Plus, X } from "lucide-react";
import type { WorkspaceLarryEvent } from "@/app/dashboard/types";
import type { LarryConversation } from "@/lib/larry";
import { ChatInput, type AttachedFile } from "@/components/larry/ChatInput";
import { useSmartScroll } from "@/hooks/useSmartScroll";
import { useLarryChat, type LarryMessage } from "./useLarryChat";

interface LarryChatProps {
  projectId?: string;
  projectName?: string;
  onVoiceInput?: () => void;
}

/* ─── Helpers ────────────────────────────────────────────────────── */

function formatRelativeTime(dateStr?: string | null): string {
  if (!dateStr) return "Just now";
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMins = Math.max(0, Math.floor(diffMs / 60_000));
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffHours < 48) return "Yesterday";
  return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function getConversationTitle(conversation: LarryConversation): string {
  if (conversation.title?.trim()) return conversation.title.trim();
  if (conversation.lastMessagePreview?.trim()) {
    return conversation.lastMessagePreview.trim().slice(0, 48);
  }
  return "New conversation";
}

/* ─── Action Helpers ─────────────────────────────────────────────── */

function getActionTone(event: WorkspaceLarryEvent) {
  if (event.eventType === "suggested") {
    return { badge: "bg-[#fff7ed] text-[#c2410c]", border: "border-[#fed7aa]", label: "Pending approval" };
  }
  if (event.eventType === "accepted") {
    return { badge: "bg-[#ecfdf3] text-[#15803d]", border: "border-[#bbf7d0]", label: "Accepted" };
  }
  return { badge: "bg-[#e8f0ff] text-[#1d4ed8]", border: "border-[#bfdbfe]", label: "Auto executed" };
}

function getActionMeta(event: WorkspaceLarryEvent): string {
  const pieces = [event.requestedByName ? `Requested by ${event.requestedByName}` : "Requested from this chat"];
  if (event.eventType === "accepted" && event.approvedByName) {
    pieces.push(`Accepted by ${event.approvedByName}`);
  } else if (event.executionMode === "auto") {
    pieces.push("Executed by Larry");
  }
  return pieces.join(" · ");
}

/* ─── Sub-components ─────────────────────────────────────────────── */

function LinkedActionChips({ actions }: { actions: WorkspaceLarryEvent[] }) {
  if (actions.length === 0) return null;
  return (
    <div className="mt-3 space-y-2 border-t border-black/5 pt-3">
      {actions.map((action) => {
        const tone = getActionTone(action);
        return (
          <div key={action.id} className={`rounded-xl border px-3 py-2 ${tone.border}`} style={{ background: "#ffffff" }}>
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 flex-1 text-[12px] font-semibold text-[var(--pm-text)]">{action.displayText}</p>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone.badge}`}>{tone.label}</span>
            </div>
            <p className="mt-1 text-[11px] leading-5 text-[var(--pm-text-muted)]">{getActionMeta(action)}</p>
          </div>
        );
      })}
    </div>
  );
}

function MessageBubble({ msg }: { msg: LarryMessage }) {
  const isLarry = msg.role === "larry";
  const isProcessing = msg.id === "processing";
  const executedCount =
    msg.actionsExecuted ??
    msg.linkedActions.filter((a) => a.eventType === "auto_executed" || a.eventType === "accepted").length;
  const suggestionCount =
    msg.suggestionCount ??
    msg.linkedActions.filter((a) => a.eventType === "suggested").length;

  return (
    <div className={`mb-2 flex ${isLarry ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[85%] rounded-xl px-3 py-2 text-[13px] leading-relaxed ${
          isLarry ? "bg-[#fafaff] text-[var(--pm-text)]" : "bg-[#6c44f6] text-white"
        }`}
      >
        {isProcessing ? (
          <span className="flex items-center gap-1 py-0.5">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#6c44f6]" style={{ animationDelay: "0ms" }} />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#6c44f6]" style={{ animationDelay: "150ms" }} />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#6c44f6]" style={{ animationDelay: "300ms" }} />
          </span>
        ) : (
          <p>{msg.content}</p>
        )}
        {isLarry && !isProcessing && (msg.clarifications?.length ?? 0) > 0 && (
          <div className="mt-2 rounded-lg border border-[#ddd6fe] bg-[#faf5ff] p-2">
            <p className="text-[11px] font-semibold text-[#6d28d9]">Before I act, I need:</p>
            <ul className="mt-1 space-y-1 text-[11px] text-[#5b21b6]">
              {msg.clarifications?.map((item, i) => <li key={`${item.field}-${i}`}>• {item.question}</li>)}
            </ul>
          </div>
        )}
        {isLarry && !isProcessing && (executedCount > 0 || suggestionCount > 0) && (
          <p className="mt-1 text-[11px] text-[#6c44f6]">
            {executedCount} action{executedCount !== 1 ? "s" : ""} taken
            {suggestionCount > 0 ? ` · ${suggestionCount} suggestion${suggestionCount !== 1 ? "s" : ""} pending` : ""}
          </p>
        )}
        {isLarry && !isProcessing && <LinkedActionChips actions={msg.linkedActions} />}
      </div>
    </div>
  );
}

/* ─── History Dropdown ───────────────────────────────────────────── */

function HistoryDropdown({
  conversations,
  activeId,
  onSelect,
  onNewChat,
  onClose,
}: {
  conversations: LarryConversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute left-2 right-2 z-10 rounded-xl border border-[#e5e3f0] bg-white shadow-lg"
      style={{ top: "56px", maxHeight: "320px", overflow: "hidden" }}
    >
      <div className="flex items-center justify-between border-b border-[#f0eef5] px-3 py-2.5">
        <span className="text-[12px] font-semibold text-[#666]">Recent Chats</span>
        <button
          type="button"
          onClick={() => { onNewChat(); onClose(); }}
          className="text-[11px] font-medium text-[#6c44f6] hover:text-[#5835d4]"
        >
          + New Chat
        </button>
      </div>
      <div className="overflow-y-auto" style={{ maxHeight: "270px" }}>
        {conversations.length === 0 && (
          <p className="px-3 py-6 text-center text-[12px] text-[#999]">No conversations yet</p>
        )}
        {conversations.map((conv) => {
          const isActive = conv.id === activeId;
          return (
            <button
              key={conv.id}
              type="button"
              onClick={() => { onSelect(conv.id); onClose(); }}
              className={`w-full px-3 py-2.5 text-left transition-colors ${
                isActive
                  ? "bg-[rgba(108,68,246,0.12)]"
                  : "hover:bg-[rgba(108,68,246,0.06)]"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`truncate text-[12px] font-medium ${
                    isActive ? "text-[#6c44f6]" : "text-[#333]"
                  }`}
                >
                  {getConversationTitle(conv)}
                </span>
                <span className="shrink-0 text-[10px] text-[#aaa]">
                  {formatRelativeTime(conv.lastMessageAt ?? conv.updatedAt)}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Main Widget ────────────────────────────────────────────────── */

export function LarryChat({ projectId, projectName, onVoiceInput }: LarryChatProps) {
  const chat = useLarryChat(projectId);
  const { containerRef, endRef, hasNewMessages, scrollToBottom } = useSmartScroll(chat.messages);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [files, setFiles] = useState<AttachedFile[]>([]);

  useEffect(() => {
    function onOpen() { chat.open(); }
    function onPush(event: Event) {
      const message = (event as CustomEvent<string>).detail;
      if (message) chat.pushMessage(message);
    }
    function onLoadConversation(event: Event) {
      const id = (event as CustomEvent<string>).detail;
      if (id) void chat.loadConversation(id);
    }
    function onPrefill(event: Event) {
      const text = (event as CustomEvent<string>).detail;
      if (text) { chat.open(); chat.setInput(text); }
    }

    window.addEventListener("larry:open", onOpen);
    window.addEventListener("larry:toggle", chat.toggle);
    window.addEventListener("larry:push", onPush);
    window.addEventListener("larry:load-conversation", onLoadConversation);
    window.addEventListener("larry:prefill", onPrefill);

    return () => {
      window.removeEventListener("larry:open", onOpen);
      window.removeEventListener("larry:toggle", chat.toggle);
      window.removeEventListener("larry:push", onPush);
      window.removeEventListener("larry:load-conversation", onLoadConversation);
      window.removeEventListener("larry:prefill", onPrefill);
    };
  }, [chat.loadConversation, chat.open, chat.pushMessage, chat.setInput]);

  if (!chat.isOpen) return null;

  return (
    <div
      className="fixed z-50 flex flex-col overflow-hidden rounded-[14px] border border-[#f0edfa] bg-white"
      style={{
        width: 420,
        height: 560,
        bottom: "84px",
        right: "24px",
        boxShadow: "0 20px 60px rgba(0,0,0,0.1), 0 4px 14px rgba(0,0,0,0.04)",
        animation: "larry-widget-enter 0.25s cubic-bezier(0.16,1,0.3,1)",
      }}
    >
      <style>{`
        @keyframes larry-widget-enter {
          from { opacity: 0; transform: scale(0.95) translateY(8px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>

      {/* ── Header: Breadcrumb ── */}
      <div className="flex items-center justify-between rounded-t-[14px] border-b border-[#f0edfa] bg-gradient-to-r from-[#6c44f6] to-[#b29cf8] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Layers size={16} className="shrink-0 text-white" />
          <div className="min-w-0">
            <span className="text-[14px] font-semibold text-white">Larry</span>
            <div style={{ fontSize: 10, color: "#bdb7d0" }}>
              Project assistant{projectName ? ` · ${projectName}` : ""}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => { chat.startNewChat(); setHistoryOpen(false); }}
            title="New chat"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-white/70 hover:bg-white/20 hover:text-white"
          >
            <Plus size={15} />
          </button>
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            title="Chat history"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-white/70 hover:bg-white/20 hover:text-white"
          >
            <Menu size={15} />
          </button>
          <button
            type="button"
            onClick={chat.close}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-white/70 hover:bg-white/20 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* ── History Dropdown (overlay) ── */}
      <div className="relative">
        {historyOpen && (
          <HistoryDropdown
            conversations={chat.conversations}
            activeId={chat.conversationId}
            onSelect={(id) => void chat.loadConversation(id)}
            onNewChat={chat.startNewChat}
            onClose={() => setHistoryOpen(false)}
          />
        )}
      </div>

      {/* ── Proactive Queue ── */}
      {chat.proactiveQueue.length > 0 && (
        <div className="space-y-1 border-b border-[#f0edfa] px-4 py-2">
          {chat.proactiveQueue.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-2 rounded-lg bg-[#f5f3ff] px-3 py-1.5">
              <p className="text-[12px] text-[#5b21b6]">{item.message}</p>
              <button type="button" onClick={() => chat.dismissProactive(item.id)} className="text-[#9699a8] hover:text-[#5b21b6]">
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Messages ── */}
      <div ref={containerRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {chat.messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Layers size={28} className="mb-2 text-[#6c44f6] opacity-40" />
            <p className="text-[13px] text-[var(--pm-text-muted)]">
              {projectId
                ? "Tell Larry what to do and it will persist the conversation and any linked actions here."
                : "Open a project first, or use the Larry section inside any project tab to talk to me in context."}
            </p>
          </div>
        )}
        {chat.messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
        <div ref={endRef} />
      </div>

      {/* ── New messages indicator ── */}
      {hasNewMessages && (
        <div className="flex justify-center border-t border-[#f0edfa] bg-[#fafaff]">
          <button
            type="button"
            onClick={scrollToBottom}
            className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium text-[#6c44f6] hover:text-[#5835d4]"
          >
            <ChevronDown size={12} />
            New messages
          </button>
        </div>
      )}

      {/* ── Input ── */}
      <ChatInput
        value={chat.input}
        onChange={chat.setInput}
        onSubmit={chat.handleSubmit}
        disabled={chat.busy || !projectId}
        busy={chat.busy}
        placeholder={projectId ? "Tell Larry what to do..." : "Open a project first"}
        onVoiceInput={onVoiceInput}
        files={files}
        onFilesChange={setFiles}
        variant="widget"
      />
    </div>
  );
}
