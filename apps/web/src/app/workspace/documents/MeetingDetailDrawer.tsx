"use client";

import { useEffect, useState } from "react";
import { getTimezone } from "@/lib/timezone-context";
import { X, FileText, Zap, Copy, Check } from "lucide-react";

export interface MeetingDetail {
  id: string;
  title: string | null;
  summary: string | null;
  transcript: string | null;
  actionCount: number;
  meetingDate: string | null;
  createdAt: string;
  projectId?: string | null;
}

interface MeetingDetailDrawerProps {
  docId: string | null;
  detail: MeetingDetail | null;
  loading: boolean;
  projects: Record<string, string>;
  onClose: () => void;
}

function formatDate(meetingDate: string | null, createdAt: string): string {
  const raw = meetingDate ?? createdAt;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: getTimezone() });
}

const SPEAKER_RE = /^([A-Za-z][^:]{0,40}):\s+(.+)$/;

function TranscriptView({ raw }: { raw: string }) {
  const lines = raw.split("\n").map((line) => {
    const m = line.match(SPEAKER_RE);
    return m ? { speaker: m[1].trim(), text: m[2] } : { speaker: null, text: line };
  });

  return (
    <div style={{ fontSize: "13px", lineHeight: "1.65" }}>
      {lines.map((line, i) =>
        line.speaker ? (
          <div key={i} style={{ marginBottom: "6px" }}>
            <span style={{ fontWeight: 600, color: "var(--text-1)", marginRight: "6px" }}>
              {line.speaker}:
            </span>
            <span style={{ color: "var(--text-2)" }}>{line.text}</span>
          </div>
        ) : line.text.trim() ? (
          <p key={i} style={{ color: "var(--text-2)", marginBottom: "6px" }}>
            {line.text}
          </p>
        ) : (
          <div key={i} style={{ height: "6px" }} />
        )
      )}
    </div>
  );
}

export function MeetingDetailDrawer({ docId, detail, loading, projects, onClose }: MeetingDetailDrawerProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!docId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [docId, onClose]);

  if (!docId) return null;

  function copyTranscript() {
    if (!detail?.transcript) return;
    navigator.clipboard.writeText(detail.transcript).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const projectName = detail?.projectId ? (projects[detail.projectId] ?? null) : null;

  return (
    <div
      className="fixed right-0 top-0 z-50 flex h-full flex-col"
      style={{
        width: "440px",
        background: "var(--surface)",
        borderLeft: "1px solid var(--border)",
        boxShadow: "var(--shadow-3)",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "10px",
          padding: "16px 20px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            flexShrink: 0,
            display: "flex",
            height: "32px",
            width: "32px",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "8px",
            background: "var(--surface-2)",
            marginTop: "2px",
          }}
        >
          <FileText size={15} style={{ color: "var(--text-muted)" }} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {loading ? (
            <div className="pm-shimmer" style={{ height: "18px", width: "200px", borderRadius: "4px", marginBottom: "8px" }} />
          ) : (
            <p className="text-h3" style={{ marginBottom: "4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {detail?.title ?? "Meeting transcript"}
            </p>
          )}
          {loading ? (
            <div className="pm-shimmer" style={{ height: "13px", width: "140px", borderRadius: "4px" }} />
          ) : (
            <p className="text-body-sm">
              {projectName ?? "No project"}
              {detail && (
                <span style={{ color: "var(--text-muted)" }}>
                  {" "}· {formatDate(detail.meetingDate, detail.createdAt)}
                </span>
              )}
            </p>
          )}
        </div>

        {!loading && detail && detail.actionCount > 0 && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "11px",
              fontWeight: 600,
              color: "var(--cta)",
              background: "rgba(0,115,234,0.08)",
              borderRadius: "var(--radius-badge)",
              padding: "3px 8px",
              flexShrink: 0,
            }}
          >
            <Zap size={10} />
            {detail.actionCount} action{detail.actionCount !== 1 ? "s" : ""}
          </span>
        )}

        <button
          onClick={onClose}
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "28px",
            width: "28px",
            borderRadius: "var(--radius-btn)",
            border: "none",
            background: "none",
            cursor: "pointer",
            color: "var(--text-muted)",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-2)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
        >
          <X size={15} />
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>

        {/* AI Summary */}
        <div style={{ marginBottom: "24px" }}>
          <p className="text-caption" style={{ marginBottom: "8px" }}>AI Summary</p>
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div className="pm-shimmer" style={{ height: "13px", borderRadius: "4px" }} />
              <div className="pm-shimmer" style={{ height: "13px", width: "85%", borderRadius: "4px" }} />
              <div className="pm-shimmer" style={{ height: "13px", width: "70%", borderRadius: "4px" }} />
            </div>
          ) : detail?.summary ? (
            <div
              style={{
                background: "var(--surface-2)",
                borderRadius: "var(--radius-card)",
                padding: "12px 14px",
                fontSize: "13px",
                lineHeight: "1.65",
                color: "var(--text-2)",
                whiteSpace: "pre-wrap",
              }}
            >
              {detail.summary}
            </div>
          ) : (
            <p className="text-body-sm">No summary available.</p>
          )}
        </div>

        {/* Transcript */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
            <p className="text-caption">Transcript</p>
            {detail?.transcript && (
              <button
                onClick={copyTranscript}
                className="pm-btn pm-btn-secondary pm-btn-sm"
                style={{ display: "inline-flex", alignItems: "center", gap: "5px", height: "26px", fontSize: "11px" }}
              >
                {copied ? <Check size={11} /> : <Copy size={11} />}
                {copied ? "Copied!" : "Copy"}
              </button>
            )}
          </div>

          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {[100, 85, 90, 75, 95, 80].map((w, i) => (
                <div key={i} className="pm-shimmer" style={{ height: "13px", width: `${w}%`, borderRadius: "4px" }} />
              ))}
            </div>
          ) : detail?.transcript ? (
            <div
              style={{
                background: "var(--surface-2)",
                borderRadius: "var(--radius-card)",
                padding: "14px 16px",
                maxHeight: "calc(100vh - 380px)",
                overflowY: "auto",
              }}
            >
              <TranscriptView raw={detail.transcript} />
            </div>
          ) : (
            <p className="text-body-sm">No transcript available.</p>
          )}
        </div>
      </div>
    </div>
  );
}
