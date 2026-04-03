"use client";

import { useEffect, useRef } from "react";
import { Mic, Sparkles, X } from "lucide-react";
import type { WorkspaceLarryEvent } from "@/app/dashboard/types";
import { useLarryChat, type LarryMessage } from "./useLarryChat";

interface LarryChatProps {
  projectId?: string;
  onVoiceInput?: () => void;
}

function getActionTone(event: WorkspaceLarryEvent) {
  if (event.eventType === "suggested") {
    return {
      badge: "bg-[#fff7ed] text-[#c2410c]",
      border: "border-[#fed7aa]",
      label: "Pending approval",
    };
  }

  if (event.eventType === "accepted") {
    return {
      badge: "bg-[#ecfdf3] text-[#15803d]",
      border: "border-[#bbf7d0]",
      label: "Accepted",
    };
  }

  return {
    badge: "bg-[#e8f0ff] text-[#1d4ed8]",
    border: "border-[#bfdbfe]",
    label: "Auto executed",
  };
}

function getActionMeta(event: WorkspaceLarryEvent): string {
  const pieces = [
    event.requestedByName ? `Requested by ${event.requestedByName}` : "Requested from this chat",
  ];

  if (event.eventType === "accepted" && event.approvedByName) {
    pieces.push(`Accepted by ${event.approvedByName}`);
  } else if (event.executionMode === "auto") {
    pieces.push("Executed by Larry");
  }

  return pieces.join(" · ");
}

function LinkedActionChips({ actions }: { actions: WorkspaceLarryEvent[] }) {
  if (actions.length === 0) return null;

  return (
    <div className="mt-3 space-y-2 border-t border-black/5 pt-3">
      {actions.map((action) => {
        const tone = getActionTone(action);
        return (
          <div
            key={action.id}
            className={`rounded-xl border px-3 py-2 ${tone.border}`}
            style={{ background: "#ffffff" }}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 flex-1 text-[12px] font-semibold text-[var(--pm-text)]">
                {action.displayText}
              </p>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone.badge}`}>
                {tone.label}
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-5 text-[var(--pm-text-muted)]">
              {getActionMeta(action)}
            </p>
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
    msg.linkedActions.filter((action) => action.eventType === "auto_executed" || action.eventType === "accepted").length;
  const suggestionCount =
    msg.suggestionCount ??
    msg.linkedActions.filter((action) => action.eventType === "suggested").length;

  return (
    <div className={`mb-2 flex ${isLarry ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[85%] rounded-xl px-3 py-2 text-[13px] leading-relaxed ${
          isLarry ? "bg-[#f5f3ff] text-[var(--pm-text)]" : "bg-[#6366f1] text-white"
        }`}
      >
        {isProcessing ? (
          <span className="flex items-center gap-1 py-0.5">
            <span
              className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#6366f1]"
              style={{ animationDelay: "0ms" }}
            />
            <span
              className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#6366f1]"
              style={{ animationDelay: "150ms" }}
            />
            <span
              className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#6366f1]"
              style={{ animationDelay: "300ms" }}
            />
          </span>
        ) : (
          <p>{msg.content}</p>
        )}
        {isLarry && !isProcessing && (msg.clarifications?.length ?? 0) > 0 && (
          <div className="mt-2 rounded-lg border border-[#ddd6fe] bg-[#faf5ff] p-2">
            <p className="text-[11px] font-semibold text-[#6d28d9]">Before I act, I need:</p>
            <ul className="mt-1 space-y-1 text-[11px] text-[#5b21b6]">
              {msg.clarifications?.map((item, index) => (
                <li key={`${item.field}-${index}`}>• {item.question}</li>
              ))}
            </ul>
          </div>
        )}
        {isLarry && !isProcessing && (executedCount > 0 || suggestionCount > 0) && (
          <p className="mt-1 text-[11px] text-[#6366f1]">
            {executedCount} action{executedCount !== 1 ? "s" : ""} taken
            {suggestionCount > 0
              ? ` · ${suggestionCount} suggestion${suggestionCount !== 1 ? "s" : ""} pending`
              : ""}
          </p>
        )}
        {isLarry && !isProcessing && <LinkedActionChips actions={msg.linkedActions} />}
      </div>
    </div>
  );
}

export function LarryChat({ projectId, onVoiceInput }: LarryChatProps) {
  const chat = useLarryChat(projectId);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOpen() {
      chat.open();
    }
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
      if (text) {
        chat.open();
        chat.setInput(text);
      }
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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.messages]);

  if (!chat.isOpen) {
    return null;
  }

  return (
    <div
      className="fixed z-50 flex flex-col rounded-2xl border border-[var(--pm-border)] bg-white shadow-2xl"
      style={{ width: 400, height: 520, bottom: "84px", right: "24px" }}
    >
      <div className="flex items-center justify-between rounded-t-2xl border-b border-[var(--pm-border)] bg-gradient-to-r from-[#6c44f6] to-[#b29cf8] px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-white" />
          <span className="text-[14px] font-semibold text-white">Larry</span>
          {projectId && (
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] text-white">
              project context
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={chat.close}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-white/80 hover:bg-white/20 hover:text-white"
        >
          <X size={16} />
        </button>
      </div>

      {chat.proactiveQueue.length > 0 && (
        <div className="space-y-1 border-b border-[var(--pm-border)] px-4 py-2">
          {chat.proactiveQueue.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-2 rounded-lg bg-[#f5f3ff] px-3 py-1.5"
            >
              <p className="text-[12px] text-[#5b21b6]">{item.message}</p>
              <button
                type="button"
                onClick={() => chat.dismissProactive(item.id)}
                className="text-[#9699a8] hover:text-[#5b21b6]"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {chat.messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Sparkles size={28} className="mb-2 text-[#6366f1] opacity-40" />
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
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={chat.handleSubmit} className="flex items-center gap-2 border-t border-[var(--pm-border)] px-4 py-3">
        <input
          value={chat.input}
          onChange={(event) => chat.setInput(event.target.value)}
          placeholder={projectId ? "Tell Larry what to do..." : "Open a project first"}
          disabled={chat.busy || !projectId}
          className="h-9 flex-1 rounded-lg border border-[var(--pm-border)] bg-[var(--pm-gray-light)] px-3 text-[13px] outline-none focus:border-[#6366f1] focus:bg-white disabled:opacity-50"
        />
        {onVoiceInput && (
          <button
            type="button"
            onClick={onVoiceInput}
            aria-label="Voice input"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--pm-border)] bg-[var(--pm-gray-light)] text-[#6366f1] transition-colors hover:border-[#6366f1] hover:bg-[#ede9fe]"
          >
            <Mic size={15} />
          </button>
        )}
        <button
          type="submit"
          disabled={chat.busy || !projectId || chat.input.trim().length < 1}
          className="h-9 rounded-lg bg-[#6366f1] px-3 text-[13px] font-medium text-white hover:bg-[#4f46e5] disabled:opacity-50"
        >
          {chat.busy ? "..." : "Send"}
        </button>
      </form>
    </div>
  );
}
