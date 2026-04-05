"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FileText,
  Folder as FolderIcon,
  FolderPlus,
  Plus,
  Search,
  Upload,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

import type { Folder, FolderBreadcrumbItem, LarryDocument } from "@/app/dashboard/types";
import { FolderBreadcrumb } from "./FolderBreadcrumb";
import {
  FolderContextMenu,
  buildFolderActions,
  buildDocumentActions,
} from "./FolderContextMenu";
import { MoveToModal } from "./MoveToModal";
import { MeetingDetailDrawer, type MeetingDetail } from "./MeetingDetailDrawer";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface DocumentRow {
  id: string;
  projectId: string | null;
  title: string;
  docType: string;
  createdAt: string;
  updatedAt: string;
  isLarryDoc?: boolean;
}

const FOLDER_TYPE_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  project: { label: "Project", color: "#6c44f6", bg: "rgba(108,68,246,0.08)" },
  company: { label: "Company", color: "var(--text-muted)", bg: "var(--surface-2)" },
  general: { label: "General", color: "var(--text-muted)", bg: "var(--surface-2)" },
};

const DOC_TYPE_LABELS: Record<string, string> = {
  transcript: "Transcript",
  email_draft: "Email draft",
  letter: "Letter",
  memo: "Memo",
  report: "Report",
  note: "Note",
  other: "Other",
};

/* ------------------------------------------------------------------ */
/*  Context menu state                                                 */
/* ------------------------------------------------------------------ */

interface ContextMenuState {
  x: number;
  y: number;
  kind: "folder" | "document";
  id: string;
}

/* ------------------------------------------------------------------ */
/*  Drag-and-drop state                                                */
/* ------------------------------------------------------------------ */

interface DragState {
  kind: "folder" | "document";
  id: string;
}

/* ------------------------------------------------------------------ */
/*  Rename state                                                       */
/* ------------------------------------------------------------------ */

interface RenameState {
  kind: "folder" | "document";
  id: string;
  value: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "\u2014";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

const GRID_COLS = "minmax(0,1fr) 100px 100px";

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function DocumentsPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const folderId = searchParams.get("folderId") ?? null;

  /* ---- data state ---- */
  const [folders, setFolders] = useState<Folder[]>([]);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [breadcrumb, setBreadcrumb] = useState<FolderBreadcrumbItem[]>([]);
  const [loading, setLoading] = useState(true);

  /* ---- search ---- */
  const [search, setSearch] = useState("");

  /* ---- new folder inline ---- */
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const newFolderRef = useRef<HTMLInputElement>(null);

  /* ---- context menu ---- */
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null);

  /* ---- move-to modal ---- */
  const [moveTarget, setMoveTarget] = useState<{ kind: "folder" | "document"; id: string } | null>(null);

  /* ---- inline rename ---- */
  const [renaming, setRenaming] = useState<RenameState | null>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  /* ---- drag-and-drop ---- */
  const [dragging, setDragging] = useState<DragState | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  /* ---- meeting drawer (legacy, kept for compat) ---- */
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [drawerDetail, setDrawerDetail] = useState<MeetingDetail | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [projects, setProjects] = useState<Record<string, string>>({});

  /* ================================================================ */
  /*  Navigation helper                                                */
  /* ================================================================ */

  const navigateTo = useCallback(
    (id: string | null) => {
      setSearch("");
      if (id) {
        router.replace(`/workspace/documents?folderId=${id}`);
      } else {
        router.replace("/workspace/documents");
      }
    },
    [router],
  );

  /* ================================================================ */
  /*  Data fetching                                                    */
  /* ================================================================ */

  const fetchContents = useCallback(async () => {
    setLoading(true);
    try {
      if (folderId) {
        // Folder view — fetch folder metadata + contents
        const [metaRes, contentsRes] = await Promise.all([
          fetch(`/api/workspace/folders/${folderId}`, { cache: "no-store" }),
          fetch(`/api/workspace/folders/${folderId}/contents`, { cache: "no-store" }),
        ]);
        const meta = await metaRes.json();
        const contents = await contentsRes.json();

        setBreadcrumb(meta.breadcrumb ?? []);
        setFolders(contents.subfolders ?? []);

        // Merge regular documents + larry documents into DocumentRow[]
        const regularDocs: DocumentRow[] = (contents.documents ?? []).map((d: any) => ({
          id: d.id,
          projectId: d.projectId ?? null,
          title: d.title ?? "Untitled",
          docType: d.docType ?? "other",
          createdAt: d.createdAt,
          updatedAt: d.updatedAt ?? d.createdAt,
          isLarryDoc: false,
        }));

        const larryDocs: DocumentRow[] = (contents.larryDocuments ?? []).map((d: LarryDocument) => ({
          id: d.id,
          projectId: d.projectId,
          title: d.title,
          docType: d.docType,
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
          isLarryDoc: true,
        }));

        setDocuments([...regularDocs, ...larryDocs]);
      } else {
        // Root view — show all root folders
        const res = await fetch("/api/workspace/folders", { cache: "no-store" });
        const data = await res.json();
        setBreadcrumb([]);
        setFolders(data.folders ?? []);
        setDocuments([]);
      }
    } catch {
      // Silently fail — empty state will show
    } finally {
      setLoading(false);
    }
  }, [folderId]);

  useEffect(() => {
    fetchContents();
  }, [fetchContents]);

  // Load projects for legacy meeting drawer
  useEffect(() => {
    fetch("/api/workspace/projects", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { items?: { id: string; name: string }[] }) => {
        const map: Record<string, string> = {};
        for (const p of data.items ?? []) map[p.id] = p.name;
        setProjects(map);
      })
      .catch(() => {});
  }, []);

  // Legacy meeting drawer fetch
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

  /* ================================================================ */
  /*  Filtered + sorted content                                        */
  /* ================================================================ */

  const filteredFolders = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? folders.filter((f) => f.name.toLowerCase().includes(q))
      : folders;
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [folders, search]);

  const filteredDocuments = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? documents.filter((d) => d.title.toLowerCase().includes(q))
      : documents;
    return [...list].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [documents, search]);

  const isEmpty = filteredFolders.length === 0 && filteredDocuments.length === 0;
  const hasSearch = search.trim() !== "";

  /* ================================================================ */
  /*  New folder creation                                              */
  /* ================================================================ */

  useEffect(() => {
    if (creatingFolder && newFolderRef.current) {
      newFolderRef.current.focus();
    }
  }, [creatingFolder]);

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) {
      setCreatingFolder(false);
      setNewFolderName("");
      return;
    }
    try {
      await fetch("/api/workspace/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          parentId: folderId ?? undefined,
          folderType: "general",
        }),
      });
      setCreatingFolder(false);
      setNewFolderName("");
      fetchContents();
    } catch {
      // fail silently
    }
  };

  /* ================================================================ */
  /*  Rename                                                           */
  /* ================================================================ */

  useEffect(() => {
    if (renaming && renameRef.current) {
      renameRef.current.focus();
      renameRef.current.select();
    }
  }, [renaming]);

  const handleRename = async () => {
    if (!renaming) return;
    const name = renaming.value.trim();
    if (!name) {
      setRenaming(null);
      return;
    }
    try {
      if (renaming.kind === "folder") {
        await fetch(`/api/workspace/folders/${renaming.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
      }
      // Documents don't have a rename endpoint yet — just close
      setRenaming(null);
      fetchContents();
    } catch {
      setRenaming(null);
    }
  };

  /* ================================================================ */
  /*  Delete                                                           */
  /* ================================================================ */

  const handleDeleteFolder = async (id: string) => {
    if (!confirm("Delete this folder and all its contents?")) return;
    try {
      await fetch(`/api/workspace/folders/${id}`, { method: "DELETE" });
      fetchContents();
    } catch {
      // fail silently
    }
  };

  /* ================================================================ */
  /*  Move                                                             */
  /* ================================================================ */

  const handleMoveConfirm = async (targetFolderId: string) => {
    if (!moveTarget) return;
    try {
      if (moveTarget.kind === "folder") {
        await fetch(`/api/workspace/folders/${moveTarget.id}/move`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newParentId: targetFolderId }),
        });
      } else {
        await fetch(`/api/workspace/documents/${moveTarget.id}/move`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folderId: targetFolderId }),
        });
      }
      setMoveTarget(null);
      fetchContents();
    } catch {
      setMoveTarget(null);
    }
  };

  /* ================================================================ */
  /*  Drag-and-drop handlers                                           */
  /* ================================================================ */

  const handleDragStart = (kind: "folder" | "document", id: string) => (e: React.DragEvent) => {
    setDragging({ kind, id });
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  };

  const handleDragOver = (targetId: string) => (e: React.DragEvent) => {
    if (!dragging) return;
    // Don't allow dropping a folder on itself
    if (dragging.kind === "folder" && dragging.id === targetId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTarget(targetId);
  };

  const handleDragLeave = () => {
    setDropTarget(null);
  };

  const handleDrop = (targetFolderId: string) => async (e: React.DragEvent) => {
    e.preventDefault();
    setDropTarget(null);
    if (!dragging) return;
    if (dragging.kind === "folder" && dragging.id === targetFolderId) return;

    try {
      if (dragging.kind === "folder") {
        await fetch(`/api/workspace/folders/${dragging.id}/move`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newParentId: targetFolderId }),
        });
      } else {
        await fetch(`/api/workspace/documents/${dragging.id}/move`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folderId: targetFolderId }),
        });
      }
      fetchContents();
    } catch {
      // fail silently
    } finally {
      setDragging(null);
    }
  };

  const handleDragEnd = () => {
    setDragging(null);
    setDropTarget(null);
  };

  /* ================================================================ */
  /*  Context menu builders                                            */
  /* ================================================================ */

  const getFolderActions = (folder: Folder) =>
    buildFolderActions({
      onOpen: () => navigateTo(folder.id),
      onRename: () =>
        setRenaming({ kind: "folder", id: folder.id, value: folder.name }),
      onMoveTo: () => setMoveTarget({ kind: "folder", id: folder.id }),
      onDelete: () => handleDeleteFolder(folder.id),
    });

  const getDocumentActions = (doc: DocumentRow) =>
    buildDocumentActions({
      onOpen: () => {
        // For now, just a placeholder
      },
      onMoveTo: () => setMoveTarget({ kind: "document", id: doc.id }),
    });

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */

  return (
    <div
      style={{
        minHeight: "100%",
        overflowY: "auto",
        background: "var(--page-bg)",
        padding: "24px",
      }}
    >
      {/* ---- Page header ---- */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "4px",
        }}
      >
        <h1 className="text-h1">Documents</h1>

        <div style={{ display: "flex", gap: "8px" }}>
          <button
            className="pm-btn pm-btn-sm"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
            onClick={() => {
              setCreatingFolder(true);
              setNewFolderName("");
            }}
          >
            <FolderPlus size={13} />
            New folder
          </button>
          <button
            className="pm-btn pm-btn-primary pm-btn-sm"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <Upload size={13} />
            Upload
          </button>
        </div>
      </div>

      <p
        className="text-body-sm"
        style={{ marginBottom: "12px", color: "var(--text-muted)" }}
      >
        Browse folders and documents in your workspace.
      </p>

      {/* ---- Breadcrumb ---- */}
      <FolderBreadcrumb items={breadcrumb} onNavigate={navigateTo} />

      {/* ---- Toolbar ---- */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          marginBottom: "16px",
          flexWrap: "wrap",
        }}
      >
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
          <Search
            size={13}
            style={{ color: "var(--text-muted)", flexShrink: 0 }}
          />
          <input
            placeholder="Search in this folder\u2026"
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

        {/* Stats */}
        {!loading && (
          <span
            className="text-body-sm"
            style={{
              display: "flex",
              alignItems: "center",
              color: "var(--text-muted)",
            }}
          >
            {filteredFolders.length} folder{filteredFolders.length !== 1 ? "s" : ""}
            {filteredDocuments.length > 0 &&
              `, ${filteredDocuments.length} document${filteredDocuments.length !== 1 ? "s" : ""}`}
          </span>
        )}
      </div>

      {/* ---- Content grid ---- */}
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
          style={{ gridTemplateColumns: GRID_COLS }}
        >
          <span>Name</span>
          <span>Type</span>
          <span>Date</span>
        </div>

        {loading ? (
          /* ---- Shimmer skeleton ---- */
          <div style={{ display: "flex", flexDirection: "column" }}>
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="pm-table-row"
                style={{ gridTemplateColumns: GRID_COLS }}
              >
                <span
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <div
                    className="pm-shimmer"
                    style={{
                      height: "28px",
                      width: "28px",
                      borderRadius: "6px",
                      flexShrink: 0,
                    }}
                  />
                  <div
                    className="pm-shimmer"
                    style={{
                      height: "14px",
                      width: `${120 + i * 30}px`,
                      borderRadius: "4px",
                    }}
                  />
                </span>
                <div
                  className="pm-shimmer"
                  style={{
                    height: "18px",
                    width: "60px",
                    borderRadius: "var(--radius-badge)",
                  }}
                />
                <div
                  className="pm-shimmer"
                  style={{ height: "13px", width: "60px", borderRadius: "4px" }}
                />
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* ---- New folder inline input ---- */}
            <AnimatePresence>
              {creatingFolder && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="pm-table-row"
                  style={{ gridTemplateColumns: GRID_COLS }}
                >
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <div
                      style={{
                        flexShrink: 0,
                        display: "flex",
                        height: "28px",
                        width: "28px",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: "6px",
                        background: "rgba(108,68,246,0.08)",
                      }}
                    >
                      <FolderIcon
                        size={14}
                        style={{ color: "#6c44f6" }}
                      />
                    </div>
                    <input
                      ref={newFolderRef}
                      placeholder="Folder name\u2026"
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleCreateFolder();
                        if (e.key === "Escape") {
                          setCreatingFolder(false);
                          setNewFolderName("");
                        }
                      }}
                      onBlur={handleCreateFolder}
                      style={{
                        flex: 1,
                        background: "none",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-btn)",
                        padding: "2px 8px",
                        fontSize: "13px",
                        fontWeight: 500,
                        color: "var(--text-1)",
                        outline: "none",
                      }}
                    />
                  </span>
                  <span />
                  <span />
                </motion.div>
              )}
            </AnimatePresence>

            {/* ---- Empty state ---- */}
            {isEmpty && !creatingFolder && (
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
                  <FolderIcon
                    size={20}
                    style={{ color: "var(--text-muted)" }}
                  />
                </div>
                {hasSearch ? (
                  <>
                    <p
                      style={{
                        fontSize: "15px",
                        fontWeight: 500,
                        color: "var(--text-1)",
                        marginBottom: "6px",
                      }}
                    >
                      No results match &ldquo;{search}&rdquo;
                    </p>
                    <button
                      onClick={() => setSearch("")}
                      style={{
                        color: "#6c44f6",
                        fontSize: "13px",
                        fontWeight: 500,
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      Clear search
                    </button>
                  </>
                ) : folderId ? (
                  <>
                    <p
                      style={{
                        fontSize: "15px",
                        fontWeight: 500,
                        color: "var(--text-1)",
                        marginBottom: "6px",
                      }}
                    >
                      This folder is empty
                    </p>
                    <p className="text-body-sm" style={{ marginBottom: "16px" }}>
                      Drag files here or create a subfolder.
                    </p>
                    <button
                      onClick={() => {
                        setCreatingFolder(true);
                        setNewFolderName("");
                      }}
                      style={{
                        color: "#6c44f6",
                        fontSize: "13px",
                        fontWeight: 500,
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      <Plus size={13} />
                      New folder
                    </button>
                  </>
                ) : (
                  <>
                    <p
                      style={{
                        fontSize: "15px",
                        fontWeight: 500,
                        color: "var(--text-1)",
                        marginBottom: "6px",
                      }}
                    >
                      No folders yet
                    </p>
                    <p className="text-body-sm" style={{ marginBottom: "16px" }}>
                      Create your first folder to organise workspace documents.
                    </p>
                    <button
                      onClick={() => {
                        setCreatingFolder(true);
                        setNewFolderName("");
                      }}
                      style={{
                        color: "#6c44f6",
                        fontSize: "13px",
                        fontWeight: 500,
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      <Plus size={13} />
                      Create folder
                    </button>
                  </>
                )}
              </div>
            )}

            {/* ---- Folder rows ---- */}
            {filteredFolders.map((folder) => {
              const badge = FOLDER_TYPE_BADGE[folder.folderType] ?? FOLDER_TYPE_BADGE.general;
              const isDropping = dropTarget === folder.id;
              const isRenaming =
                renaming?.kind === "folder" && renaming.id === folder.id;

              return (
                <div
                  key={folder.id}
                  className="pm-table-row"
                  draggable={!isRenaming}
                  onDragStart={handleDragStart("folder", folder.id)}
                  onDragOver={handleDragOver(folder.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop(folder.id)}
                  onDragEnd={handleDragEnd}
                  onDoubleClick={() => navigateTo(folder.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setCtxMenu({
                      x: e.clientX,
                      y: e.clientY,
                      kind: "folder",
                      id: folder.id,
                    });
                  }}
                  style={{
                    gridTemplateColumns: GRID_COLS,
                    cursor: "pointer",
                    borderLeft: isDropping
                      ? "3px solid #6c44f6"
                      : "3px solid transparent",
                    background: isDropping
                      ? "rgba(108,68,246,0.04)"
                      : undefined,
                    transition: "border-color 0.15s, background 0.15s",
                  }}
                >
                  {/* Name */}
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        flexShrink: 0,
                        display: "flex",
                        height: "28px",
                        width: "28px",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: "6px",
                        background:
                          folder.folderType === "project"
                            ? "rgba(108,68,246,0.08)"
                            : "var(--surface-2)",
                      }}
                    >
                      <FolderIcon
                        size={14}
                        style={{
                          color:
                            folder.folderType === "project"
                              ? "#6c44f6"
                              : "var(--text-muted)",
                        }}
                      />
                    </div>

                    {isRenaming ? (
                      <input
                        ref={renameRef}
                        value={renaming.value}
                        onChange={(e) =>
                          setRenaming({ ...renaming, value: e.target.value })
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRename();
                          if (e.key === "Escape") setRenaming(null);
                        }}
                        onBlur={handleRename}
                        onClick={(e) => e.stopPropagation()}
                        onDoubleClick={(e) => e.stopPropagation()}
                        style={{
                          flex: 1,
                          background: "none",
                          border: "1px solid var(--border)",
                          borderRadius: "var(--radius-btn)",
                          padding: "2px 8px",
                          fontSize: "13px",
                          fontWeight: 500,
                          color: "var(--text-1)",
                          outline: "none",
                        }}
                      />
                    ) : (
                      <span
                        className="text-h3"
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {folder.name}
                      </span>
                    )}
                  </span>

                  {/* Badge */}
                  <span>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        fontSize: "11px",
                        fontWeight: 600,
                        color: badge.color,
                        background: badge.bg,
                        borderRadius: "var(--radius-badge)",
                        padding: "2px 7px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {badge.label}
                    </span>
                  </span>

                  {/* Date */}
                  <span className="text-body-sm">
                    {formatDate(folder.updatedAt ?? folder.createdAt)}
                  </span>
                </div>
              );
            })}

            {/* ---- Document rows ---- */}
            {filteredDocuments.map((doc) => {
              const label = DOC_TYPE_LABELS[doc.docType] ?? "Document";

              return (
                <div
                  key={doc.id}
                  className="pm-table-row"
                  draggable
                  onDragStart={handleDragStart("document", doc.id)}
                  onDragEnd={handleDragEnd}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setCtxMenu({
                      x: e.clientX,
                      y: e.clientY,
                      kind: "document",
                      id: doc.id,
                    });
                  }}
                  style={{
                    gridTemplateColumns: GRID_COLS,
                    cursor: "default",
                  }}
                >
                  {/* Name */}
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      minWidth: 0,
                    }}
                  >
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
                      <FileText
                        size={13}
                        style={{ color: "var(--text-muted)" }}
                      />
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

                  {/* Type badge */}
                  <span>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "3px",
                        fontSize: "11px",
                        fontWeight: 600,
                        color: "var(--text-2)",
                        background: "var(--surface-2)",
                        borderRadius: "var(--radius-badge)",
                        padding: "2px 7px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {label}
                    </span>
                  </span>

                  {/* Date */}
                  <span className="text-body-sm">
                    {formatDate(doc.createdAt)}
                  </span>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* ---- Context menu ---- */}
      {ctxMenu && (
        <FolderContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          actions={
            ctxMenu.kind === "folder"
              ? getFolderActions(folders.find((f) => f.id === ctxMenu.id)!)
              : getDocumentActions(documents.find((d) => d.id === ctxMenu.id)!)
          }
          onClose={() => setCtxMenu(null)}
        />
      )}

      {/* ---- Move-to modal ---- */}
      <MoveToModal
        open={moveTarget !== null}
        onClose={() => setMoveTarget(null)}
        onConfirm={handleMoveConfirm}
        excludeId={moveTarget?.kind === "folder" ? moveTarget.id : undefined}
        title={moveTarget ? `Move ${moveTarget.kind} to\u2026` : undefined}
      />

      {/* ---- Legacy meeting drawer ---- */}
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
