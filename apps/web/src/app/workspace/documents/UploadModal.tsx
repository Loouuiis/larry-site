"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, Folder, Loader2, Upload, X } from "lucide-react";
import type { Folder as FolderType } from "@/app/dashboard/types";

interface UploadModalProps {
  open: boolean;
  onClose: () => void;
  onUploaded: () => void;
  initialFolderId?: string | null;
}

interface TreeNode {
  folder: FolderType;
  children: TreeNode[] | null;
  expanded: boolean;
}

const ACCEPTED_TYPES = ".txt,.md,.csv,.json,.pdf,.docx,.xlsx,.pptx";
const MAX_SIZE = 2 * 1024 * 1024;

const MIME_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export function UploadModal({ open, onClose, onUploaded, initialFolderId }: UploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(initialFolderId ?? null);
  const [roots, setRoots] = useState<TreeNode[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draggingOver, setDraggingOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadChildren = useCallback(async (parentId: string | null): Promise<FolderType[]> => {
    const qs = parentId ? `?parentId=${parentId}` : "";
    const res = await fetch(`/api/workspace/folders${qs}`, { cache: "no-store" });
    const data = await res.json();
    return (data.folders ?? []) as FolderType[];
  }, []);

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setError(null);
    setSelectedFolderId(initialFolderId ?? null);
    setFoldersLoading(true);
    loadChildren(null)
      .then((folders) => {
        setRoots(folders.map((f) => ({ folder: f, children: null, expanded: false })));
      })
      .finally(() => setFoldersLoading(false));
  }, [open, loadChildren, initialFolderId]);

  const toggleExpand = useCallback(async (node: TreeNode) => {
    if (node.expanded) {
      node.expanded = false;
      setRoots((r) => [...r]);
      return;
    }
    if (node.children === null) {
      const children = await loadChildren(node.folder.id);
      node.children = children.map((f) => ({ folder: f, children: null, expanded: false }));
    }
    node.expanded = true;
    setRoots((r) => [...r]);
  }, [loadChildren]);

  function renderTree(nodes: TreeNode[], indent: number): React.ReactNode {
    return nodes.map((node) => (
      <div key={node.folder.id}>
        <div
          onClick={() => setSelectedFolderId(node.folder.id)}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors cursor-pointer"
          style={{
            paddingLeft: `${12 + indent * 16}px`,
            background: selectedFolderId === node.folder.id ? "rgba(108,68,246,0.08)" : undefined,
            color: selectedFolderId === node.folder.id ? "#6c44f6" : "var(--text-2)",
            fontWeight: selectedFolderId === node.folder.id ? 600 : 400,
          }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); toggleExpand(node); }}
            className="shrink-0 w-4 h-4 flex items-center justify-center"
          >
            <ChevronRight
              size={12}
              style={{
                transform: node.expanded ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform 0.15s",
                color: "var(--text-disabled)",
              }}
            />
          </button>
          <Folder size={14} style={{ color: selectedFolderId === node.folder.id ? "#6c44f6" : "var(--text-muted)" }} />
          <span className="truncate">{node.folder.name}</span>
        </div>
        {node.expanded && node.children && renderTree(node.children, indent + 1)}
      </div>
    ));
  }

  const pickFile = (picked: File | null) => {
    setError(null);
    if (!picked) return;
    if (picked.size > MAX_SIZE) {
      setError("File must be under 2 MB.");
      return;
    }
    setFile(picked);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDraggingOver(false);
    const dropped = e.dataTransfer.files[0] ?? null;
    pickFile(dropped);
  };

  const handleUpload = async () => {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const title = file.name.replace(/\.[^.]+$/, "") || "Untitled";
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      const isBinary = ["pdf", "docx", "xlsx", "pptx"].includes(ext);
      const docType = isBinary ? ext : "other";

      let content: string;
      let metadata: Record<string, unknown> = {};

      if (isBinary) {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        // Process in chunks to avoid call-stack overflow on large files
        const chunkSize = 8192;
        let binary = "";
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
        }
        content = btoa(binary);
        metadata = {
          binaryEncoding: "base64",
          mimeType: MIME_TYPES[ext] ?? "application/octet-stream",
          fileName: file.name,
          byteLength: buffer.byteLength,
        };
      } else {
        // Strip null bytes — PostgreSQL rejects U+0000 in text columns
        content = (await file.text()).replace(/\0/g, "").slice(0, 50_000);
        if (!content.trim()) {
          setError("File appears to be empty or unreadable.");
          setUploading(false);
          return;
        }
      }

      const body: Record<string, unknown> = {
        title,
        content,
        docType,
        sourceKind: "upload",
        metadata: Object.keys(metadata).length ? metadata : undefined,
      };
      if (selectedFolderId) body.folderId = selectedFolderId;

      const res = await fetch("/api/workspace/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error ?? "Upload failed.");
        return;
      }

      onUploaded();
      onClose();
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ background: "rgba(0,0,0,0.4)" }}
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="w-[460px] flex flex-col rounded-xl shadow-xl"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", maxHeight: "80vh" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
            <h3 className="text-[15px] font-semibold" style={{ color: "var(--text-1)" }}>Upload file</h3>
            <button onClick={onClose} style={{ color: "var(--text-muted)" }}><X size={16} /></button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDraggingOver(true); }}
              onDragLeave={() => setDraggingOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed cursor-pointer transition-colors"
              style={{
                borderColor: draggingOver ? "#6c44f6" : "var(--border)",
                background: draggingOver ? "rgba(108,68,246,0.04)" : "var(--surface-2)",
                padding: "24px 16px",
              }}
            >
              <Upload size={20} style={{ color: "var(--text-muted)" }} />
              {file ? (
                <p className="text-[13px] font-medium" style={{ color: "var(--text-1)" }}>{file.name}</p>
              ) : (
                <>
                  <p className="text-[13px] font-medium" style={{ color: "var(--text-2)" }}>Click or drag a file here</p>
                  <p className="text-[11px]" style={{ color: "var(--text-disabled)" }}>txt, md, csv, json, pdf, docx, xlsx, pptx · max 2 MB</p>
                </>
              )}
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPTED_TYPES}
                className="hidden"
                style={{ display: "none" }}
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              />
            </div>

            {error && (
              <p className="text-[12px]" style={{ color: "var(--color-danger, #e53e3e)" }}>{error}</p>
            )}

            {/* Folder picker */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--text-disabled)" }}>
                Destination folder
              </p>
              <div
                className="rounded-lg border overflow-y-auto"
                style={{ borderColor: "var(--border)", maxHeight: "200px", background: "var(--surface)" }}
              >
                {/* No folder option */}
                <div
                  onClick={() => setSelectedFolderId(null)}
                  className="flex items-center gap-2 px-3 py-1.5 text-[13px] cursor-pointer rounded-md m-1 transition-colors"
                  style={{
                    background: selectedFolderId === null ? "rgba(108,68,246,0.08)" : undefined,
                    color: selectedFolderId === null ? "#6c44f6" : "var(--text-muted)",
                    fontWeight: selectedFolderId === null ? 600 : 400,
                  }}
                >
                  <Folder size={14} />
                  <span>No folder</span>
                </div>

                {foldersLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 size={16} className="animate-spin" style={{ color: "var(--text-muted)" }} />
                  </div>
                ) : (
                  <div className="p-1">{renderTree(roots, 0)}</div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 px-4 py-3" style={{ borderTop: "1px solid var(--border)" }}>
            <button onClick={onClose} className="pm-btn pm-btn-sm" style={{ color: "var(--text-2)" }}>Cancel</button>
            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="pm-btn pm-btn-primary pm-btn-sm"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                opacity: !file || uploading ? 0.5 : 1,
              }}
            >
              {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
              Upload
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
