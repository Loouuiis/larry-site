"use client";

import { createContext, useContext } from "react";

export type WorkspaceChromeContextValue = {
  openMeeting: () => void;
  refreshShell: () => void;
};

const WorkspaceChromeContext = createContext<WorkspaceChromeContextValue | null>(null);

export function WorkspaceChromeProvider({
  value,
  children,
}: {
  value: WorkspaceChromeContextValue;
  children: React.ReactNode;
}) {
  return <WorkspaceChromeContext.Provider value={value}>{children}</WorkspaceChromeContext.Provider>;
}

export function useWorkspaceChrome(): WorkspaceChromeContextValue | null {
  return useContext(WorkspaceChromeContext);
}
