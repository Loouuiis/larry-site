"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NotificationBell } from "./NotificationBell";
import { useWorkspaceChrome } from "./WorkspaceChromeContext";
import { Plus, Menu } from "lucide-react";

type WorkspaceTopBarProps = {
  userEmail?: string | null;
  workspaceName?: string;
  onMobileMenuOpen?: () => void;
};

function Breadcrumb({ workspaceName }: { workspaceName: string }) {
  const pathname = usePathname();
  const parts: { label: string; href?: string }[] = [];

  if (pathname?.startsWith("/workspace/projects/new")) {
    parts.push({ label: workspaceName || "Home", href: "/workspace" });
    parts.push({ label: "New Project" });
  } else {
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
    } else if (pathname?.startsWith("/workspace/actions")) {
      parts.push({ label: workspaceName || "Home", href: "/workspace" });
      parts.push({ label: "Actions" });
    } else if (pathname?.startsWith("/workspace/documents")) {
      parts.push({ label: workspaceName || "Home", href: "/workspace" });
      parts.push({ label: "Documents" });
    } else if (pathname?.startsWith("/workspace/chats")) {
      parts.push({ label: workspaceName || "Home", href: "/workspace" });
      parts.push({ label: "Chats" });
    } else if (pathname?.startsWith("/workspace/settings")) {
      parts.push({ label: workspaceName || "Home", href: "/workspace" });
      parts.push({ label: "Settings" });
    } else if (pathname?.startsWith("/workspace/my-work")) {
      parts.push({ label: workspaceName || "Home", href: "/workspace" });
      parts.push({ label: "My Work" });
    } else if (pathname === "/workspace") {
      parts.push({ label: "Home" });
    }
  }

  if (parts.length === 0) return null;

  return (
    <nav className="flex min-w-0 items-center gap-1" aria-label="Breadcrumb">
      {parts.map((part, index) => (
        <span key={index} className="flex min-w-0 items-center gap-1">
          {index > 0 && (
            <span className="select-none text-[13px]" style={{ color: "var(--text-disabled)" }}>
              &gt;
            </span>
          )}
          {part.href ? (
            <Link
              href={part.href}
              className="truncate text-[14px] transition-colors hover:opacity-80"
              style={{ color: "var(--text-muted)" }}
            >
              {part.label}
            </Link>
          ) : (
            <span className="truncate text-[14px] font-medium" style={{ color: "var(--text-2)" }}>
              {part.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function WorkspaceTopBar({
  workspaceName = "Larry Workspace",
  onMobileMenuOpen,
}: WorkspaceTopBarProps) {
  const chrome = useWorkspaceChrome();

  return (
    <header
      className="flex h-12 shrink-0 items-center justify-between gap-4 px-4"
      style={{
        height: "48px",
        background: "var(--surface)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <button
        className="flex h-8 w-8 items-center justify-center rounded-lg md:hidden"
        style={{ color: "var(--text-muted)" }}
        onClick={onMobileMenuOpen}
        aria-label="Open menu"
      >
        <Menu size={18} />
      </button>

      <div className="hidden min-w-0 flex-1 md:block">
        <Breadcrumb workspaceName={workspaceName} />
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <NotificationBell count={chrome?.notifCount ?? 0} onCountChange={() => undefined} />

        <Link
          href="/workspace/projects/new"
          className="hidden items-center gap-1.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90 sm:inline-flex"
          style={{
            height: "32px",
            padding: "0 12px",
            borderRadius: "var(--radius-btn)",
            background: "var(--cta)",
          }}
        >
          <Plus size={14} />
          New Project
        </Link>
      </div>
    </header>
  );
}
