"use client";

import { useEffect, useRef } from "react";
import {
  Bot,
  ChevronDown,
  FileText,
  LayoutGrid,
  ListChecks,
  Sparkles,
  WandSparkles,
  X,
} from "lucide-react";
import { useLarryChat, type LarryIntent, type LarryMessage } from "./useLarryChat";
import { useWorkspaceChrome } from "./WorkspaceChromeContext";

const INTENT_OPTIONS: Array<{ value: LarryIntent; label: string; icon: React.ElementType }> = [
  { value: "freeform", label: "Ask", icon: WandSparkles },
  { value: "create_plan", label: "Plan", icon: ListChecks },
  { value: "update_scope", label: "Scope", icon: LayoutGrid },
  { value: "draft_follow_up", label: "Follow-up", icon: Bot },
  { value: "request_summary", label: "Summary", icon: FileText },
];

interface LarryChatProps {
  projectId?: string;
  pendingCount?: number;
  actionCount?: number;
}

function MessageBubble({ msg }: { msg: LarryMessage }) {
  const isLarry = msg.role === "larry";
  return (
    <div className={`flex ${isLarry ? "justify-start" : "justify-end"} mb-2`}>
      <div
        className={`max-w-[85%] rounded-xl px-3 py-2 text-[13px] leading-relaxed ${
          isLarry
            ? "bg-[#f5f3ff] text-[var(--pm-text)]"
            : "bg-[#6366f1] text-white"
        }`}
      >
        <p>{msg.text}</p>
        {isLarry && msg.reasoning && (
          <details className="mt-1.5">
            <summary className="cursor-pointer text-[11px] text-[#6366f1] hover:underline">Why?</summary>
            <div className="mt-1 space-y-1 text-[11px] text-[var(--pm-text-secondary)]">
              {msg.reasoning.why && <p>{msg.reasoning.why}</p>}
              {msg.reasoning.signals && msg.reasoning.signals.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {msg.reasoning.signals.map((s, i) => (
                    <span key={i} className="rounded-full bg-[#e0e7ff] px-2 py-0.5 text-[#4338ca]">{s}</span>
                  ))}
                </div>
              )}
              {msg.reasoning.threshold && (
                <p className="text-[var(--pm-text-muted)]">Policy: {msg.reasoning.threshold}</p>
              )}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

export function LarryChat({ projectId, pendingCount = 0, actionCount = 0 }: LarryChatProps) {
  const chat = useLarryChat(projectId);
  const chrome = useWorkspaceChrome();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Listen for external open/push events from chrome context
  useEffect(() => {
    function onOpen() { chat.open(); }
    function onPush(e: Event) {
      const msg = (e as CustomEvent<string>).detail;
      if (msg) chat.pushMessage(msg);
    }
    window.addEventListener("larry:open", onOpen);
    window.addEventListener("larry:push", onPush);
    return () => {
      window.removeEventListener("larry:open", onOpen);
      window.removeEventListener("larry:push", onPush);
    };
  }, [chat.open, chat.pushMessage]);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.messages]);

  if (!chat.isOpen) {
    return (
      <button
        type="button"
        onClick={chat.open}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#6366f1] to-[#0073EA] text-white shadow-lg hover:shadow-xl transition-shadow"
        title="Open Larry"
      >
        <Sparkles size={22} />
        {(pendingCount + actionCount) > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
            {pendingCount + actionCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col rounded-2xl border border-[var(--pm-border)] bg-white shadow-2xl"
      style={{ width: 400, height: 560 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between rounded-t-2xl border-b border-[var(--pm-border)] bg-gradient-to-r from-[#6366f1] to-[#0073EA] px-4 py-3">
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
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-white/80 hover:text-white hover:bg-white/20"
        >
          <X size={16} />
        </button>
      </div>

      {/* Proactive banners */}
      {(pendingCount > 0 || actionCount > 0) && (
        <div className="border-b border-[var(--pm-border)] bg-amber-50 px-4 py-2">
          {pendingCount > 0 && (
            <p className="text-[12px] text-amber-800">
              {pendingCount} item{pendingCount !== 1 ? "s" : ""} in Action Center awaiting review
            </p>
          )}
          {actionCount > 0 && actionCount !== pendingCount && (
            <p className="text-[12px] text-amber-700">{actionCount} pending notifications</p>
          )}
        </div>
      )}

      {/* Proactive queue */}
      {chat.proactiveQueue.length > 0 && (
        <div className="border-b border-[var(--pm-border)] px-4 py-2 space-y-1">
          {chat.proactiveQueue.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-2 rounded-lg bg-[#f5f3ff] px-3 py-1.5">
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

      {/* Messages */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {chat.messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Sparkles size={28} className="mb-2 text-[#6366f1] opacity-40" />
            <p className="text-[13px] text-[var(--pm-text-muted)]">
              Ask Larry anything about this workspace or run a coordination command.
            </p>
          </div>
        )}
        {chat.messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Intent chips */}
      <div className="flex flex-wrap gap-1 border-t border-[var(--pm-border)] px-4 pt-2 pb-1">
        {INTENT_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const active = chat.intent === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => chat.setIntent(opt.value)}
              className={`inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-medium transition ${
                active
                  ? "bg-[#6366f1] text-white"
                  : "bg-[var(--pm-gray-light)] text-[var(--pm-text-secondary)] hover:bg-[#e0e2e8]"
              }`}
            >
              <Icon size={10} />
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Input */}
      <form onSubmit={chat.handleSubmit} className="flex items-center gap-2 border-t border-[var(--pm-border)] px-4 py-3">
        <input
          value={chat.input}
          onChange={(e) => chat.setInput(e.target.value)}
          placeholder="Message Larry…"
          disabled={chat.busy}
          className="flex-1 h-9 rounded-lg border border-[var(--pm-border)] bg-[var(--pm-gray-light)] px-3 text-[13px] outline-none focus:border-[#6366f1] focus:bg-white disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={chat.busy || chat.input.trim().length < 2}
          className="h-9 rounded-lg bg-[#6366f1] px-3 text-[13px] font-medium text-white disabled:opacity-50 hover:bg-[#4f46e5]"
        >
          {chat.busy ? "…" : "Send"}
        </button>
      </form>
    </div>
  );
}
