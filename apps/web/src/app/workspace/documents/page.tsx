"use client";

import { useEffect, useState } from "react";
import { FileText, ChevronDown, ArrowRight } from "lucide-react";
import Link from "next/link";

interface MeetingDocument {
  id: string;
  title: string | null;
  summary: string | null;
  actionCount: number;
  meetingDate: string | null;
  createdAt: string;
}

function formatDate(meetingDate: string | null, createdAt: string): string {
  const raw = meetingDate ?? createdAt;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function DocumentsPage() {
  const [meetings, setMeetings] = useState<MeetingDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/workspace/meetings?limit=50", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { meetings?: MeetingDocument[] }) => {
        const withSummary = (data.meetings ?? []).filter((m) => m.summary != null);
        setMeetings(withSummary);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-8">
      <div className="mb-6">
        <h1 className="text-[22px] font-semibold text-[var(--pm-text)]">Documents</h1>
        <p className="text-[14px] text-[var(--pm-text-secondary)] mt-0.5">
          AI-generated summaries and reports from your projects.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#6366f1] border-t-transparent" />
        </div>
      ) : meetings.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--pm-border)] py-20 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#f0f4ff]">
            <FileText size={22} className="text-[#6366f1]" />
          </div>
          <p className="text-[15px] font-medium text-[var(--pm-text)]">No documents yet</p>
          <p className="mt-1 text-[13px] text-[var(--pm-text-secondary)] max-w-sm">
            Meeting summaries and AI-generated reports will appear here. Upload a meeting transcript to generate your first document.
          </p>
          <Link
            href="/workspace/meetings"
            className="mt-5 inline-flex items-center gap-1.5 rounded-lg border border-[var(--pm-border)] bg-white px-4 py-2 text-[13px] font-medium text-[var(--pm-text)] hover:bg-[var(--pm-gray-light)] transition"
          >
            Go to Meetings
            <ArrowRight size={13} />
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {meetings.map((meeting) => {
            const isExpanded = expandedId === meeting.id;
            const excerpt = meeting.summary && meeting.summary.length > 120
              ? meeting.summary.slice(0, 120) + "…"
              : meeting.summary;

            return (
              <div
                key={meeting.id}
                className="rounded-xl border border-[var(--pm-border)] bg-white shadow-sm overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : meeting.id)}
                  className="w-full text-left px-5 py-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#f0f4ff]">
                        <FileText size={15} className="text-[#6366f1]" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[14px] font-semibold text-[var(--pm-text)] truncate">
                          {meeting.title ?? "Meeting transcript"}
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-[12px] text-[var(--pm-text-muted)]">
                            {formatDate(meeting.meetingDate, meeting.createdAt)}
                          </span>
                          {meeting.actionCount > 0 && (
                            <span className="rounded-full bg-[#ede9fe] px-2 py-0.5 text-[11px] font-medium text-[#6d28d9]">
                              {meeting.actionCount} {meeting.actionCount === 1 ? "action" : "actions"}
                            </span>
                          )}
                        </div>
                        {!isExpanded && excerpt && (
                          <p className="mt-1.5 text-[13px] text-[var(--pm-text-secondary)] line-clamp-2">
                            {excerpt}
                          </p>
                        )}
                      </div>
                    </div>
                    <ChevronDown
                      size={15}
                      className={`mt-1 shrink-0 text-[var(--pm-text-muted)] transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                    />
                  </div>
                </button>

                {isExpanded && meeting.summary && (
                  <div className="border-t border-[var(--pm-border)] px-5 py-4">
                    <p className="text-[13px] leading-relaxed text-[var(--pm-text-secondary)] whitespace-pre-wrap">
                      {meeting.summary}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
