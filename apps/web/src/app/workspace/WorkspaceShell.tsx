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
import { QueryClientProvider } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/query-client";
import { ToastProvider } from "@/components/toast/ToastContext";
import { ToastContainer } from "@/components/toast/ToastContainer";
import { triggerBoundedWorkspaceRefresh } from "./refresh";
import { useTranscriptProcessing } from "./useTranscriptProcessing";
import { VerificationBanner } from "@/components/auth/VerificationBanner";
import { GlobalSearch } from "@/components/GlobalSearch";
import { TimezoneProvider } from "@/lib/timezone-context";
import { NotificationProvider } from "@/lib/notifications/NotificationContext";
import { NotificationBanners } from "@/components/notifications/NotificationBanners";

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
  displayName?: string | null;
};

export function WorkspaceShell({ children, userEmail, emailVerified, avatarUrl, displayName }: WorkspaceShellProps) {
  const pathname = usePathname();
  const [projects, setProjects] = useState<WorkspaceProject[]>([]);
  const [chatProjectId, setChatProjectId] = useState<string>("");
  // "project" = open with project context; "global" = open with no project (workspace assistant)
  const [chatMode, setChatMode] = useState<"project" | "global">("project");
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [notifCount, setNotifCount] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [sidebarAutoOpen, setSidebarAutoOpen] = useState(false);

  const projectIdFromPath = pathname?.match(
    /^\/workspace\/projects\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
  )?.[1] ?? "";

  const isLarryPage = pathname?.startsWith("/workspace/larry") ?? false;
  const sidebarVisibleCollapsed = sidebarCollapsed && !sidebarAutoOpen;

  const activeNav: WorkspaceSidebarNav = useMemo(() => {
    if (pathname === "/workspace") return "home";
    if (pathname?.startsWith("/workspace/my-work")) return "my-work";
    if (pathname?.startsWith("/workspace/timeline")) return "timeline";
    if (pathname?.startsWith("/workspace/actions")) return "actions";
    if (pathname?.startsWith("/workspace/notifications")) return "notifications";
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
      const [projectsRes, notifRes] = await Promise.all([
        fetch("/api/workspace/projects", { cache: "no-store" }),
        fetch("/api/workspace/notifications?unread=false&limit=50", { cache: "no-store" }),
      ]);
      const payload = await readJson<{ items?: WorkspaceProject[] }>(projectsRes);
      if (projectsRes.ok) {
        setProjects(Array.isArray(payload.items) ? payload.items : []);
      }
      const notifPayload = await readJson<{ unreadCount?: number }>(notifRes);
      if (notifRes.ok) {
        setNotifCount(notifPayload.unreadCount ?? 0);
      }
    } catch {
      // Keep the shell mounted even if refresh fails.
    }
  }, []);

  const {
    state: transcriptProcessingState,
    startProcessing: startTranscriptProcessing,
    reset: resetTranscriptProcessing,
    isProcessing: meetingBusy,
  } = useTranscriptProcessing({
    onSuccess: async () => {
      setTranscript("");
      await loadShell();
      triggerBoundedWorkspaceRefresh();
    },
  });

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

  // When "Ask Larry" (project button) opens the chat, ensure we're in project mode.
  // This listener runs before LarryChat's own larry:open listener because WorkspaceShell
  // is the parent and mounts first.
  useEffect(() => {
    function onLarryOpen() {
      setChatMode("project");
    }
    window.addEventListener("larry:open", onLarryOpen);
    return () => window.removeEventListener("larry:open", onLarryOpen);
  }, []);

  const onMeetingSubmit = useCallback(async () => {
    const trimmedTranscript = transcript.trim();
    if (trimmedTranscript.length < 20) return;

    await startTranscriptProcessing({
      transcript: trimmedTranscript,
      projectId: chatProjectId || undefined,
    });
  }, [chatProjectId, startTranscriptProcessing, transcript]);

  return (
    <TimezoneProvider>
    <QueryClientProvider client={getQueryClient()}>
    <NotificationProvider>
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
          displayName={displayName}
          notifCount={notifCount}
          collapsed={sidebarVisibleCollapsed}
          autoOpened={sidebarAutoOpen}
          onToggleCollapsed={() => {
            setSidebarCollapsed((v) => !v);
            setSidebarAutoOpen(false);
          }}
          onAutoOpenStart={() => {
            if (sidebarCollapsed) {
              setSidebarAutoOpen(true);
            }
          }}
          onAutoOpenEnd={() => {
            if (sidebarCollapsed) {
              setSidebarAutoOpen(false);
            }
          }}
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
        onClose={() => {
          setMeetingOpen(false);
          if (!meetingBusy) {
            resetTranscriptProcessing();
          }
        }}
        transcript={transcript}
        onTranscriptChange={setTranscript}
        onSubmit={onMeetingSubmit}
        busy={meetingBusy}
        processingState={transcriptProcessingState}
      />
      {!isLarryPage && (
        <>
          <LarryChat
            projectId={chatMode === "project" ? (chatProjectId || undefined) : undefined}
            projectName={chatMode === "project" ? projects.find((p) => p.id === chatProjectId)?.name : undefined}
          />
          <button
            type="button"
            aria-label="Ask Larry"
            data-testid="ask-larry-fab"
            onClick={() => {
              setChatMode("global");
              window.dispatchEvent(new CustomEvent("larry:toggle"));
            }}
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
    <GlobalSearch />
    {process.env.NEXT_PUBLIC_NOTIFICATIONS_V2_ENABLED === "true" && <NotificationBanners />}
    </ToastProvider>
    </NotificationProvider>
    </QueryClientProvider>
    </TimezoneProvider>
  );
}
