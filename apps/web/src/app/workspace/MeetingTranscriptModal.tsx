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
      <div className="w-[520px] max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--pm-border)] bg-[var(--pm-surface)] shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--pm-border)]">
          <div className="flex items-center gap-2">
            <MessageSquare size={18} className="text-[var(--pm-blue)]" />
            <h2 className="text-[16px] font-semibold text-[var(--pm-text)]">Meeting → execution</h2>
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
          <p className="text-[13px] text-[var(--pm-text-secondary)] mb-3">
            Paste a meeting transcript. Larry extracts actions, owners, and deadlines—then routes high-impact items to
            your Action Center for approval.
          </p>
          <textarea
            value={transcript}
            onChange={(e) => onTranscriptChange(e.target.value)}
            rows={8}
            placeholder="Paste meeting transcript here..."
            className="w-full rounded-lg border border-[var(--pm-border)] bg-[var(--pm-gray-light)] px-4 py-3 text-[14px] outline-none focus:border-[var(--pm-blue)] focus:bg-white resize-y"
          />
          <div className="flex justify-end gap-2 mt-4">
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
