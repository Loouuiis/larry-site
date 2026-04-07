"use client";

import type {
  WorkspaceProject,
  WorkspaceTask,
  WorkspaceLarryEvent,
  WorkspaceTimeline,
  WorkspaceOutcomes,
  WorkspaceProjectMember,
  WorkspaceHealth,
} from "@/app/dashboard/types";
import { ProjectInfoTabs } from "./ProjectInfoTabs";
import { ProgressBox } from "./ProgressBox";
import { ActionBox } from "./ActionBox";
import { StatusBreakdown } from "./StatusBreakdown";
import { MiniDonutChart } from "./MiniDonutChart";

interface ProjectOverviewTabProps {
  project: WorkspaceProject;
  tasks: WorkspaceTask[];
  timeline: WorkspaceTimeline | null;
  outcomes: WorkspaceOutcomes | null;
  suggested: WorkspaceLarryEvent[];
  activity: WorkspaceLarryEvent[];
  members: WorkspaceProjectMember[];
  health: WorkspaceHealth | null | undefined;
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
  health,
  onNavigateToTab,
}: ProjectOverviewTabProps) {
  return (
    <div className="space-y-4">
      {/* Row 1: Progress bar | Mini donut | Action box */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
        <ProgressBox
          tasks={tasks}
          timeline={timeline}
          targetDate={project.targetDate}
          members={members}
          avgRiskScore={health?.avgRiskScore}
          riskLevel={health?.riskLevel}
        />
        <MiniDonutChart tasks={tasks} />
        <ActionBox
          pendingCount={suggested.length}
          onGoToActionCenter={() => onNavigateToTab("actions")}
        />
      </div>

      {/* Row 2: Tabbed info card: AI Summary | Recent Activity | My Tasks */}
      <ProjectInfoTabs
        narrative={outcomes?.narrative}
        activity={activity}
        tasks={tasks}
        onNavigateToTaskCenter={() => onNavigateToTab("tasks")}
      />

      {/* Row 3+4: New status boxes + full-width bar chart */}
      <StatusBreakdown tasks={tasks} />
    </div>
  );
}
