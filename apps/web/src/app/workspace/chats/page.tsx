"use client";

import { useEffect, useState } from "react";
import { Clock, MessageSquare, Plus, Sparkles } from "lucide-react";

interface Conversation {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function ChatsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/workspace/larry/conversations");
        const data = (await res.json()) as { items?: Conversation[] };
        setConversations(data.items ?? []);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  function openNewChat() {
    window.dispatchEvent(new CustomEvent("larry:open"));
  }

  function openConversation(id: string) {
    window.dispatchEvent(new CustomEvent("larry:load-conversation", { detail: id }));
  }

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
          onClick={openNewChat}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#6366f1] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#4f46e5] transition-colors"
        >
          <Plus size={14} />
          New Chat
        </button>
      </div>

      {loading && (
        <p className="text-[14px] text-[var(--pm-text-muted)]">Loading…</p>
      )}

      {!loading && conversations.length === 0 && (
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
            onClick={openNewChat}
            className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-[#6366f1] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#4f46e5] transition-colors"
          >
            <Sparkles size={13} />
            Ask Larry
          </button>
        </div>
      )}

      {!loading && conversations.length > 0 && (
        <div className="space-y-2">
          {conversations.map((conv) => (
            <button
              key={conv.id}
              type="button"
              onClick={() => openConversation(conv.id)}
              className="w-full flex items-center gap-3 rounded-xl border border-[var(--pm-border)] bg-white p-4 text-left hover:border-[#6366f1] hover:bg-[#faf9ff] transition-colors shadow-sm"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f5f3ff]">
                <MessageSquare size={16} className="text-[#6366f1]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-medium text-[var(--pm-text)] truncate">
                  {conv.title ?? "Conversation"}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0 text-[12px] text-[var(--pm-text-muted)]">
                <Clock size={11} />
                {formatDate(conv.updatedAt)}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
