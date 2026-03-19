"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Home,
  Search,
  Sparkles,
  Star,
  Waypoints,
  Bot,
  Workflow,
} from "lucide-react";
import { WorkspaceProject } from "./types";

type ConnectorDot = {
  key: "slack" | "calendar" | "email";
  label: string;
  connected: boolean;
};

interface SidebarProps {
  workspaceName: string;
  projects: WorkspaceProject[];
  selectedProjectId: string;
  onSelectProject: (projectId: string) => void;
  connectorDots: ConnectorDot[];
}

function Dot({ connected }: { connected: boolean }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${connected ? "bg-emerald-500" : "bg-slate-300"}`}
      aria-hidden
    />
  );
}

export function Sidebar({
  workspaceName,
  projects,
  selectedProjectId,
  onSelectProject,
  connectorDots,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [favoritesOpen, setFavoritesOpen] = useState(true);
  const [workspaceOpen, setWorkspaceOpen] = useState(true);

  const favoriteProjects = useMemo(() => projects.slice(0, 3), [projects]);

  return (
    <aside
      className={`dashboard-sidebar border-r border-slate-200 bg-white transition-all ${collapsed ? "w-[88px]" : "w-[290px]"}`}
    >
      <div className="flex h-full flex-col p-3">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#0073EA] text-xs font-bold text-white">
              L
            </span>
            {!collapsed && (
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{workspaceName}</p>
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Workspace</p>
              </div>
            )}
          </div>
          <button
            type="button"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-100"
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        <nav className="space-y-1 border-b border-slate-200 pb-3">
          <button className="dashboard-nav-item">
            <Home size={16} />
            {!collapsed && <span>Home</span>}
          </button>
          <button className="dashboard-nav-item">
            <Waypoints size={16} />
            {!collapsed && <span>My Work</span>}
          </button>
          <button className="dashboard-nav-item">
            <Search size={16} />
            {!collapsed && <span>Search</span>}
          </button>
        </nav>

        <section className="mt-3 border-b border-slate-200 pb-3">
          {!collapsed && <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Larry AI</p>}
          <button className="dashboard-nav-item">
            <Sparkles size={16} />
            {!collapsed && <span>AI Sidekick</span>}
          </button>
          <button className="dashboard-nav-item">
            <Workflow size={16} />
            {!collapsed && <span>Workflows</span>}
          </button>
          <button className="dashboard-nav-item">
            <Bot size={16} />
            {!collapsed && <span>Agents</span>}
          </button>
        </section>

        <section className="mt-3 border-b border-slate-200 pb-3">
          <button
            type="button"
            className="mb-2 flex w-full items-center justify-between px-2 text-xs font-semibold uppercase tracking-wide text-slate-500"
            onClick={() => setFavoritesOpen((value) => !value)}
          >
            {!collapsed ? <span>Favorites</span> : <Star size={14} />}
            {!collapsed && (favoritesOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
          </button>
          {!collapsed && favoritesOpen && (
            <div className="space-y-1">
              {favoriteProjects.map((project) => (
                <button
                  key={project.id}
                  className={`dashboard-project-item ${selectedProjectId === project.id ? "active" : ""}`}
                  onClick={() => onSelectProject(project.id)}
                >
                  <span className="truncate">{project.name}</span>
                </button>
              ))}
              {favoriteProjects.length === 0 && (
                <p className="px-2 text-xs text-slate-500">No favorites yet.</p>
              )}
            </div>
          )}
        </section>

        <section className="mt-3 min-h-0 flex-1">
          <button
            type="button"
            className="mb-2 flex w-full items-center justify-between px-2 text-xs font-semibold uppercase tracking-wide text-slate-500"
            onClick={() => setWorkspaceOpen((value) => !value)}
          >
            {!collapsed ? <span>Workspaces</span> : <ChevronDown size={14} />}
            {!collapsed && (workspaceOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
          </button>

          {!collapsed && workspaceOpen && (
            <div className="max-h-[260px] space-y-1 overflow-y-auto pr-1">
              {projects.map((project) => (
                <button
                  key={project.id}
                  className={`dashboard-project-item ${selectedProjectId === project.id ? "active" : ""}`}
                  onClick={() => onSelectProject(project.id)}
                >
                  <span className="truncate">{project.name}</span>
                  <span className="text-[11px] text-slate-500">risk {project.riskLevel ?? "low"}</span>
                </button>
              ))}
              {projects.length === 0 && (
                <p className="px-2 text-xs text-slate-500">No boards yet.</p>
              )}
            </div>
          )}
        </section>

        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2">
          {!collapsed && (
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Connections</p>
          )}
          <div className={`grid gap-2 ${collapsed ? "grid-cols-1" : "grid-cols-3"}`}>
            {connectorDots.map((connector) => (
              <div
                key={connector.key}
                className="flex items-center gap-1.5 rounded-md bg-white px-2 py-1.5 text-[11px] text-slate-700"
              >
                <Dot connected={connector.connected} />
                {!collapsed && <span>{connector.label}</span>}
              </div>
            ))}
          </div>
        </div>

        <button
          type="button"
          className="mt-3 flex h-10 items-center justify-between rounded-lg border border-slate-200 px-3 text-sm text-slate-700 hover:bg-slate-50"
        >
          {!collapsed && <span>{workspaceName}</span>}
          <ChevronDown size={16} />
        </button>
      </div>
    </aside>
  );
}

