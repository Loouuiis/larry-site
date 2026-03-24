"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import { ProjectSelectionScreen } from "@/components/dashboard/ProjectSelectionScreen";
import { StartProjectFlow } from "@/components/dashboard/StartProjectFlow";
import type { WorkspaceSnapshot, WorkspaceProject } from "@/app/dashboard/types";

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return {} as T;
  try { return JSON.parse(text) as T; } catch { return {} as T; }
}

type Health = "on-track" | "at-risk" | "overdue" | "not-started";

function mapHealth(riskLevel: string | null | undefined): Health {
  if (riskLevel === "high") return "overdue";
  if (riskLevel === "medium") return "at-risk";
  return "on-track";
}

function mapProject(p: WorkspaceProject) {
  const now = new Date();
  const targetDate = p.targetDate ? new Date(p.targetDate) : null;
  const isOverdue = targetDate && targetDate < now && p.status !== "completed";
  const health: Health = p.status === "completed"
    ? "on-track"
    : isOverdue
      ? "overdue"
      : mapHealth(p.riskLevel);

  return {
    id:          p.id,
    name:        p.name,
    description: p.description ?? (p.status === "completed" ? "Completed project" : "Active project"),
    health,
    progress:    p.completionRate != null ? Math.round(Number(p.completionRate) * 100) : 0,
    deadline:    p.targetDate
      ? new Date(p.targetDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
      : "—",
    team:        [] as string[],
    lastUpdated: p.updatedAt
      ? (() => {
          const diff = Date.now() - new Date(p.updatedAt!).getTime();
          const mins = Math.floor(diff / 60000);
          if (mins < 60) return `${mins}m ago`;
          const hrs = Math.floor(mins / 60);
          if (hrs < 24) return `${hrs}h ago`;
          return `${Math.floor(hrs / 24)}d ago`;
        })()
      : "—",
  };
}

export function WorkspaceHome() {
  const router = useRouter();
  const [projects, setProjects] = useState<WorkspaceProject[]>([]);
  const [showNewProject, setShowNewProject] = useState(false);

  useEffect(() => {
    fetch("/api/workspace/snapshot?includeProjectContext=false", { cache: "no-store" })
      .then((r) => readJson<WorkspaceSnapshot>(r))
      .then((data) => { if (data.projects) setProjects(data.projects); })
      .catch((e) => { if (process.env.NODE_ENV !== "production") console.error("[WorkspaceHome] fetch failed", e); });
  }, []);

  return (
    <>
      <ProjectSelectionScreen
        externalProjects={projects.map(mapProject)}
        onSelectProject={(id) => router.push(`/workspace/projects/${id}`)}
        onNewProject={() => setShowNewProject(true)}
      />
      <AnimatePresence>
        {showNewProject && (
          <StartProjectFlow
            onClose={() => setShowNewProject(false)}
            onCreated={(id) => router.push(`/workspace/projects/${id}`)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
