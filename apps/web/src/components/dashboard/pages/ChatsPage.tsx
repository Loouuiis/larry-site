"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Search } from "lucide-react";

const EASE = [0.22, 1, 0.36, 1] as const;

interface ChatThread {
  id: string;
  name: string;
  context: string;
  lastMessage: string;
  time: string;
  unread: number;
  messages: { role: "larry" | "user"; text: string; time: string }[];
}

const THREADS: ChatThread[] = [
  {
    id: "alpha",
    name: "Alpha Launch",
    context: "Project channel",
    lastMessage: "API spec sign-off is overdue. Shall I escalate to TK?",
    time: "2m ago",
    unread: 2,
    messages: [
      { role: "larry", text: "Good morning! Alpha Launch has 4 open actions. The API spec sign-off with TK is now overdue — it was due yesterday.", time: "9:00am" },
      { role: "user",  text: "Has TK been reminded?", time: "9:02am" },
      { role: "larry", text: "Yes — I sent a reminder at 8am. No response yet. Want me to escalate to their manager or push the deadline to tomorrow?", time: "9:02am" },
      { role: "larry", text: "API spec sign-off is overdue. Shall I escalate to TK?", time: "9:05am" },
    ],
  },
  {
    id: "q3",
    name: "Q3 Programme",
    context: "Project channel",
    lastMessage: "3 actions are overdue. I've flagged LP as the coordinator.",
    time: "18m ago",
    unread: 1,
    messages: [
      { role: "larry", text: "Q3 Programme standup summary is ready. Here are the highlights:\n• 9 open actions, 3 overdue\n• SR's client deliverables are blocked pending client response\n• LP has been flagged as coordinator", time: "8:30am" },
      { role: "user",  text: "What's the risk to the March 28 deadline?", time: "8:35am" },
      { role: "larry", text: "High risk. At current velocity, 6 of the 9 open actions won't close before March 28. I'd recommend a focused review session today. Want me to draft the agenda?", time: "8:35am" },
      { role: "larry", text: "3 actions are overdue. I've flagged LP as the coordinator.", time: "9:02am" },
    ],
  },
  {
    id: "vendor",
    name: "Vendor Onboarding",
    context: "Project channel",
    lastMessage: "Contract finalisation is on track for Apr 2.",
    time: "2h ago",
    unread: 0,
    messages: [
      { role: "larry", text: "Vendor Onboarding is at 88% — great progress. The only remaining open action is the contract finalisation with AK, due Apr 2.", time: "7:00am" },
      { role: "user",  text: "Any risks I should know about?", time: "7:05am" },
      { role: "larry", text: "No blockers currently. AK confirmed the contract review is in progress. I'll alert you immediately if anything changes.", time: "7:05am" },
      { role: "larry", text: "Contract finalisation is on track for Apr 2.", time: "7:30am" },
    ],
  },
  {
    id: "platform",
    name: "Platform Migration",
    context: "Project channel",
    lastMessage: "Security review is still blocked. ME hasn't responded.",
    time: "3h ago",
    unread: 3,
    messages: [
      { role: "larry", text: "Platform Migration is now overdue (was due Mar 20). The main blocker is the security review — ME hasn't updated in 4 days.", time: "6:00am" },
      { role: "user",  text: "Have we escalated?", time: "6:10am" },
      { role: "larry", text: "Yes — I escalated to LP yesterday at 2pm. Still no response. I'd recommend a direct call with ME today to unblock this.", time: "6:10am" },
      { role: "larry", text: "Security review is still blocked. ME hasn't responded.", time: "6:30am" },
    ],
  },
];

const container = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.06 } },
};
const itemAnim = {
  hidden:  { opacity: 0, x: -10 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.4, ease: EASE } },
};

export function ChatsPage() {
  const [activeThread, setActiveThread] = useState(THREADS[0].id);
  const [inputs, setInputs]             = useState<Record<string, string>>({});

  const thread = THREADS.find((t) => t.id === activeThread)!;

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden rounded-2xl border border-[var(--border)] bg-white pb-4 shadow-card">

      {/* Thread list */}
      <motion.aside
        variants={container}
        initial="hidden"
        animate="visible"
        className="w-64 shrink-0 border-r border-[var(--border)] flex flex-col"
      >
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3.5">
          <Search size={13} className="shrink-0 text-[var(--text-disabled)]" />
          <input
            placeholder="Search chats…"
            className="flex-1 bg-transparent text-xs text-[var(--text-2)] placeholder:text-[var(--text-disabled)] outline-none"
          />
        </div>
        <ul role="list" className="flex-1 overflow-y-auto">
          {THREADS.map((t) => {
            const isActive = t.id === activeThread;
            return (
              <motion.li key={t.id} variants={itemAnim}>
                <button
                  onClick={() => setActiveThread(t.id)}
                  className={[
                    "w-full text-left px-4 py-3.5 border-b border-[var(--border)] transition-colors",
                    isActive ? "bg-[var(--color-brand)]/5" : "hover:bg-[var(--surface-2)]",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-semibold ${isActive ? "text-[var(--color-brand)]" : "text-[var(--text-1)]"}`}>
                      {t.name}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-[var(--text-disabled)]">{t.time}</span>
                      {t.unread > 0 && (
                        <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--color-brand)] px-1 text-[9px] font-bold text-white">
                          {t.unread}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-[10px] text-[var(--text-disabled)] truncate">{t.lastMessage}</p>
                </button>
              </motion.li>
            );
          })}
        </ul>
      </motion.aside>

      {/* Message view */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-3.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-[var(--color-brand)] text-[9px] font-bold text-white select-none">
            L
          </div>
          <div>
            <p className="text-sm font-semibold text-[var(--text-1)]">{thread.name}</p>
            <p className="text-[10px] text-[var(--text-disabled)]">{thread.context}</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5 rounded-full border border-[var(--color-brand)]/20 bg-[var(--color-brand)]/5 px-3 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 live-pulse" aria-hidden="true" />
            <span className="text-[10px] font-medium text-[var(--color-brand)]">Larry is active</span>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeThread}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {thread.messages.map((msg, i) => (
                <div key={i} className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                  {msg.role === "larry" && (
                    <span className="flex h-6 w-6 shrink-0 mt-0.5 items-center justify-center rounded-lg bg-[var(--color-brand)] text-[8px] font-bold text-white select-none">
                      L
                    </span>
                  )}
                  <div className="max-w-[75%] space-y-1">
                    <div
                      className={[
                        "rounded-2xl px-4 py-2.5 text-xs leading-relaxed whitespace-pre-line",
                        msg.role === "larry"
                          ? "bg-[var(--surface-2)] text-[var(--text-2)] rounded-tl-sm"
                          : "bg-[var(--color-brand)] text-white rounded-tr-sm",
                      ].join(" ")}
                    >
                      {msg.text}
                    </div>
                    <p className={`text-[10px] text-[var(--text-disabled)] ${msg.role === "user" ? "text-right" : ""}`}>
                      {msg.time}
                    </p>
                  </div>
                </div>
              ))}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Input */}
        <div className="border-t border-[var(--border)] px-4 py-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setInputs((p) => ({ ...p, [activeThread]: "" }));
            }}
            className="flex items-center gap-2"
          >
            <input
              value={inputs[activeThread] ?? ""}
              onChange={(e) => setInputs((p) => ({ ...p, [activeThread]: e.target.value }))}
              placeholder={`Message Larry about ${thread.name}…`}
              className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-2 text-xs text-[var(--text-2)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[var(--color-brand)]/40 focus:ring-2 focus:ring-[var(--color-brand)]/10 transition-all"
            />
            <button
              type="submit"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--color-brand)] text-white shadow-[0_2px_8px_rgba(139,92,246,0.25)] hover:bg-[var(--color-brand-dark)] transition-colors"
            >
              <Send size={13} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
