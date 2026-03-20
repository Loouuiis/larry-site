"use client";

import { Menu, Zap, Bell } from "lucide-react";

const PAGE_TITLES: Record<string, string> = {
  projects:  "Projects",
  documents: "Documents",
  chats:     "Chats",
  meetings:  "Meeting Notes",
  analytics: "Analytics",
};

interface TopbarProps {
  activeSection: string;
  actionCount?: number;
  actionPanelOpen?: boolean;
  notificationCount?: number;
  notificationPanelOpen?: boolean;
  onMenuClick: () => void;
  onActionTabClick: () => void;
  onNotificationClick: () => void;
}

export function Topbar({
  activeSection,
  actionCount = 0,
  actionPanelOpen = false,
  notificationCount = 0,
  notificationPanelOpen = false,
  onMenuClick,
  onActionTabClick,
  onNotificationClick,
}: TopbarProps) {
  const title = PAGE_TITLES[activeSection] ?? "Dashboard";

  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-[var(--color-border)] bg-white px-4 sm:px-6">
      {/* Mobile hamburger */}
      <button
        onClick={onMenuClick}
        aria-label="Open navigation"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-50 hover:text-neutral-700 transition-colors md:hidden"
      >
        <Menu size={18} />
      </button>

      {/* Page title */}
      <h1 className="flex-1 text-base font-semibold text-neutral-900 tracking-[-0.02em]">
        {title}
      </h1>

      {/* Right side actions */}
      <div className="flex items-center gap-2">
        {/* Action Tab button */}
        <button
          onClick={onActionTabClick}
          className={[
            "relative flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-medium shadow-sm transition-all duration-150",
            actionPanelOpen
              ? "border-[var(--color-brand)]/30 bg-[var(--color-brand)]/8 text-[var(--color-brand)] shadow-[0_0_0_3px_rgba(139,92,246,0.1)]"
              : "border-neutral-200 bg-white text-neutral-600 hover:border-[var(--color-brand)]/40 hover:bg-[var(--color-brand)]/4 hover:text-[var(--color-brand)] hover:shadow-[0_0_0_3px_rgba(139,92,246,0.08)]",
          ].join(" ")}
        >
          <Zap size={13} className="shrink-0" />
          <span className="hidden sm:inline">Action Tab</span>
          {actionCount > 0 && (
            <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--color-brand)] px-1 text-[9px] font-bold text-white">
              {actionCount}
            </span>
          )}
        </button>

        {/* Notification bell */}
        <button
          onClick={onNotificationClick}
          aria-label="Notifications"
          className={[
            "relative flex h-8 w-8 items-center justify-center rounded-xl border transition-all duration-150",
            notificationPanelOpen
              ? "border-[var(--color-brand)]/30 bg-[var(--color-brand)]/8 text-[var(--color-brand)] shadow-[0_0_0_3px_rgba(139,92,246,0.1)]"
              : "border-neutral-200 bg-white text-neutral-500 hover:border-[var(--color-brand)]/30 hover:bg-[var(--color-brand)]/4 hover:text-[var(--color-brand)]",
          ].join(" ")}
        >
          <Bell size={15} />
          {notificationCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[14px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
              {notificationCount}
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
