"use client";

import { LogoutButton } from "@/app/dashboard/LogoutButton";

type WorkspaceTopBarProps = {
  userEmail?: string | null;
};

export function WorkspaceTopBar({ userEmail }: WorkspaceTopBarProps) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--pm-border)] bg-[var(--pm-surface)] px-4">
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-[13px] font-semibold text-[var(--pm-text)] truncate">Larry Workspace</span>
        <span className="hidden sm:inline text-[12px] text-[var(--pm-text-muted)]">Execution coordination</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {userEmail && (
          <span className="hidden lg:inline max-w-[200px] truncate text-[12px] text-[var(--pm-text-muted)]">
            {userEmail}
          </span>
        )}
        <LogoutButton />
      </div>
    </header>
  );
}
