"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, ChevronDown, ChevronsUpDown, Check,
} from "lucide-react";
import {
  EASE, ZOOM_LABELS,
  type ZoomLevel, type GroupBy, type ColourBy,
} from "./timeline-utils";

/* ─── Dropdown ─────────────────────────────────────────────────────── */

function Dropdown<T extends string>({
  value, options, onChange, label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value)!;

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[var(--text-2)] hover:border-[var(--border-2)] transition-colors"
      >
        <span className="text-[var(--text-disabled)] mr-0.5">{label}:</span>
        {current.label}
        <ChevronDown
          size={11}
          className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.14, ease: EASE }}
            className="absolute left-0 top-full z-50 mt-1 min-w-[140px] overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-[var(--shadow-2)]"
          >
            {options.map((opt) => (
              <li key={opt.value}>
                <button
                  onClick={() => { onChange(opt.value); setOpen(false); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-[11px] font-medium text-[var(--text-2)] hover:bg-[var(--surface-2)] transition-colors"
                >
                  {opt.label}
                  {opt.value === value && <Check size={11} className="ml-auto text-[var(--brand)]" />}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Toolbar ──────────────────────────────────────────────────────── */

interface TimelineToolbarProps {
  zoom: ZoomLevel;
  groupBy: GroupBy;
  colourBy: ColourBy;
  searchQuery: string;
  allCollapsed: boolean;
  onZoomChange: (z: ZoomLevel) => void;
  onGroupByChange: (g: GroupBy) => void;
  onColourByChange: (c: ColourBy) => void;
  onSearchChange: (q: string) => void;
  onToggleCollapseAll: () => void;
  onJumpToToday: () => void;
}

const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: "phase", label: "Phase" },
  { value: "assignee", label: "Assignee" },
  { value: "status", label: "Status" },
];

const COLOUR_OPTIONS: { value: ColourBy; label: string }[] = [
  { value: "status", label: "Status" },
  { value: "assignee", label: "Assignee" },
  { value: "priority", label: "Priority" },
];

export function TimelineToolbar({
  zoom, groupBy, colourBy, searchQuery, allCollapsed,
  onZoomChange, onGroupByChange, onColourByChange,
  onSearchChange, onToggleCollapseAll, onJumpToToday,
}: TimelineToolbarProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap mb-3">
      {/* Zoom buttons */}
      <div className="flex items-center rounded-lg border border-[var(--border)] overflow-hidden">
        {(["week", "month", "quarter"] as ZoomLevel[]).map((z) => (
          <button
            key={z}
            onClick={() => onZoomChange(z)}
            className={[
              "px-2.5 py-1.5 text-[11px] font-semibold transition-colors",
              zoom === z
                ? "bg-[var(--brand)] text-white"
                : "bg-white text-[var(--text-2)] hover:bg-[var(--surface-2)]",
            ].join(" ")}
          >
            {ZOOM_LABELS[z]}
          </button>
        ))}
      </div>

      {/* Today button */}
      <button
        onClick={onJumpToToday}
        className="flex items-center gap-1.5 rounded-lg border border-[var(--brand)]/20 bg-[var(--brand)]/5 px-2.5 py-1.5 text-[11px] font-medium text-[var(--brand)] hover:bg-[var(--brand)]/10 transition-colors"
      >
        Today
      </button>

      {/* Group by dropdown */}
      <Dropdown
        value={groupBy}
        options={GROUP_OPTIONS}
        onChange={onGroupByChange}
        label="Group"
      />

      {/* Colour by dropdown */}
      <Dropdown
        value={colourBy}
        options={COLOUR_OPTIONS}
        onChange={onColourByChange}
        label="Colour"
      />

      {/* Search */}
      <div className="relative ml-auto">
        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-disabled)]" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search tasks..."
          className="w-[160px] rounded-lg border border-[var(--border)] bg-white py-1.5 pl-7 pr-2.5 text-[11px] text-[var(--text-2)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[var(--brand)]/40 focus:ring-2 focus:ring-[var(--brand)]/10 transition-all"
        />
      </div>

      {/* Collapse all */}
      <button
        onClick={onToggleCollapseAll}
        className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[var(--text-2)] hover:bg-[var(--surface-2)] transition-colors"
      >
        <ChevronsUpDown size={12} />
        {allCollapsed ? "Expand all" : "Collapse all"}
      </button>
    </div>
  );
}
