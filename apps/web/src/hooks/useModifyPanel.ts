"use client";

// Client-side state machine for the Modify Action panel.
// Spec: docs/superpowers/specs/2026-04-15-modify-action-design.md
//
// Lifecycle: idle → loading → editing → (saving | conflict) → idle.
// All edits live in memory until saveAndExecute() commits; stop() discards.

import { useCallback, useMemo, useState } from "react";

export type ModifyPanelState =
  | "idle"
  | "loading"
  | "editing"
  | "saving"
  | "conflict"
  | "error";

export interface ModifySnapshot {
  eventId: string;
  actionType: string;
  displayText: string;
  reasoning: string;
  payload: Record<string, unknown>;
  editableFields: string[];
  teamMembers: { userId: string; displayName: string; email: string }[];
}

export interface DiffEntry {
  key: string;
  before: unknown;
  after: unknown;
}

export interface ChatTurn {
  who: "you" | "larry";
  text: string;
}

export interface SaveResult {
  executed: boolean;
  entity: unknown;
  event: unknown;
}

async function readJson<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export function useModifyPanel() {
  const [state, setState] = useState<ModifyPanelState>("idle");
  const [snapshot, setSnapshot] = useState<ModifySnapshot | null>(null);
  const [workingPayload, setWorkingPayload] = useState<Record<string, unknown> | null>(null);
  const [chatLog, setChatLog] = useState<ChatTurn[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setState("idle");
    setSnapshot(null);
    setWorkingPayload(null);
    setChatLog([]);
    setError(null);
  }, []);

  const open = useCallback(async (eventId: string) => {
    setState("loading");
    setError(null);
    setChatLog([]);
    try {
      const res = await fetch(`/api/workspace/larry/events/${eventId}/modify`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await readJson<{ message?: string; error?: string }>(res);
        const message =
          res.status === 409
            ? "This suggestion was already resolved."
            : body?.message ?? body?.error ?? "Couldn't open Modify.";
        setState(res.status === 409 ? "conflict" : "error");
        setError(message);
        return;
      }
      const snap = (await res.json()) as ModifySnapshot;
      setSnapshot(snap);
      setWorkingPayload({ ...snap.payload });
      setState("editing");
    } catch (e) {
      setState("error");
      setError(e instanceof Error ? e.message : "Couldn't open Modify.");
    }
  }, []);

  const applyPatch = useCallback((patch: Record<string, unknown>) => {
    setWorkingPayload((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const diff = useMemo<DiffEntry[]>(() => {
    if (!snapshot || !workingPayload) return [];
    const out: DiffEntry[] = [];
    const keys = new Set<string>([
      ...Object.keys(snapshot.payload ?? {}),
      ...Object.keys(workingPayload ?? {}),
    ]);
    for (const key of keys) {
      // Only report diffs for editable fields — the payload may contain other
      // internal keys (taskId, sourceKind, etc.) that we don't surface.
      if (!snapshot.editableFields.includes(key)) continue;
      const before = snapshot.payload[key];
      const after = workingPayload[key];
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        out.push({ key, before, after });
      }
    }
    return out;
  }, [snapshot, workingPayload]);

  const sendChat = useCallback(
    async (message: string): Promise<void> => {
      if (!snapshot || !workingPayload) return;
      const trimmed = message.trim();
      if (!trimmed) return;
      setChatLog((log) => [...log, { who: "you", text: trimmed }]);
      try {
        const res = await fetch(
          `/api/workspace/larry/events/${snapshot.eventId}/modify-chat`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: trimmed, currentPayload: workingPayload }),
          }
        );
        if (!res.ok) {
          const body = await readJson<{ message?: string; error?: string }>(res);
          if (res.status === 409) {
            setState("conflict");
            setError("This suggestion was already resolved elsewhere.");
            return;
          }
          setChatLog((log) => [
            ...log,
            {
              who: "larry",
              text: body?.message ?? body?.error ?? "Sorry, I couldn't process that.",
            },
          ]);
          return;
        }
        const body = (await res.json()) as {
          message: string;
          payloadPatch?: Record<string, unknown>;
          summary?: string;
        };
        setChatLog((log) => [...log, { who: "larry", text: body.message }]);
        if (body.payloadPatch && Object.keys(body.payloadPatch).length > 0) {
          applyPatch(body.payloadPatch);
        }
      } catch (e) {
        setChatLog((log) => [
          ...log,
          {
            who: "larry",
            text:
              e instanceof Error
                ? `Something went wrong: ${e.message}`
                : "Something went wrong.",
          },
        ]);
      }
    },
    [applyPatch, snapshot, workingPayload]
  );

  const saveAndExecute = useCallback(async (): Promise<SaveResult | null> => {
    if (!snapshot || !workingPayload) return null;
    if (diff.length === 0) return null;
    setState("saving");
    setError(null);
    try {
      const patch: Record<string, unknown> = {};
      for (const entry of diff) {
        patch[entry.key] = entry.after;
      }
      const res = await fetch(
        `/api/workspace/larry/events/${snapshot.eventId}/modify/save`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payloadPatch: patch, executeImmediately: true }),
        }
      );
      if (res.status === 409) {
        setState("conflict");
        setError("This suggestion was already resolved elsewhere.");
        return null;
      }
      if (!res.ok) {
        const body = await readJson<{ message?: string; error?: string }>(res);
        setState("editing");
        setError(body?.message ?? body?.error ?? "Save failed.");
        return null;
      }
      const body = (await res.json()) as SaveResult;
      reset();
      return body;
    } catch (e) {
      setState("editing");
      setError(e instanceof Error ? e.message : "Save failed.");
      return null;
    }
  }, [diff, reset, snapshot, workingPayload]);

  const stop = useCallback(async (): Promise<void> => {
    if (snapshot) {
      try {
        await fetch(`/api/workspace/larry/events/${snapshot.eventId}/modify/stop`, {
          method: "POST",
        });
      } catch {
        // Best-effort audit log. Panel closes regardless.
      }
    }
    reset();
  }, [reset, snapshot]);

  return {
    state,
    snapshot,
    workingPayload,
    diff,
    chatLog,
    error,
    open,
    applyPatch,
    sendChat,
    saveAndExecute,
    stop,
  };
}
