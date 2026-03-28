"use client";

import { useEffect, useRef } from "react";
import { Mic, Sparkles, X } from "lucide-react";
import { useLarryChat, type LarryMessage } from "./useLarryChat";

interface LarryChatProps {
  projectId?: string;
  onVoiceInput?: () => void;
}

function MessageBubble({ msg }: { msg: LarryMessage }) {
  const isLarry = msg.role === "larry";
  const isProcessing = msg.id === "processing";
  return (
    <div className={`flex ${isLarry ? "justify-start" : "justify-end"} mb-2`}>
      <div
        className={`max-w-[85%] rounded-xl px-3 py-2 text-[13px] leading-relaxed ${
          isLarry
            ? "bg-[#f5f3ff] text-[var(--pm-text)]"
            : "bg-[#6366f1] text-white"
        }`}
      >
        {isProcessing ? (
          <span className="flex items-center gap-1 py-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[#6366f1] animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="h-1.5 w-1.5 rounded-full bg-[#6366f1] animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="h-1.5 w-1.5 rounded-full bg-[#6366f1] animate-bounce" style={{ animationDelay: "300ms" }} />
          </span>
        ) : (
          <p>{msg.text}</p>
        )}
        {isLarry && (msg.actionsExecuted ?? 0) > 0 && (
          <p className="mt-1 text-[11px] text-[#6366f1]">
            {msg.actionsExecuted} action{msg.actionsExecuted !== 1 ? "s" : ""} taken
            {(msg.suggestionCount ?? 0) > 0 ? ` · ${msg.suggestionCount} suggestion${msg.suggestionCount !== 1 ? "s" : ""} pending` : ""}
          </p>
        )}
      </div>
    </div>
  );
}

export function LarryChat({ projectId, onVoiceInput }: LarryChatProps) {
  const chat = useLarryChat(projectId);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Listen for external open/push/load-conversation/prefill events
  useEffect(() => {
    function onOpen() { chat.open(); }
    function onPush(e: Event) {
      const msg = (e as CustomEvent<string>).detail;
      if (msg) chat.pushMessage(msg);
    }
    function onLoadConversation(e: Event) {
      const id = (e as CustomEvent<string>).detail;
      if (id) void chat.loadConversation(id);
    }
    function onPrefill(e: Event) {
      const text = (e as CustomEvent<string>).detail;
      if (text) {
        chat.open();
        chat.setInput(text);
      }
    }
    window.addEventListener("larry:open", onOpen);
    window.addEventListener("larry:push", onPush);
    window.addEventListener("larry:load-conversation", onLoadConversation);
    window.addEventListener("larry:prefill", onPrefill);
    return () => {
      window.removeEventListener("larry:open", onOpen);
      window.removeEventListener("larry:push", onPush);
      window.removeEventListener("larry:load-conversation", onLoadConversation);
      window.removeEventListener("larry:prefill", onPrefill);
    };
  }, [chat.open, chat.pushMessage, chat.loadConversation, chat.setInput]);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.messages]);

  if (!chat.isOpen) {
    return null;
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col rounded-2xl border border-[var(--pm-border)] bg-white shadow-2xl"
      style={{ width: 400, height: 520 }}
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
              {projectId
                ? "Tell Larry what to do — it will act immediately."
                : "Open a project first, or use the Larry section inside any project tab to talk to me in context."}
            </p>
          </div>
        )}
        {chat.messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={chat.handleSubmit} className="flex items-center gap-2 border-t border-[var(--pm-border)] px-4 py-3">
        <input
          value={chat.input}
          onChange={(e) => chat.setInput(e.target.value)}
          placeholder={projectId ? "Tell Larry what to do…" : "Open a project first"}
          disabled={chat.busy || !projectId}
          className="flex-1 h-9 rounded-lg border border-[var(--pm-border)] bg-[var(--pm-gray-light)] px-3 text-[13px] outline-none focus:border-[#6366f1] focus:bg-white disabled:opacity-50"
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
          className="h-9 rounded-lg bg-[#6366f1] px-3 text-[13px] font-medium text-white disabled:opacity-50 hover:bg-[#4f46e5]"
        >
          {chat.busy ? "…" : "Send"}
        </button>
      </form>
    </div>
  );
}
