"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { FileText, MoreHorizontal, Search, Mic } from "lucide-react";

const EASE = [0.22, 1, 0.36, 1] as const;

interface Document {
  id: string;
  title: string;
  docType: string;
  projectId: string | null;
  projectName: string | null;
  createdAt: string;
}

const container = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.05 } },
};
const item = {
  hidden:  { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function DocTypeChip({ docType }: { docType: string }) {
  if (docType === "meeting_summary") {
    return (
      <span className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-medium bg-[var(--color-brand)]/8 text-[var(--color-brand)]">
        <Mic size={8} />
        Meeting Summary
      </span>
    );
  }
  return (
    <span className="rounded px-1.5 py-0.5 text-[9px] font-medium bg-blue-50 text-blue-500">
      Doc
    </span>
  );
}

export function DocumentsPage() {
  const [docs, setDocs] = useState<Document[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/workspace/documents")
      .then((r) => r.json())
      .then((data) => setDocs(Array.isArray(data.documents) ? data.documents : []))
      .catch(() => setDocs([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = docs.filter(
    (d) =>
      d.title.toLowerCase().includes(search.toLowerCase()) ||
      (d.projectName ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <motion.div variants={container} initial="hidden" animate="visible" className="space-y-5 pb-10">

      {/* Toolbar */}
      <motion.div variants={item} className="flex items-center gap-3">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-[var(--border)] bg-white px-3.5 py-2.5 shadow-sm max-w-sm">
          <Search size={14} className="shrink-0 text-[var(--text-muted)]" />
          <input
            placeholder="Search documents…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-xs text-[var(--text-2)] placeholder:text-[var(--text-disabled)] outline-none"
          />
        </div>
      </motion.div>

      {/* Table */}
      <motion.div
        variants={item}
        className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-card"
      >
        {/* Header */}
        <div className="hidden sm:grid grid-cols-[2fr_1fr_1fr_40px] border-b border-[var(--border)] px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-disabled)]">
          <span>Document</span>
          <span>Project</span>
          <span>Created</span>
          <span />
        </div>

        {loading ? (
          <div className="px-5 py-10 text-center text-xs text-[var(--text-disabled)]">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-10 text-center text-xs text-[var(--text-disabled)]">
            {docs.length === 0 ? "No documents yet. Meeting summaries will appear here after a transcript is processed." : "No results."}
          </div>
        ) : (
          <ul role="list" className="divide-y divide-[var(--border)]">
            {filtered.map((doc) => (
              <motion.li
                key={doc.id}
                whileHover={{ backgroundColor: "rgba(139,92,246,0.02)" }}
                className="group flex flex-col gap-2 px-5 py-3.5 cursor-pointer sm:grid sm:grid-cols-[2fr_1fr_1fr_40px] sm:items-center"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-brand)]/8">
                    <FileText size={14} className="text-[var(--color-brand)]" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-[var(--text-1)]">{doc.title}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <DocTypeChip docType={doc.docType} />
                    </div>
                  </div>
                </div>
                <span className="hidden sm:block truncate text-xs text-[var(--text-muted)]">
                  {doc.projectName ?? "—"}
                </span>
                <span className="hidden sm:block text-xs text-[var(--text-disabled)]">
                  {formatDate(doc.createdAt)}
                </span>
                <div className="hidden sm:flex justify-end">
                  <button className="flex h-6 w-6 items-center justify-center rounded-lg text-[var(--text-disabled)] hover:bg-[var(--surface-2)] hover:text-[var(--text-2)] opacity-0 group-hover:opacity-100 transition-all">
                    <MoreHorizontal size={13} />
                  </button>
                </div>
              </motion.li>
            ))}
          </ul>
        )}
      </motion.div>
    </motion.div>
  );
}
