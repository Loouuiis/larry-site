"use client";

import { ChevronDown, MessageSquare, Plus, Search, Sparkles } from "lucide-react";
import { BoardView, WorkspaceProject } from "./types";

interface BoardToolbarProps {
  projects: WorkspaceProject[];
  selectedProjectId: string;
  selectedProjectName: string;
  searchQuery: string;
  boardView: BoardView;
  onSelectProject: (projectId: string) => void;
  onSearchChange: (value: string) => void;
  onNewTaskClick: () => void;
  onBoardViewChange: (view: BoardView) => void;
  onMeetingClick: () => void;
  onLarryClick: () => void;
  larryActive: boolean;
}

const VIEW_LABELS: Record<BoardView, string> = {
  table: "Table",
  kanban: "Kanban",
  gantt: "Timeline",
};

export function BoardToolbar({
  projects,
  selectedProjectId,
  selectedProjectName,
  searchQuery,
  boardView,
  onSelectProject,
  onSearchChange,
  onNewTaskClick,
  onBoardViewChange,
  onMeetingClick,
  onLarryClick,
  larryActive,
}: BoardToolbarProps) {
  return (
    <header className="bg-[var(--pm-surface)] border-b border-[var(--pm-border)]">
      {/* Top row: Board name + tabs */}
      <div className="flex items-center justify-between px-5 pt-4 pb-0">
        <div className="flex items-center gap-3">
          <h1 className="text-[20px] font-semibold text-[var(--pm-text)]">
            {selectedProjectName || "Project Board"}
          </h1>
          <div className="relative">
            <select
              value={selectedProjectId}
              onChange={(e) => onSelectProject(e.target.value)}
              className="appearance-none h-7 rounded border border-[var(--pm-border)] bg-[var(--pm-gray-light)] pl-2 pr-6 text-[13px] text-[var(--pm-text-secondary)] outline-none hover:border-[var(--pm-blue)] focus:border-[var(--pm-blue)]"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <ChevronDown size={12} className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--pm-text-muted)]" />
          </div>
        </div>
        <div className="flex items-center gap-2 pr-1">
          <button
            type="button"
            onClick={onLarryClick}
            className={`inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-[13px] font-medium transition-colors ${
              larryActive
                ? "border-[#6366f1] bg-[#f5f3ff] text-[#5b21b6]"
                : "border-[var(--pm-border)] bg-[var(--pm-surface)] text-[var(--pm-text-secondary)] hover:bg-[var(--pm-gray-light)]"
            }`}
          >
            <Sparkles size={15} className="text-[#6366f1]" />
            Larry
          </button>
        </div>
      </div>

      {/* Tab row */}
      <div className="flex items-end gap-0 px-5 mt-2">
        {(["table", "kanban", "gantt"] as BoardView[]).map((view) => (
          <button
            key={view}
            type="button"
            onClick={() => onBoardViewChange(view)}
            className={`relative px-4 pb-2 pt-1 text-[14px] font-medium transition-colors ${
              boardView === view
                ? "text-[var(--pm-blue)]"
                : "text-[var(--pm-text-secondary)] hover:text-[var(--pm-text)]"
            }`}
          >
            {VIEW_LABELS[view]}
            {boardView === view && (
              <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t bg-[var(--pm-blue)]" />
            )}
          </button>
        ))}
      </div>

      {/* Toolbar row */}
      <div className="flex items-center gap-2 px-5 py-2 border-t border-[var(--pm-border)] bg-[var(--pm-surface)]">
        <button
          type="button"
          onClick={onNewTaskClick}
          className="inline-flex h-[30px] items-center gap-1.5 rounded-md bg-[#0073EA] px-3 text-[13px] font-medium text-white hover:bg-[#0060c2]"
        >
          <Plus size={14} />
          New task
        </button>

        <button
          type="button"
          onClick={onMeetingClick}
          className="inline-flex h-[30px] items-center gap-1.5 rounded-md border border-[#e6e9ef] bg-white px-2.5 text-[13px] font-medium text-[#323338] hover:bg-[#f5f6f8]"
        >
          <MessageSquare size={14} className="text-[#676879]" />
          Meeting
        </button>

        <div className="relative ml-1">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--pm-text-muted)]" />
          <input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search"
            className="h-7 w-[180px] rounded border border-[var(--pm-border)] bg-[var(--pm-surface)] pl-8 pr-2 text-[13px] outline-none focus:border-[var(--pm-blue)] focus:w-[260px] transition-all"
          />
        </div>
      </div>
    </header>
  );
}
