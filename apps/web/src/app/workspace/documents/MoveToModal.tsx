"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, Folder, Loader2, X } from "lucide-react";
import type { Folder as FolderType } from "@/app/dashboard/types";

interface MoveToModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (targetFolderId: string) => void;
  excludeId?: string;
  title?: string;
}

interface TreeNode {
  folder: FolderType;
  children: TreeNode[] | null;
  expanded: boolean;
}

export function MoveToModal({ open, onClose, onConfirm, excludeId, title = "Move to\u2026" }: MoveToModalProps) {
  const [roots, setRoots] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const loadChildren = useCallback(async (parentId: string | null): Promise<FolderType[]> => {
    const qs = parentId ? `?parentId=${parentId}` : "";
    const res = await fetch(`/api/workspace/folders${qs}`, { cache: "no-store" });
    const data = await res.json();
    return (data.folders ?? []) as FolderType[];
  }, []);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSelected(null);
    loadChildren(null)
      .then((folders) => {
        setRoots(
          folders
            .filter((f) => f.id !== excludeId)
            .map((f) => ({ folder: f, children: null, expanded: false }))
        );
      })
      .finally(() => setLoading(false));
  }, [open, loadChildren, excludeId]);

  const toggleExpand = useCallback(async (node: TreeNode) => {
    if (node.expanded) {
      node.expanded = false;
      setRoots((r) => [...r]);
      return;
    }
    if (node.children === null) {
      const children = await loadChildren(node.folder.id);
      node.children = children
        .filter((f) => f.id !== excludeId)
        .map((f) => ({ folder: f, children: null, expanded: false }));
    }
    node.expanded = true;
    setRoots((r) => [...r]);
  }, [loadChildren, excludeId]);

  function renderTree(nodes: TreeNode[], indent: number) {
    return nodes.map((node) => (
      <div key={node.folder.id}>
        <div
          onClick={() => setSelected(node.folder.id)}
          onDoubleClick={() => toggleExpand(node)}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors cursor-pointer"
          style={{
            paddingLeft: `${12 + indent * 16}px`,
            background: selected === node.folder.id ? "rgba(108,68,246,0.08)" : undefined,
            color: selected === node.folder.id ? "#6c44f6" : "var(--text-2)",
            fontWeight: selected === node.folder.id ? 600 : 400,
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
          <Folder size={14} style={{ color: selected === node.folder.id ? "#6c44f6" : "var(--text-muted)" }} />
          <span className="truncate">{node.folder.name}</span>
        </div>
        {node.expanded && node.children && renderTree(node.children, indent + 1)}
      </div>
    ));
  }

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
          className="w-[400px] max-h-[480px] flex flex-col rounded-xl shadow-xl"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
            <h3 className="text-[15px] font-semibold" style={{ color: "var(--text-1)" }}>{title}</h3>
            <button onClick={onClose} style={{ color: "var(--text-muted)" }}><X size={16} /></button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 min-h-[200px]">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={20} className="animate-spin" style={{ color: "var(--text-muted)" }} />
              </div>
            ) : roots.length === 0 ? (
              <p className="text-center py-8 text-[13px]" style={{ color: "var(--text-muted)" }}>No folders found</p>
            ) : (
              renderTree(roots, 0)
            )}
          </div>

          <div className="flex justify-end gap-2 px-4 py-3" style={{ borderTop: "1px solid var(--border)" }}>
            <button onClick={onClose} className="pm-btn pm-btn-sm" style={{ color: "var(--text-2)" }}>Cancel</button>
            <button
              onClick={() => selected && onConfirm(selected)}
              disabled={!selected}
              className="pm-btn pm-btn-primary pm-btn-sm"
              style={{ opacity: selected ? 1 : 0.5 }}
            >
              Move here
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
