"use client";

import { useEffect, useState } from "react";
import { Download, FileText, Mail, Search } from "lucide-react";
import Link from "next/link";

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
  createdAt: string;
}

interface Project {
  id: string;
  name: string;
}

function formatDate(value: string): string {
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
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
    case "other": return "Document";
    default: return docType.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

function getSourceLabel(sourceKind: string | null): string {
  switch (sourceKind) {
    case "direct_chat": return "Larry chat";
    case "template_generation": return "Generated";
    case "manual": return "Manual";
    case "meeting": return "Meeting";
    default: return sourceKind ?? "Unknown";
  }
}

function isGeneratedFile(doc: ProjectDocument): boolean {
  return Boolean(doc.metadata?.generated) && Boolean(doc.metadata?.binaryEncoding);
}

const SELECT_STYLE: React.CSSProperties = {
  height: "36px",
  padding: "0 10px",
  borderRadius: "var(--radius-btn)",
  border: "1px solid var(--border)",
  background: "var(--surface-2)",
  color: "var(--text-1)",
  fontSize: "13px",
  cursor: "pointer",
  outline: "none",
};

export function DocumentsPageClient() {
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [emailDrafts, setEmailDrafts] = useState<EmailDraft[]>([]);
  const [projects, setProjects] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"documents" | "drafts">("documents");
  const [search, setSearch] = useState("");
  const [filterProjectId, setFilterProjectId] = useState("");
  const [expandedDraftId, setExpandedDraftId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/workspace/documents?limit=50", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/workspace/email-drafts?limit=50", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/workspace/projects", { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(
        ([docsData, draftsData, projectsData]: [
          { items?: ProjectDocument[] },
          { items?: EmailDraft[] },
          { items?: Project[] },
        ]) => {
          setDocuments(docsData.items ?? []);
          setEmailDrafts(draftsData.items ?? []);
          const map: Record<string, string> = {};
          for (const p of projectsData.items ?? []) map[p.id] = p.name;
          setProjects(map);
        }
      )
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const allProjectIds = Array.from(
    new Set([
      ...documents.map((d) => d.projectId),
      ...emailDrafts.map((d) => d.projectId),
    ].filter(Boolean) as string[])
  );

  const displayDocs = documents.filter((d) => {
    if (filterProjectId && d.projectId !== filterProjectId) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!d.title.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const displayDrafts = emailDrafts.filter((d) => {
    if (filterProjectId && d.projectId !== filterProjectId) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (
        !d.subject.toLowerCase().includes(q) &&
        !d.recipient.toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  const hasFilters = search.trim() !== "" || filterProjectId !== "";

  return (
    <div style={{ minHeight: "100%", overflowY: "auto", background: "var(--page-bg)", padding: "24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
        <h1 className="text-h1">Documents</h1>
      </div>
      <p className="text-body-sm" style={{ marginBottom: "20px" }}>
        Project documents and email drafts created by Larry or generated from project data.
      </p>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: "4px",
          marginBottom: "16px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        {(["documents", "drafts"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className="text-body-sm"
            style={{
              padding: "8px 16px",
              fontWeight: tab === t ? 600 : 400,
              color: tab === t ? "var(--text-1)" : "var(--text-muted)",
              borderTop: "none",
              borderLeft: "none",
              borderRight: "none",
              borderBottom: tab === t ? "2px solid var(--cta)" : "2px solid transparent",
              background: "none",
              cursor: "pointer",
              marginBottom: "-1px",
            }}
          >
            {t === "documents"
              ? `Documents (${documents.length})`
              : `Email Drafts (${emailDrafts.length})`}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            height: "36px",
            padding: "0 10px",
            borderRadius: "var(--radius-btn)",
            border: "1px solid var(--border)",
            background: "var(--surface-2)",
            flex: "1 1 200px",
            maxWidth: "320px",
          }}
        >
          <Search size={13} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
          <input
            placeholder={tab === "documents" ? "Search documents…" : "Search drafts…"}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1,
              background: "none",
              border: "none",
              outline: "none",
              fontSize: "13px",
              color: "var(--text-1)",
            }}
          />
        </div>

        {allProjectIds.length > 0 && (
          <select value={filterProjectId} onChange={(e) => setFilterProjectId(e.target.value)} style={SELECT_STYLE}>
            <option value="">All projects</option>
            {allProjectIds.map((id) => (
              <option key={id} value={id}>
                {projects[id] ?? id.slice(0, 8)}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-card)",
            padding: "48px",
            textAlign: "center",
            background: "var(--surface)",
          }}
        >
          <p className="text-body-sm">Loading…</p>
        </div>
      ) : tab === "documents" ? (
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-card)",
            overflow: "hidden",
            background: "var(--surface)",
          }}
        >
          <div
            className="pm-table-header"
            style={{ gridTemplateColumns: "minmax(0,1fr) 120px 160px 110px 100px" }}
          >
            <span>Document</span>
            <span>Type</span>
            <span>Project</span>
            <span>Source</span>
            <span>Date</span>
          </div>

          {displayDocs.length === 0 ? (
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
              {hasFilters ? (
                <>
                  <p style={{ fontSize: "15px", fontWeight: 500, color: "var(--text-1)", marginBottom: "6px" }}>
                    No documents match your filters
                  </p>
                  <button
                    onClick={() => { setSearch(""); setFilterProjectId(""); }}
                    style={{ color: "var(--cta)", fontSize: "13px", fontWeight: 500, background: "none", border: "none", cursor: "pointer" }}
                  >
                    Clear filters
                  </button>
                </>
              ) : (
                <>
                  <p style={{ fontSize: "15px", fontWeight: 500, color: "var(--text-1)", marginBottom: "6px" }}>
                    No documents yet
                  </p>
                  <p className="text-body-sm" style={{ marginBottom: "16px" }}>
                    Ask Larry to draft a letter, generate a status report, or create a task spreadsheet from a project.
                  </p>
                </>
              )}
            </div>
          ) : (
            displayDocs.map((doc) => {
              const projectName = doc.projectId ? (projects[doc.projectId] ?? null) : null;
              return (
                <div
                  key={doc.id}
                  className="pm-table-row"
                  style={{ gridTemplateColumns: "minmax(0,1fr) 120px 160px 110px 100px" }}
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
                    <span
                      className="text-h3"
                      style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    >
                      {doc.title}
                    </span>
                  </span>
                  <span className="text-body-sm">{getDocTypeLabel(doc.docType)}</span>
                  <span className="text-body-sm" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {projectName ? (
                      <Link href={`/workspace/projects/${doc.projectId}`} style={{ color: "var(--cta)" }}>
                        {projectName}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </span>
                  <span className="text-body-sm">{getSourceLabel(doc.sourceKind)}</span>
                  <span className="text-body-sm" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {formatDate(doc.updatedAt)}
                    {isGeneratedFile(doc) && (
                      <a
                        href={`/api/workspace/documents/${encodeURIComponent(doc.id)}/download`}
                        download
                        title="Download"
                        style={{ color: "var(--cta)", display: "inline-flex" }}
                      >
                        <Download size={13} />
                      </a>
                    )}
                  </span>
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* Email drafts tab */
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-card)",
            overflow: "hidden",
            background: "var(--surface)",
          }}
        >
          <div
            className="pm-table-header"
            style={{ gridTemplateColumns: "minmax(0,1fr) 160px 100px 80px" }}
          >
            <span>Subject</span>
            <span>Recipient</span>
            <span>Project</span>
            <span>Date</span>
          </div>

          {displayDrafts.length === 0 ? (
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
                <Mail size={20} style={{ color: "var(--text-muted)" }} />
              </div>
              <p style={{ fontSize: "15px", fontWeight: 500, color: "var(--text-1)", marginBottom: "6px" }}>
                {hasFilters ? "No drafts match your filters" : "No email drafts yet"}
              </p>
              {!hasFilters && (
                <p className="text-body-sm">
                  Ask Larry to draft an email from a project context to create drafts here.
                </p>
              )}
              {hasFilters && (
                <button
                  onClick={() => { setSearch(""); setFilterProjectId(""); }}
                  style={{ color: "var(--cta)", fontSize: "13px", fontWeight: 500, background: "none", border: "none", cursor: "pointer" }}
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            displayDrafts.map((draft) => {
              const projectName = draft.projectId ? (projects[draft.projectId] ?? null) : null;
              const isExpanded = expandedDraftId === draft.id;
              return (
                <div key={draft.id}>
                  <div
                    className="pm-table-row"
                    style={{
                      gridTemplateColumns: "minmax(0,1fr) 160px 100px 80px",
                      cursor: "pointer",
                    }}
                    onClick={() => setExpandedDraftId(isExpanded ? null : draft.id)}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                      <Mail size={13} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                      <span
                        className="text-h3"
                        style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      >
                        {draft.subject || "(No subject)"}
                      </span>
                    </span>
                    <span className="text-body-sm" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {draft.recipient}
                    </span>
                    <span className="text-body-sm" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {projectName ?? "—"}
                    </span>
                    <span className="text-body-sm">{formatDate(draft.createdAt)}</span>
                  </div>
                  {isExpanded && (
                    <div
                      style={{
                        padding: "12px 16px 16px",
                        borderTop: "1px solid var(--border)",
                        background: "var(--surface-2)",
                      }}
                    >
                      <p className="text-body-sm" style={{ fontWeight: 600, marginBottom: "8px" }}>
                        Draft body
                      </p>
                      <pre
                        style={{
                          fontSize: "13px",
                          lineHeight: "1.6",
                          color: "var(--text-2)",
                          whiteSpace: "pre-wrap",
                          fontFamily: "inherit",
                          margin: 0,
                        }}
                      >
                        {draft.body}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
