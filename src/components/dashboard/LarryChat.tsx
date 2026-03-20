"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Sparkles } from "lucide-react";

const EASE = [0.22, 1, 0.36, 1] as const;

interface Message {
  id: number;
  role: "larry" | "user";
  text: string;
  time: string;
}

const INITIAL_MESSAGES: Message[] = [
  {
    id: 1,
    role: "larry",
    text: "Hi! I'm Larry, your AI project manager. I'm keeping an eye on your 4 active projects. How can I help?",
    time: "Just now",
  },
  {
    id: 2,
    role: "larry",
    text: "⚠️ Heads up — Q3 Programme has 3 overdue actions. Want me to send reminders to the owners?",
    time: "Just now",
  },
];

const QUICK_REPLIES = [
  "Show overdue actions",
  "Summarise Q3 Programme",
  "Who's blocked?",
];

const MOCK_RESPONSES: Record<string, string> = {
  "Show overdue actions":
    "There are 7 overdue actions across your projects:\n• Finalise Q3 deliverables (SR, Q3 Programme)\n• Security review approval (ME, Platform Migration)\n• Budget sign-off from Finance (JP, Alpha Launch)\n\nShall I send reminders to all three?",
  "Summarise Q3 Programme":
    "Q3 Programme is at 45% completion with 9 open actions. The biggest blocker is the client deliverables sign-off — SR hasn't responded in 2 days. I've flagged this to LP. Deadline is Mar 28.",
  "Who's blocked?":
    "3 people appear blocked based on recent inactivity:\n• ME — no update on security review for 4 days\n• SR — client deliverables pending client response\n• JP — waiting on Finance approval (escalated yesterday)\n\nWant me to reach out to any of them?",
};

export function LarryChat() {
  const [open, setOpen]         = useState(false);
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [input, setInput]       = useState("");
  const [typing, setTyping]     = useState(false);
  const bottomRef               = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  function sendMessage(text: string) {
    if (!text.trim()) return;
    const userMsg: Message = {
      id: Date.now(),
      role: "user",
      text: text.trim(),
      time: "Just now",
    };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setTyping(true);

    setTimeout(() => {
      const response =
        MOCK_RESPONSES[text.trim()] ??
        "Got it. I'll look into that and update you shortly. Is there anything else you need right now?";
      setMessages((m) => [
        ...m,
        { id: Date.now() + 1, role: "larry", text: response, time: "Just now" },
      ]);
      setTyping(false);
    }, 1100);
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="chat-panel"
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ duration: 0.26, ease: EASE }}
            className="flex flex-col w-[340px] sm:w-[380px] overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[0_24px_64px_rgba(0,0,0,0.12),0_4px_16px_rgba(0,0,0,0.06)]"
            style={{ maxHeight: "min(520px, calc(100vh - 120px))" }}
          >
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-neutral-100 bg-gradient-to-r from-[var(--color-brand)]/5 to-[var(--color-accent-blue)]/5 px-4 py-3.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--color-brand)] shadow-[0_2px_8px_rgba(139,92,246,0.35)]">
                <Sparkles size={14} className="text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-neutral-900">Larry</p>
                <div className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 live-pulse" aria-hidden="true" />
                  <p className="text-[10px] text-neutral-400">Active · AI Project Manager</p>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-white hover:text-neutral-600 transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, ease: EASE }}
                  className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                >
                  {msg.role === "larry" && (
                    <span className="flex h-6 w-6 shrink-0 mt-0.5 items-center justify-center rounded-lg bg-[var(--color-brand)] text-[8px] font-bold text-white select-none">
                      L
                    </span>
                  )}
                  <div
                    className={[
                      "max-w-[82%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-line",
                      msg.role === "larry"
                        ? "bg-[var(--color-surface)] text-neutral-700 rounded-tl-sm"
                        : "bg-[var(--color-brand)] text-white rounded-tr-sm",
                    ].join(" ")}
                  >
                    {msg.text}
                  </div>
                </motion.div>
              ))}

              {/* Typing indicator */}
              <AnimatePresence>
                {typing && (
                  <motion.div
                    key="typing"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="flex items-center gap-2.5"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[var(--color-brand)] text-[8px] font-bold text-white select-none">
                      L
                    </span>
                    <div className="flex gap-1 rounded-2xl rounded-tl-sm bg-[var(--color-surface)] px-4 py-3">
                      {[0, 0.15, 0.3].map((delay, i) => (
                        <motion.span
                          key={i}
                          className="h-1.5 w-1.5 rounded-full bg-neutral-400"
                          animate={{ y: [0, -4, 0] }}
                          transition={{ duration: 0.6, repeat: Infinity, delay, ease: "easeInOut" }}
                        />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div ref={bottomRef} />
            </div>

            {/* Quick replies */}
            <div className="flex gap-1.5 overflow-x-auto px-4 pb-2 scrollbar-hide">
              {QUICK_REPLIES.map((r) => (
                <button
                  key={r}
                  onClick={() => sendMessage(r)}
                  className="shrink-0 rounded-full border border-[var(--color-brand)]/20 bg-[var(--color-brand)]/5 px-3 py-1.5 text-[11px] font-medium text-[var(--color-brand)] transition-colors hover:bg-[var(--color-brand)]/10 whitespace-nowrap"
                >
                  {r}
                </button>
              ))}
            </div>

            {/* Input */}
            <form
              onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}
              className="flex items-center gap-2 border-t border-neutral-100 px-3 py-3"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask Larry anything…"
                className="flex-1 rounded-xl bg-[var(--color-surface)] px-3.5 py-2 text-xs text-neutral-700 placeholder:text-neutral-400 outline-none focus:ring-2 focus:ring-[var(--color-brand)]/20 transition-shadow"
              />
              <button
                type="submit"
                disabled={!input.trim()}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--color-brand)] text-white shadow-[0_2px_8px_rgba(139,92,246,0.3)] transition-all hover:bg-[var(--color-brand-dark)] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Send size={13} />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Trigger button */}
      <motion.button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close Larry chat" : "Open Larry chat"}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        transition={{ duration: 0.18, ease: EASE }}
        className="relative flex h-13 w-13 items-center justify-center rounded-2xl bg-[var(--color-brand)] text-white shadow-[0_4px_20px_rgba(139,92,246,0.45)] transition-shadow hover:shadow-[0_6px_28px_rgba(139,92,246,0.55)]"
        style={{ height: 52, width: 52 }}
      >
        <AnimatePresence mode="wait">
          {open ? (
            <motion.span
              key="x"
              initial={{ opacity: 0, rotate: -90 }}
              animate={{ opacity: 1, rotate: 0 }}
              exit={{ opacity: 0, rotate: 90 }}
              transition={{ duration: 0.18 }}
            >
              <X size={20} />
            </motion.span>
          ) : (
            <motion.span
              key="sparkle"
              initial={{ opacity: 0, rotate: 90 }}
              animate={{ opacity: 1, rotate: 0 }}
              exit={{ opacity: 0, rotate: -90 }}
              transition={{ duration: 0.18 }}
            >
              <Sparkles size={20} />
            </motion.span>
          )}
        </AnimatePresence>
        {/* Unread dot */}
        {!open && (
          <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-400" />
        )}
      </motion.button>
    </div>
  );
}
