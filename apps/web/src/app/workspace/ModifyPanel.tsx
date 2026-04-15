"use client";

// Inline Modify Action panel rendered on an Action Centre card.
// Spec: docs/superpowers/specs/2026-04-15-modify-action-design.md
//
// The panel owns its own useModifyPanel hook. Parents pass the eventId
// and an onFinished callback that fires on either Save & execute success
// or Stop — the callback refreshes the Action Centre and closes the panel.

import { useEffect, useRef, useState } from "react";
import { useModifyPanel } from "@/hooks/useModifyPanel";
import { ModifyDiff } from "./ModifyDiff";
import { ModifyPanelFields } from "./ModifyPanelFields";

export interface ModifyPanelProps {
  eventId: string;
  onFinished: (outcome: "saved" | "stopped" | "conflict") => void;
}

export function ModifyPanel({ eventId, onFinished }: ModifyPanelProps) {
  const panel = useModifyPanel();
  const [chatInput, setChatInput] = useState("");
  const openedRef = useRef<string | null>(null);

  useEffect(() => {
    if (openedRef.current === eventId) return;
    openedRef.current = eventId;
    void panel.open(eventId);
  }, [eventId, panel]);

  if (panel.state === "loading") {
    return (
      <div className="mt-3 rounded-lg border border-neutral-200 bg-white p-4 text-sm text-neutral-500 shadow-sm">
        Loading suggestion…
      </div>
    );
  }

  if (panel.state === "conflict") {
    return (
      <div className="mt-3 rounded-lg border border-amber-400 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm">
        <p className="mb-2">
          This suggestion was already resolved in another tab. Refresh the Action Centre
          to see the current state.
        </p>
        <button
          type="button"
          onClick={() => onFinished("conflict")}
          className="rounded border border-amber-400 bg-white px-3 py-1 font-medium hover:bg-amber-100"
        >
          Close
        </button>
      </div>
    );
  }

  if (panel.state === "error" || !panel.snapshot || !panel.workingPayload) {
    return (
      <div className="mt-3 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900 shadow-sm">
        <p className="mb-2">{panel.error ?? "Couldn't open Modify. Please try again."}</p>
        <button
          type="button"
          onClick={() => onFinished("stopped")}
          className="rounded border border-red-300 bg-white px-3 py-1 font-medium hover:bg-red-100"
        >
          Close
        </button>
      </div>
    );
  }

  const { snapshot, workingPayload, diff, chatLog, error } = panel;
  const saving = panel.state === "saving";

  async function handleChat(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = chatInput.trim();
    if (!trimmed) return;
    setChatInput("");
    await panel.sendChat(trimmed);
  }

  async function handleSave() {
    const result = await panel.saveAndExecute();
    if (result) onFinished("saved");
  }

  async function handleStop() {
    await panel.stop();
    onFinished("stopped");
  }

  return (
    <div className="mt-3 space-y-4 rounded-lg border border-neutral-300 bg-white p-4 shadow-sm">
      <header className="text-xs uppercase tracking-wide text-neutral-500">
        Editing: <span className="font-semibold text-neutral-800">{snapshot.displayText}</span>
      </header>

      <section>
        <ModifyPanelFields
          snapshot={snapshot}
          payload={workingPayload}
          onPatch={panel.applyPatch}
        />
      </section>

      <section className="space-y-2">
        <form onSubmit={handleChat} className="flex gap-2">
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Anything a field can't capture? Describe the change…"
            className="flex-1 rounded border border-neutral-300 px-2 py-1 text-sm focus:border-[#6c44f6] focus:outline-none focus:ring-1 focus:ring-[#6c44f6]"
          />
          <button
            type="submit"
            className="rounded bg-neutral-800 px-3 py-1 text-sm font-medium text-white hover:bg-neutral-700"
          >
            Tell Larry
          </button>
        </form>
        {chatLog.length > 0 && (
          <div className="space-y-1 rounded bg-neutral-50 p-2 text-sm">
            {chatLog.map((entry, i) => (
              <div key={i}>
                <strong className="text-neutral-700">
                  {entry.who === "you" ? "You" : "Larry"}:
                </strong>{" "}
                <span className="text-neutral-800">{entry.text}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded border border-neutral-200 bg-neutral-50 p-3">
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Review
        </h4>
        <ModifyDiff entries={diff} />
      </section>

      {error && (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || diff.length === 0}
          className="rounded bg-[#6c44f6] px-3 py-1 text-sm font-medium text-white hover:bg-[#5933e0] disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save & execute"}
        </button>
        <button
          type="button"
          onClick={handleStop}
          disabled={saving}
          className="rounded border border-neutral-300 px-3 py-1 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
        >
          Stop
        </button>
      </div>
    </div>
  );
}
