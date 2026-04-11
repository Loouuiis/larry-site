"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NotificationBell } from "./NotificationBell";
import { useWorkspaceChrome } from "./WorkspaceChromeContext";
import { Menu, Search } from "lucide-react";

type WorkspaceTopBarProps = {
  userEmail?: string | null;
  workspaceName?: string;
  onMobileMenuOpen?: () => void;
};

function Breadcrumb({ workspaceName }: { workspaceName: string }) {
  const pathname = usePathname();
  const parts: { label: string; href?: string }[] = [];

  const projectMatch = pathname?.match(/^\/workspace\/projects\/([^/]+)(\/(.+))?/);
  if (projectMatch) {
    parts.push({ label: workspaceName || "Home", href: "/workspace" });
    parts.push({ label: "Project" });
    if (projectMatch[3]) {
      const section = projectMatch[3];
      parts.push({ label: section.charAt(0).toUpperCase() + section.slice(1) });
    }
  } else if (pathname?.startsWith("/workspace/meetings")) {
    parts.push({ label: workspaceName || "Home", href: "/workspace" });
    parts.push({ label: "Meetings" });
  } else if (pathname?.startsWith("/workspace/documents")) {
    parts.push({ label: workspaceName || "Home", href: "/workspace" });
    parts.push({ label: "Documents" });
  } else if (pathname?.startsWith("/workspace/larry")) {
    parts.push({ label: workspaceName || "Home", href: "/workspace" });
    parts.push({ label: "Ask Larry" });
  } else if (pathname?.startsWith("/workspace/chats")) {
    parts.push({ label: workspaceName || "Home", href: "/workspace" });
    parts.push({ label: "Chats" });
  } else if (pathname?.startsWith("/workspace/settings")) {
    parts.push({ label: workspaceName || "Home", href: "/workspace" });
    parts.push({ label: "Settings" });
  } else if (pathname?.startsWith("/workspace/my-work")) {
    parts.push({ label: workspaceName || "Home", href: "/workspace" });
    parts.push({ label: "My Tasks" });
  } else if (pathname?.startsWith("/workspace/actions")) {
    parts.push({ label: workspaceName || "Home", href: "/workspace" });
    parts.push({ label: "Actions" });
  } else if (pathname === "/workspace") {
    parts.push({ label: "Home" });
  }

  if (parts.length === 0) return null;

  return (
    <nav className="flex items-center gap-1 min-w-0 ml-4" aria-label="Breadcrumb">
      {parts.map((part, i) => (
        <span key={i} className="flex items-center gap-1 min-w-0">
          {i > 0 && (
            <span className="text-[13px] select-none" style={{ color: "#f0edfa" }}>
              /
            </span>
          )}
          {part.href ? (
            <Link
              href={part.href}
              className="text-[13px] truncate transition-colors hover:opacity-80"
              style={{ color: "var(--text-muted)" }}
            >
              {part.label}
            </Link>
          ) : (
            <span className="text-[13px] font-medium truncate" style={{ color: "var(--text-2)" }}>
              {part.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function WorkspaceTopBar({ userEmail: _userEmail, workspaceName = "Larry Workspace", onMobileMenuOpen }: WorkspaceTopBarProps) {
  const chrome = useWorkspaceChrome();

  return (
    <header className="flex h-12 shrink-0 items-center justify-between px-6 gap-4" style={{ height: 48 }}>
      {/* Mobile: hamburger */}
      <button
        className="flex h-8 w-8 items-center justify-center rounded-lg md:hidden"
        style={{ color: "var(--text-muted)" }}
        onClick={onMobileMenuOpen}
        aria-label="Open menu"
      >
        <Menu size={18} />
      </button>

      {/* Search bar */}
      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent("larry:search-open"))}
        className="hidden md:flex items-center gap-2 rounded-lg px-3 h-8 text-[13px] transition-colors ml-4"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          color: "var(--text-muted)",
          minWidth: 200,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#6c44f6")}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
      >
        <Search size={13} />
        <span className="flex-1 text-left">Search...</span>
        <kbd
          className="flex items-center rounded px-1 py-0.5 text-[10px]"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", lineHeight: 1.4 }}
        >
          ⌘K
        </kbd>
      </button>

      {/* Right: bell */}
      <div className="flex items-center shrink-0 ml-auto">
        <NotificationBell count={chrome?.notifCount ?? 0} onCountChange={() => undefined} />
      </div>
    </header>
  );
}
