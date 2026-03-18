"use client";

import { LogoutButton } from "./LogoutButton";

export function DashboardActions() {
  return (
    <div className="fixed right-4 top-4 z-40 flex items-center gap-2 sm:right-6 sm:top-5">
      <span className="hidden rounded-full border border-neutral-200 bg-white/70 px-3 py-1 text-xs font-medium text-neutral-600 backdrop-blur sm:inline-flex">
        Workspace Beta
      </span>
      <LogoutButton />
    </div>
  );
}
