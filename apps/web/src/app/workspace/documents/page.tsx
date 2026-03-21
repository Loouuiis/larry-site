"use client";

import { FileText, ArrowRight } from "lucide-react";
import Link from "next/link";

export default function DocumentsPage() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-8">
      <div className="mb-6">
        <h1 className="text-[22px] font-semibold text-[var(--pm-text)]">Documents</h1>
        <p className="text-[14px] text-[var(--pm-text-secondary)] mt-0.5">
          AI-generated summaries and reports from your projects.
        </p>
      </div>

      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--pm-border)] py-20 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#f0f4ff]">
          <FileText size={22} className="text-[#0073EA]" />
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
    </div>
  );
}
