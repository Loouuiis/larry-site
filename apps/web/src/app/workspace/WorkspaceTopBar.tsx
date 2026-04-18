"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  } else if (pathname?.startsWith("/workspace/notifications")) {
    parts.push({ label: workspaceName || "Home", href: "/workspace" });
    parts.push({ label: "Notifications" });
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
  function openSearch() {
    window.dispatchEvent(new Event("larry:search-open"));
  }

  return (
    <header className="flex h-12 shrink-0 items-center px-6 gap-4" style={{ height: 48 }}>
      {/* Mobile: hamburger */}
      <button
        className="flex h-8 w-8 items-center justify-center rounded-lg md:hidden"
        style={{ color: "var(--text-muted)" }}
        onClick={onMobileMenuOpen}
        aria-label="Open menu"
      >
        <Menu size={18} />
      </button>

      <div className="flex-1" />

      {/* Cmd+K hint — hidden on mobile */}
      <button
        type="button"
        onClick={openSearch}
        aria-label="Open search"
        className="hidden sm:flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] transition-opacity hover:opacity-80"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          color: "var(--text-muted)",
        }}
      >
        <Search size={12} />
        <span>Search</span>
        <kbd
          className="flex items-center rounded px-1 py-0.5 text-[10px] ml-1"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-disabled)", fontFamily: "inherit" }}
        >
          ⌘K
        </kbd>
      </button>
    </header>
  );
}
