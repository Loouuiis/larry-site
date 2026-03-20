"use client";

import { useEffect } from "react";
import { recordProjectVisit } from "@/lib/recent-projects";

export function RecordProjectVisit({ projectId }: { projectId: string }) {
  useEffect(() => {
    recordProjectVisit(projectId);
  }, [projectId]);
  return null;
}
