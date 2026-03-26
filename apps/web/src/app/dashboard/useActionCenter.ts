"use client";

import { useCallback, useEffect, useState } from "react";
import { ActionCardViewModel, EmailDraft, WorkspaceAction } from "./types";

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return { error: text } as T;
  }
}

function normalizeImpact(value: string | undefined): "low" | "medium" | "high" {
  if (value === "high") return "high";
  if (value === "medium") return "medium";
  return "low";
}

function mapAction(action: WorkspaceAction): ActionCardViewModel {
  const confidence =
    typeof action.confidence === "number" ? action.confidence.toFixed(2) : String(action.confidence ?? "0.00");
  return {
    id: action.id,
    impact: normalizeImpact(action.impact),
    title: action.actionType ?? "proposal",
    reason: action.reasoning?.what ?? action.reason,
    confidence,
    threshold: action.reasoning?.threshold ?? "default policy",
  };
}

export function useActionCenter(
  initialActions: WorkspaceAction[],
  initialDrafts: EmailDraft[]
) {
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [correctionBusyId, setCorrectionBusyId] = useState<string | null>(null);
  const [draftBusyId, setDraftBusyId] = useState<string | null>(null);
  const [actions, setActions] = useState<WorkspaceAction[]>(initialActions);
  const [drafts, setDrafts] = useState<EmailDraft[]>(initialDrafts);

  useEffect(() => { setActions(initialActions); }, [initialActions]);
  useEffect(() => { setDrafts(initialDrafts); }, [initialDrafts]);

  const actionCards: ActionCardViewModel[] = actions.map(mapAction);

  const handleActionDecision = useCallback(
    async (
      actionId: string,
      decision: "approve" | "reject",
      options: { note?: string; overridePayload?: Record<string, unknown> } = {}
    ) => {
      setActionBusyId(actionId);
      try {
        const endpoint = decision === "approve"
          ? `/api/workspace/actions/${actionId}/approve`
          : `/api/workspace/actions/${actionId}/reject`;
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(options),
        });
        if (res.ok) {
          setActions((prev) => prev.filter((a) => a.id !== actionId));
          window.dispatchEvent(new CustomEvent("larry:refresh-snapshot"));
        }
      } finally {
        setActionBusyId(null);
      }
    },
    []
  );

  const handleActionCorrect = useCallback(async (actionId: string) => {
    setCorrectionBusyId(actionId);
    try {
      const res = await fetch(`/api/workspace/actions/${actionId}/correct`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          correctionType: "bad_reasoning",
          correctionPayload: {},
          tunePolicy: false,
        }),
      });
      if (res.ok) {
        setActions((prev) => prev.filter((a) => a.id !== actionId));
      }
    } finally {
      setCorrectionBusyId(null);
    }
  }, []);

  const sendEmailDraft = useCallback(async (draftId: string) => {
    setDraftBusyId(draftId);
    try {
      const draft = drafts.find((item) => item.id === draftId);
      if (!draft) return;

      const res = await fetch("/api/workspace/email/drafts/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: draft.projectId ?? undefined,
          actionId: draft.actionId ?? undefined,
          to: draft.recipient,
          subject: draft.subject,
          body: draft.body,
          sendNow: true,
        }),
      });
      if (res.ok) {
        setDrafts((prev) => prev.filter((d) => d.id !== draftId));
        window.dispatchEvent(new CustomEvent("larry:refresh-snapshot"));
      }
    } finally {
      setDraftBusyId(null);
    }
  }, [drafts]);

  return {
    actionCards,
    drafts,
    actionBusyId,
    correctionBusyId,
    draftBusyId,
    handleActionDecision,
    handleActionCorrect,
    sendEmailDraft,
  };
}
