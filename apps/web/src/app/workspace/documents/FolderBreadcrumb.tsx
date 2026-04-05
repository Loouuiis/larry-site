"use client";

import { ChevronRight, FolderOpen } from "lucide-react";
import type { FolderBreadcrumbItem } from "@/app/dashboard/types";

interface FolderBreadcrumbProps {
  items: FolderBreadcrumbItem[];
  onNavigate: (folderId: string | null) => void;
}

export function FolderBreadcrumb({ items, onNavigate }: FolderBreadcrumbProps) {
  return (
    <nav className="flex items-center gap-1 text-[13px] mb-3" aria-label="Folder breadcrumb">
      <button
        onClick={() => onNavigate(null)}
        className="flex items-center gap-1 px-1.5 py-0.5 rounded-md transition-colors hover:bg-[var(--surface-2)]"
        style={{ color: items.length === 0 ? "var(--text-1)" : "var(--text-muted)", fontWeight: items.length === 0 ? 600 : 400 }}
      >
        <FolderOpen size={14} />
        Documents
      </button>

      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={item.id} className="flex items-center gap-1">
            <ChevronRight size={12} style={{ color: "var(--text-disabled)" }} />
            <button
              onClick={() => onNavigate(item.id)}
              className="px-1.5 py-0.5 rounded-md transition-colors hover:bg-[var(--surface-2)]"
              style={{ color: isLast ? "var(--text-1)" : "var(--text-muted)", fontWeight: isLast ? 600 : 400 }}
            >
              {item.name}
            </button>
          </span>
        );
      })}
    </nav>
  );
}
