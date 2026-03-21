"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Sparkles, Mic, MicOff, ChevronDown } from "lucide-react";

const EASE = [0.22, 1, 0.36, 1] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: number;
  role: "larry" | "user";
  text: string;
  time: string;
}

// ─── Prompt cards ─────────────────────────────────────────────────────────────

const EXAMPLE_PROMPTS: { emoji: string; label: string; sub: string }[] = [
  { emoji: "🚀", label: "Create a project from this idea", sub: "Turn a description into a full project" },
  { emoji: "📋", label: "Summarize my tasks",             sub: "Get a quick overview of what's on your plate" },
  { emoji: "🔄", label: "Update project status",         sub: "Mark progress across one or more projects" },
];

// ─── Quick chips (shown after first message) ──────────────────────────────────

const QUICK_REPLIES = [
  "Who's blocked?",
  "Show overdue actions",
  "What's due this week?",
];

// ─── Mock responses ───────────────────────────────────────────────────────────

const MOCK_RESPONSES: Record<string, string> = {
  "Create a project from this idea":
    "Love it — let's build something. Drop your idea in a few sentences and I'll scaffold the project: goals, milestones, team structure, and a first-draft timeline. Ready when you are. ✍️",
  "Summarize my tasks":
    "Here's your task snapshot:\n\n🔴 3 overdue (Website Redesign, CRM Migration, Brand Refresh)\n🟡 5 due this week (Mobile MVP, Q1 Report…)\n🟢 12 on track\n\nYour busiest day looks like Thursday. Want me to suggest a re-prioritisation?",
  "Update project status":
    "Sure — which project would you like to update? You can say something like \"Mobile App MVP is 70% done\" and I'll log it, notify stakeholders, and flag any downstream blockers.",
  "Who's blocked?":
    "3 people appear blocked:\n• ME — security review, 4 days idle\n• SR — waiting on client sign-off\n• JP — Finance approval pending\n\nWant me to send a nudge to any of them?",
  "Show overdue actions":
    "7 overdue actions across your projects:\n• Finalise Q3 deliverables (SR)\n• Security review (ME)\n• Budget sign-off (JP)\n\nShall I draft reminder messages?",
  "What's due this week?":
    "This week (by Friday):\n• Mobile App MVP — final testing ⚠️\n• Q1 Analytics Report — dashboard section\n• Brand Identity — first draft review\n\n3 items need attention before Thursday. Want a full breakdown?",
};

const FALLBACK =
  "On it. Give me a moment to check the latest across your projects — I'll have something useful for you shortly. 👀";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function now() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LarryAvatar({ size = 24 }: { size?: number }) {
  return (
    <span
      className="shrink-0 flex items-center justify-center rounded-xl bg-[var(--color-brand)] font-bold text-white select-none"
      style={{ height: size, width: size, fontSize: size * 0.38 }}
    >
      L
    </span>
  );
}

function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="flex items-end gap-2"
    >
      <LarryAvatar size={26} />
      <div className="flex flex-col gap-0.5">
        <span className="text-[9px] text-neutral-400 pl-1">Larry is thinking…</span>
        <div className="flex gap-1 rounded-2xl rounded-bl-sm bg-[var(--color-surface)] px-3.5 py-2.5">
          {[0, 0.14, 0.28].map((delay, i) => (
            <motion.span
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-neutral-400"
              animate={{ y: [0, -5, 0] }}
              transition={{ duration: 0.55, repeat: Infinity, delay, ease: "easeInOut" }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isLarry = msg.role === "larry";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.22, ease: EASE }}
      className={`flex items-end gap-2 ${isLarry ? "" : "flex-row-reverse"}`}
    >
      {isLarry && <LarryAvatar size={26} />}
      <div className="flex flex-col gap-0.5 max-w-[82%]">
        {isLarry && (
          <span className="text-[9px] text-neutral-400 pl-1">Larry · {msg.time}</span>
        )}
        <div
          className={[
            "px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-line",
            isLarry
              ? "bg-[var(--color-surface)] text-neutral-700 rounded-2xl rounded-bl-sm"
              : "bg-[var(--color-brand)] text-white rounded-2xl rounded-br-sm",
          ].join(" ")}
        >
          {msg.text}
        </div>
        {!isLarry && (
          <span className="text-[9px] text-neutral-400 pr-1 text-right">You · {msg.time}</span>
        )}
      </div>
    </motion.div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function LarryChat() {
  const [open, setOpen]         = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput]       = useState("");
  const [typing, setTyping]     = useState(false);
  const [listening, setListening] = useState(false);
  const [minimised, setMinimised] = useState(false);
  const bottomRef               = useRef<HTMLDivElement>(null);
  const inputRef                = useRef<HTMLInputElement>(null);
  const hasMessages             = messages.length > 0;

  useEffect(() => {
    if (open && !minimised) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, open, minimised]);

  useEffect(() => {
    if (open && !minimised) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open, minimised]);

  // Fake voice: toggle for 2.5s then auto-off
  function toggleVoice() {
    if (listening) { setListening(false); return; }
    setListening(true);
    setTimeout(() => {
      setListening(false);
      // Simulate a transcript appearing
      setInput("Summarize my tasks");
    }, 2500);
  }

  function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const userMsg: Message = { id: Date.now(), role: "user", text: trimmed, time: now() };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setTyping(true);
    setTimeout(() => {
      const reply = MOCK_RESPONSES[trimmed] ?? FALLBACK;
      setMessages((m) => [...m, { id: Date.now() + 1, role: "larry", text: reply, time: now() }]);
      setTyping(false);
    }, 1100 + Math.random() * 400);
  }

  function handlePrompt(label: string) {
    sendMessage(label);
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      {/* ── Chat window ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="chat-panel"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.95 }}
            transition={{ duration: 0.28, ease: EASE }}
            className="flex flex-col w-[340px] sm:w-[390px] overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white shadow-[0_24px_64px_rgba(0,0,0,0.13),0_4px_16px_rgba(0,0,0,0.06)]"
            style={{ maxHeight: minimised ? 0 : "min(580px, calc(100vh - 120px))" }}
          >
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-[var(--color-border)] bg-white px-4 py-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--color-brand)]">
                <Sparkles size={15} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-neutral-900 tracking-[-0.02em]">Larry</p>
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
                  <p className="text-[10px] text-neutral-400">AI Project Manager · always on</p>
                </div>
              </div>
              {hasMessages && (
                <motion.button
                  onClick={() => setMessages([])}
                  whileTap={{ scale: 0.92 }}
                  className="flex h-6 items-center gap-1 rounded-lg px-2 text-[10px] font-medium text-neutral-400 hover:bg-white/70 hover:text-neutral-600 transition-colors"
                  title="Clear chat"
                >
                  Clear
                </motion.button>
              )}
              <motion.button
                onClick={() => setMinimised((v) => !v)}
                whileTap={{ scale: 0.92 }}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/70 hover:text-neutral-600 transition-colors"
                aria-label="Minimise"
              >
                <ChevronDown size={14} className={minimised ? "rotate-180" : ""} />
              </motion.button>
              <motion.button
                onClick={() => { setOpen(false); setMinimised(false); }}
                whileTap={{ scale: 0.92 }}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/70 hover:text-neutral-600 transition-colors"
                aria-label="Close"
              >
                <X size={14} />
              </motion.button>
            </div>

            <AnimatePresence>
              {!minimised && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="flex flex-col flex-1 overflow-hidden"
                >
                  {/* Messages / Empty state */}
                  <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                    {!hasMessages ? (
                      /* Welcome / empty state */
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, ease: EASE }}
                        className="flex flex-col items-center gap-5 py-4 text-center"
                      >
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-brand)]">
                          <Sparkles size={24} className="text-white" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-neutral-900 tracking-[-0.02em]">
                            Hey, I&apos;m Larry 👋
                          </p>
                          <p className="mt-1 text-xs text-neutral-500 leading-relaxed max-w-[260px]">
                            Your AI project manager. I keep tabs on everything so you don&apos;t have to.
                          </p>
                        </div>

                        {/* Prompt cards */}
                        <div className="flex flex-col gap-2 w-full">
                          {EXAMPLE_PROMPTS.map((p) => (
                            <motion.button
                              key={p.label}
                              onClick={() => handlePrompt(p.label)}
                              whileHover={{ scale: 1.015, x: 2 }}
                              whileTap={{ scale: 0.985 }}
                              transition={{ duration: 0.15, ease: EASE }}
                              className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-3 text-left transition-shadow hover:border-[var(--color-brand)]/25 hover:shadow-[0_2px_12px_rgba(139,92,246,0.08)]"
                            >
                              <span className="text-lg shrink-0">{p.emoji}</span>
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-neutral-800 truncate">{p.label}</p>
                                <p className="text-[10px] text-neutral-400 leading-snug truncate">{p.sub}</p>
                              </div>
                            </motion.button>
                          ))}
                        </div>
                      </motion.div>
                    ) : (
                      /* Message list */
                      <>
                        {messages.map((msg) => (
                          <MessageBubble key={msg.id} msg={msg} />
                        ))}
                        <AnimatePresence>
                          {typing && <TypingIndicator key="typing" />}
                        </AnimatePresence>
                        <div ref={bottomRef} />
                      </>
                    )}
                  </div>

                  {/* Quick replies (only shown when there are messages) */}
                  <AnimatePresence>
                    {hasMessages && !typing && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="flex gap-1.5 overflow-x-auto px-4 pb-2 scrollbar-none"
                      >
                        {QUICK_REPLIES.map((r) => (
                          <motion.button
                            key={r}
                            onClick={() => sendMessage(r)}
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.96 }}
                            className="shrink-0 rounded-full border border-[var(--color-brand)]/20 bg-[var(--color-brand)]/5 px-3 py-1.5 text-[11px] font-medium text-[var(--color-brand)] hover:bg-[var(--color-brand)]/10 transition-colors whitespace-nowrap"
                          >
                            {r}
                          </motion.button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Input bar */}
                  <form
                    onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}
                    className="flex items-center gap-2 border-t border-[var(--color-border)] px-3 py-3"
                  >
                    {/* Voice button */}
                    <motion.button
                      type="button"
                      onClick={toggleVoice}
                      whileHover={{ scale: 1.06 }}
                      whileTap={{ scale: 0.92 }}
                      aria-label={listening ? "Stop listening" : "Voice input"}
                      className={[
                        "relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all duration-200",
                        listening
                          ? "bg-red-500 text-white shadow-[0_0_0_4px_rgba(239,68,68,0.2)]"
                          : "bg-[var(--color-surface)] text-neutral-500 hover:text-[var(--color-brand)]",
                      ].join(" ")}
                    >
                      {listening ? (
                        <>
                          <MicOff size={13} />
                          {/* Pulse ring */}
                          <motion.span
                            className="absolute inset-0 rounded-xl border-2 border-red-400"
                            animate={{ scale: [1, 1.4], opacity: [0.7, 0] }}
                            transition={{ duration: 0.9, repeat: Infinity, ease: "easeOut" }}
                          />
                        </>
                      ) : (
                        <Mic size={13} />
                      )}
                    </motion.button>

                    <input
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder={listening ? "Listening…" : "Ask Larry anything…"}
                      disabled={listening}
                      className="flex-1 rounded-xl bg-[var(--color-surface)] px-3.5 py-2 text-xs text-neutral-700 placeholder:text-neutral-400 outline-none focus:ring-2 focus:ring-[var(--color-brand)]/20 transition-shadow disabled:opacity-50"
                    />

                    <motion.button
                      type="submit"
                      disabled={!input.trim() || listening}
                      whileHover={{ scale: 1.06 }}
                      whileTap={{ scale: 0.92 }}
                      transition={{ duration: 0.15, ease: EASE }}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--color-brand)] text-white shadow-[0_2px_8px_rgba(139,92,246,0.3)] transition-all hover:bg-[var(--color-brand-dark)] disabled:opacity-35 disabled:cursor-not-allowed disabled:shadow-none"
                    >
                      <Send size={13} />
                    </motion.button>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── FAB trigger ── */}
      <motion.button
        onClick={() => { setOpen((v) => !v); setMinimised(false); }}
        aria-label={open ? "Close Larry" : "Open Larry"}
        whileHover={{ scale: 1.07 }}
        whileTap={{ scale: 0.93 }}
        transition={{ duration: 0.18, ease: EASE }}
        className="relative flex items-center justify-center rounded-2xl bg-[var(--color-brand)] text-white shadow-[0_4px_16px_rgba(139,92,246,0.3)] hover:bg-[var(--color-brand-dark)] hover:shadow-[0_6px_20px_rgba(139,92,246,0.35)] transition-all"
        style={{ height: 52, width: 52 }}
      >
        <AnimatePresence mode="wait">
          {open ? (
            <motion.span
              key="x"
              initial={{ opacity: 0, rotate: -80, scale: 0.8 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={{ opacity: 0, rotate: 80, scale: 0.8 }}
              transition={{ duration: 0.2 }}
            >
              <X size={20} />
            </motion.span>
          ) : (
            <motion.span
              key="sparkle"
              initial={{ opacity: 0, rotate: 80, scale: 0.8 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={{ opacity: 0, rotate: -80, scale: 0.8 }}
              transition={{ duration: 0.2 }}
            >
              <Sparkles size={20} />
            </motion.span>
          )}
        </AnimatePresence>
        {/* Online dot */}
        {!open && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-400"
          />
        )}
      </motion.button>
    </div>
  );
}
