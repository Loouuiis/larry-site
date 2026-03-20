"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sidebar, type NavSection } from "./Sidebar";
import { Topbar } from "./Topbar";
import { LarryChat } from "./LarryChat";
import { ProjectsPage }    from "./pages/ProjectsPage";
import { DocumentsPage }   from "./pages/DocumentsPage";
import { ChatsPage }       from "./pages/ChatsPage";
import { MeetingNotesPage } from "./pages/MeetingNotesPage";

const EASE = [0.22, 1, 0.36, 1] as const;

const ACTION_COUNTS: Record<NavSection, number> = {
  projects:  3,
  documents: 0,
  chats:     6,
  meetings:  2,
};

function PageContent({ section }: { section: NavSection }) {
  switch (section) {
    case "projects":  return <ProjectsPage />;
    case "documents": return <DocumentsPage />;
    case "chats":     return <ChatsPage />;
    case "meetings":  return <MeetingNotesPage />;
  }
}

export function Layout() {
  const [active, setActive]           = useState<NavSection>("projects");
  const [mobileOpen, setMobileOpen]   = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-neutral-50/60">
      <Sidebar
        active={active}
        setActive={setActive}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar
          activeSection={active}
          actionCount={ACTION_COUNTS[active]}
          onMenuClick={() => setMobileOpen(true)}
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
              <PageContent section={active} />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <LarryChat />
    </div>
  );
}
