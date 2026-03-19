"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, ChevronDown, FileText, LayoutGrid, ListChecks, WandSparkles } from "lucide-react";
import { BoardToolbar } from "./BoardToolbar";
import { RightPanel } from "./RightPanel";
import { Sidebar } from "./Sidebar";
import { TaskTable } from "./TaskTable";
import { useWorkspaceDashboard } from "./useWorkspaceDashboard";
import { BoardView, WorkspaceTask } from "./types";

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

function mapBoardViewLabel(view: BoardView): string {
  if (view === "kanban") return "Kanban";
  if (view === "gantt") return "Timeline";
  return "Table";
}

export function WorkspaceDashboard() {
  const {
    loading,
    error,
    notice,
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
    meetingTranscript,
    meetingBusy,
    actionBusyId,
    correctionBusyId,
    draftBusyId,
    setProjectName,
    setTaskTitle,
    setBoardView,
    setSearchQuery,
    setLarryPrompt,
    setLarryIntent,
    setMeetingTranscript,
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
    handleMeetingTranscriptSubmit,
    openConnectorInstall,
    sendEmailDraft,
  } = useWorkspaceDashboard();

  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const taskInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const id = window.setInterval(() => {
      setSuggestionIndex((current) => (current + 1) % COMMAND_SUGGESTIONS.length);
    }, 3500);
    return () => window.clearInterval(id);
  }, []);

  const connectorDots = [
    { key: "slack" as const, label: "Slack", connected: Boolean(connectors?.slack?.connected) },
    { key: "calendar" as const, label: "Calendar", connected: Boolean(connectors?.calendar?.connected) },
    { key: "email" as const, label: "Email", connected: Boolean(connectors?.email?.connected) },
  ];

  const onTaskTriageFromRow = (task: WorkspaceTask) => handleTaskTriage(task);
  const selectedProjectName = selectedProject?.name ?? "Project board";

  const completionRate = Number(snapshot.health?.completionRate ?? 0);
  const avgRiskScore = Number(snapshot.health?.avgRiskScore ?? 0);
  const blockedCount = snapshot.health?.blockedCount ?? 0;

  const activeIntent = INTENT_OPTIONS.find((option) => option.value === larryIntent);

  return (
    <section className="dashboard-shell mx-auto w-full max-w-[1700px]">
      {(error || snapshot.error) && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          {error || snapshot.error}
        </div>
      )}
      {notice && (
        <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-900">
          {notice}
        </div>
      )}

      <div className="dashboard-frame grid min-h-[80vh] grid-cols-1 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm xl:grid-cols-[290px_minmax(0,1fr)]">
        <Sidebar
          workspaceName={snapshot.boardMeta?.workspaceName ?? "Larry Workspace"}
          projects={snapshot.projects}
          selectedProjectId={selectedProjectId}
          onSelectProject={selectProject}
          connectorDots={connectorDots}
        />

        <div className="min-w-0 bg-[#f6f7fb]">
          <div className="grid grid-cols-1 gap-3 p-3 xl:grid-cols-[minmax(0,1fr)_360px]">
            <main className="min-w-0 space-y-3">
              <BoardToolbar
                projects={snapshot.projects}
                selectedProjectId={selectedProjectId}
                selectedProjectName={selectedProjectName}
                searchQuery={searchQuery}
                onSelectProject={selectProject}
                onSearchChange={setSearchQuery}
                onNewTaskClick={() => taskInputRef.current?.focus()}
              />

              <section className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  {INTENT_OPTIONS.map((intent) => {
                    const Icon = intent.icon;
                    const active = larryIntent === intent.value;
                    return (
                      <button
                        key={intent.value}
                        type="button"
                        onClick={() => setLarryIntent(intent.value)}
                        className={`inline-flex h-8 items-center gap-1 rounded-full border px-3 text-xs font-medium transition ${
                          active
                            ? "border-[#0073EA] bg-[#0073EA] text-white"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <Icon size={13} />
                        {intent.label}
                      </button>
                    );
                  })}
                </div>

                <form onSubmit={handleLarryRun} className="grid gap-2 md:grid-cols-[1fr_auto]">
                  <div className="relative">
                    <input
                      value={larryPrompt}
                      onChange={(event) => setLarryPrompt(event.target.value)}
                      placeholder={COMMAND_SUGGESTIONS[suggestionIndex]}
                      className="h-11 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-[#0073EA]"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
                      {activeIntent?.label}
                    </span>
                  </div>
                  <button
                    type="submit"
                    disabled={larryBusy || larryPrompt.trim().length < 3}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#0073EA] px-4 text-sm font-semibold text-white hover:bg-[#0068d6] disabled:opacity-50"
                  >
                    <WandSparkles size={16} />
                    {larryBusy ? "Running..." : "Ask Larry"}
                  </button>
                </form>
                {lastLarryResponse && (
                  <p className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
                    {lastLarryResponse}
                  </p>
                )}
              </section>

              <section className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Meeting to Execution</p>
                  <span className="text-[11px] text-slate-500">Transcript upload-first</span>
                </div>
                <textarea
                  value={meetingTranscript}
                  onChange={(event) => setMeetingTranscript(event.target.value)}
                  rows={4}
                  placeholder="Paste meeting transcript here. Larry will extract actions, owners, and deadlines."
                  className="w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#0073EA]"
                />
                <button
                  type="button"
                  onClick={() => void handleMeetingTranscriptSubmit()}
                  disabled={meetingBusy || meetingTranscript.trim().length < 20}
                  className="mt-2 inline-flex h-9 items-center gap-2 rounded-md bg-[#111827] px-3 text-sm font-medium text-white hover:bg-[#1f2937] disabled:opacity-50"
                >
                  <Bot size={14} />
                  {meetingBusy ? "Processing..." : "Process transcript"}
                </button>
              </section>

              <section className="rounded-lg border border-slate-200 bg-white p-3">
                <form onSubmit={handleCreateTask} className="mb-3 grid gap-2 md:grid-cols-[1fr_220px_auto]">
                  <input
                    ref={taskInputRef}
                    value={taskTitle}
                    onChange={(event) => setTaskTitle(event.target.value)}
                    placeholder="Task title"
                    className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-[#0073EA]"
                  />

                  <div className="relative">
                    <select
                      value={selectedProjectId}
                      onChange={(event) => selectProject(event.target.value)}
                      className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 pr-7 text-sm outline-none focus:border-[#0073EA]"
                    >
                      <option value="">Select project</option>
                      {snapshot.projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-500" />
                  </div>

                  <button
                    type="submit"
                    disabled={taskBusy || !canCreateTask}
                    className="h-10 rounded-md bg-[#0073EA] px-4 text-sm font-semibold text-white hover:bg-[#0068d6] disabled:opacity-50"
                  >
                    {taskBusy ? "Adding..." : "Add task"}
                  </button>
                </form>

                <div className="mb-3 grid grid-cols-3 gap-2 text-xs sm:grid-cols-6">
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-center">Backlog<br /><span className="text-base font-semibold">{groupedCounts.backlog}</span></div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-center">Not started<br /><span className="text-base font-semibold">{groupedCounts.not_started}</span></div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-center">In progress<br /><span className="text-base font-semibold">{groupedCounts.in_progress}</span></div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-center">Waiting<br /><span className="text-base font-semibold">{groupedCounts.waiting}</span></div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-center">Blocked<br /><span className="text-base font-semibold">{groupedCounts.blocked}</span></div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-center">Done<br /><span className="text-base font-semibold">{groupedCounts.completed}</span></div>
                </div>

                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-1 text-xs">
                    {(["table", "kanban", "gantt"] as BoardView[]).map((view) => (
                      <button
                        key={view}
                        type="button"
                        onClick={() => setBoardView(view)}
                        className={`rounded px-2.5 py-1 font-medium ${
                          boardView === view ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
                        }`}
                      >
                        {mapBoardViewLabel(view)}
                      </button>
                    ))}
                  </div>
                  <span className="text-xs text-slate-500">
                    {loading ? "Refreshing board..." : `${boardTasks.length} tasks in view`}
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
              </section>

              <section className="rounded-lg border border-slate-200 bg-white p-3">
                <form onSubmit={handleCreateProject} className="grid gap-2 md:grid-cols-[1fr_auto]">
                  <input
                    value={projectName}
                    onChange={(event) => setProjectName(event.target.value)}
                    placeholder="Create a new project board"
                    className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-[#0073EA]"
                  />
                  <button
                    type="submit"
                    disabled={projectBusy || projectName.trim().length === 0}
                    className="h-10 rounded-md bg-[#111827] px-4 text-sm font-semibold text-white hover:bg-[#1f2937] disabled:opacity-50"
                  >
                    {projectBusy ? "Creating..." : "Create project"}
                  </button>
                </form>
              </section>
            </main>

            <div className="xl:hidden">
              <button
                type="button"
                onClick={() => setRightPanelOpen(!rightPanelOpen)}
                className="mb-2 inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700"
              >
                {rightPanelOpen ? "Hide" : "Show"} Action Center
              </button>
            </div>

            <div className={`${rightPanelOpen ? "block" : "hidden"} xl:block`}>
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
        </div>
      </div>
    </section>
  );
}
