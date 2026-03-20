"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bot,
  ChevronDown,
  FileText,
  LayoutGrid,
  ListChecks,
  MessageSquare,
  Sparkles,
  WandSparkles,
  X,
} from "lucide-react";
import { BoardToolbar } from "./BoardToolbar";
import { RightPanel } from "./RightPanel";
import { TaskTable } from "./TaskTable";
import { useWorkspaceDashboard } from "./useWorkspaceDashboard";
import { useWorkspaceChrome } from "@/app/workspace/WorkspaceChromeContext";
import { WorkspaceTask } from "./types";

const INTENT_OPTIONS = [
  { value: "freeform", label: "Freeform", icon: WandSparkles },
  { value: "create_plan", label: "Create Plan", icon: ListChecks },
  { value: "update_scope", label: "Update Scope", icon: LayoutGrid },
  { value: "draft_follow_up", label: "Follow-up", icon: Bot },
  { value: "request_summary", label: "Summary", icon: FileText },
] as const;

const COMMAND_SUGGESTIONS = [
  "Summarize this week's blockers and propose fixes.",
  "Generate ownership follow-ups for overdue items.",
  "Create a leadership update based on project risk.",
  "Turn meeting actions into tasks with deadlines.",
];

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
    larryPrompt,
    larryIntent,
    larryBusy,
    lastLarryResponse,
    actionBusyId,
    correctionBusyId,
    draftBusyId,
    setProjectName,
    setTaskTitle,
    setBoardView,
    setSearchQuery,
    setLarryPrompt,
    setLarryIntent,
    setRightPanelOpen,
    toggleGroupCollapse,
    selectProject,
    handleCreateProject,
    handleCreateTask,
    handleTaskTriage,
    handleMoveTask,
    handleActionDecision,
    handleActionCorrect,
    handleLarryRun,
    openConnectorInstall,
    sendEmailDraft,
  } = useWorkspaceDashboard(projectId);

  const [larryOpen, setLarryOpen] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const taskInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => {
      setSuggestionIndex((c) => (c + 1) % COMMAND_SUGGESTIONS.length);
    }, 3500);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(""), 4000);
    return () => window.clearTimeout(id);
  }, [notice, setNotice]);

  const openMeeting = () => {
    chrome?.openMeeting();
  };

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
        onLarryClick={() => setLarryOpen((o) => !o)}
        larryActive={larryOpen}
      />

      {larryOpen && (
        <div className="shrink-0 border-b border-[var(--pm-border)] bg-[var(--pm-surface)] px-5 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--pm-border)] pb-2 mb-2">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-[var(--pm-text)]">
              <Sparkles size={16} className="text-[#6366f1]" />
              Coordination commands
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={openMeeting}
                className="inline-flex h-7 items-center gap-1 rounded-md border border-[var(--pm-border)] bg-white px-2 text-[12px] text-[var(--pm-text-secondary)] hover:bg-[var(--pm-gray-light)]"
              >
                <MessageSquare size={13} />
                Meeting
              </button>
              <button
                type="button"
                onClick={() => setLarryOpen(false)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--pm-text-muted)] hover:bg-[var(--pm-gray-light)]"
              >
                <X size={16} />
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 pb-2">
            {INTENT_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const active = larryIntent === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setLarryIntent(opt.value)}
                  className={`inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[12px] font-medium transition ${
                    active
                      ? "bg-[#6366f1] text-white"
                      : "bg-[var(--pm-gray-light)] text-[var(--pm-text-secondary)] hover:bg-[#e0e2e8]"
                  }`}
                >
                  <Icon size={12} />
                  {opt.label}
                </button>
              );
            })}
          </div>
          <div className="max-h-[120px] overflow-y-auto text-[13px] text-[var(--pm-text-secondary)] mb-2">
            {lastLarryResponse ? (
              <p className="leading-relaxed">{lastLarryResponse}</p>
            ) : (
              <p className="text-[var(--pm-text-muted)]">
                Run coordination commands on this project. High-impact outputs still route through Action Center for
                approval.
              </p>
            )}
          </div>
          <form onSubmit={handleLarryRun} className="flex items-center gap-2">
            <input
              value={larryPrompt}
              onChange={(e) => setLarryPrompt(e.target.value)}
              placeholder={COMMAND_SUGGESTIONS[suggestionIndex]}
              className="flex-1 h-9 rounded-lg border border-[var(--pm-border)] bg-[var(--pm-gray-light)] px-3 text-[13px] outline-none focus:border-[#6366f1] focus:bg-white"
            />
            <button
              type="submit"
              disabled={larryBusy || larryPrompt.trim().length < 3}
              className="pm-btn pm-btn-primary pm-btn-sm"
              style={{ background: "#6366f1", borderColor: "#6366f1" }}
            >
              {larryBusy ? "…" : "Send"}
            </button>
          </form>
        </div>
      )}

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
          />

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
