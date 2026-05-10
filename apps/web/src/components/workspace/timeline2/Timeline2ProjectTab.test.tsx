// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Timeline2Snapshot, Timeline2UserPreferences } from "@larry/shared";
import { TIMELINE2_GANTT_COLUMN_ORDER, normalizeTimeline2UserPreferences } from "@larry/shared/timeline2";
import { Timeline2ProjectTab } from "./Timeline2ProjectTab";
import { useTimeline2 } from "@/hooks/useTimeline2";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock("@/hooks/useTimeline2", () => ({
  useTimeline2: vi.fn(),
}));

vi.mock("./Timeline2Primitives", () => ({
  EmptyState: ({ onCreate }: { onCreate: () => void }) => (
    <button type="button" onClick={onCreate}>
      Empty state
    </button>
  ),
}));

vi.mock("./Timeline2GanttSurface", () => ({
  Timeline2GanttSurface: () => <div data-testid="timeline2-gantt-surface">Gantt</div>,
}));

vi.mock("./TaskCenter2Surface", () => ({
  TaskCenter2Surface: () => <div data-testid="taskcenter2-surface">Task center</div>,
}));

vi.mock("./Timeline2BranchReview", () => ({
  Timeline2BranchReview: () => <div data-testid="timeline2-branch-review">Branch review</div>,
}));

vi.mock("./Timeline2NodeDrawer", () => ({
  Timeline2NodeDrawer: () => <div data-testid="timeline2-node-drawer">Drawer</div>,
}));

vi.mock("./Timeline2AiPanel", () => ({
  Timeline2AiPanel: () => <div data-testid="timeline2-ai-panel">AI panel</div>,
}));

const baseSnapshot: Timeline2Snapshot = {
  projectId: "project-1",
  generatedAt: "2026-05-06T00:00:00.000Z",
  plan: {
    id: "plan-1",
    projectId: "project-1",
    createdAt: "2026-05-06T00:00:00.000Z",
    updatedAt: "2026-05-06T00:00:00.000Z",
  },
  activeRevision: null,
  tree: [
    {
      id: "node-1",
      planId: "plan-1",
      parentId: null,
      kind: "task",
      title: "Launch task",
      description: null,
      status: "not_started",
      priority: "medium",
      startDate: null,
      dueDate: null,
      sortOrder: 0,
      progress: 0,
      isCriticalPath: false,
      actionRequired: { required: false, note: null },
      assignees: [],
      rollup: {
        healthStatus: "not_started",
        priority: "medium",
        startDate: null,
        dueDate: null,
        assignees: [],
        actionRequiredCount: 0,
        dependencyWarningCount: 0,
        descendantCount: 0,
      },
      children: [],
      createdAt: "2026-05-06T00:00:00.000Z",
      updatedAt: "2026-05-06T00:00:00.000Z",
    },
  ],
  nodes: [],
  dependencies: [],
  teamMembers: [],
  openBranches: [],
};
baseSnapshot.nodes = baseSnapshot.tree;

const basePreferences: Timeline2UserPreferences = normalizeTimeline2UserPreferences({
  columnOrder: [...TIMELINE2_GANTT_COLUMN_ORDER],
  visibleColumns: TIMELINE2_GANTT_COLUMN_ORDER.filter((key) => key !== "task_name"),
  columnWidths: {
    status: 124,
    priority: 92,
    progress: 112,
    start_date: 88,
    due_date: 88,
    assignee: 144,
  },
  outlineWidth: 520,
  dayWidth: 38,
  collapsedNodeIds: [],
});

describe("Timeline2ProjectTab", () => {
  beforeEach(() => {
    vi.mocked(useTimeline2).mockReturnValue({
      snapshot: baseSnapshot,
      preferences: basePreferences,
      criticalPath: null,
      loading: false,
      error: null,
      busy: false,
      refresh: vi.fn(),
      createNode: vi.fn(),
      updateNode: vi.fn(),
      deleteNode: vi.fn(),
      createDependency: vi.fn(),
      deleteDependency: vi.fn(),
      acceptBranch: vi.fn(),
      rejectBranch: vi.fn(),
      updatePreferences: vi.fn(),
      runAi: vi.fn(),
    });
  });

  it("keeps timeline mode focused on gantt + AI orchestration", () => {
    render(<Timeline2ProjectTab projectId="project-1" projectDisplayName="Acme" mode="timeline" />);

    expect(screen.getByTestId("timeline2-gantt-surface")).toBeInTheDocument();
    expect(screen.getByTestId("timeline2-ai-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("taskcenter2-surface")).not.toBeInTheDocument();
    expect(screen.queryByTestId("timeline2-branch-review")).not.toBeInTheDocument();
  });

  it("keeps tasks mode focused on branch review + task center orchestration", () => {
    render(<Timeline2ProjectTab projectId="project-1" projectDisplayName="Acme" mode="tasks" />);

    expect(screen.getByTestId("taskcenter2-surface")).toBeInTheDocument();
    expect(screen.getByTestId("timeline2-branch-review")).toBeInTheDocument();
    expect(screen.getByTestId("timeline2-ai-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("timeline2-gantt-surface")).not.toBeInTheDocument();
  });
});
