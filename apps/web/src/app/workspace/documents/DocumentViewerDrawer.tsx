"use client";

import { useEffect, useState } from "react";
import { X, FileText, Copy, Check, Download } from "lucide-react";
import type { LarryDocument } from "@/app/dashboard/types";

interface DocumentViewerDrawerProps {
  docId: string | null;
  isLarryDoc: boolean;
  onClose: () => void;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  email_draft: "Email draft",
  letter: "Letter",
  memo: "Memo",
  report: "Report",
  note: "Note",
  other: "Document",
};

const STATE_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  draft:  { label: "Draft",  color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
  final:  { label: "Final",  color: "#22c55e", bg: "rgba(34,197,94,0.1)" },
  sent:   { label: "Sent",   color: "#6c44f6", bg: "rgba(108,68,246,0.1)" },
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function ContentView({ content, docType }: { content: string; docType: string }) {
  // Email drafts get special rendering with To/Subject headers
  return (
    <div
      style={{
        fontSize: "13px",
        lineHeight: "1.7",
        color: "var(--text-2)",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {content}
    </div>
  );
}

export function DocumentViewerDrawer({ docId, isLarryDoc, onClose }: DocumentViewerDrawerProps) {
  const [doc, setDoc] = useState<LarryDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!docId) { setDoc(null); return; }

    if (!isLarryDoc) return; // handled via download link, no fetch needed

    setLoading(true);
    setDoc(null);
    fetch(`/api/workspace/larry/documents/${docId}`, { cache: "no-store" })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => setDoc(data ?? null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [docId, isLarryDoc]);

  useEffect(() => {
    if (!docId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [docId, onClose]);

  if (!docId) return null;

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
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 69,
          background: "rgba(0,0,0,0.2)",
        }}
      />

      {/* Drawer */}
      <div
        className="fixed right-0 top-0 flex h-full flex-col"
        style={{
          zIndex: 70,
          width: "500px",
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
              <>
                <div className="pm-shimmer" style={{ height: "16px", width: "200px", borderRadius: "4px", marginBottom: "8px" }} />
                <div className="pm-shimmer" style={{ height: "12px", width: "120px", borderRadius: "4px" }} />
              </>
            ) : (
              <>
                <p
                  className="text-h3"
                  style={{ marginBottom: "4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  {doc?.title ?? "Document"}
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                  <span className="text-body-sm">{typeLabel}</span>
                  {doc && <span className="text-body-sm" style={{ color: "var(--text-disabled)" }}>·</span>}
                  {doc && <span className="text-body-sm">{formatDate(doc.updatedAt)}</span>}
                  {stateBadge && (
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: 600,
                        color: stateBadge.color,
                        background: stateBadge.bg,
                        borderRadius: "var(--radius-badge)",
                        padding: "1px 6px",
                      }}
                    >
                      {stateBadge.label}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>

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

        {/* Email draft meta */}
        {!loading && doc?.docType === "email_draft" && (doc.emailRecipient || doc.emailSubject) && (
          <div
            style={{
              padding: "12px 20px",
              borderBottom: "1px solid var(--border)",
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              gap: "4px",
            }}
          >
            {doc.emailRecipient && (
              <p style={{ fontSize: "12px", color: "var(--text-2)" }}>
                <span style={{ color: "var(--text-muted)", marginRight: "6px" }}>To:</span>
                {doc.emailRecipient}
              </p>
            )}
            {doc.emailSubject && (
              <p style={{ fontSize: "12px", color: "var(--text-2)" }}>
                <span style={{ color: "var(--text-muted)", marginRight: "6px" }}>Subject:</span>
                {doc.emailSubject}
              </p>
            )}
          </div>
        )}

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {[100, 90, 95, 80, 85, 70, 88].map((w, i) => (
                <div key={i} className="pm-shimmer" style={{ height: "13px", width: `${w}%`, borderRadius: "4px" }} />
              ))}
            </div>
          ) : doc?.content ? (
            <>
              <div
                style={{
                  background: "var(--surface-2)",
                  borderRadius: "var(--radius-card)",
                  padding: "16px 18px",
                  marginBottom: "16px",
                }}
              >
                <ContentView content={doc.content} docType={doc.docType} />
              </div>
            </>
          ) : (
            <p className="text-body-sm">No content available.</p>
          )}
        </div>

        {/* Footer actions */}
        {!loading && doc && (
          <div
            style={{
              padding: "12px 20px",
              borderTop: "1px solid var(--border)",
              flexShrink: 0,
              display: "flex",
              gap: "8px",
            }}
          >
            <button
              onClick={copyContent}
              className="pm-btn pm-btn-sm"
              style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? "Copied!" : "Copy content"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
