"use client";

import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import Link from "next/link";

type WorkspaceProject = {
  id: string;
  name: string;
};

type WorkspaceDocument = {
  id: string;
  projectId: string | null;
  title: string;
  content: string;
  docType: string;
  sourceKind: string | null;
  sourceRecordId: string | null;
  version: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

type WorkspaceDocumentListResponse = {
  items?: WorkspaceDocument[];
  error?: string;
};

type WorkspaceProjectListResponse = {
  items?: WorkspaceProject[];
};

function formatDate(raw: string): string {
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function labelForDocType(docType: string): string {
  if (docType === "docx_template") return ".docx template";
  if (docType === "xlsx_template") return ".xlsx template";
  if (docType === "email_draft") return "Email draft";
  return docType.replace(/_/g, " ");
}

function isWorkspaceDocumentListResponse(value: unknown): value is WorkspaceDocumentListResponse {
  return Boolean(value && typeof value === "object");
}

export default function DocumentsPage() {
  const [docs, setDocs] = useState<WorkspaceDocument[]>([]);
  const [projects, setProjects] = useState<WorkspaceProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyTemplateType, setBusyTemplateType] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const projectsById = useMemo(() => {
    return new Map(projects.map((project) => [project.id, project.name]));
  }, [projects]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [docsResponse, projectsResponse] = await Promise.all([
          fetch("/api/workspace/documents?limit=100", { cache: "no-store" }),
          fetch("/api/workspace/projects", { cache: "no-store" }),
        ]);

        const docsJson = await docsResponse.json().catch(() => ({}));
        const projectsJson = await projectsResponse.json().catch(() => ({}));

        if (cancelled) return;

        const nextDocs = isWorkspaceDocumentListResponse(docsJson) && Array.isArray(docsJson.items)
          ? docsJson.items
          : [];
        const nextProjects = Array.isArray(projectsJson?.items)
          ? projectsJson.items
          : [];

        setDocs(nextDocs);
        setProjects(nextProjects);
        setSelectedProjectId((current) => current || nextProjects[0]?.id || "");
      } catch {
        if (!cancelled) {
          setDocs([]);
          setProjects([]);
          setError("Failed to load documents.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function createTemplate(docType: "docx_template" | "xlsx_template") {
    if (!selectedProjectId) {
      setError("Select a project first.");
      return;
    }

    setBusyTemplateType(docType);
    setError(null);

    const body =
      docType === "docx_template"
        ? {
            projectId: selectedProjectId,
            title: "Project Brief Template",
            content:
              "# Project Brief\n\n## Objective\n- \n\n## Scope\n- In scope\n- Out of scope\n\n## Risks\n- \n",
            docType,
            sourceKind: "template",
            metadata: { format: "docx", templateCategory: "project_brief" },
          }
        : {
            projectId: selectedProjectId,
            title: "Milestone Tracker Template",
            content:
              "Sheet: Milestones\nColumns: Milestone, Owner, Target Date, Status\n",
            docType,
            sourceKind: "template",
            metadata: { format: "xlsx", templateCategory: "milestone_tracker" },
          };

    try {
      const response = await fetch("/api/workspace/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.document) {
        throw new Error(payload?.error ?? "Failed to create template.");
      }

      const createdDocument = payload.document as WorkspaceDocument;
      setDocs((current) => [createdDocument, ...current.filter((doc) => doc.id !== createdDocument.id)]);
    } catch (templateError) {
      setError(templateError instanceof Error ? templateError.message : "Failed to create template.");
    } finally {
      setBusyTemplateType(null);
    }
  }

  return (
    <div
      style={{
        minHeight: "100%",
        overflowY: "auto",
        background: "var(--page-bg)",
        padding: "24px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "16px",
          marginBottom: "24px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 className="text-h1">Documents</h1>
          <p className="text-body-sm" style={{ marginTop: "4px" }}>
            Project assets, email drafts, and starter templates.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <select
            value={selectedProjectId}
            onChange={(event) => setSelectedProjectId(event.target.value)}
            style={{
              height: "36px",
              borderRadius: "10px",
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--text-1)",
              padding: "0 10px",
              minWidth: "200px",
            }}
          >
            <option value="">Select project...</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="pm-btn pm-btn-sm"
            onClick={() => void createTemplate("docx_template")}
            disabled={busyTemplateType !== null}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            {busyTemplateType === "docx_template" ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
            New .docx template
          </button>

          <button
            type="button"
            className="pm-btn pm-btn-sm"
            onClick={() => void createTemplate("xlsx_template")}
            disabled={busyTemplateType !== null}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            {busyTemplateType === "xlsx_template" ? <Loader2 size={13} className="animate-spin" /> : <FileSpreadsheet size={13} />}
            New .xlsx template
          </button>
        </div>
      </div>

      {error && (
        <div
          style={{
            marginBottom: "16px",
            borderRadius: "12px",
            border: "1px solid #fecaca",
            background: "#fef2f2",
            color: "#b91c1c",
            padding: "10px 12px",
            fontSize: "13px",
          }}
        >
          {error}
        </div>
      )}

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

      {!loading && (
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
            style={{ gridTemplateColumns: "minmax(0,1fr) 150px 180px 140px 100px" }}
          >
            <span>Document</span>
            <span>Type</span>
            <span>Project</span>
            <span>Updated</span>
            <span>Version</span>
          </div>

          {docs.map((doc) => (
            <div
              key={doc.id}
              className="pm-table-row"
              style={{ gridTemplateColumns: "minmax(0,1fr) 150px 180px 140px 100px" }}
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
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {doc.title}
                </span>
              </span>

              <span className="text-body-sm" style={{ textTransform: "capitalize" }}>
                {labelForDocType(doc.docType)}
              </span>

              <span
                className="text-body-sm"
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {doc.projectId ? projectsById.get(doc.projectId) ?? doc.projectId.slice(0, 8) : "-"}
              </span>

              <span className="text-body-sm">{formatDate(doc.updatedAt)}</span>
              <span className="text-body-sm">v{doc.version}</span>
            </div>
          ))}

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
                Create a starter template or save an email draft to populate this list.
              </p>
              <Link
                href="/workspace/projects/new"
                style={{ color: "var(--cta)", fontSize: "14px", fontWeight: 500 }}
              >
                Start a project -&gt;
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
