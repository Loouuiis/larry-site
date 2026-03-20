"use client";

import { Menu, Zap } from "lucide-react";

const PAGE_TITLES: Record<string, string> = {
  projects:  "Projects",
  documents: "Documents",
  chats:     "Chats",
  meetings:  "Meeting Notes",
};

interface TopbarProps {
  activeSection: string;
  actionCount?: number;
  onMenuClick: () => void;
}

export function Topbar({ activeSection, actionCount = 3, onMenuClick }: TopbarProps) {
  const title = PAGE_TITLES[activeSection] ?? "Dashboard";

  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-neutral-100 bg-white px-4 sm:px-6">
      {/* Mobile hamburger */}
      <button
        onClick={onMenuClick}
        aria-label="Open navigation"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-50 hover:text-neutral-700 transition-colors md:hidden"
      >
        <Menu size={18} />
      </button>

      {/* Page title */}
      <h1 className="flex-1 text-base font-semibold text-neutral-900" style={{ letterSpacing: "-0.02em" }}>
        {title}
      </h1>

      {/* Right side actions */}
      <div className="flex items-center gap-2">
        {/* Action Tab button */}
        <button className="relative flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3.5 py-2 text-xs font-medium text-neutral-600 shadow-sm transition-all duration-150 hover:border-[var(--color-brand)]/40 hover:bg-[var(--color-brand)]/4 hover:text-[var(--color-brand)] hover:shadow-[0_0_0_3px_rgba(139,92,246,0.08)]">
          <Zap size={13} className="shrink-0" />
          <span className="hidden sm:inline">Action Tab</span>
          {actionCount > 0 && (
            <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--color-brand)] px-1 text-[9px] font-bold text-white">
              {actionCount}
            </span>
          )}
        </button>

        {/* User avatar */}
        <button
          aria-label="User menu"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--color-accent-purple)] to-[var(--color-accent-blue)] text-xs font-bold text-white shadow-sm transition-transform hover:scale-105"
        >
          U
        </button>
      </div>
    </header>
  );
}
