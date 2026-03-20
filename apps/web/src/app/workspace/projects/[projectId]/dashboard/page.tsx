"use client";

import { use } from "react";
import { ProjectDashboard } from "./ProjectDashboard";

export default function ProjectDashboardPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  return <ProjectDashboard projectId={projectId} />;
}
