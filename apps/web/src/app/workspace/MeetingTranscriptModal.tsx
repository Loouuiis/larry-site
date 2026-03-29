"use client";

import { Bot, MessageSquare, X } from "lucide-react";

type MeetingTranscriptModalProps = {
  open: boolean;
  onClose: () => void;
  transcript: string;
  onTranscriptChange: (value: string) => void;
  onSubmit: () => void;
  busy: boolean;
};

export function MeetingTranscriptModal({
  open,
  onClose,
  transcript,
  onTranscriptChange,
  onSubmit,
  busy,
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
            Paste a meeting transcript. Larry saves it now and queues background review so the meeting summary and
            Action Centre items show up on the workspace path shortly.
          </p>
          <textarea
            value={transcript}
            onChange={(e) => onTranscriptChange(e.target.value)}
            rows={8}
            placeholder="Paste meeting transcript here... (minimum 20 characters)"
            className="w-full resize-y rounded-lg border border-[var(--pm-border)] bg-[var(--pm-gray-light)] px-4 py-3 text-[14px] outline-none focus:border-[var(--pm-blue)] focus:bg-white"
          />
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
              {busy ? "Queueing..." : "Queue transcript"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
