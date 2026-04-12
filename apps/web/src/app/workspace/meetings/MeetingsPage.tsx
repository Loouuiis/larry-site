"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck2, Clock, FileText, Upload, CheckCircle2, XCircle, Plus, X, Loader2, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import type { WorkspaceMeetingsOverview, WorkspaceMeeting, WorkspaceProject } from "@/app/dashboard/types";
import { triggerBoundedWorkspaceRefresh } from "@/app/workspace/refresh";
import {
  useTranscriptProcessing,
  type TranscriptProcessingState,
} from "@/app/workspace/useTranscriptProcessing";

function ProcessingProgress({ state }: { state: TranscriptProcessingState }) {
  const pct = state.progress;
  const tone =
    state.phase === "failed"
      ? { text: "#b91c1c", background: "#fecaca", fill: "#dc2626" }
      : state.phase === "succeeded"
        ? { text: "#15803d", background: "#bbf7d0", fill: "#16a34a" }
        : { text: "var(--text-2)", background: "var(--border)", fill: "var(--cta)" };
  return (
    <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "12px" }}>
        <span style={{ color: tone.text, fontWeight: 500 }}>{state.statusLabel}</span>
        <span style={{ color: tone.text, fontVariantNumeric: "tabular-nums" }}>{pct}%</span>
      </div>
      <div
        style={{
          height: "6px",
          width: "100%",
          borderRadius: "3px",
          background: tone.background,
          overflow: "hidden",
        }}
      >
        <div
          className={state.phase === "processing" ? "pm-shimmer" : ""}
          style={{
            height: "100%",
            borderRadius: "3px",
            background: tone.fill,
            transition: "width 0.7s ease",
            width: `${pct}%`,
          }}
        />
      </div>
      <p style={{ margin: 0, fontSize: "12px", color: tone.text }}>{state.detail}</p>
    </div>
  );
}

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return {} as T;
  }
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

function getMeetingStatus(meeting: WorkspaceMeeting) {
  if (meeting.summary?.trim() || meeting.actionCount > 0) {
    return {
      label: "Ready",
      style: { background: "#e6f9f0", color: "#00854d" },
    };
  }

  return {
    label: "Processing",
    style: { background: "#eff6ff", color: "#1d4ed8" },
  };
}

function QuickProjectFromTranscript({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (projectId: string) => void;
}) {
  const [projectName, setProjectName] = useState("");
  const [transcriptText, setTranscriptText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!projectName.trim()) {
      setFormError("Give the project a name.");
      return;
    }
    if (transcriptText.trim().length < 20) {
      setFormError("Paste a transcript with at least 20 characters.");
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const draftRes = await fetch("/api/workspace/projects/intake/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "meeting",
          project: { name: projectName.trim(), description: null, startDate: null, targetDate: null, attachToProjectId: null },
          meeting: { meetingTitle: null, transcript: transcriptText.trim() },
        }),
      });
      const draftData = (await readJson<{ draft?: { id: string }; error?: string; message?: string }>(draftRes));
      if (!draftRes.ok || !draftData.draft?.id) {
        setFormError(draftData.message ?? draftData.error ?? "Failed to create project draft.");
        return;
      }

      const bootstrapRes = await fetch(`/api/workspace/projects/intake/drafts/${encodeURIComponent(draftData.draft.id)}/bootstrap`, {
        method: "POST",
      });
      const bootstrapData = await readJson<{ draft?: { id: string }; error?: string; message?: string }>(bootstrapRes);
      if (!bootstrapRes.ok || !bootstrapData.draft) {
        setFormError(bootstrapData.message ?? bootstrapData.error ?? "Failed to extract actions from transcript.");
        return;
      }

      const finalizeRes = await fetch(`/api/workspace/projects/intake/drafts/${encodeURIComponent(draftData.draft.id)}/finalize`, {
        method: "POST",
      });
      const finalizeData = await readJson<{ draft?: { id: string; projectId?: string }; error?: string; message?: string }>(finalizeRes);
      if (!finalizeRes.ok || !finalizeData.draft) {
        setFormError(finalizeData.message ?? finalizeData.error ?? "Failed to create the project.");
        return;
      }

      window.dispatchEvent(new CustomEvent("larry:refresh-snapshot"));
      triggerBoundedWorkspaceRefresh();
      if (finalizeData.draft.projectId) {
        onCreated(finalizeData.draft.projectId);
      }
    } catch {
      setFormError("Network error while creating the project.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 backdrop-blur-sm"
      style={{ background: "rgba(15,23,42,0.55)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0, y: 12 }}
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        className="relative w-full max-w-xl bg-white"
        style={{ borderRadius: "var(--radius-card)", border: "1px solid var(--border)", boxShadow: "var(--shadow-3)" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px 0" }}>
          <h2 className="text-h2">New project from transcript</h2>
          <button type="button" onClick={onClose} style={{ color: "var(--text-muted)", cursor: "pointer", background: "none", border: "none" }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "16px 24px 24px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <input
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="Project name"
            autoFocus
            style={{
              width: "100%",
              height: "42px",
              borderRadius: "var(--radius-btn)",
              border: "1px solid var(--border)",
              background: "var(--surface-2)",
              padding: "0 14px",
              fontSize: "14px",
              color: "var(--text-1)",
              outline: "none",
              boxSizing: "border-box",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "#6c44f6")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
          />
          <textarea
            value={transcriptText}
            onChange={(e) => setTranscriptText(e.target.value)}
            rows={8}
            placeholder="Paste meeting notes or transcript here..."
            style={{
              width: "100%",
              borderRadius: "var(--radius-btn)",
              border: "1px solid var(--border)",
              background: "var(--surface-2)",
              padding: "12px 14px",
              fontSize: "14px",
              color: "var(--text-1)",
              outline: "none",
              resize: "vertical",
              boxSizing: "border-box",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "#6c44f6")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
          />
          {formError && (
            <div style={{ borderRadius: "var(--radius-btn)", background: "#fef2f2", border: "1px solid #fecaca", padding: "10px 14px", fontSize: "13px", color: "#b91c1c" }}>
              {formError}
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "4px" }}>
            <button type="button" onClick={onClose} className="pm-btn pm-btn-secondary" disabled={submitting}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !projectName.trim() || transcriptText.trim().length < 20}
              className="pm-btn pm-btn-primary"
              style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {submitting ? "Creating..." : "Create project"}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

export function MeetingsPage() {
  const router = useRouter();
  const [meetings, setMeetings] = useState<WorkspaceMeeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [transcript, setTranscript] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedData, setExpandedData] = useState<Record<string, WorkspaceMeeting>>({});
  const [projects, setProjects] = useState<WorkspaceProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [showNewProject, setShowNewProject] = useState(false);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/workspace/meetings/overview", { cache: "no-store" });
      const data = await readJson<WorkspaceMeetingsOverview>(res);
      if (!res.ok) {
        setError(data.error ?? "Failed to load meetings.");
        return;
      }
      const nextProjects = Array.isArray(data.projects) ? data.projects : [];
      setMeetings(Array.isArray(data.meetings) ? data.meetings : []);
      setProjects(nextProjects);
      setSelectedProjectId((current) => {
        if (current && nextProjects.some((project) => project.id === current)) return current;
        return nextProjects[0]?.id ?? "";
      });
      setError(data.error ?? "");
    } finally {
      setLoading(false);
    }
  }, []);

  const {
    state: processingState,
    startProcessing,
    isProcessing: processing,
  } = useTranscriptProcessing({
    onSuccess: async () => {
      await loadOverview();
      triggerBoundedWorkspaceRefresh();
    },
  });

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    function onRefresh() {
      void loadOverview();
    }

    window.addEventListener("larry:refresh-snapshot", onRefresh);
    return () => window.removeEventListener("larry:refresh-snapshot", onRefresh);
  }, [loadOverview]);

  const handleProcess = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTranscript = transcript.trim();
    if (trimmedTranscript.length < 20) return;
    const succeeded = await startProcessing({
      transcript: trimmedTranscript,
      projectId: selectedProjectId || undefined,
    });
    if (succeeded) {
      setTranscript("");
    }
  };

  const loadExpanded = async (id: string) => {
    if (expandedData[id]) {
      setExpandedId(id);
      return;
    }
    try {
      const res = await fetch(`/api/workspace/meetings/${id}`);
      const data = await readJson<WorkspaceMeeting>(res);
      setExpandedData((prev) => ({ ...prev, [id]: data }));
      setExpandedId(id);
    } catch {
      setExpandedId(id);
    }
  };

  const filteredMeetings = meetings.filter((meeting) => {
    if (!search.trim()) return true;
    const query = search.toLowerCase();
    const title = (meeting.title ?? "Meeting transcript").toLowerCase();
    const project = projects.find((p) => p.id === meeting.projectId);
    const projectName = (project?.name ?? "").toLowerCase();
    return title.includes(query) || projectName.includes(query);
  });

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div
        style={{
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          padding: "20px 32px",
        }}
      >
        <h1 className="text-h1">Meetings</h1>
        <p className="text-body-sm" style={{ marginTop: "4px" }}>
          Upload a transcript and Larry will analyze it, update the meeting summary, and save the transcript analysis
          into the correct project documents.
        </p>
      </div>

      <div
        style={{
          maxWidth: "896px",
          margin: "0 auto",
          padding: "24px 32px",
          display: "flex",
          flexDirection: "column",
          gap: "28px",
        }}
      >
        {error && (
          <div
            style={{
              borderRadius: "var(--radius-btn)",
              border: "1px solid #fde68a",
              background: "#fffbeb",
              padding: "10px 14px",
              fontSize: "13px",
              color: "#92400e",
            }}
          >
            {error}
          </div>
        )}

        <section
          style={{
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-card)",
            padding: "20px",
            background: "var(--surface)",
          }}
        >
          <form onSubmit={handleProcess} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ position: "relative" }}>
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder="Paste meeting transcript here... (minimum 20 characters)"
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

            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {projects.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1, minWidth: 0, maxWidth: "340px" }}>
                  <select
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    disabled={processing}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      borderRadius: "var(--radius-btn)",
                      border: "1px solid var(--border)",
                      background: "var(--surface-2)",
                      padding: "0 12px",
                      height: "36px",
                      fontSize: "14px",
                      color: "var(--text-1)",
                      outline: "none",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      opacity: processing ? 0.5 : 1,
                    }}
                  >
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>{project.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setShowNewProject(true)}
                    disabled={processing}
                    title="New project"
                    style={{
                      flexShrink: 0,
                      width: "36px",
                      height: "36px",
                      borderRadius: "var(--radius-btn)",
                      border: "1px solid var(--border)",
                      background: "var(--surface-2)",
                      color: "#6c44f6",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      opacity: processing ? 0.5 : 1,
                    }}
                  >
                    <Plus size={16} />
                  </button>
                </div>
              )}
              {projects.length === 0 && !loading && (
                <button
                  type="button"
                  onClick={() => setShowNewProject(true)}
                  disabled={processing}
                  style={{
                    height: "36px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    borderRadius: "var(--radius-btn)",
                    border: "1px solid var(--border)",
                    background: "var(--surface-2)",
                    padding: "0 14px",
                    fontSize: "14px",
                    color: "#6c44f6",
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  <Plus size={14} />
                  New project
                </button>
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
                {processing ? "Processing..." : "Process transcript"}
              </button>
            </div>
          </form>

          {processingState.phase !== "idle" && (
            <div
              style={{
                marginTop: "16px",
                borderRadius: "var(--radius-btn)",
                border:
                  processingState.phase === "failed"
                    ? "1px solid #fecaca"
                    : processingState.phase === "succeeded"
                      ? "1px solid #bbf7d0"
                      : "1px solid var(--border)",
                background:
                  processingState.phase === "failed"
                    ? "#fef2f2"
                    : processingState.phase === "succeeded"
                      ? "#f0fdf4"
                      : "var(--surface-2)",
                padding: "14px 16px",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", minWidth: 0 }}>
                  {processingState.phase === "failed" ? (
                    <XCircle size={16} style={{ marginTop: "2px", flexShrink: 0, color: "#dc2626" }} />
                  ) : (
                    <CheckCircle2
                      size={16}
                      style={{
                        marginTop: "2px",
                        flexShrink: 0,
                        color: processingState.phase === "succeeded" ? "#16a34a" : "var(--cta)",
                      }}
                    />
                  )}
                  <div style={{ minWidth: 0 }}>
                    <p
                      style={{
                        fontSize: "13px",
                        fontWeight: 500,
                        color:
                          processingState.phase === "failed"
                            ? "#b91c1c"
                            : processingState.phase === "succeeded"
                              ? "#15803d"
                              : "var(--text-2)",
                      }}
                    >
                      {processingState.statusLabel}
                    </p>
                    <ProcessingProgress state={processingState} />
                  </div>
                </div>
                {processingState.phase === "succeeded" && selectedProjectId && (
                  <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => router.push(`/workspace/projects/${selectedProjectId}`)}
                      style={{
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
                      View project
                    </button>
                    <button
                      type="button"
                      onClick={() => router.push(`/workspace/documents?projectId=${encodeURIComponent(selectedProjectId)}`)}
                      style={{
                        borderRadius: "var(--radius-btn)",
                        border: "1px solid #86efac",
                        background: "#fff",
                        padding: "4px 12px",
                        fontSize: "12px",
                        fontWeight: 500,
                        color: "#15803d",
                        cursor: "pointer",
                      }}
                    >
                      View documents
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        <section>
          <h2 className="text-h2" style={{ marginBottom: "12px" }}>Meeting Notes</h2>

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search meetings..."
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
            <p className="text-body-sm">Loading...</p>
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
              <CalendarCheck2 size={24} style={{ margin: "0 auto 12px", color: "var(--text-disabled)" }} />
              <p className="text-body-sm">No meetings yet. Process your first transcript above.</p>
            </div>
          ) : (
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-card)",
                overflow: "hidden",
                background: "var(--surface)",
              }}
            >
              <div className="pm-table-header" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,140px) 120px 80px 100px" }}>
                <span>Title</span>
                <span>Project</span>
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
                    style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,140px) 120px 80px 100px", cursor: "pointer" }}
                    onClick={() => {
                      if (expandedId === meeting.id) {
                        setExpandedId(null);
                      } else {
                        void loadExpanded(meeting.id);
                      }
                    }}
                  >
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
                      <span className="text-h3" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {meeting.title ?? "Meeting transcript"}
                      </span>
                    </span>

                    <span className="text-body-sm" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {(() => {
                        const project = projects.find((p) => p.id === meeting.projectId);
                        return project ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#6c44f6", flexShrink: 0 }} />
                            {project.name}
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-disabled)" }}>Unassigned</span>
                        );
                      })()}
                    </span>

                    <span className="text-body-sm" style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <Clock size={11} />
                      {timeAgo(meeting.createdAt)}
                    </span>

                    <span className="text-body-sm">{meeting.actionCount}</span>

                    <span>
                      {(() => {
                        const status = getMeetingStatus(meeting);
                        return (
                          <span className="pm-pill" style={status.style}>
                            {status.label}
                          </span>
                        );
                      })()}
                    </span>
                  </div>

                  {expandedId === meeting.id && (
                    <div
                      style={{
                        borderTop: "1px solid var(--border)",
                        padding: "16px 20px",
                        background: "var(--surface-2)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "14px",
                      }}
                    >
                      {/* Project label */}
                      {(() => {
                        const project = projects.find((p) => p.id === meeting.projectId);
                        return project ? (
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#6c44f6", flexShrink: 0 }} />
                            <span style={{ fontSize: "12px", fontWeight: 600, color: "#6c44f6" }}>{project.name}</span>
                          </div>
                        ) : null;
                      })()}

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

                      {/* Full transcript */}
                      {expandedData[meeting.id]?.transcript ? (
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
                            Transcript
                          </p>
                          <div
                            style={{
                              fontSize: "13px",
                              color: "var(--text-2)",
                              lineHeight: "1.6",
                              whiteSpace: "pre-line",
                              maxHeight: "300px",
                              overflowY: "auto",
                              borderRadius: "var(--radius-btn)",
                              border: "1px solid var(--border)",
                              background: "var(--surface)",
                              padding: "12px 14px",
                            }}
                          >
                            {expandedData[meeting.id].transcript}
                          </div>
                        </div>
                      ) : expandedData[meeting.id] && !expandedData[meeting.id]?.summary && !expandedData[meeting.id]?.transcript ? (
                        <p style={{ fontSize: "13px", color: "var(--text-disabled)", fontStyle: "italic" }}>
                          No transcript or summary available yet. Larry may still be processing.
                        </p>
                      ) : null}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <AnimatePresence>
        {showNewProject && (
          <QuickProjectFromTranscript
            onClose={() => setShowNewProject(false)}
            onCreated={(projectId) => {
              setShowNewProject(false);
              void loadOverview();
              setSelectedProjectId(projectId);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
