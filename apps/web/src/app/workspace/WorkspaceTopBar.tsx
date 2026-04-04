"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NotificationBell } from "./NotificationBell";
import { useWorkspaceChrome } from "./WorkspaceChromeContext";
import { Menu } from "lucide-react";

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
            <span className="text-[13px] select-none" style={{ color: "var(--text-disabled)" }}>
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

const IDLE_MS = 2500;
const REVEAL_ZONE_PX = 60;

export function WorkspaceTopBar({ userEmail: _userEmail, workspaceName = "Larry Workspace", onMobileMenuOpen }: WorkspaceTopBarProps) {
  const chrome = useWorkspaceChrome();
  const [visible, setVisible] = useState(true);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const barRef = useRef<HTMLElement>(null);

  const resetIdle = useCallback(() => {
    setVisible(true);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setVisible(false), IDLE_MS);
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (e.clientY <= REVEAL_ZONE_PX) {
        setVisible(true);
        if (idleTimer.current) clearTimeout(idleTimer.current);
        return;
      }
      // If mouse moves away from top zone while bar is visible, start idle timer
      resetIdle();
    };

    const onScroll = () => resetIdle();

    window.addEventListener("mousemove", onMove);
    window.addEventListener("scroll", onScroll, true);

    // Start the initial idle timer
    idleTimer.current = setTimeout(() => setVisible(false), IDLE_MS);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("scroll", onScroll, true);
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [resetIdle]);

  return (
    <header
      ref={barRef}
      className="flex h-12 shrink-0 items-center justify-between px-4 gap-4 transition-all duration-200"
      style={{
        height: "48px",
        transform: visible ? "translateY(0)" : "translateY(-100%)",
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      {/* Mobile: hamburger */}
      <button
        className="flex h-8 w-8 items-center justify-center rounded-lg md:hidden"
        style={{ color: "var(--text-muted)" }}
        onClick={onMobileMenuOpen}
        aria-label="Open menu"
      >
        <Menu size={18} />
      </button>

      {/* Breadcrumb */}
      <div className="hidden md:flex flex-1 min-w-0">
        <Breadcrumb workspaceName={workspaceName} />
      </div>

      {/* Right: bell */}
      <div className="flex items-center shrink-0 ml-auto">
        <NotificationBell count={chrome?.notifCount ?? 0} onCountChange={() => undefined} />
      </div>
    </header>
  );
}
