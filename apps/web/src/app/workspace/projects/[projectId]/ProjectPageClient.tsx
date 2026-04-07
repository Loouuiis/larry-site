"use client";

import { Suspense } from "react";
import { ProjectWorkspaceView } from "./ProjectWorkspaceView";

export function ProjectPageClient({ projectId }: { projectId: string }) {
  return (
    <Suspense>
      <ProjectWorkspaceView projectId={projectId} />
    </Suspense>
  );
}
