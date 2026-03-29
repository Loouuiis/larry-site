"use client";

import { useLarryActionCentre } from "./useLarryActionCentre";

export function useProjectActionCentre(projectId: string, onMutate: () => Promise<void>) {
  return useLarryActionCentre({
    projectId,
    onMutate,
  });
}
