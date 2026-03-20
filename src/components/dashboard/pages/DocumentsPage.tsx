"use client";

import { motion } from "framer-motion";
import { FileText, FileSpreadsheet, Presentation, MoreHorizontal, Search, Plus } from "lucide-react";

const EASE = [0.22, 1, 0.36, 1] as const;

const DOCS = [
  { id: 1, title: "Q3 Programme — Project Charter",        type: "doc",   project: "Q3 Programme",       edited: "Today, 9:14am",  author: "SR", size: "48 KB"  },
  { id: 2, title: "Alpha Launch — Technical Spec v2",      type: "sheet", project: "Alpha Launch",       edited: "Yesterday",      author: "TK", size: "124 KB" },
  { id: 3, title: "Vendor Onboarding — Contract Draft",    type: "doc",   project: "Vendor Onboarding",  edited: "Mar 19",         author: "AK", size: "32 KB"  },
  { id: 4, title: "Platform Migration — Architecture Deck",type: "slide", project: "Platform Migration", edited: "Mar 18",         author: "ME", size: "2.1 MB" },
  { id: 5, title: "Q3 Weekly Standup — Mar 17",            type: "doc",   project: "Q3 Programme",       edited: "Mar 17",         author: "LP", size: "18 KB"  },
  { id: 6, title: "Alpha Launch — Budget Tracker",         type: "sheet", project: "Alpha Launch",       edited: "Mar 15",         author: "JP", size: "88 KB"  },
  { id: 7, title: "Vendor Risk Assessment",                type: "doc",   project: "Vendor Onboarding",  edited: "Mar 14",         author: "AK", size: "41 KB"  },
  { id: 8, title: "Platform Migration — Sprint 4 Review",  type: "slide", project: "Platform Migration", edited: "Mar 12",         author: "ME", size: "1.4 MB" },
];

const TYPE_CONFIG: Record<string, { icon: React.ElementType; bg: string; color: string; label: string }> = {
  doc:   { icon: FileText,        bg: "bg-blue-50",                          color: "text-blue-500",              label: "Doc"   },
  sheet: { icon: FileSpreadsheet, bg: "bg-emerald-50",                       color: "text-emerald-500",           label: "Sheet" },
  slide: { icon: Presentation,    bg: "bg-[var(--color-brand)]/8",           color: "text-[var(--color-brand)]",  label: "Deck"  },
};

const container = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.05 } },
};
const item = {
  hidden:  { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
};

export function DocumentsPage() {
  return (
    <motion.div variants={container} initial="hidden" animate="visible" className="space-y-5 pb-10">

      {/* Toolbar */}
      <motion.div variants={item} className="flex items-center gap-3">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 shadow-sm max-w-sm">
          <Search size={14} className="shrink-0 text-neutral-400" />
          <input
            placeholder="Search documents…"
            className="flex-1 bg-transparent text-xs text-neutral-700 placeholder:text-neutral-400 outline-none"
          />
        </div>
        <button className="flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-xs font-medium text-neutral-600 shadow-sm hover:border-[var(--color-brand)]/40 hover:text-[var(--color-brand)] transition-colors">
          <Plus size={13} />
          New Doc
        </button>
      </motion.div>

      {/* Table */}
      <motion.div
        variants={item}
        className="overflow-hidden rounded-2xl border border-neutral-100 bg-white"
        style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
      >
        {/* Header */}
        <div className="hidden sm:grid grid-cols-[2fr_1fr_1fr_80px_40px] border-b border-neutral-100 px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
          <span>Document</span>
          <span>Project</span>
          <span>Last edited</span>
          <span className="text-right">Size</span>
          <span />
        </div>

        <ul role="list" className="divide-y divide-neutral-50">
          {DOCS.map(({ id, title, type, project, edited, author, size }) => {
            const tc = TYPE_CONFIG[type];
            const Icon = tc.icon;
            return (
              <motion.li
                key={id}
                whileHover={{ backgroundColor: "rgba(139,92,246,0.02)" }}
                className="group flex flex-col gap-2 px-5 py-3.5 cursor-pointer sm:grid sm:grid-cols-[2fr_1fr_1fr_80px_40px] sm:items-center"
              >
                {/* Title + icon */}
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tc.bg}`}>
                    <Icon size={14} className={tc.color} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-neutral-800">{title}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${tc.bg} ${tc.color}`}>
                        {tc.label}
                      </span>
                      <span className="text-[10px] text-neutral-400">by {author}</span>
                    </div>
                  </div>
                </div>
                <span className="hidden sm:block truncate text-xs text-neutral-500">{project}</span>
                <span className="hidden sm:block text-xs text-neutral-400">{edited}</span>
                <span className="hidden sm:block text-right text-xs text-neutral-400">{size}</span>
                <div className="hidden sm:flex justify-end">
                  <button className="flex h-6 w-6 items-center justify-center rounded-lg text-neutral-300 hover:bg-neutral-100 hover:text-neutral-600 opacity-0 group-hover:opacity-100 transition-all">
                    <MoreHorizontal size={13} />
                  </button>
                </div>
              </motion.li>
            );
          })}
        </ul>
      </motion.div>
    </motion.div>
  );
}
