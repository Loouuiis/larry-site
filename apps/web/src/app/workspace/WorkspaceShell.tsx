"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import { LarryChat } from "./LarryChat";
import { WorkspaceSidebar, type WorkspaceSidebarNav } from "@/components/dashboard/Sidebar";
import type { WorkspaceProject } from "@/app/dashboard/types";
import { MeetingTranscriptModal } from "./MeetingTranscriptModal";
import { WorkspaceChromeProvider } from "./WorkspaceChromeContext";
import { WorkspaceTopBar } from "./WorkspaceTopBar";
import { ToastProvider } from "@/components/toast/ToastContext";
import { ToastContainer } from "@/components/toast/ToastContainer";
import { triggerBoundedWorkspaceRefresh } from "./refresh";
import { VerificationBanner } from "@/components/auth/VerificationBanner";

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
  emailVerified?: boolean;
  avatarUrl?: string | null;
};

export function WorkspaceShell({ children, userEmail, emailVerified, avatarUrl }: WorkspaceShellProps) {
  const pathname = usePathname();
  const [projects, setProjects] = useState<WorkspaceProject[]>([]);
  const [chatProjectId, setChatProjectId] = useState<string>("");
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [meetingBusy, setMeetingBusy] = useState(false);
  const [notifCount] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  const projectIdFromPath = pathname?.match(
    /^\/workspace\/projects\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
  )?.[1] ?? "";

  const isLarryPage = pathname?.startsWith("/workspace/larry") ?? false;

  const activeNav: WorkspaceSidebarNav = useMemo(() => {
    if (pathname === "/workspace") return "home";
    if (pathname?.startsWith("/workspace/my-work")) return "my-work";
    if (pathname?.startsWith("/workspace/actions")) return "actions";
    if (pathname?.startsWith("/workspace/meetings")) return "meetings";
    if (pathname?.startsWith("/workspace/calendar")) return "calendar";
    if (pathname?.startsWith("/workspace/documents")) return "documents";
    if (pathname?.startsWith("/workspace/email-drafts")) return "email-drafts";
    if (pathname?.startsWith("/workspace/larry")) return "larry";
    if (pathname?.startsWith("/workspace/chats")) return "chats";
    if (pathname?.startsWith("/workspace/settings")) return "settings";
    return "project";
  }, [pathname]);

  const loadShell = useCallback(async () => {
    try {
      const response = await fetch("/api/workspace/projects", { cache: "no-store" });
      const payload = await readJson<{ items?: WorkspaceProject[] }>(response);
      if (response.ok) {
        setProjects(Array.isArray(payload.items) ? payload.items : []);
      }
    } catch {
      // Keep the shell mounted even if project list refresh fails.
    }
  }, []);

  useEffect(() => {
    void loadShell();
  }, [loadShell]);

  useEffect(() => {
    if (projectIdFromPath) {
      setChatProjectId(projectIdFromPath);
      if (typeof window !== "undefined") {
        window.localStorage.setItem("larry:last-project-id", projectIdFromPath);
      }
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    const storedProjectId = window.localStorage.getItem("larry:last-project-id") ?? "";
    if (storedProjectId && projects.some((project) => project.id === storedProjectId)) {
      setChatProjectId(storedProjectId);
      return;
    }

    setChatProjectId(projects[0]?.id ?? "");
  }, [projectIdFromPath, projects]);

  useEffect(() => {
    function onRefresh() {
      void loadShell();
    }

    window.addEventListener("larry:refresh-snapshot", onRefresh);
    return () => window.removeEventListener("larry:refresh-snapshot", onRefresh);
  }, [loadShell]);

  const onMeetingSubmit = useCallback(async () => {
    const trimmedTranscript = transcript.trim();
    if (trimmedTranscript.length < 20) return;

    setMeetingBusy(true);
    try {
      const response = await fetch("/api/workspace/meetings/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: trimmedTranscript,
          projectId: projectIdFromPath || undefined,
        }),
      });

      if (response.ok) {
        setTranscript("");
        setMeetingOpen(false);
        await loadShell();
        triggerBoundedWorkspaceRefresh();
      }
    } finally {
      setMeetingBusy(false);
    }
  }, [loadShell, projectIdFromPath, transcript]);

  return (
    <ToastProvider>
    <WorkspaceChromeProvider
      value={{
        openMeeting: () => setMeetingOpen(true),
        refreshShell: loadShell,
        notifCount,
        openLarry: () => window.dispatchEvent(new CustomEvent("larry:open")),
        pushLarryMessage: (message) => window.dispatchEvent(new CustomEvent("larry:push", { detail: message })),
      }}
    >
      <div className="workspace-root dashboard-root flex h-screen overflow-hidden bg-[var(--pm-bg)] text-[var(--pm-text)]">
        <WorkspaceSidebar
          projects={projects}
          activeNav={activeNav}
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
          userEmail={userEmail}
          avatarUrl={avatarUrl}
          notifCount={notifCount}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed((v) => !v)}
        />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <WorkspaceTopBar userEmail={userEmail} onMobileMenuOpen={() => setMobileOpen(true)} />
          {!emailVerified && <VerificationBanner />}
          <div className="flex-1 overflow-y-auto">
            {children}
          </div>
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
      {!isLarryPage && (
        <>
          <LarryChat
            projectId={chatProjectId || undefined}
            projectName={projects.find((p) => p.id === chatProjectId)?.name}
          />
          <button
            type="button"
            aria-label="Ask Larry"
            onClick={() => window.dispatchEvent(new CustomEvent("larry:toggle"))}
            style={{
              position: "fixed",
              bottom: "24px",
              right: "24px",
              width: "48px",
              height: "48px",
              borderRadius: "14px",
              background: "#6c44f6",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 20px rgba(108,68,246,0.3)",
              zIndex: 60,
              border: "none",
              cursor: "pointer",
            }}
          >
            <Sparkles size={20} />
          </button>
        </>
      )}
    </WorkspaceChromeProvider>
    <ToastContainer />
    </ToastProvider>
  );
}
