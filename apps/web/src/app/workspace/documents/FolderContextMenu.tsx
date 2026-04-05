"use client";

import { useEffect, useRef } from "react";
import { FolderOpen, Pencil, Move, Trash2 } from "lucide-react";

interface ContextMenuAction {
  label: string;
  icon: React.ElementType;
  onClick: () => void;
  danger?: boolean;
}

interface FolderContextMenuProps {
  x: number;
  y: number;
  actions: ContextMenuAction[];
  onClose: () => void;
}

export function FolderContextMenu({ x, y, actions, onClose }: FolderContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-[160px] py-1 rounded-lg shadow-lg"
      style={{
        left: x,
        top: y,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
      }}
    >
      {actions.map((action) => (
        <button
          key={action.label}
          onClick={() => { action.onClick(); onClose(); }}
          className="flex w-full items-center gap-2 px-3 py-2 text-[13px] transition-colors hover:bg-[var(--surface-2)]"
          style={{ color: action.danger ? "#dc2626" : "var(--text-2)" }}
        >
          <action.icon size={14} />
          {action.label}
        </button>
      ))}
    </div>
  );
}

export function buildFolderActions(opts: {
  onOpen: () => void;
  onRename: () => void;
  onMoveTo: () => void;
  onDelete?: () => void;
}): ContextMenuAction[] {
  const actions: ContextMenuAction[] = [
    { label: "Open", icon: FolderOpen, onClick: opts.onOpen },
    { label: "Rename", icon: Pencil, onClick: opts.onRename },
    { label: "Move to\u2026", icon: Move, onClick: opts.onMoveTo },
  ];
  if (opts.onDelete) {
    actions.push({ label: "Delete", icon: Trash2, onClick: opts.onDelete, danger: true });
  }
  return actions;
}

export function buildDocumentActions(opts: {
  onOpen: () => void;
  onMoveTo: () => void;
  onDelete?: () => void;
}): ContextMenuAction[] {
  const actions: ContextMenuAction[] = [
    { label: "Open", icon: FolderOpen, onClick: opts.onOpen },
    { label: "Move to\u2026", icon: Move, onClick: opts.onMoveTo },
  ];
  if (opts.onDelete) {
    actions.push({ label: "Delete", icon: Trash2, onClick: opts.onDelete, danger: true });
  }
  return actions;
}
