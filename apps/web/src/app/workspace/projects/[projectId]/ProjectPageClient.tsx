"use client";

import { ProjectWorkspaceView } from "./ProjectWorkspaceView";

export function ProjectPageClient({ projectId }: { projectId: string }) {
  return <ProjectWorkspaceView projectId={projectId} />;
}
