"use client";

import {
  ChevronDown,
  Ellipsis,
  Filter,
  Group,
  Plus,
  Search,
  SlidersHorizontal,
  SortAsc,
  UserRound,
} from "lucide-react";
import { WorkspaceProject } from "./types";
import { LogoutButton } from "./LogoutButton";

interface BoardToolbarProps {
  projects: WorkspaceProject[];
  selectedProjectId: string;
  selectedProjectName: string;
  searchQuery: string;
  onSelectProject: (projectId: string) => void;
  onSearchChange: (value: string) => void;
  onNewTaskClick: () => void;
}

const iconButtonClass =
  "inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50";

export function BoardToolbar({
  projects,
  selectedProjectId,
  selectedProjectName,
  searchQuery,
  onSelectProject,
  onSearchChange,
  onNewTaskClick,
}: BoardToolbarProps) {
  return (
    <header className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold text-slate-900">{selectedProjectName || "Project Board"}</h1>
          <div className="relative">
            <select
              value={selectedProjectId}
              onChange={(event) => onSelectProject(event.target.value)}
              className="h-9 rounded-md border border-slate-200 bg-slate-50 px-3 pr-7 text-sm text-slate-700 outline-none focus:border-[#0073EA]"
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-500" />
          </div>
        </div>
        <LogoutButton />
      </div>

      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <button
          type="button"
          onClick={onNewTaskClick}
          className="inline-flex h-9 items-center gap-1 rounded-md bg-[#0073EA] px-3 text-sm font-medium text-white hover:bg-[#0068d6]"
        >
          <Plus size={16} />
          New task
        </button>

        <div className="relative min-w-[220px] flex-1 sm:max-w-[360px]">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search task or owner"
            className="h-9 w-full rounded-md border border-slate-200 bg-white pl-8 pr-3 text-sm outline-none focus:border-[#0073EA]"
          />
        </div>

        <button type="button" className={iconButtonClass}>
          <UserRound size={14} />
          Person
        </button>
        <button type="button" className={iconButtonClass}>
          <Filter size={14} />
          Filter
        </button>
        <button type="button" className={iconButtonClass}>
          <SortAsc size={14} />
          Sort
        </button>
        <button type="button" className={iconButtonClass}>
          <SlidersHorizontal size={14} />
          Hide
        </button>
        <button type="button" className={iconButtonClass}>
          <Group size={14} />
          Group by
        </button>
        <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50">
          <Ellipsis size={14} />
        </button>
      </div>
    </header>
  );
}

