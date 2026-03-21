"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ProjectSelectionScreen } from "./ProjectSelectionScreen";
import { ProjectWorkspace } from "./ProjectWorkspace";
import { StartProjectFlow } from "./StartProjectFlow";
import { LarryChat } from "./LarryChat";

const EASE = [0.22, 1, 0.36, 1] as const;

interface SelectedProject {
  id: string;
  name: string;
}

export function Layout() {
  const [selected, setSelected] = useState<SelectedProject | null>(null);
  const [showNewProject, setShowNewProject] = useState(false);

  return (
    <div className="h-screen overflow-hidden bg-[var(--background)]">
      <AnimatePresence mode="wait">
        {selected ? (
          <motion.div
            key={`workspace-${selected.id}`}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.28, ease: EASE }}
            className="h-full flex flex-col"
          >
            <ProjectWorkspace
              projectId={selected.id}
              projectName={selected.name}
              onBack={() => setSelected(null)}
            />
          </motion.div>
        ) : (
          <motion.div
            key="selection"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="h-full overflow-y-auto"
          >
            <ProjectSelectionScreen
              onSelectProject={(id, name) => setSelected({ id, name })}
              onNewProject={() => setShowNewProject(true)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <LarryChat />

      <AnimatePresence>
        {showNewProject && (
          <StartProjectFlow onClose={() => setShowNewProject(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}
