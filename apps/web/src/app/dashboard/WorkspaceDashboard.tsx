"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { BoardToolbar } from "./BoardToolbar";
import { RightPanel } from "./RightPanel";
import { TaskTable } from "./TaskTable";
import { useWorkspaceDashboard } from "./useWorkspaceDashboard";
import { useWorkspaceChrome } from "@/app/workspace/WorkspaceChromeContext";
import { BoardTaskRow, TaskStatus, WorkspaceTask } from "./types";
import { TaskDetailPanel, type TaskPanelData } from "@/components/dashboard/TaskDetailPanel";

function boardTaskToPanel(task: BoardTaskRow, projectName: string): TaskPanelData {
  const now = new Date();
  const isOverdue = task.dueDate
    ? new Date(task.dueDate).getTime() < now.getTime() && task.status !== "completed"
    : false;
  const statusMap: Record<TaskStatus, TaskPanelData["status"]> = {
    not_started: "upcoming",
    on_track:    "on-track",
    at_risk:     "at-risk",
    overdue:     "overdue",
    completed:   "done",
  };
  const panelStatus: TaskPanelData["status"] = isOverdue ? "overdue" : (statusMap[task.status] ?? "upcoming");
  const initials = (task.assigneeUserId ?? "PM").replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase() || "PM";
  return {
    id:          task.id,
    name:        task.title,
    description: "",
    status:      panelStatus,
    priority:    task.priority,
    assignee:    initials,
    assigneeFull: initials,
    project:     projectName,
    deadline:    task.dueDate ?? "—",
    progress:    task.progressPercent ?? 0,
  };
}

type WorkspaceDashboardProps = {
  projectId: string;
};

export function WorkspaceDashboard({ projectId }: WorkspaceDashboardProps) {
  const chrome = useWorkspaceChrome();
  const {
    loading,
    error,
    notice,
    setNotice,
    snapshot,
    connectors,
    selectedProjectId,
    selectedProject,
    boardTasks,
    taskGroups,
    groupedCounts,
    actionCards,
    boardView,
    searchQuery,
    collapsedGroups,
    rightPanelOpen,
    projectName,
    projectBusy,
    taskTitle,
    taskBusy,
    canCreateTask,
    taskTriageBusyId,
    taskMoveBusyId,
    setProjectName,
    setTaskTitle,
    setBoardView,
    setSearchQuery,
    setRightPanelOpen,
    toggleGroupCollapse,
    selectProject,
    handleCreateProject,
    handleCreateTask,
    handleTaskTriage,
    handleMoveTask,
    handleActionDecision,
    handleActionCorrect,
    openConnectorInstall,
    sendEmailDraft,
    actionBusyId,
    correctionBusyId,
    draftBusyId,
  } = useWorkspaceDashboard(projectId);

  const taskInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedTask, setSelectedTask] = useState<BoardTaskRow | null>(null);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(""), 4000);
    return () => window.clearTimeout(id);
  }, [notice, setNotice]);

  const openMeeting = () => chrome?.openMeeting();
  const openLarry = () => chrome?.openLarry();

  const onTaskTriageFromRow = (task: WorkspaceTask) => handleTaskTriage(task);
  const selectedProjectName = selectedProject?.name ?? "Project board";
  const completionRate = Number(snapshot.health?.completionRate ?? 0);
  const avgRiskScore = Number(snapshot.health?.avgRiskScore ?? 0);
  const blockedCount = snapshot.health?.blockedCount ?? 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {(error || snapshot.error) && (
        <div className="mx-5 mt-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-[13px] text-amber-800">
          {error || snapshot.error}
        </div>
      )}
      {notice && (
        <div className="mx-5 mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-[13px] text-emerald-800">
          {notice}
        </div>
      )}

      <BoardToolbar
        projects={snapshot.projects}
        selectedProjectId={selectedProjectId}
        selectedProjectName={selectedProjectName}
        searchQuery={searchQuery}
        boardView={boardView}
        onSelectProject={selectProject}
        onSearchChange={setSearchQuery}
        onNewTaskClick={() => taskInputRef.current?.focus()}
        onBoardViewChange={setBoardView}
        onMeetingClick={openMeeting}
        onLarryOpen={openLarry}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="min-w-0 flex-1 overflow-y-auto">
          <div className="border-b border-[var(--pm-border)] bg-[var(--pm-surface)] px-5 py-3">
            <form onSubmit={handleCreateTask} className="flex items-center gap-2">
              <input
                ref={taskInputRef}
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="+ Add task title"
                className="h-9 flex-1 rounded-lg border border-[var(--pm-border)] bg-[var(--pm-gray-light)] px-3 text-[14px] outline-none transition-colors focus:border-[#6366f1] focus:bg-white"
              />
              <div className="relative">
                <select
                  value={selectedProjectId}
                  onChange={(e) => selectProject(e.target.value)}
                  className="h-9 appearance-none rounded-lg border border-[var(--pm-border)] bg-[var(--pm-gray-light)] px-3 pr-7 text-[13px] outline-none focus:border-[#6366f1]"
                >
                  <option value="">Project</option>
                  {snapshot.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={12}
                  className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[var(--pm-text-muted)]"
                />
              </div>
              <button
                type="submit"
                disabled={taskBusy || !canCreateTask}
                className="pm-btn pm-btn-primary"
                style={{ height: 36, background: "#0073EA" }}
              >
                {taskBusy ? "Adding…" : "Add task"}
              </button>
            </form>
          </div>

          <div className="flex flex-wrap items-center gap-1 border-b border-[var(--pm-border)] bg-[var(--pm-bg)] px-5 py-2">
            {[
              { label: "Backlog", count: groupedCounts.backlog, color: "var(--pm-gray)" },
              { label: "Not started", count: groupedCounts.not_started, color: "var(--pm-gray)" },
              { label: "In progress", count: groupedCounts.in_progress, color: "var(--pm-orange)" },
              { label: "Waiting", count: groupedCounts.waiting, color: "var(--pm-orange)" },
              { label: "Blocked", count: groupedCounts.blocked, color: "var(--pm-red)" },
              { label: "Done", count: groupedCounts.completed, color: "var(--pm-green)" },
            ].map((s) => (
              <div
                key={s.label}
                className="flex items-center gap-1.5 rounded-full border border-[var(--pm-border)] bg-[var(--pm-surface)] px-3 py-1"
              >
                <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                <span className="text-[12px] text-[var(--pm-text-secondary)]">{s.label}</span>
                <span className="text-[12px] font-semibold text-[var(--pm-text)]">{s.count}</span>
              </div>
            ))}
            <span className="ml-auto text-[12px] text-[var(--pm-text-muted)]">
              {loading ? "Refreshing…" : `${boardTasks.length} tasks`}
            </span>
          </div>

          <TaskTable
            boardView={boardView}
            groups={taskGroups}
            collapsedGroups={collapsedGroups}
            moveBusyTaskId={taskMoveBusyId}
            triageBusyTaskId={taskTriageBusyId}
            onToggleGroup={toggleGroupCollapse}
            onMoveTask={handleMoveTask}
            onTaskTriage={onTaskTriageFromRow}
            onAddTaskClick={() => taskInputRef.current?.focus()}
            onTaskClick={(task) => setSelectedTask(task)}
          />
          {/* Backdrop */}
          {selectedTask && (
            <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setSelectedTask(null)} />
          )}
          {/* Colleague's animated TaskDetailPanel */}
          <div className="fixed right-0 top-0 z-50 h-full">
            <AnimatePresence>
              {selectedTask && (
                <TaskDetailPanel
                  task={boardTaskToPanel(selectedTask, selectedProjectName)}
                  onClose={() => setSelectedTask(null)}
                />
              )}
            </AnimatePresence>
          </div>

          <div className="px-5 py-4">
            <form onSubmit={handleCreateProject} className="flex max-w-md items-center gap-2">
              <input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="New project name…"
                className="h-9 flex-1 rounded-lg border border-[var(--pm-border)] bg-[var(--pm-surface)] px-3 text-[14px] outline-none focus:border-[#6366f1]"
              />
              <button
                type="submit"
                disabled={projectBusy || projectName.trim().length === 0}
                className="pm-btn pm-btn-secondary"
                style={{ height: 36 }}
              >
                {projectBusy ? "Creating…" : "Create project"}
              </button>
            </form>
          </div>
        </div>

        <div className="hidden w-[340px] shrink-0 overflow-y-auto border-l border-[var(--pm-border)] bg-[var(--pm-bg)] xl:block">
          <RightPanel
            completionRate={completionRate}
            avgRiskScore={avgRiskScore}
            blockedCount={blockedCount}
            outcomes={snapshot.outcomes}
            actionCards={actionCards}
            activityItems={snapshot.activity ?? []}
            emailDrafts={snapshot.emailDrafts ?? []}
            actionBusyId={actionBusyId}
            correctionBusyId={correctionBusyId}
            draftBusyId={draftBusyId}
            connectors={connectors ?? {}}
            onActionDecision={handleActionDecision}
            onActionCorrect={handleActionCorrect}
            onConnectorInstall={openConnectorInstall}
            onSendDraft={sendEmailDraft}
          />
        </div>
      </div>

      <div className="fixed bottom-20 right-4 z-40 xl:hidden">
        <button
          type="button"
          onClick={() => setRightPanelOpen(!rightPanelOpen)}
          className="h-10 rounded-full px-4 text-[13px] font-medium text-white shadow-lg"
          style={{ background: "#6366f1" }}
        >
          {rightPanelOpen ? "Hide" : "Action Center"}
          {actionCards.length > 0 && (
            <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold text-[#6366f1]">
              {actionCards.length}
            </span>
          )}
        </button>
      </div>

      {rightPanelOpen && (
        <div className="fixed inset-0 z-50 flex xl:hidden">
          <div className="flex-1 bg-black/30" onClick={() => setRightPanelOpen(false)} />
          <div className="w-[340px] overflow-y-auto bg-[var(--pm-bg)]">
            <RightPanel
              completionRate={completionRate}
              avgRiskScore={avgRiskScore}
              blockedCount={blockedCount}
              outcomes={snapshot.outcomes}
              actionCards={actionCards}
              activityItems={snapshot.activity ?? []}
              emailDrafts={snapshot.emailDrafts ?? []}
              actionBusyId={actionBusyId}
              correctionBusyId={correctionBusyId}
              draftBusyId={draftBusyId}
              connectors={connectors ?? {}}
              onActionDecision={handleActionDecision}
              onActionCorrect={handleActionCorrect}
              onConnectorInstall={openConnectorInstall}
              onSendDraft={sendEmailDraft}
            />
          </div>
        </div>
      )}
    </div>
  );
}
