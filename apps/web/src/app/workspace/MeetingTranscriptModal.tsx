"use client";

import { Bot, MessageSquare, X } from "lucide-react";
import type { TranscriptProcessingState } from "./useTranscriptProcessing";

type MeetingTranscriptModalProps = {
  open: boolean;
  onClose: () => void;
  transcript: string;
  onTranscriptChange: (value: string) => void;
  onSubmit: () => void;
  busy: boolean;
  processingState: TranscriptProcessingState;
};

function TranscriptProgressCard({ state }: { state: TranscriptProcessingState }) {
  const tone =
    state.phase === "failed"
      ? { border: "#fecaca", background: "#fef2f2", text: "#b91c1c", bar: "#dc2626" }
      : state.phase === "succeeded"
        ? { border: "#bbf7d0", background: "#f0fdf4", text: "#15803d", bar: "#16a34a" }
        : { border: "var(--pm-border)", background: "var(--pm-gray-light)", text: "var(--pm-text)", bar: "var(--pm-blue)" };

  return (
    <div
      className="mt-4 rounded-xl border px-4 py-3"
      style={{
        borderColor: tone.border,
        background: tone.background,
      }}
    >
      <div className="mb-2 flex items-center justify-between text-[12px]">
        <span className="font-medium" style={{ color: tone.text }}>{state.statusLabel}</span>
        <span className="tabular-nums" style={{ color: tone.text }}>{state.progress}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/70">
        <div
          className={state.phase === "processing" ? "pm-shimmer" : ""}
          style={{
            width: `${state.progress}%`,
            height: "100%",
            borderRadius: "999px",
            background: tone.bar,
            transition: "width 0.4s ease",
          }}
        />
      </div>
      <p className="mt-2 text-[12px]" style={{ color: tone.text }}>
        {state.detail}
      </p>
    </div>
  );
}

export function MeetingTranscriptModal({
  open,
  onClose,
  transcript,
  onTranscriptChange,
  onSubmit,
  busy,
  processingState,
}: MeetingTranscriptModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
      <div className="max-h-[90vh] w-[520px] overflow-y-auto rounded-2xl border border-[var(--pm-border)] bg-[var(--pm-surface)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--pm-border)] px-5 py-4">
          <div className="flex items-center gap-2">
            <MessageSquare size={18} className="text-[var(--pm-blue)]" />
            <h2 className="text-[16px] font-semibold text-[var(--pm-text)]">Meeting to Action Centre</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[var(--pm-gray-light)]"
          >
            <X size={16} className="text-[var(--pm-text-muted)]" />
          </button>
        </div>
        <div className="p-5">
          <p className="mb-3 text-[13px] text-[var(--pm-text-secondary)]">
            Paste a meeting transcript. Larry will save it, analyze it, update the meeting summary, and add the
            transcript analysis to the project documents.
          </p>
          <textarea
            value={transcript}
            onChange={(e) => onTranscriptChange(e.target.value)}
            rows={8}
            placeholder="Paste meeting transcript here... (minimum 20 characters)"
            disabled={busy}
            className="w-full resize-y rounded-lg border border-[var(--pm-border)] bg-[var(--pm-gray-light)] px-4 py-3 text-[14px] outline-none focus:border-[var(--pm-blue)] focus:bg-white"
          />
          {processingState.phase !== "idle" && <TranscriptProgressCard state={processingState} />}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="pm-btn pm-btn-secondary">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                void onSubmit();
              }}
              disabled={busy || transcript.trim().length < 20}
              className="pm-btn pm-btn-primary"
            >
              <Bot size={15} />
              {busy ? "Processing..." : "Process transcript"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
