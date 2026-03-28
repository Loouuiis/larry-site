"use client";

import { useEffect, useState } from "react";
import { FileText, Upload } from "lucide-react";
import Link from "next/link";

interface MeetingDocument {
  id: string;
  title: string | null;
  summary: string | null;
  actionCount: number;
  meetingDate: string | null;
  createdAt: string;
  projectId?: string | null;
}

function formatDate(meetingDate: string | null, createdAt: string): string {
  const raw = meetingDate ?? createdAt;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function DocumentsPage() {
  const [docs, setDocs] = useState<MeetingDocument[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/workspace/meetings?limit=50", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { meetings?: MeetingDocument[] }) => {
        const withSummary = (data.meetings ?? []).filter((m) => m.summary != null);
        setDocs(withSummary);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div
      style={{
        minHeight: "100%",
        overflowY: "auto",
        background: "var(--page-bg)",
        padding: "24px",
      }}
    >
      {/* Page header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "24px",
        }}
      >
        <div>
          <h1 className="text-h1">Documents</h1>
          <p className="text-body-sm" style={{ marginTop: "4px" }}>
            Meeting summaries, reports, and workspace knowledge.
          </p>
        </div>
        <button
          className="pm-btn pm-btn-primary pm-btn-sm"
          style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
        >
          <Upload size={13} />
          Upload
        </button>
      </div>

      {/* Loading state */}
      {loading && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 0" }}>
          <div
            className="pm-shimmer"
            style={{
              height: "20px",
              width: "200px",
              borderRadius: "var(--radius-btn)",
            }}
          />
        </div>
      )}

      {/* Document table */}
      {!loading && (
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
            style={{ gridTemplateColumns: "minmax(0,1fr) 100px 120px 100px 100px" }}
          >
            <span>Document</span>
            <span>Type</span>
            <span>Project</span>
            <span>Date</span>
            <span>Author</span>
          </div>

          {/* Table rows */}
          {docs.map((doc) => (
            <div
              key={doc.id}
              className="pm-table-row"
              style={{ gridTemplateColumns: "minmax(0,1fr) 100px 120px 100px 100px" }}
            >
              {/* Document name with icon */}
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
                  {doc.title ?? "Meeting transcript"}
                </span>
              </span>

              {/* Type */}
              <span className="text-body-sm">Meeting summary</span>

              {/* Project */}
              <span
                className="text-body-sm"
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {doc.projectId ? doc.projectId.slice(0, 8) + "…" : "—"}
              </span>

              {/* Date */}
              <span className="text-body-sm">
                {formatDate(doc.meetingDate, doc.createdAt)}
              </span>

              {/* Author */}
              <span className="text-body-sm">Larry</span>
            </div>
          ))}

          {/* Empty state */}
          {!loading && docs.length === 0 && (
            <div style={{ padding: "48px", textAlign: "center" }}>
              <div
                style={{
                  margin: "0 auto 12px",
                  display: "flex",
                  height: "48px",
                  width: "48px",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "var(--radius-card)",
                  background: "var(--surface-2)",
                }}
              >
                <FileText size={20} style={{ color: "var(--text-muted)" }} />
              </div>
              <p
                style={{
                  fontSize: "15px",
                  fontWeight: 500,
                  color: "var(--text-1)",
                  marginBottom: "6px",
                }}
              >
                No documents yet
              </p>
              <p className="text-body-sm" style={{ marginBottom: "16px" }}>
                Process a meeting transcript to see summaries here.
              </p>
              <Link
                href="/workspace/meetings"
                style={{ color: "var(--cta)", fontSize: "14px", fontWeight: 500 }}
              >
                Go to Meetings →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}