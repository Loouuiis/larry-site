"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Check, X, MessageSquare, Sparkles, Loader2 } from "lucide-react";
import type { LarryEvent } from "@/hooks/useLarryEvents";
import { readJson } from "@/lib/larry";

// ── Tab context ───────────────────────────────────────────────────────────────

type TabId = "overview" | "timeline" | "analytics" | "meetings" | "orgchart" | "documents";

// Maps each action_type to the tab where it is shown.
// "overview" shows ALL suggestions (Action Centre home base).
// Other tabs filter to only their mapped types.
const ACTION_TAB_MAP: Record<string, TabId> = {
  task_create: "overview",
  status_update: "overview",
  owner_change: "overview",
  deadline_change: "timeline",
  risk_flag: "analytics",
  reminder_send: "meetings",
  scope_change: "documents",
  email_draft: "documents",
  project_create: "overview",
};

const TAB_CONTEXT: Record<TabId, { label: string; placeholder: string; contextHint: string }> = {
  overview: {
    label: "Tasks",
    placeholder: "Ask Larry about tasks, assignments, priorities…",
    contextHint: "The user is on the Tasks tab, looking at task management, assignments, and status.",
  },
  timeline: {
    label: "Timeline",
    placeholder: "Ask Larry about deadlines, scheduling, milestones…",
    contextHint: "The user is on the Timeline tab, looking at scheduling, deadlines, and milestones.",
  },
  analytics: {
    label: "Analytics",
    placeholder: "Ask Larry about project health, risk, or metrics…",
    contextHint: "The user is on the Analytics tab, looking at project health, risk scores, and completion metrics.",
  },
  meetings: {
    label: "Meetings",
    placeholder: "Ask Larry about meeting notes, action items…",
    contextHint: "The user is on the Meetings tab, looking at meeting notes and extracted action items.",
  },
  orgchart: {
    label: "Team",
    placeholder: "Ask Larry about workload, team capacity, ownership…",
    contextHint: "The user is on the Team tab, looking at member workload, blocked tasks, and ownership.",
  },
  documents: {
    label: "Documents",
    placeholder: "Ask Larry about project scope, documents, decisions…",
    contextHint: "The user is on the Documents tab, looking at project documentation and scope.",
  },
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface LarryTabSectionProps {
  projectId: string;
  tabId: TabId;
  suggested: LarryEvent[];
  activity: LarryEvent[];
  accepting: string | null;
  dismissing: string | null;
  onAccept: (id: string) => Promise<void>;
  onDismiss: (id: string) => Promise<void>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRelativeTime(value: string): string {
  const delta = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(delta / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function LarryTabSection({
  projectId,
  tabId,
  suggested,
  activity,
  accepting,
  dismissing,
  onAccept,
  onDismiss,
}: LarryTabSectionProps) {
  const ctx = TAB_CONTEXT[tabId];
  const storageKey = `larry-section-${projectId}-${tabId}`;
  const suggestionsStorageKey = `larry-suggestions-${projectId}-${tabId}`;

  const [sectionCollapsed, setSectionCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(storageKey) === "true";
  });
  const [suggestionsCollapsed, setSuggestionsCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(suggestionsStorageKey) === "true";
  });

  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [showAllActivity, setShowAllActivity] = useState(false);
  const [chatResponse, setChatResponse] = useState<{
    text: string;
    actionsExecuted?: number;
    suggestionCount?: number;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Persist collapse state
  const toggleSection = useCallback(() => {
    setSectionCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(storageKey, String(next));
      return next;
    });
  }, [storageKey]);

  const toggleSuggestions = useCallback(() => {
    setSuggestionsCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(suggestionsStorageKey, String(next));
      return next;
    });
  }, [suggestionsStorageKey]);

  // Clear chat response when tab changes
  useEffect(() => {
    setChatResponse(null);
  }, [tabId]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || busy) return;
      setBusy(true);
      setChatResponse(null);
      const fullMessage = `[${ctx.contextHint}]\n\n${text}`;
      try {
        const res = await fetch("/api/workspace/larry/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, message: fullMessage }),
        });
        const data = await readJson<{
          message?: string;
          actionsExecuted?: number;
          suggestionCount?: number;
          error?: string;
        }>(res);
        setChatResponse({
          text: res.ok ? (data.message ?? "Done.") : (data.error ?? "Something went wrong."),
          actionsExecuted: data.actionsExecuted,
          suggestionCount: data.suggestionCount,
        });
        if (res.ok && (data.actionsExecuted ?? 0) > 0) {
          window.dispatchEvent(new CustomEvent("larry:refresh-snapshot"));
        }
      } catch {
        setChatResponse({ text: "Network error — please try again." });
      } finally {
        setBusy(false);
      }
    },
    [busy, projectId, ctx.contextHint]
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const text = input.trim();
      if (!text) return;
      setInput("");
      await sendMessage(text);
    },
    [input, sendMessage]
  );

  // "Chat to refine" — pre-fill the chat input so the user can edit before sending
  const chatToRefine = useCallback((suggestion: LarryEvent) => {
    const msg = `I want to adjust: ${suggestion.displayText}`;
    window.dispatchEvent(new CustomEvent("larry:prefill", { detail: msg }));
  }, []);

  // Filter suggestions to those relevant for this tab.
  // The overview tab acts as Action Centre and shows everything.
  const tabSuggested = tabId === "overview"
    ? suggested
    : suggested.filter((e) => (ACTION_TAB_MAP[e.actionType] ?? "overview") === tabId);

  const hasSuggestions = tabSuggested.length > 0;
  const hasActivity = activity.length > 0;

  return (
    <div className="mb-6 rounded-[18px] border border-[#e8e4f9] bg-[#faf9ff]">
      {/* Section header */}
      <button
        type="button"
        onClick={toggleSection}
        className="flex w-full items-center justify-between rounded-[18px] px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-[#6366f1]" />
          <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#6366f1]">
            Larry
          </span>
          {hasSuggestions && !sectionCollapsed && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
              {tabSuggested.length} pending
            </span>
          )}
          {hasSuggestions && sectionCollapsed && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
              {tabSuggested.length}
            </span>
          )}
        </div>
        {sectionCollapsed
          ? <ChevronRight size={14} className="text-[#9694a8]" />
          : <ChevronDown size={14} className="text-[#9694a8]" />}
      </button>

      {!sectionCollapsed && (
        <div className="px-4 pb-4 space-y-4">
          {/* ── Chat input ─────────────────────────────────────────────── */}
          <div>
            <form onSubmit={handleSubmit} className="flex items-center gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={ctx.placeholder}
                disabled={busy}
                className="flex-1 h-9 rounded-xl border border-[#e2defc] bg-white px-3 text-[13px] outline-none focus:border-[#6366f1] disabled:opacity-50 placeholder:text-[#b0add8]"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-[#6366f1] px-3 text-[12px] font-medium text-white disabled:opacity-40 hover:bg-[#4f46e5]"
              >
                {busy
                  ? <Loader2 size={13} className="animate-spin" />
                  : <Sparkles size={13} />}
                {busy ? "Working…" : "Ask"}
              </button>
            </form>

            {/* Chat response */}
            {chatResponse && (
              <div className="mt-2 rounded-xl border border-[#e8e4f9] bg-[#f5f3ff] px-3 py-2">
                <p className="text-[13px] text-[#4c3fa0] leading-relaxed">{chatResponse.text}</p>
                {(chatResponse.actionsExecuted ?? 0) > 0 && (
                  <p className="mt-1 text-[11px] text-[#6366f1]">
                    {chatResponse.actionsExecuted} action{chatResponse.actionsExecuted !== 1 ? "s" : ""} taken
                    {(chatResponse.suggestionCount ?? 0) > 0
                      ? ` · ${chatResponse.suggestionCount} suggestion${chatResponse.suggestionCount !== 1 ? "s" : ""} added`
                      : ""}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => setChatResponse(null)}
                  className="mt-1 text-[11px] text-[#9694a8] hover:text-[#6366f1]"
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>

          {/* ── Pending suggestions ────────────────────────────────────── */}
          {hasSuggestions && (
            <div>
              <button
                type="button"
                onClick={toggleSuggestions}
                className="flex w-full items-center justify-between py-1"
              >
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#D97706]">
                  Pending approval · {tabSuggested.length}
                </span>
                {suggestionsCollapsed
                  ? <ChevronRight size={12} className="text-[#D97706]" />
                  : <ChevronDown size={12} className="text-[#D97706]" />}
              </button>

              {!suggestionsCollapsed && (
                <div className="mt-2 space-y-2">
                  {tabSuggested.map((event) => (
                    <div
                      key={event.id}
                      className="rounded-[14px] border border-[#FDE68A] bg-[#FFFBEB] px-3 py-3"
                    >
                      <p className="text-[13px] font-medium text-[#92400e]">{event.displayText}</p>
                      {event.reasoning && (
                        <p className="mt-0.5 text-[12px] text-[#b45309] leading-relaxed">
                          {event.reasoning}
                        </p>
                      )}
                      <p className="mt-1 text-[10px] text-[#b45309]/60">
                        {formatRelativeTime(event.createdAt)}
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          type="button"
                          disabled={accepting === event.id || dismissing === event.id}
                          onClick={() => onAccept(event.id)}
                          className="flex items-center gap-1 rounded-lg bg-[#16a34a] px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-50 hover:bg-[#15803d]"
                        >
                          <Check size={11} />
                          {accepting === event.id ? "Accepting…" : "Accept"}
                        </button>
                        <button
                          type="button"
                          disabled={accepting === event.id || dismissing === event.id}
                          onClick={() => onDismiss(event.id)}
                          className="flex items-center gap-1 rounded-lg border border-[#e5e7eb] bg-white px-2.5 py-1 text-[11px] font-medium text-[#6b7280] disabled:opacity-50 hover:bg-[#f9fafb]"
                        >
                          <X size={11} />
                          {dismissing === event.id ? "Dismissing…" : "Decline"}
                        </button>
                        <button
                          type="button"
                          disabled={accepting === event.id || dismissing === event.id}
                          onClick={() => chatToRefine(event)}
                          className="flex items-center gap-1 rounded-lg border border-[#e8e4f9] bg-white px-2.5 py-1 text-[11px] font-medium text-[#6366f1] disabled:opacity-50 hover:bg-[#f5f3ff]"
                        >
                          <MessageSquare size={11} />
                          Chat to refine →
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Recent activity ────────────────────────────────────────── */}
          {hasActivity && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9694a8] mb-2">
                Larry did
              </p>
              <div className="space-y-1">
                {(showAllActivity ? activity : activity.slice(0, 3)).map((event) => (
                  <div key={event.id} className="flex items-start gap-2">
                    <Check size={11} className="mt-0.5 shrink-0 text-[#16a34a]" />
                    <p className="text-[12px] text-[#6b7280] leading-relaxed">
                      {event.displayText}
                      <span className="ml-1 text-[#b0b0b0]">· {formatRelativeTime(event.createdAt)}</span>
                    </p>
                  </div>
                ))}
              </div>
              {activity.length > 3 && (
                <button
                  type="button"
                  onClick={() => setShowAllActivity((v) => !v)}
                  className="mt-1 text-[11px] text-[#9694a8] hover:text-[#6366f1]"
                >
                  {showAllActivity ? "Show less" : `Show ${activity.length - 3} more…`}
                </button>
              )}
            </div>
          )}

          {/* Empty state */}
          {!hasSuggestions && !hasActivity && (
            <p className="text-[12px] text-[#b0add8]">
              No pending actions. Ask Larry anything about this {ctx.label.toLowerCase()} view.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
