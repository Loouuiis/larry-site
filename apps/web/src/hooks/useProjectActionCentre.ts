"use client";

import { useLarryActionCentre } from "./useLarryActionCentre";

type AcceptedCallback = (toast: {
  actionType: string;
  actionLabel: string;
  actionColor: string;
  displayText: string;
  projectName: string | null;
  projectId: string;
}) => void;

export function useProjectActionCentre(
  projectId: string,
  onMutate: () => Promise<void>,
  onAccepted?: AcceptedCallback,
) {
  return useLarryActionCentre({
    projectId,
    onMutate,
    onAccepted,
  });
}
