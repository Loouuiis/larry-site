"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck2, ChevronDown, Clock, FileText, Upload, CheckCircle2, XCircle } from "lucide-react";

interface MeetingNote {
  id: string;
  title?: string | null;
  summary?: string | null;
  actionCount: number;
  meetingDate?: string | null;
  createdAt: string;
  projectId?: string | null;
  agentRunId?: string | null;
  agentRunState?: string | null;
}

type AgentRunState =
  | "INGESTED"
  | "NORMALIZED"
  | "EXTRACTED"
  | "PROPOSED"
  | "APPROVAL_PENDING"
  | "EXECUTED"
  | "VERIFIED"
  | "FAILED";

const STATE_PROGRESS: Record<AgentRunState, number> = {
  INGESTED: 10,
  NORMALIZED: 28,
  EXTRACTED: 55,
  PROPOSED: 75,
  APPROVAL_PENDING: 92,
  EXECUTED: 96,
  VERIFIED: 100,
  FAILED: 100,
};

const STATE_LABEL: Record<AgentRunState, string> = {
  INGESTED: "Ingesting transcript…",
  NORMALIZED: "Normalising signals…",
  EXTRACTED: "Extracting actions with AI…",
  PROPOSED: "Proposing task changes…",
  APPROVAL_PENDING: "Routing to Action Center…",
  EXECUTED: "Executing actions…",
  VERIFIED: "Complete",
  FAILED: "Failed",
};

function ProcessingProgress({ state }: { state: AgentRunState }) {
  const pct = STATE_PROGRESS[state] ?? 10;
  const isExtracting = state === "EXTRACTED";
  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center justify-between text-[12px]">
        <span className="text-[#5b21b6] font-medium">{STATE_LABEL[state]}</span>
        <span className="text-[#7c3aed] tabular-nums">{pct}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-[#e0e7ff] overflow-hidden">
        <div
          className={`h-full rounded-full bg-[#6366f1] transition-all duration-700 ${isExtracting ? "animate-pulse" : ""}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return {} as T;
  try { return JSON.parse(text) as T; } catch { return {} as T; }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function MeetingsPage() {
  const router = useRouter();
  const [meetings, setMeetings] = useState<MeetingNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [transcript, setTranscript] = useState("");
  const [processing, setProcessing] = useState(false);
  const [processingRunId, setProcessingRunId] = useState<string | null>(null);
  const [processingState, setProcessingState] = useState<AgentRunState | null>(null);
  const [successState, setSuccessState] = useState<"complete" | "failed" | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedData, setExpandedData] = useState<Record<string, MeetingNote>>({});
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const simTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const loadMeetings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/workspace/meetings");
      const data = await readJson<{ meetings?: MeetingNote[] }>(res);
      setMeetings(data.meetings ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadMeetings(); }, [loadMeetings]);

  const pollRunState = useCallback((runId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/workspace/agent/runs/${runId}`);
        const data = await readJson<{ run?: { state?: AgentRunState } }>(res);
        const state = data.run?.state;
        if (state) {
          setProcessingState(state);
          if (state === "VERIFIED" || state === "APPROVAL_PENDING") {
            clearInterval(pollRef.current!);
            setProcessing(false);
            setProcessingRunId(null);
            setSuccessState("complete");
            setTimeout(() => void loadMeetings(), 1000);
          } else if (state === "FAILED") {
            clearInterval(pollRef.current!);
            setProcessing(false);
            setProcessingRunId(null);
            setSuccessState("failed");
          }
        }
      } catch {
        clearInterval(pollRef.current!);
        setProcessing(false);
      }
    }, 2000);
  }, [loadMeetings]);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // Simulate state progression while the synchronous API call is running
  useEffect(() => {
    simTimersRef.current.forEach(clearTimeout);
    simTimersRef.current = [];
    if (!processing) return;
    const steps: [AgentRunState, number][] = [
      ["NORMALIZED", 1200],
      ["EXTRACTED", 3500],
      ["PROPOSED", 18000],
    ];
    simTimersRef.current = steps.map(([s, delay]) =>
      setTimeout(() => setProcessingState((prev) => {
        const prevIdx = prev ? ["INGESTED","NORMALIZED","EXTRACTED","PROPOSED","APPROVAL_PENDING","EXECUTED","VERIFIED","FAILED"].indexOf(prev) : -1;
        const newIdx = ["INGESTED","NORMALIZED","EXTRACTED","PROPOSED","APPROVAL_PENDING","EXECUTED","VERIFIED","FAILED"].indexOf(s);
        return newIdx > prevIdx ? s : prev;
      }), delay)
    );
    return () => { simTimersRef.current.forEach(clearTimeout); };
  }, [processing]);

  const handleProcess = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = transcript.trim();
    if (t.length < 20) return;
    setProcessing(true);
    setProcessingState("INGESTED");
    setSuccessState(null);
    try {
      const res = await fetch("/api/workspace/meetings/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: t }),
      });
      const data = await readJson<{ runId?: string }>(res);
      if (res.ok && data.runId) {
        setProcessingRunId(data.runId);
        setTranscript("");
        pollRunState(data.runId);
      } else {
        setProcessing(false);
      }
    } catch {
      setProcessing(false);
    }
  };

  const loadExpanded = async (id: string) => {
    if (expandedData[id]) { setExpandedId(id); return; }
    try {
      const res = await fetch(`/api/workspace/meetings/${id}`);
      const data = await readJson<MeetingNote>(res);
      setExpandedData((prev) => ({ ...prev, [id]: data }));
      setExpandedId(id);
    } catch {
      setExpandedId(id);
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="border-b border-[var(--pm-border)] bg-[var(--pm-surface)] px-8 py-6">
        <h1 className="text-[22px] font-semibold text-[var(--pm-text)]">Meetings</h1>
        <p className="mt-1 text-[14px] text-[var(--pm-text-secondary)]">
          Upload a transcript and Larry will extract tasks, decisions, and action items.
        </p>
      </div>

      <div className="mx-auto max-w-4xl px-8 py-6 space-y-8">
        {/* Upload zone */}
        <section>
          <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-[var(--pm-text-muted)]">
            New Meeting Transcript
          </h2>
          <form onSubmit={handleProcess} className="space-y-3">
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Paste meeting transcript here… (minimum 20 characters)"
              rows={6}
              disabled={processing}
              className="w-full rounded-xl border border-[var(--pm-border)] bg-[var(--pm-surface)] px-4 py-3 text-[14px] outline-none focus:border-[#6366f1] resize-none disabled:opacity-50"
            />
            <div className="flex items-center justify-between">
              <p className="text-[12px] text-[var(--pm-text-muted)]">
                {transcript.length} characters
              </p>
              <button
                type="submit"
                disabled={processing || transcript.trim().length < 20}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#6366f1] px-4 text-[13px] font-medium text-white hover:bg-[#4f46e5] disabled:opacity-50"
              >
                <Upload size={14} />
                {processing ? "Processing…" : "Process transcript"}
              </button>
            </div>
          </form>

          {/* Processing progress */}
          {processing && processingState && (
            <div className="mt-4 rounded-xl border border-[#e0e7ff] bg-[#f5f3ff] p-4">
              <p className="text-[13px] font-medium text-[#5b21b6]">Larry is processing your meeting…</p>
              <ProcessingProgress state={processingState} />
            </div>
          )}

          {/* Success / failure result */}
          {!processing && successState === "complete" && (
            <div className="mt-4 rounded-xl border border-[#bbf7d0] bg-[#f0fdf4] p-4 flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-[#16a34a]" />
                <div>
                  <p className="text-[13px] font-medium text-[#15803d]">Extraction complete</p>
                  <p className="mt-0.5 text-[12px] text-[#166534]">Actions are ready for review in the Action Center.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => router.push("/workspace/actions")}
                className="shrink-0 rounded-lg bg-[#16a34a] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#15803d]"
              >
                Go to Action Center →
              </button>
            </div>
          )}

          {!processing && successState === "failed" && (
            <div className="mt-4 rounded-xl border border-[#fecaca] bg-[#fef2f2] p-4 flex items-center gap-3">
              <XCircle size={18} className="shrink-0 text-[#dc2626]" />
              <p className="text-[13px] font-medium text-[#b91c1c]">Processing failed — please try again.</p>
            </div>
          )}
        </section>

        {/* Meetings list */}
        <section>
          <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-[var(--pm-text-muted)]">
            Meeting Notes
          </h2>
          {loading ? (
            <p className="text-[14px] text-[var(--pm-text-muted)]">Loading…</p>
          ) : meetings.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--pm-border)] bg-[var(--pm-surface)] px-6 py-12 text-center">
              <CalendarCheck2 size={28} className="mx-auto mb-3 text-[var(--pm-text-muted)] opacity-40" />
              <p className="text-[14px] text-[var(--pm-text-secondary)]">No meetings yet. Process your first transcript above.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {meetings.map((meeting) => (
                <div key={meeting.id} className="rounded-xl border border-[var(--pm-border)] bg-white shadow-sm overflow-hidden">
                  <button
                    type="button"
                    onClick={() => {
                      if (expandedId === meeting.id) {
                        setExpandedId(null);
                      } else {
                        void loadExpanded(meeting.id);
                      }
                    }}
                    className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-[#f8f9fb]"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#f5f3ff]">
                        <FileText size={16} className="text-[#6366f1]" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-[var(--pm-text)] truncate">
                          {meeting.title ?? "Meeting transcript"}
                        </p>
                        <div className="flex items-center gap-3 mt-0.5 text-[12px] text-[var(--pm-text-muted)]">
                          <span className="flex items-center gap-1">
                            <Clock size={11} />
                            {timeAgo(meeting.createdAt)}
                          </span>
                          <span>{meeting.actionCount} action{meeting.actionCount !== 1 ? "s" : ""} extracted</span>
                        </div>
                      </div>
                    </div>
                    <ChevronDown
                      size={16}
                      className={`shrink-0 text-[var(--pm-text-muted)] transition-transform ${expandedId === meeting.id ? "rotate-180" : ""}`}
                    />
                  </button>

                  {expandedId === meeting.id && (
                    <div className="border-t border-[var(--pm-border)] px-5 py-4 space-y-3">
                      {expandedData[meeting.id]?.summary && (
                        <div>
                          <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--pm-text-muted)]">Summary</h4>
                          <p className="text-[13px] text-[var(--pm-text-secondary)] leading-relaxed">
                            {expandedData[meeting.id].summary}
                          </p>
                        </div>
                      )}
                      {meeting.agentRunId && (
                        <p className="text-[11px] text-[var(--pm-text-muted)]">
                          Run: {meeting.agentRunId.slice(0, 8)}… · State: {meeting.agentRunState ?? "—"}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
