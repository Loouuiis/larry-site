"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck2, Clock, FileText, Upload, CheckCircle2, XCircle } from "lucide-react";

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
  INGESTED: "Reading transcript…",
  NORMALIZED: "Finding action items…",
  EXTRACTED: "Preparing for your review…",
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
    <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "12px" }}>
        <span style={{ color: "var(--text-2)", fontWeight: 500 }}>{STATE_LABEL[state]}</span>
        <span style={{ color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>{pct}%</span>
      </div>
      <div
        style={{
          height: "6px",
          width: "100%",
          borderRadius: "3px",
          background: "var(--border)",
          overflow: "hidden",
        }}
      >
        <div
          className={isExtracting ? "pm-shimmer" : ""}
          style={{
            height: "100%",
            borderRadius: "3px",
            background: "var(--cta)",
            transition: "width 0.7s ease",
            width: `${pct}%`,
          }}
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

function formatShortDate(dateStr: string | null | undefined): string {
  const raw = dateStr;
  if (!raw) return "—";
  const d = new Date(raw);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

interface Project { id: string; name: string; }

export function MeetingsPage() {
  const router = useRouter();
  const [meetings, setMeetings] = useState<MeetingNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [transcript, setTranscript] = useState("");
  const [processing, setProcessing] = useState(false);
  const [processingState, setProcessingState] = useState<AgentRunState | null>(null);
  const [successState, setSuccessState] = useState<"complete" | "failed" | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedData, setExpandedData] = useState<Record<string, MeetingNote>>({});
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [search, setSearch] = useState("");
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

  useEffect(() => {
    fetch("/api/workspace/snapshot?includeProjectContext=false", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { projects?: Project[] }) => {
        const list = data.projects ?? [];
        setProjects(list);
        if (list.length > 0) setSelectedProjectId(list[0].id);
      })
      .catch(() => {});
  }, []);


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
        body: JSON.stringify({ transcript: t, projectId: selectedProjectId || undefined }),
      });
      if (res.ok) {
        setTranscript("");
        setSuccessState("complete");
        setProcessingState("VERIFIED");
        setTimeout(() => void loadMeetings(), 800);
      } else {
        setSuccessState("failed");
      }
    } catch {
      setSuccessState("failed");
    } finally {
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

  const filteredMeetings = meetings.filter((m) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (m.title ?? "Meeting transcript").toLowerCase().includes(q);
  });

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {/* Page header */}
      <div
        style={{
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          padding: "20px 32px",
        }}
      >
        <h1 className="text-h1">Meetings</h1>
        <p className="text-body-sm" style={{ marginTop: "4px" }}>
          Upload a transcript and Larry will extract tasks, decisions, and action items.
        </p>
      </div>

      <div style={{ maxWidth: "896px", margin: "0 auto", padding: "24px 32px", display: "flex", flexDirection: "column", gap: "28px" }}>

        {/* Upload card */}
        <section
          style={{
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-card)",
            padding: "20px",
            background: "var(--surface)",
          }}
        >
          <form onSubmit={handleProcess} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {/* Textarea with char count overlay */}
            <div style={{ position: "relative" }}>
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder="Paste meeting transcript here… (minimum 20 characters)"
                disabled={processing}
                style={{
                  width: "100%",
                  minHeight: "120px",
                  resize: "vertical",
                  borderRadius: "var(--radius-btn)",
                  border: "1px solid var(--border)",
                  background: "var(--surface-2)",
                  padding: "12px 14px 28px 14px",
                  fontSize: "14px",
                  color: "var(--text-1)",
                  outline: "none",
                  boxSizing: "border-box",
                  opacity: processing ? 0.5 : 1,
                }}
              />
              <span
                style={{
                  position: "absolute",
                  bottom: "8px",
                  right: "10px",
                  fontSize: "11px",
                  color: "var(--text-disabled)",
                  pointerEvents: "none",
                }}
              >
                {transcript.length} chars
              </span>
            </div>

            {/* Project dropdown + submit in a flex row */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {projects.length > 0 && (
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  disabled={processing}
                  style={{
                    flex: 1,
                    borderRadius: "var(--radius-btn)",
                    border: "1px solid var(--border)",
                    background: "var(--surface-2)",
                    padding: "0 12px",
                    height: "36px",
                    fontSize: "14px",
                    color: "var(--text-1)",
                    outline: "none",
                    opacity: processing ? 0.5 : 1,
                  }}
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              )}
              <button
                type="submit"
                disabled={processing || transcript.trim().length < 20 || !selectedProjectId}
                className="pm-btn pm-btn-primary"
                style={{
                  height: "36px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  borderRadius: "var(--radius-btn)",
                  flexShrink: 0,
                }}
              >
                <Upload size={13} />
                {processing ? "Processing…" : "Process"}
              </button>
            </div>
          </form>

          {/* Processing progress */}
          {processing && processingState && (
            <div
              style={{
                marginTop: "16px",
                borderRadius: "var(--radius-btn)",
                border: "1px solid var(--border)",
                background: "var(--surface-2)",
                padding: "14px 16px",
              }}
            >
              <p style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-2)" }}>
                Larry is processing your meeting…
              </p>
              <ProcessingProgress state={processingState} />
            </div>
          )}

          {/* Success banner */}
          {!processing && successState === "complete" && (
            <div
              style={{
                marginTop: "16px",
                borderRadius: "var(--radius-btn)",
                border: "1px solid #bbf7d0",
                background: "#f0fdf4",
                padding: "14px 16px",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: "12px",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                <CheckCircle2 size={16} style={{ marginTop: "2px", flexShrink: 0, color: "#16a34a" }} />
                <div>
                  <p style={{ fontSize: "13px", fontWeight: 500, color: "#15803d" }}>Transcript processed</p>
                  <p style={{ marginTop: "2px", fontSize: "12px", color: "#166534" }}>
                    Larry has analysed the meeting. Check the project for suggested actions.
                  </p>
                </div>
              </div>
              {selectedProjectId && (
                <button
                  type="button"
                  onClick={() => router.push(`/workspace/projects/${selectedProjectId}`)}
                  style={{
                    flexShrink: 0,
                    borderRadius: "var(--radius-btn)",
                    background: "#16a34a",
                    border: "none",
                    padding: "4px 12px",
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "#fff",
                    cursor: "pointer",
                  }}
                >
                  View project →
                </button>
              )}
            </div>
          )}

          {/* Failure banner */}
          {!processing && successState === "failed" && (
            <div
              style={{
                marginTop: "16px",
                borderRadius: "var(--radius-btn)",
                border: "1px solid #fecaca",
                background: "#fef2f2",
                padding: "14px 16px",
                display: "flex",
                alignItems: "center",
                gap: "10px",
              }}
            >
              <XCircle size={16} style={{ flexShrink: 0, color: "#dc2626" }} />
              <p style={{ fontSize: "13px", fontWeight: 500, color: "#b91c1c" }}>
                Processing failed — please try again.
              </p>
            </div>
          )}
        </section>

        {/* Meeting notes section */}
        <section>
          <h2 className="text-h2" style={{ marginBottom: "12px" }}>Meeting Notes</h2>

          {/* Search */}
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search meetings…"
            style={{
              width: "100%",
              height: "36px",
              borderRadius: "var(--radius-btn)",
              border: "1px solid var(--border)",
              background: "var(--surface-2)",
              padding: "0 12px",
              fontSize: "14px",
              color: "var(--text-1)",
              outline: "none",
              marginBottom: "12px",
              boxSizing: "border-box",
            }}
          />

          {loading ? (
            <p className="text-body-sm">Loading…</p>
          ) : meetings.length === 0 ? (
            <div
              style={{
                borderRadius: "var(--radius-card)",
                border: "1px dashed var(--border)",
                background: "var(--surface)",
                padding: "48px 24px",
                textAlign: "center",
              }}
            >
              <CalendarCheck2
                size={24}
                style={{ margin: "0 auto 12px", color: "var(--text-disabled)" }}
              />
              <p className="text-body-sm">No meetings yet. Process your first transcript above.</p>
            </div>
          ) : (
            /* Table */
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-card)",
                overflow: "hidden",
                background: "var(--surface)",
              }}
            >
              {/* Table header */}
              <div
                className="pm-table-header"
                style={{ gridTemplateColumns: "minmax(0,1fr) 120px 80px 100px" }}
              >
                <span>Title</span>
                <span>Date</span>
                <span>Actions</span>
                <span>Status</span>
              </div>

              {filteredMeetings.length === 0 && (
                <div style={{ padding: "24px", textAlign: "center" }}>
                  <p className="text-body-sm">No meetings match your search.</p>
                </div>
              )}

              {filteredMeetings.map((meeting) => (
                <div key={meeting.id}>
                  <div
                    className="pm-table-row"
                    style={{
                      gridTemplateColumns: "minmax(0,1fr) 120px 80px 100px",
                      cursor: "pointer",
                    }}
                    onClick={() => {
                      if (expandedId === meeting.id) {
                        setExpandedId(null);
                      } else {
                        void loadExpanded(meeting.id);
                      }
                    }}
                  >
                    {/* Title */}
                    <span style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                      <div
                        style={{
                          flexShrink: 0,
                          display: "flex",
                          height: "28px",
                          width: "28px",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: "6px",
                          background: "var(--surface-2)",
                        }}
                      >
                        <FileText size={13} style={{ color: "var(--text-muted)" }} />
                      </div>
                      <span
                        className="text-h3"
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {meeting.title ?? "Meeting transcript"}
                      </span>
                    </span>

                    {/* Date */}
                    <span className="text-body-sm" style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <Clock size={11} />
                      {timeAgo(meeting.createdAt)}
                    </span>

                    {/* Action count */}
                    <span className="text-body-sm">
                      {meeting.actionCount}
                    </span>

                    {/* Status */}
                    <span>
                      {meeting.agentRunState ? (
                        <span
                          className="pm-pill"
                          style={
                            meeting.agentRunState === "VERIFIED"
                              ? { background: "#e6f9f0", color: "#00854d" }
                              : meeting.agentRunState === "FAILED"
                              ? { background: "#fff0f0", color: "var(--pm-red)" }
                              : {}
                          }
                        >
                          {meeting.agentRunState === "VERIFIED"
                            ? "Done"
                            : meeting.agentRunState === "FAILED"
                            ? "Failed"
                            : meeting.agentRunState}
                        </span>
                      ) : (
                        <span className="text-body-sm">—</span>
                      )}
                    </span>
                  </div>

                  {/* Expanded detail */}
                  {expandedId === meeting.id && (
                    <div
                      style={{
                        borderTop: "1px solid var(--border)",
                        padding: "16px 20px",
                        background: "var(--surface-2)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "10px",
                      }}
                    >
                      {expandedData[meeting.id]?.summary && (
                        <div>
                          <p
                            style={{
                              fontSize: "11px",
                              fontWeight: 600,
                              textTransform: "uppercase",
                              letterSpacing: "0.1em",
                              color: "var(--text-muted)",
                              marginBottom: "4px",
                            }}
                          >
                            Summary
                          </p>
                          <p style={{ fontSize: "13px", color: "var(--text-2)", lineHeight: "1.5" }}>
                            {expandedData[meeting.id].summary}
                          </p>
                        </div>
                      )}
                      {meeting.agentRunId && (
                        <p style={{ fontSize: "11px", color: "var(--text-disabled)" }}>
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
