"use client";

import { useEffect, useState } from "react";
import { FileText, Search, Zap, Upload } from "lucide-react";
import Link from "next/link";
import { MeetingDetailDrawer, type MeetingDetail } from "./MeetingDetailDrawer";

interface MeetingDocument {
  id: string;
  title: string | null;
  summary: string | null;
  actionCount: number;
  meetingDate: string | null;
  createdAt: string;
  projectId?: string | null;
}

interface Project {
  id: string;
  name: string;
}

function formatDate(meetingDate: string | null, createdAt: string): string {
  const raw = meetingDate ?? createdAt;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
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
  const [docs, setDocs] = useState<MeetingDocument[]>([]);
  const [projects, setProjects] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [drawerDetail, setDrawerDetail] = useState<MeetingDetail | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);

  const [search, setSearch] = useState("");
  const [filterProjectId, setFilterProjectId] = useState("");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");

  // Initial data load
  useEffect(() => {
    Promise.all([
      fetch("/api/workspace/meetings?limit=50", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/workspace/projects", { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([meetingsData, projectsData]: [{ meetings?: MeetingDocument[] }, { items?: Project[] }]) => {
        const withSummary = (meetingsData.meetings ?? []).filter((m) => m.summary != null);
        setDocs(withSummary);
        const map: Record<string, string> = {};
        for (const p of projectsData.items ?? []) map[p.id] = p.name;
        setProjects(map);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Drawer fetch
  useEffect(() => {
    if (!selectedDocId) { setDrawerDetail(null); return; }
    setDrawerLoading(true);
    setDrawerDetail(null);
    fetch(`/api/workspace/meetings/${selectedDocId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data: MeetingDetail) => setDrawerDetail(data))
      .catch(() => {})
      .finally(() => setDrawerLoading(false));
  }, [selectedDocId]);

  // Derived display list
  const displayDocs = docs
    .filter((d) => {
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!(d.title ?? "meeting transcript").toLowerCase().includes(q)) return false;
      }
      if (filterProjectId && d.projectId !== filterProjectId) return false;
      return true;
    })
    .sort((a, b) => {
      const da = new Date(a.meetingDate ?? a.createdAt).getTime();
      const db = new Date(b.meetingDate ?? b.createdAt).getTime();
      return sortOrder === "newest" ? db - da : da - db;
    });

  const totalActions = docs.reduce((sum, d) => sum + d.actionCount, 0);
  const hasFilters = search.trim() !== "" || filterProjectId !== "";

  // Unique projects that appear in docs
  const docProjectIds = Array.from(new Set(docs.map((d) => d.projectId).filter(Boolean))) as string[];

  return (
    <div style={{ minHeight: "100%", overflowY: "auto", background: "var(--page-bg)", padding: "24px" }}>

      {/* Page header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
        <h1 className="text-h1">Documents</h1>
        <button
          className="pm-btn pm-btn-primary pm-btn-sm"
          style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
        >
          <Upload size={13} />
          Upload
        </button>
      </div>
      <p className="text-body-sm" style={{ marginBottom: "16px" }}>
        Meeting summaries, reports, and workspace knowledge.
      </p>

      {/* Stats bar */}
      {!loading && docs.length > 0 && (
        <p className="text-body-sm" style={{ marginBottom: "16px", color: "var(--text-muted)" }}>
          {docs.length} meeting{docs.length !== 1 ? "s" : ""} processed
          {totalActions > 0 && ` · ${totalActions} action${totalActions !== 1 ? "s" : ""} extracted`}
        </p>
      )}

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
            placeholder="Search documents…"
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

        {docProjectIds.length > 0 && (
          <select
            value={filterProjectId}
            onChange={(e) => setFilterProjectId(e.target.value)}
            style={SELECT_STYLE}
          >
            <option value="">All projects</option>
            {docProjectIds.map((id) => (
              <option key={id} value={id}>{projects[id] ?? id.slice(0, 8)}</option>
            ))}
          </select>
        )}

        <select
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value as "newest" | "oldest")}
          style={SELECT_STYLE}
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
      </div>

      {/* Table */}
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
          style={{ gridTemplateColumns: "minmax(0,1fr) 90px 160px 100px" }}
        >
          <span>Document</span>
          <span>Actions</span>
          <span>Project</span>
          <span>Date</span>
        </div>

        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
            {[1, 2, 3].map((i) => (
              <div key={i} className="pm-table-row" style={{ gridTemplateColumns: "minmax(0,1fr) 90px 160px 100px" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div className="pm-shimmer" style={{ height: "28px", width: "28px", borderRadius: "6px", flexShrink: 0 }} />
                  <div className="pm-shimmer" style={{ height: "14px", width: "200px", borderRadius: "4px" }} />
                </span>
                <div className="pm-shimmer" style={{ height: "18px", width: "32px", borderRadius: "var(--radius-badge)" }} />
                <div className="pm-shimmer" style={{ height: "13px", width: "100px", borderRadius: "4px" }} />
                <div className="pm-shimmer" style={{ height: "13px", width: "60px", borderRadius: "4px" }} />
              </div>
            ))}
          </div>
        ) : displayDocs.length === 0 ? (
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
                  Process a meeting transcript to see summaries here.
                </p>
                <Link href="/workspace/meetings" style={{ color: "var(--cta)", fontSize: "14px", fontWeight: 500 }}>
                  Go to Meetings →
                </Link>
              </>
            )}
          </div>
        ) : (
          displayDocs.map((doc) => {
            const isSelected = selectedDocId === doc.id;
            const projectName = doc.projectId ? (projects[doc.projectId] ?? null) : null;
            return (
              <div
                key={doc.id}
                className="pm-table-row"
                style={{
                  gridTemplateColumns: "minmax(0,1fr) 90px 160px 100px",
                  cursor: "pointer",
                  borderLeft: isSelected ? "3px solid var(--brand)" : "3px solid transparent",
                  background: isSelected ? "var(--surface-2)" : undefined,
                  paddingLeft: isSelected ? "13px" : "16px",
                }}
                onClick={() => setSelectedDocId(isSelected ? null : doc.id)}
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
                      background: isSelected ? "var(--surface)" : "var(--surface-2)",
                    }}
                  >
                    <FileText size={13} style={{ color: "var(--text-muted)" }} />
                  </div>
                  <span
                    className="text-h3"
                    style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    {doc.title ?? "Meeting transcript"}
                  </span>
                </span>

                <span>
                  {doc.actionCount > 0 ? (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "3px",
                        fontSize: "11px",
                        fontWeight: 600,
                        color: "var(--cta)",
                        background: "rgba(0,115,234,0.08)",
                        borderRadius: "var(--radius-badge)",
                        padding: "2px 7px",
                      }}
                    >
                      <Zap size={9} />
                      {doc.actionCount}
                    </span>
                  ) : (
                    <span className="text-body-sm">—</span>
                  )}
                </span>

                <span
                  className="text-body-sm"
                  style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  {projectName ?? "—"}
                </span>

                <span className="text-body-sm">
                  {formatDate(doc.meetingDate, doc.createdAt)}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Drawer */}
      <MeetingDetailDrawer
        docId={selectedDocId}
        detail={drawerDetail}
        loading={drawerLoading}
        projects={projects}
        onClose={() => setSelectedDocId(null)}
      />
    </div>
  );
}
