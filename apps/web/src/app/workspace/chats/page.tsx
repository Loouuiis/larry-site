"use client";

import { MessageSquare, Plus, Sparkles } from "lucide-react";

export default function ChatsPage() {
  const openLarry = () => {
    window.dispatchEvent(new CustomEvent("larry:open"));
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-semibold text-[var(--pm-text)]">Chats</h1>
          <p className="text-[14px] text-[var(--pm-text-secondary)] mt-0.5">
            Your conversations with Larry.
          </p>
        </div>
        <button
          type="button"
          onClick={openLarry}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#6366f1] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#4f46e5] transition"
        >
          <Plus size={14} />
          New Chat
        </button>
      </div>

      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--pm-border)] py-20 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#f5f3ff]">
          <MessageSquare size={22} className="text-[#6366f1]" />
        </div>
        <p className="text-[15px] font-medium text-[var(--pm-text)]">No chats yet</p>
        <p className="mt-1 text-[13px] text-[var(--pm-text-secondary)] max-w-xs">
          Past Larry conversations will appear here. Start a new chat to coordinate work, get summaries, or draft follow-ups.
        </p>
        <button
          type="button"
          onClick={openLarry}
          className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-[#6366f1] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#4f46e5] transition"
        >
          <Sparkles size={13} />
          Ask Larry
        </button>
      </div>
    </div>
  );
}
