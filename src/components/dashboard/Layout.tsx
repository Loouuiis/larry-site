"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sidebar, type NavSection } from "./Sidebar";
import { Topbar } from "./Topbar";
import { LarryChat } from "./LarryChat";
import { StartProjectFlow } from "./StartProjectFlow";
import { ActionPanel } from "./ActionPanel";
import { NotificationPanel, TOTAL_NOTIFICATION_COUNT } from "./NotificationPanel";
import { ProjectsPage }    from "./pages/ProjectsPage";
import { DocumentsPage }   from "./pages/DocumentsPage";
import { ChatsPage }       from "./pages/ChatsPage";
import { MeetingNotesPage } from "./pages/MeetingNotesPage";
import { AnalyticsPage }   from "./pages/AnalyticsPage";

const EASE = [0.22, 1, 0.36, 1] as const;

// Global action count (across all sections)
const TOTAL_ACTION_COUNT = 7;

function PageContent({ section, onNewProject }: { section: NavSection; onNewProject: () => void }) {
  switch (section) {
    case "projects":  return <ProjectsPage onNewProject={onNewProject} />;
    case "documents": return <DocumentsPage />;
    case "chats":     return <ChatsPage />;
    case "meetings":  return <MeetingNotesPage />;
    case "analytics": return <AnalyticsPage />;
  }
}

export function Layout() {
  const [active, setActive]               = useState<NavSection>("projects");
  const [mobileOpen, setMobileOpen]       = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);
  const [actionPanelOpen, setActionPanelOpen]         = useState(false);
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false);

  return (
    <div className="dashboard flex h-screen overflow-hidden bg-[var(--background)]">
      <Sidebar
        active={active}
        setActive={setActive}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar
          activeSection={active}
          actionCount={TOTAL_ACTION_COUNT}
          actionPanelOpen={actionPanelOpen}
          notificationCount={TOTAL_NOTIFICATION_COUNT}
          notificationPanelOpen={notificationPanelOpen}
          onMenuClick={() => setMobileOpen(true)}
          onActionTabClick={() => { setActionPanelOpen((v) => !v); setNotificationPanelOpen(false); }}
          onNotificationClick={() => { setNotificationPanelOpen((v) => !v); setActionPanelOpen(false); }}
        />

        {/* Page content with animated transitions */}
        <main className="flex-1 overflow-y-auto px-4 pt-6 sm:px-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={active}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.28, ease: EASE }}
            >
              <PageContent section={active} onNewProject={() => setShowNewProject(true)} />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <LarryChat />

      {/* Action panel */}
      <AnimatePresence>
        {actionPanelOpen && (
          <ActionPanel onClose={() => setActionPanelOpen(false)} />
        )}
      </AnimatePresence>

      {/* Notification panel */}
      <AnimatePresence>
        {notificationPanelOpen && (
          <NotificationPanel onClose={() => setNotificationPanelOpen(false)} />
        )}
      </AnimatePresence>

      {/* Start Project overlay */}
      <AnimatePresence>
        {showNewProject && (
          <StartProjectFlow onClose={() => setShowNewProject(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}
