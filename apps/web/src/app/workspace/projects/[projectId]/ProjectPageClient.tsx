"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ProjectWorkspace } from "@/components/dashboard/ProjectWorkspace";
import type { WorkspaceSnapshot } from "@/app/dashboard/types";

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return {} as T;
  try { return JSON.parse(text) as T; } catch { return {} as T; }
}

export function ProjectPageClient({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [projectName, setProjectName] = useState<string>("");

  useEffect(() => {
    fetch(`/api/workspace/snapshot?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store" })
      .then((r) => readJson<WorkspaceSnapshot>(r))
      .then((data) => {
        const match = data.projects?.find((p) => p.id === projectId);
        if (match) setProjectName(match.name);
      })
      .catch(() => {});
  }, [projectId]);

  if (!projectName) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--color-brand)] border-t-transparent" />
      </div>
    );
  }

  return (
    <ProjectWorkspace
      projectId={projectId}
      projectName={projectName}
      onBack={() => router.push("/workspace")}
    />
  );
}
