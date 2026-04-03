"use client";

import { useEffect, useState } from "react";
import { FileText, Mail, Search, Upload } from "lucide-react";
import Link from "next/link";
import { MeetingDetailDrawer, type MeetingDetail } from "./MeetingDetailDrawer";
import type { LarryDocument } from "@/app/dashboard/types";

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

// Unified row displayed in the table
interface DisplayRow {
  id: string;
  title: string;
  type: "transcript" | "email_draft" | "letter" | "memo" | "report" | "note" | "other";
  projectId: string | null;
  date: string; // ISO for sorting
  /** Only set for transcript rows — triggers the meeting drawer */
  isMeeting: boolean;
}

function toDisplayRow(doc: MeetingDocument): DisplayRow {
  return {
    id: doc.id,
    title: doc.title ?? "Meeting transcript",
    type: "transcript",
    projectId: doc.projectId ?? null,
    date: doc.meetingDate ?? doc.createdAt,
    isMeeting: true,
  };
}

function larryDocToDisplayRow(doc: LarryDocument): DisplayRow {
  return {
    id: doc.id,
    title: doc.title,
    type: doc.docType,
    projectId: doc.projectId,
    date: doc.createdAt,
    isMeeting: false,
  };
}

const TYPE_LABELS: Record<DisplayRow["type"], string> = {
  transcript: "Transcript",
  email_draft: "Email draft",
  letter: "Letter",
  memo: "Memo",
  report: "Report",
  note: "Note",
  other: "Other",
};

function TypeBadge({ type }: { type: DisplayRow["type"] }) {
  const isTranscript = type === "transcript";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "3px",
        fontSize: "11px",
        fontWeight: 600,
        color: isTranscript ? "var(--cta)" : "var(--text-2)",
        background: isTranscript ? "rgba(0,115,234,0.08)" : "var(--surface-2)",
        borderRadius: "var(--radius-badge)",
        padding: "2px 7px",
        whiteSpace: "nowrap",
      }}
    >
      {isTranscript ? <FileText size={9} /> : <Mail size={9} />}
      {TYPE_LABELS[type]}
    </span>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
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
  const [rows, setRows] = useState<DisplayRow[]>([]);
  const [projects, setProjects] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [drawerDetail, setDrawerDetail] = useState<MeetingDetail | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);

  const [search, setSearch] = useState("");
  const [filterProjectId, setFilterProjectId] = useState("");
  const [filterType, setFilterType] = useState("");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");

  // Initial data load — fetch meetings, larry docs, and projects in parallel
  useEffect(() => {
    Promise.all([
      fetch("/api/workspace/meetings?limit=50", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/workspace/larry/documents?limit=50", { cache: "no-store" }).then((r) =>
        r.json().catch(() => ({ items: [] }))
      ),
      fetch("/api/workspace/projects", { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(
        ([
          meetingsData,
          larryDocsData,
          projectsData,
        ]: [
          { meetings?: MeetingDocument[] },
          { items?: LarryDocument[] },
          { items?: Project[] },
        ]) => {
          const meetingRows = (meetingsData.meetings ?? [])
            .filter((m) => m.summary != null)
            .map(toDisplayRow);

          const larryRows = (larryDocsData.items ?? []).map(larryDocToDisplayRow);

          setRows([...meetingRows, ...larryRows]);

          const map: Record<string, string> = {};
          for (const p of projectsData.items ?? []) map[p.id] = p.name;
          setProjects(map);
        }
      )
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Drawer fetch for meeting transcripts
  useEffect(() => {
    if (!selectedMeetingId) {
      setDrawerDetail(null);
      return;
    }
    setDrawerLoading(true);
    setDrawerDetail(null);
    fetch(`/api/workspace/meetings/${selectedMeetingId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data: MeetingDetail) => setDrawerDetail(data))
      .catch(() => {})
      .finally(() => setDrawerLoading(false));
  }, [selectedMeetingId]);

  // Derived display list
  const displayRows = rows
    .filter((row) => {
      if (search.trim()) {
        if (!row.title.toLowerCase().includes(search.toLowerCase())) return false;
      }
      if (filterProjectId && row.projectId !== filterProjectId) return false;
      if (filterType && row.type !== filterType) return false;
      return true;
    })
    .sort((a, b) => {
      const da = new Date(a.date).getTime();
      const db = new Date(b.date).getTime();
      return sortOrder === "newest" ? db - da : da - db;
    });

  const hasFilters = search.trim() !== "" || filterProjectId !== "" || filterType !== "";

  // Unique projects in the current set
  const docProjectIds = Array.from(
    new Set(rows.map((r) => r.projectId).filter(Boolean))
  ) as string[];

  // Unique types in the current set
  const docTypes = Array.from(new Set(rows.map((r) => r.type))) as Array<DisplayRow["type"]>;

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
      {!loading && rows.length > 0 && (
        <p className="text-body-sm" style={{ marginBottom: "16px", color: "var(--text-muted)" }}>
          {rows.length} document{rows.length !== 1 ? "s" : ""}
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

        {docTypes.length > 1 && (
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            style={SELECT_STYLE}
          >
            <option value="">All types</option>
            {docTypes.map((t) => (
              <option key={t} value={t}>{TYPE_LABELS[t]}</option>
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
          style={{ gridTemplateColumns: "minmax(0,1fr) 120px 160px 100px" }}
        >
          <span>Document</span>
          <span>Type</span>
          <span>Project</span>
          <span>Date</span>
        </div>

        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="pm-table-row"
                style={{ gridTemplateColumns: "minmax(0,1fr) 120px 160px 100px" }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div className="pm-shimmer" style={{ height: "28px", width: "28px", borderRadius: "6px", flexShrink: 0 }} />
                  <div className="pm-shimmer" style={{ height: "14px", width: "200px", borderRadius: "4px" }} />
                </span>
                <div className="pm-shimmer" style={{ height: "18px", width: "72px", borderRadius: "var(--radius-badge)" }} />
                <div className="pm-shimmer" style={{ height: "13px", width: "100px", borderRadius: "4px" }} />
                <div className="pm-shimmer" style={{ height: "13px", width: "60px", borderRadius: "4px" }} />
              </div>
            ))}
          </div>
        ) : displayRows.length === 0 ? (
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
                  onClick={() => { setSearch(""); setFilterProjectId(""); setFilterType(""); }}
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
          displayRows.map((row) => {
            const isSelected = selectedMeetingId === row.id && row.isMeeting;
            const projectName = row.projectId ? (projects[row.projectId] ?? null) : null;
            return (
              <div
                key={row.id}
                className="pm-table-row"
                style={{
                  gridTemplateColumns: "minmax(0,1fr) 120px 160px 100px",
                  cursor: row.isMeeting ? "pointer" : "default",
                  borderLeft: isSelected ? "3px solid var(--brand)" : "3px solid transparent",
                  background: isSelected ? "var(--surface-2)" : undefined,
                  paddingLeft: isSelected ? "13px" : "16px",
                }}
                onClick={() => {
                  if (!row.isMeeting) return;
                  setSelectedMeetingId(isSelected ? null : row.id);
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
                      background: isSelected ? "var(--surface)" : "var(--surface-2)",
                    }}
                  >
                    <FileText size={13} style={{ color: "var(--text-muted)" }} />
                  </div>
                  <span
                    className="text-h3"
                    style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    {row.title}
                  </span>
                </span>

                <span>
                  <TypeBadge type={row.type} />
                </span>

                <span
                  className="text-body-sm"
                  style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  {projectName ?? "—"}
                </span>

                <span className="text-body-sm">
                  {formatDate(row.date)}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Drawer — only for meeting transcripts */}
      <MeetingDetailDrawer
        docId={selectedMeetingId}
        detail={drawerDetail}
        loading={drawerLoading}
        projects={projects}
        onClose={() => setSelectedMeetingId(null)}
      />
    </div>
  );
}
