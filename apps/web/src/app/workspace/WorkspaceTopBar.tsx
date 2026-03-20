"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/app/dashboard/LogoutButton";
import { NotificationBell } from "./NotificationBell";
import { useWorkspaceChrome } from "./WorkspaceChromeContext";
import { BellRing, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type WorkspaceTopBarProps = {
  userEmail?: string | null;
  workspaceName?: string;
};

function Breadcrumb({ workspaceName }: { workspaceName: string }) {
  const pathname = usePathname();
  const parts: { label: string; href?: string }[] = [
    { label: workspaceName || "Larry Workspace", href: "/workspace" },
  ];

  const projectMatch = pathname?.match(/^\/workspace\/projects\/([^/]+)(\/(.+))?/);
  if (projectMatch) {
    parts.push({ label: "Project" });
    if (projectMatch[3]) {
      parts.push({ label: projectMatch[3].charAt(0).toUpperCase() + projectMatch[3].slice(1) });
    }
  } else if (pathname?.startsWith("/workspace/meetings")) {
    parts.push({ label: "Meetings" });
  } else if (pathname?.startsWith("/workspace/actions")) {
    parts.push({ label: "Action Center" });
  } else if (pathname?.startsWith("/workspace/documents")) {
    parts.push({ label: "Documents" });
  } else if (pathname?.startsWith("/workspace/chats")) {
    parts.push({ label: "Chats" });
  } else if (pathname?.startsWith("/workspace/settings")) {
    parts.push({ label: "Settings" });
  } else if (pathname?.startsWith("/workspace/my-work")) {
    parts.push({ label: "My Work" });
  }

  return (
    <nav className="flex items-center gap-1 text-[13px]">
      {parts.map((part, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="text-[var(--pm-text-muted)]">/</span>}
          {part.href ? (
            <Link href={part.href} className="text-[var(--pm-text-secondary)] hover:text-[var(--pm-text)]">
              {part.label}
            </Link>
          ) : (
            <span className="font-medium text-[var(--pm-text)]">{part.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function WorkspaceTopBar({ userEmail, workspaceName = "Larry Workspace" }: WorkspaceTopBarProps) {
  const chrome = useWorkspaceChrome();
  const router = useRouter();
  const [search, setSearch] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) {
      router.push(`/workspace?q=${encodeURIComponent(search.trim())}`);
    }
  };

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--pm-border)] bg-[var(--pm-surface)] px-4 gap-4">
      {/* Left: breadcrumb */}
      <div className="min-w-0 flex-1">
        <Breadcrumb workspaceName={workspaceName} />
      </div>

      {/* Center: global search */}
      <form onSubmit={handleSearch} className="hidden md:flex items-center">
        <div className="relative">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--pm-text-muted)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks, projects…"
            className="h-8 w-[220px] rounded-lg border border-[var(--pm-border)] bg-[var(--pm-gray-light)] pl-8 pr-3 text-[13px] outline-none focus:border-[#6366f1] focus:w-[280px] transition-all"
          />
        </div>
      </form>

      {/* Right: bells + user */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Action Center bell */}
        <Link
          href="/workspace/actions"
          className="relative inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--pm-text-muted)] hover:bg-[var(--pm-gray-light)]"
          title="Action Center"
        >
          <BellRing size={18} />
          {(chrome?.pendingCount ?? 0) > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-0.5 text-[10px] font-bold text-white">
              {(chrome?.pendingCount ?? 0) > 99 ? "99+" : chrome?.pendingCount}
            </span>
          )}
        </Link>

        {/* Notification bell */}
        <NotificationBell
          count={chrome?.notifCount ?? 0}
          onCountChange={() => undefined}
        />

        {userEmail && (
          <span className="hidden lg:inline max-w-[180px] truncate text-[12px] text-[var(--pm-text-muted)]">
            {userEmail}
          </span>
        )}
        <LogoutButton />
      </div>
    </header>
  );
}
