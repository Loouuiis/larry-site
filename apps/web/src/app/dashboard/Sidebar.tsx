"use client";

import Link from "next/link";
import { useState } from "react";
import {
  BarChart3,
  ChevronDown,
  ChevronRight,
  Home,
  ListTodo,
  MessageSquare,
} from "lucide-react";
import { WorkspaceProject } from "./types";

type ConnectorDot = {
  key: "slack" | "calendar" | "email";
  label: string;
  connected: boolean;
};

export type WorkspaceSidebarNav = "home" | "my-work" | "project";

interface SidebarProps {
  workspaceName: string;
  projects: WorkspaceProject[];
  selectedProjectId: string;
  onMeetingTranscriptClick: () => void;
  connectorDots: ConnectorDot[];
  activeNav: WorkspaceSidebarNav;
}

function navClass(active: boolean) {
  return `flex w-full items-center gap-2 rounded-md py-[7px] pl-3 pr-3 text-[14px] transition-colors ${
    active
      ? "bg-[#ede9fe] font-medium text-[#5b21b6]"
      : "text-[#323338] hover:bg-[#f5f6f8]"
  }`;
}

export function Sidebar({
  workspaceName,
  projects,
  selectedProjectId,
  onMeetingTranscriptClick,
  connectorDots,
  activeNav,
}: SidebarProps) {
  const [favoritesOpen, setFavoritesOpen] = useState(true);
  const [workspaceOpen, setWorkspaceOpen] = useState(true);

  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col border-r border-[#e6e9ef] bg-white">
      <div className="flex items-center gap-2.5 border-b border-[#e6e9ef] px-4 py-3">
        <Link
          href="/workspace"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#6366f1] to-[#0073EA] text-xs font-bold text-white"
        >
          L
        </Link>
        <p className="truncate text-[14px] font-semibold text-[#323338]">{workspaceName}</p>
      </div>

      <div className="px-2 pt-2 space-y-0.5">
        <Link href="/workspace" className={navClass(activeNav === "home")}>
          <Home size={16} className="shrink-0 text-[#9699a8]" />
          <span>Home</span>
        </Link>
        <Link href="/workspace/my-work" className={navClass(activeNav === "my-work")}>
          <ListTodo size={16} className="shrink-0 text-[#9699a8]" />
          <span>My work</span>
        </Link>
      </div>

      <div className="px-3 pt-3 pb-1">
        <button
          type="button"
          onClick={onMeetingTranscriptClick}
          className="flex w-full items-center gap-2.5 rounded-lg border border-[#e0e7ff] bg-[#f5f3ff] px-3 py-2.5 text-[14px] font-medium text-[#5b21b6] transition-colors hover:bg-[#ede9fe]"
        >
          <MessageSquare size={18} className="shrink-0" />
          <span>Meeting → execution</span>
        </button>
      </div>

      <div className="mx-3 my-2 border-t border-[#e6e9ef]" />

      <div className="px-2">
        <button
          type="button"
          className="flex w-full items-center justify-between px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#9699a8] hover:text-[#676879]"
          onClick={() => setFavoritesOpen((v) => !v)}
        >
          <span>Favorites</span>
          {favoritesOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        {favoritesOpen && (
          <div className="space-y-0.5">
            {projects.slice(0, 3).map((project) => (
              <Link
                key={project.id}
                href={`/workspace/projects/${project.id}`}
                className={`flex w-full items-center gap-2 rounded-md py-[6px] pl-6 pr-3 text-[14px] transition-colors ${
                  selectedProjectId === project.id
                    ? "border-l-[3px] border-l-[#6366f1] bg-[#ede9fe] pl-[21px] font-medium text-[#5b21b6]"
                    : "text-[#323338] hover:bg-[#f5f6f8]"
                }`}
              >
                <BarChart3 size={16} className="shrink-0 text-[#9699a8]" />
                <span className="truncate">{project.name}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="mt-1 min-h-0 flex-1 px-2">
        <button
          type="button"
          className="flex w-full items-center justify-between px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#9699a8] hover:text-[#676879]"
          onClick={() => setWorkspaceOpen((v) => !v)}
        >
          <span>Projects</span>
          {workspaceOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        {workspaceOpen && (
          <div className="max-h-[200px] space-y-0.5 overflow-y-auto pb-2">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/workspace/projects/${project.id}`}
                className={`flex w-full items-center gap-2 rounded-md py-[6px] pl-6 pr-3 text-[14px] transition-colors ${
                  selectedProjectId === project.id
                    ? "border-l-[3px] border-l-[#6366f1] bg-[#ede9fe] pl-[21px] font-medium text-[#5b21b6]"
                    : "text-[#323338] hover:bg-[#f5f6f8]"
                }`}
              >
                <BarChart3 size={16} className="shrink-0 text-[#9699a8]" />
                <span className="truncate">{project.name}</span>
              </Link>
            ))}
            {projects.length === 0 && (
              <p className="px-6 py-2 text-[13px] text-[#9699a8]">No projects yet.</p>
            )}
          </div>
        )}
      </div>

      <div className="mt-auto border-t border-[#e6e9ef] px-3 py-3">
        <div className="flex items-center gap-4">
          {connectorDots.map((c) => (
            <div key={c.key} className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${c.connected ? "bg-[#00C875]" : "bg-[#C4C4C4]"}`} />
              <span className="text-[12px] text-[#9699a8]">{c.label}</span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
