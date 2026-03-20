"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar, type WorkspaceSidebarNav } from "@/app/dashboard/Sidebar";
import type { WorkspaceSnapshot } from "@/app/dashboard/types";
import { MeetingTranscriptModal } from "./MeetingTranscriptModal";
import { WorkspaceChromeProvider } from "./WorkspaceChromeContext";
import { WorkspaceTopBar } from "./WorkspaceTopBar";

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return { error: text } as T;
  }
}

type WorkspaceShellProps = {
  children: React.ReactNode;
  userEmail?: string | null;
};

export function WorkspaceShell({ children, userEmail }: WorkspaceShellProps) {
  const pathname = usePathname();
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [meetingBusy, setMeetingBusy] = useState(false);

  const projectIdFromPath = pathname?.match(/^\/workspace\/projects\/([^/]+)/)?.[1] ?? "";

  const activeNav: WorkspaceSidebarNav = useMemo(() => {
    if (pathname === "/workspace") return "home";
    if (pathname?.startsWith("/workspace/my-work")) return "my-work";
    return "project";
  }, [pathname]);

  const loadShell = useCallback(async () => {
    const q = projectIdFromPath
      ? `?projectId=${encodeURIComponent(projectIdFromPath)}`
      : "?includeProjectContext=false";
    try {
      const res = await fetch(`/api/workspace/snapshot${q}`, { cache: "no-store" });
      const data = await readJson<WorkspaceSnapshot>(res);
      if (res.ok) {
        setSnapshot(data);
      }
    } catch {
      // no-op
    }
  }, [projectIdFromPath]);

  useEffect(() => {
    void loadShell();
  }, [loadShell]);

  const onMeetingSubmit = useCallback(async () => {
    const t = transcript.trim();
    if (t.length < 20) return;
    setMeetingBusy(true);
    try {
      const res = await fetch("/api/workspace/meetings/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: t,
          projectId: projectIdFromPath || undefined,
        }),
      });
      if (res.ok) {
        setTranscript("");
        setMeetingOpen(false);
        await loadShell();
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("larry:refresh-snapshot"));
        }
      }
    } finally {
      setMeetingBusy(false);
    }
  }, [transcript, projectIdFromPath, loadShell]);

  const connectorDots = [
    { key: "slack" as const, label: "Slack", connected: Boolean(snapshot?.connectors?.slack?.connected) },
    { key: "calendar" as const, label: "Calendar", connected: Boolean(snapshot?.connectors?.calendar?.connected) },
    { key: "email" as const, label: "Email", connected: Boolean(snapshot?.connectors?.email?.connected) },
  ];

  const projects = snapshot?.projects ?? [];

  return (
    <WorkspaceChromeProvider
      value={{
        openMeeting: () => setMeetingOpen(true),
        refreshShell: loadShell,
      }}
    >
      <div className="workspace-root dashboard-root flex h-screen flex-col overflow-hidden bg-[var(--pm-bg)] text-[var(--pm-text)]">
        <WorkspaceTopBar userEmail={userEmail} />
        <div className="flex min-h-0 flex-1">
          <Sidebar
            workspaceName={snapshot?.boardMeta?.workspaceName ?? "Larry Workspace"}
            projects={projects}
            selectedProjectId={projectIdFromPath}
            onMeetingTranscriptClick={() => setMeetingOpen(true)}
            connectorDots={connectorDots}
            activeNav={activeNav}
          />
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
        </div>
      </div>
      <MeetingTranscriptModal
        open={meetingOpen}
        onClose={() => setMeetingOpen(false)}
        transcript={transcript}
        onTranscriptChange={setTranscript}
        onSubmit={onMeetingSubmit}
        busy={meetingBusy}
      />
    </WorkspaceChromeProvider>
  );
}
