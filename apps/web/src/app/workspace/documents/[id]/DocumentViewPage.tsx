"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Copy, Check, Download } from "lucide-react";

interface DocumentData {
  id: string;
  title: string;
  content: string;
  docType: string;
  state?: string;
  emailRecipient?: string | null;
  emailSubject?: string | null;
  createdAt: string;
  updatedAt: string;
  projectId?: string | null;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  email_draft: "Email draft",
  letter: "Letter",
  memo: "Memo",
  report: "Report",
  note: "Note",
  transcript: "Transcript",
  other: "Document",
};

const STATE_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: "Draft", color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
  final: { label: "Final", color: "#22c55e", bg: "rgba(34,197,94,0.1)" },
  sent:  { label: "Sent",  color: "#6c44f6", bg: "rgba(108,68,246,0.1)" },
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function DocumentViewPage({ id, isLarry }: { id: string; isLarry: boolean }) {
  const router = useRouter();
  const [doc, setDoc] = useState<DocumentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const url = isLarry
      ? `/api/workspace/larry/documents/${id}`
      : `/api/workspace/documents/${id}`;

    fetch(url, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then((data) => setDoc(data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [id, isLarry]);

  function copyContent() {
    if (!doc?.content) return;
    navigator.clipboard.writeText(doc.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const typeLabel = doc ? (DOC_TYPE_LABELS[doc.docType] ?? "Document") : "Document";
  const stateBadge = doc?.state ? STATE_BADGE[doc.state] : null;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto" style={{ background: "var(--page-bg)" }}>
      <div className="mx-auto max-w-[760px] px-6 py-8">

        {/* Back button */}
        <button
          type="button"
          onClick={() => router.back()}
          className="mb-6 inline-flex items-center gap-1.5 text-[13px]"
          style={{ color: "var(--text-muted)" }}
        >
          <ArrowLeft size={14} />
          Back to documents
        </button>

        {loading && (
          <div
            style={{
              borderRadius: "var(--radius-card)",
              border: "1px solid var(--border)",
              background: "var(--surface)",
              padding: "32px",
            }}
          >
            <div className="pm-shimmer" style={{ height: "24px", width: "260px", borderRadius: "6px", marginBottom: "12px" }} />
            <div className="pm-shimmer" style={{ height: "13px", width: "160px", borderRadius: "4px", marginBottom: "32px" }} />
            {[100, 92, 96, 80, 88, 74, 90, 85].map((w, i) => (
              <div key={i} className="pm-shimmer" style={{ height: "13px", width: `${w}%`, borderRadius: "4px", marginBottom: "10px" }} />
            ))}
          </div>
        )}

        {error && !loading && (
          <div
            className="text-center py-16"
            style={{
              borderRadius: "var(--radius-card)",
              border: "1px solid var(--border)",
              background: "var(--surface)",
            }}
          >
            <p className="text-[15px] font-semibold mb-2" style={{ color: "var(--text-1)" }}>Document not found</p>
            <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
              This document may have been deleted or you don&apos;t have access.
            </p>
          </div>
        )}

        {doc && !loading && (
          <div
            style={{
              borderRadius: "var(--radius-card)",
              border: "1px solid var(--border)",
              background: "var(--surface)",
              overflow: "hidden",
            }}
          >
            {/* Document header */}
            <div
              style={{
                padding: "24px 28px 20px",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h1
                    className="text-[22px] font-semibold tracking-[-0.01em]"
                    style={{ color: "var(--text-1)", marginBottom: "8px" }}
                  >
                    {doc.title}
                  </h1>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                      {typeLabel}
                    </span>
                    <span style={{ color: "var(--text-disabled)" }}>·</span>
                    <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                      {formatDate(doc.updatedAt ?? doc.createdAt)}
                    </span>
                    {stateBadge && (
                      <span
                        style={{
                          fontSize: "10px",
                          fontWeight: 600,
                          color: stateBadge.color,
                          background: stateBadge.bg,
                          borderRadius: "var(--radius-badge)",
                          padding: "2px 7px",
                        }}
                      >
                        {stateBadge.label}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={copyContent}
                    className="pm-btn pm-btn-sm inline-flex items-center gap-1.5"
                  >
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                    {copied ? "Copied!" : "Copy"}
                  </button>
                  {!isLarry && (
                    <a
                      href={`/api/workspace/documents/${id}/download`}
                      className="pm-btn pm-btn-sm inline-flex items-center gap-1.5"
                      download
                    >
                      <Download size={12} />
                      Download
                    </a>
                  )}
                </div>
              </div>

              {/* Email metadata */}
              {doc.docType === "email_draft" && (doc.emailRecipient || doc.emailSubject) && (
                <div
                  className="mt-4 space-y-1.5"
                  style={{
                    background: "var(--surface-2)",
                    borderRadius: "var(--radius-btn)",
                    padding: "10px 14px",
                  }}
                >
                  {doc.emailRecipient && (
                    <p className="text-[12px]" style={{ color: "var(--text-2)" }}>
                      <span style={{ color: "var(--text-muted)", marginRight: "8px" }}>To</span>
                      {doc.emailRecipient}
                    </p>
                  )}
                  {doc.emailSubject && (
                    <p className="text-[12px]" style={{ color: "var(--text-2)" }}>
                      <span style={{ color: "var(--text-muted)", marginRight: "8px" }}>Subject</span>
                      {doc.emailSubject}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Document body */}
            <div style={{ padding: "28px" }}>
              {doc.content ? (
                <div
                  style={{
                    fontSize: "14px",
                    lineHeight: "1.8",
                    color: "var(--text-2)",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    fontFamily: doc.docType === "transcript" ? "var(--font-mono, monospace)" : "inherit",
                  }}
                >
                  {doc.content}
                </div>
              ) : (
                <p className="text-[13px]" style={{ color: "var(--text-disabled)" }}>
                  No content available.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
