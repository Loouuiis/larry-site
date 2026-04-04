"use client";

import type {
  WorkspaceProject,
  WorkspaceTask,
  WorkspaceLarryEvent,
  WorkspaceTimeline,
  WorkspaceOutcomes,
  WorkspaceProjectMember,
} from "@/app/dashboard/types";
import { ProjectDescriptionCard } from "./ProjectDescriptionCard";
import { ProjectInfoTabs } from "./ProjectInfoTabs";
import { ProgressBox } from "./ProgressBox";
import { ActionBox } from "./ActionBox";
import { StatusBreakdown } from "./StatusBreakdown";

interface ProjectOverviewTabProps {
  project: WorkspaceProject;
  tasks: WorkspaceTask[];
  timeline: WorkspaceTimeline | null;
  outcomes: WorkspaceOutcomes | null;
  suggested: WorkspaceLarryEvent[];
  activity: WorkspaceLarryEvent[];
  members: WorkspaceProjectMember[];
  onNavigateToTab: (tab: string) => void;
}

export function ProjectOverviewTab({
  project,
  tasks,
  timeline,
  outcomes,
  suggested,
  activity,
  members,
  onNavigateToTab,
}: ProjectOverviewTabProps) {
  return (
    <div className="space-y-4">
      {/* Project description */}
      <ProjectDescriptionCard description={project.description} />

      {/* Tabbed info card: AI Summary | Recent Activity | My Tasks */}
      <ProjectInfoTabs
        narrative={outcomes?.narrative}
        activity={activity}
        tasks={tasks}
        onNavigateToTaskCenter={() => onNavigateToTab("tasks")}
      />

      {/* Progress box + Action box side by side */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <ProgressBox
          tasks={tasks}
          timeline={timeline}
          targetDate={project.targetDate}
          members={members}
        />
        <ActionBox
          pendingCount={suggested.length}
          onGoToActionCenter={() => onNavigateToTab("actions")}
        />
      </div>

      {/* Status cards + Donut chart */}
      <StatusBreakdown tasks={tasks} />
    </div>
  );
}
