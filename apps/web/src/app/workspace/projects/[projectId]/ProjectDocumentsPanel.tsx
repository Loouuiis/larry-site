"use client";

import { useEffect, useState } from "react";
import { Download, FileText, Mail } from "lucide-react";

interface ProjectDocument {
  id: string;
  projectId: string | null;
  title: string;
  docType: string;
  sourceKind: string | null;
  version: number;
  metadata: Record<string, unknown>;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface EmailDraft {
  id: string;
  projectId: string | null;
  recipient: string;
  subject: string;
  body: string;
  state: string;
  metadata: Record<string, unknown>;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

function formatRelativeTime(value: string): string {
  const delta = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(delta / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function getDocTypeLabel(docType: string): string {
  switch (docType) {
    case "docx": return "Word Document";
    case "xlsx": return "Spreadsheet";
    case "pptx": return "Presentation";
    case "letter": return "Letter";
    case "report": return "Report";
    case "memo": return "Memo";
    case "brief": return "Brief";
    default: return docType.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

function isGeneratedFile(doc: ProjectDocument): boolean {
  return Boolean(doc.metadata?.generated) && Boolean(doc.metadata?.binaryEncoding);
}

export function ProjectDocumentsPanel({ projectId }: { projectId: string }) {
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [emailDrafts, setEmailDrafts] = useState<EmailDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedDraftId, setExpandedDraftId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    Promise.all([
      fetch(`/api/workspace/documents?projectId=${encodeURIComponent(projectId)}&limit=20`, {
        cache: "no-store",
      }).then((r) => r.json()),
      fetch(`/api/workspace/email-drafts?projectId=${encodeURIComponent(projectId)}&limit=20`, {
        cache: "no-store",
      }).then((r) => r.json()),
    ])
      .then(
        ([docsData, draftsData]: [
          { items?: ProjectDocument[]; error?: string },
          { items?: EmailDraft[]; error?: string },
        ]) => {
          if (!active) return;
          setDocuments(docsData.items ?? []);
          setEmailDrafts(draftsData.items ?? []);
        }
      )
      .catch(() => {
        if (!active) return;
        setError("Could not load project documents.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [projectId]);

  const hasContent = documents.length > 0 || emailDrafts.length > 0;

  return (
    <div
      style={{
        borderRadius: "var(--radius-card)",
        border: "1px solid var(--border)",
        background: "var(--surface)",
        padding: "20px",
      }}
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[18px] font-semibold" style={{ color: "var(--text-1)" }}>
            Project Documents
          </p>
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
            Documents and email drafts created by Larry or uploaded directly.
          </p>
        </div>
      </div>

      {error && (
        <div
          className="mt-4 rounded-[18px] border px-4 py-3 text-[13px]"
          style={{ borderColor: "#fecaca", background: "#fef2f2", color: "#b91c1c" }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <p className="mt-5 text-[14px]" style={{ color: "var(--text-muted)" }}>
          Loading documents...
        </p>
      ) : !hasContent ? (
        <p className="mt-5 text-[14px]" style={{ color: "var(--text-muted)" }}>
          No documents yet. Ask Larry to draft a letter, generate a status report, or create a spreadsheet export.
        </p>
      ) : (
        <div className="mt-5 space-y-5">
          {documents.length > 0 && (
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>
                Documents
              </p>
              <div className="mt-3 space-y-2">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between gap-4 rounded-[18px] border px-4 py-3"
                    style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <FileText size={16} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-semibold" style={{ color: "var(--text-1)" }}>
                          {doc.title}
                        </p>
                        <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                          {getDocTypeLabel(doc.docType)} · {formatRelativeTime(doc.updatedAt)}
                        </p>
                      </div>
                    </div>
                    {isGeneratedFile(doc) && (
                      <a
                        href={`/api/workspace/documents/${encodeURIComponent(doc.id)}/download`}
                        download
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold"
                        style={{ borderColor: "var(--border)", color: "var(--cta)", background: "var(--surface)" }}
                      >
                        <Download size={12} />
                        Download
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {emailDrafts.length > 0 && (
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>
                Email Drafts
              </p>
              <div className="mt-3 space-y-2">
                {emailDrafts.map((draft) => (
                  <div
                    key={draft.id}
                    className="rounded-[18px] border px-4 py-3"
                    style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <Mail size={16} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-semibold" style={{ color: "var(--text-1)" }}>
                            {draft.subject || "(No subject)"}
                          </p>
                          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                            To: {draft.recipient} · {draft.state} · {formatRelativeTime(draft.createdAt)}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedDraftId(expandedDraftId === draft.id ? null : draft.id)
                        }
                        className="shrink-0 text-[12px] font-semibold"
                        style={{ color: "var(--cta)" }}
                      >
                        {expandedDraftId === draft.id ? "Collapse" : "Preview"}
                      </button>
                    </div>
                    {expandedDraftId === draft.id && (
                      <div
                        className="mt-3 rounded-[14px] border px-4 py-3 text-[13px] leading-6 whitespace-pre-wrap"
                        style={{
                          borderColor: "var(--border)",
                          background: "var(--surface)",
                          color: "var(--text-2)",
                        }}
                      >
                        {draft.body}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
