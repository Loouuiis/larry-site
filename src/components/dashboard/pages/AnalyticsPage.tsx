"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  ResponsiveContainer,
  PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend,
} from "recharts";
import {
  TrendingUp, CheckCircle2, AlertTriangle, Circle,
  FileText, Presentation, Download, ChevronDown,
  Sparkles, RefreshCw,
} from "lucide-react";

const EASE = [0.22, 1, 0.36, 1] as const;

/* ─── Colours (hex for SVG fills) ──────────────────────────────────────── */

const C = {
  completed:  "#34d399",
  onTrack:    "#8b5cf6",
  atRisk:     "#fbbf24",
  notStarted: "#d1d5db",
};

/* ─── Mock data ─────────────────────────────────────────────────────────── */

const DONUT_DATA = [
  { name: "Completed",   value: 28, color: C.completed  },
  { name: "On track",    value: 18, color: C.onTrack    },
  { name: "At risk",     value:  9, color: C.atRisk     },
  { name: "Not started", value:  5, color: C.notStarted },
];
const TOTAL_TASKS  = DONUT_DATA.reduce((s, d) => s + d.value, 0);
const COMPLETE_PCT = Math.round((28 / TOTAL_TASKS) * 100);

const WORKAREA_DATA = [
  { area: "Engineering", Completed: 12, "On track": 8,  "At risk": 3, "Not started": 2 },
  { area: "Design",      Completed:  8, "On track": 4,  "At risk": 2, "Not started": 1 },
  { area: "QA",          Completed:  5, "On track": 4,  "At risk": 3, "Not started": 2 },
  { area: "Delivery",    Completed:  3, "On track": 2,  "At risk": 1, "Not started": 0 },
];

const ASSIGNEE_DATA = [
  { name: "Sarah R.",  Completed:  8, "On track": 4, "At risk": 2, "Not started": 1 },
  { name: "Tom K.",    Completed:  7, "On track": 6, "At risk": 3, "Not started": 1 },
  { name: "M. Evans",  Completed:  6, "On track": 4, "At risk": 2, "Not started": 1 },
  { name: "L. Park",   Completed:  4, "On track": 2, "At risk": 1, "Not started": 2 },
  { name: "A. Khan",   Completed:  3, "On track": 2, "At risk": 1, "Not started": 0 },
];

const STATS = [
  { label: "Total Tasks",  value: String(TOTAL_TASKS), icon: Circle,       color: "text-neutral-500", bg: "bg-neutral-100" },
  { label: "Completed",    value: "28",                icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-50"  },
  { label: "At Risk",      value: "9",                 icon: AlertTriangle, color: "text-amber-500",  bg: "bg-amber-50"   },
  { label: "On Time %",    value: `${COMPLETE_PCT}%`,  icon: TrendingUp,   color: "text-[var(--color-brand)]",  bg: "bg-[var(--color-brand)]/8"  },
];

/* ─── Animation variants ────────────────────────────────────────────────── */

const container = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } },
};
const item = {
  hidden:  { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

/* ─── Custom tooltip ────────────────────────────────────────────────────── */

function ChartTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + p.value, 0);
  return (
    <div className="rounded-xl border border-neutral-100 bg-white px-3.5 py-3 shadow-card-xl text-xs min-w-[140px]">
      {label && <p className="mb-2 font-semibold text-neutral-700">{label}</p>}
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-neutral-500">
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: p.color }} />
            {p.name}
          </span>
          <span className="font-medium text-neutral-800 tabular-nums">{p.value}</span>
        </div>
      ))}
      {payload.length > 1 && (
        <div className="mt-2 flex items-center justify-between border-t border-neutral-100 pt-2">
          <span className="text-neutral-400">Total</span>
          <span className="font-bold text-neutral-800 tabular-nums">{total}</span>
        </div>
      )}
    </div>
  );
}

/* ─── Legend pill ───────────────────────────────────────────────────────── */

function LegendPills() {
  return (
    <div className="flex flex-wrap gap-3">
      {[
        { label: "Completed",   color: C.completed  },
        { label: "On track",    color: C.onTrack    },
        { label: "At risk",     color: C.atRisk     },
        { label: "Not started", color: C.notStarted },
      ].map(({ label, color }) => (
        <span key={label} className="flex items-center gap-1.5 text-[11px] text-neutral-500">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
          {label}
        </span>
      ))}
    </div>
  );
}

/* ─── Chart card ────────────────────────────────────────────────────────── */

function ChartCard({ title, subtitle, children }: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div variants={item} className="rounded-2xl border border-neutral-100 bg-white p-5 shadow-card">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-neutral-800">
          {title}
        </h3>
        {subtitle && <p className="mt-0.5 text-[11px] text-neutral-400">{subtitle}</p>}
      </div>
      {children}
    </motion.div>
  );
}

/* ─── Donut chart card ──────────────────────────────────────────────────── */

function DonutCard() {
  return (
    <ChartCard title="Task Status Distribution" subtitle={`${TOTAL_TASKS} total tasks across all workstreams`}>
      <div className="flex flex-col items-center gap-6 sm:flex-row">
        {/* Chart */}
        <div className="relative shrink-0">
          <PieChart width={180} height={180}>
            <Pie
              data={DONUT_DATA}
              cx={90} cy={90}
              innerRadius={56}
              outerRadius={80}
              paddingAngle={3}
              dataKey="value"
              strokeWidth={0}
            >
              {DONUT_DATA.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
          {/* Centre label */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-neutral-900 leading-none">{COMPLETE_PCT}%</span>
            <span className="mt-0.5 text-[10px] font-medium text-neutral-400">Complete</span>
          </div>
        </div>

        {/* Breakdown list */}
        <div className="flex-1 space-y-3 w-full">
          {DONUT_DATA.map(({ name, value, color }) => {
            const pct = Math.round((value / TOTAL_TASKS) * 100);
            return (
              <div key={name}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs text-neutral-600">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                    {name}
                  </span>
                  <span className="text-xs font-semibold text-neutral-700 tabular-nums">{value} <span className="font-normal text-neutral-400">({pct}%)</span></span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.9, ease: EASE }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </ChartCard>
  );
}

/* ─── Stacked bar charts ────────────────────────────────────────────────── */

function WorkAreaChart() {
  return (
    <ChartCard title="Tasks by Work Area" subtitle="Breakdown of task status across each workstream">
      <LegendPills />
      <div className="mt-4 h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={WORKAREA_DATA} barSize={32} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
            <XAxis dataKey="area" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(139,92,246,0.04)" }} />
            <Bar dataKey="Completed"   stackId="a" fill={C.completed}  radius={[0,0,0,0]} />
            <Bar dataKey="On track"    stackId="a" fill={C.onTrack}    radius={[0,0,0,0]} />
            <Bar dataKey="At risk"     stackId="a" fill={C.atRisk}     radius={[0,0,0,0]} />
            <Bar dataKey="Not started" stackId="a" fill={C.notStarted} radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

function AssigneeChart() {
  return (
    <ChartCard title="Tasks by Assignee" subtitle="Individual workload and status distribution">
      <LegendPills />
      <div className="mt-4 h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={ASSIGNEE_DATA} barSize={28} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(139,92,246,0.04)" }} />
            <Bar dataKey="Completed"   stackId="a" fill={C.completed}  radius={[0,0,0,0]} />
            <Bar dataKey="On track"    stackId="a" fill={C.onTrack}    radius={[0,0,0,0]} />
            <Bar dataKey="At risk"     stackId="a" fill={C.atRisk}     radius={[0,0,0,0]} />
            <Bar dataKey="Not started" stackId="a" fill={C.notStarted} radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

/* ─── Generate Report card ──────────────────────────────────────────────── */

function GenerateReportCard() {
  const [generating, setGenerating] = useState<"pdf" | "ppt" | null>(null);

  function handleExport(type: "pdf" | "ppt") {
    setGenerating(type);
    setTimeout(() => setGenerating(null), 2000);
  }

  return (
    <motion.div variants={item} className="rounded-2xl border border-[var(--color-brand)]/12 bg-gradient-to-br from-[var(--color-brand)]/5 via-white to-[var(--color-accent-blue)]/5 p-6 shadow-card">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        {/* Left copy */}
        <div className="flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--color-brand)] text-[9px] font-bold text-white">L</span>
            <h3 className="text-sm font-semibold text-neutral-800">
              Generate Report
            </h3>
          </div>
          <p className="text-xs leading-relaxed text-neutral-500 max-w-sm">
            Export a formatted summary of this project&apos;s current status, tasks, risks, and progress — ready to share with stakeholders.
          </p>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-neutral-400">
            <Sparkles size={11} className="text-[var(--color-brand)]/60" />
            Last generated: <span className="font-medium text-neutral-500">Mar 20, 2026 at 09:14am</span>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex flex-wrap gap-2.5 shrink-0">
          <motion.button
            onClick={() => handleExport("pdf")}
            whileHover={{ scale: 1.02, y: -1 }}
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.16, ease: EASE }}
            disabled={!!generating}
            className="flex items-center gap-2 rounded-xl bg-[var(--color-brand)] px-4 py-2.5 text-xs font-semibold text-white shadow-[0_3px_12px_rgba(139,92,246,0.3)] hover:bg-[var(--color-brand-dark)] transition-colors disabled:opacity-60"
          >
            {generating === "pdf" ? (
              <RefreshCw size={13} className="animate-spin" />
            ) : (
              <FileText size={13} />
            )}
            {generating === "pdf" ? "Generating…" : "Export as PDF"}
          </motion.button>

          <motion.button
            onClick={() => handleExport("ppt")}
            whileHover={{ scale: 1.02, y: -1 }}
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.16, ease: EASE }}
            disabled={!!generating}
            className="flex items-center gap-2 rounded-xl border border-[var(--color-brand)]/25 bg-white px-4 py-2.5 text-xs font-semibold text-[var(--color-brand)] hover:border-[var(--color-brand)]/50 hover:bg-[var(--color-brand)]/5 transition-colors disabled:opacity-60"
          >
            {generating === "ppt" ? (
              <RefreshCw size={13} className="animate-spin" />
            ) : (
              <Presentation size={13} />
            )}
            {generating === "ppt" ? "Generating…" : "Export as PPT"}
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.16, ease: EASE }}
            className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-xs font-medium text-neutral-500 hover:border-neutral-300 hover:text-neutral-700 transition-colors"
          >
            <Download size={13} />
            Raw CSV
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Project selector ──────────────────────────────────────────────────── */

const PROJECTS = ["Alpha Launch", "Q3 Programme", "Vendor Onboarding", "Platform Migration"];

function ProjectSelector() {
  const [selected, setSelected] = useState(PROJECTS[0]);
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3.5 py-2 text-xs font-medium text-neutral-700 shadow-sm hover:border-neutral-300 transition-colors"
      >
        <span className="flex h-4 w-4 items-center justify-center rounded bg-[var(--color-brand)] text-[7px] font-bold text-white">L</span>
        {selected}
        <ChevronDown size={12} className={`ml-1 text-neutral-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-xl border border-neutral-100 bg-white shadow-card-xl">
          {PROJECTS.map((p) => (
            <button
              key={p}
              onClick={() => { setSelected(p); setOpen(false); }}
              className={`flex w-full items-center gap-2 px-3.5 py-2 text-xs transition-colors ${p === selected ? "bg-[var(--color-brand)]/5 font-semibold text-[var(--color-brand)]" : "text-neutral-600 hover:bg-neutral-50"}`}
            >
              {p === selected && <span className="h-1 w-1 rounded-full bg-[var(--color-brand)]" />}
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Page ──────────────────────────────────────────────────────────────── */

export function AnalyticsPage() {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="visible"
      className="space-y-5 pb-10"
    >
      {/* Page header */}
      <motion.div variants={item} className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-neutral-800">
            Dashboard &amp; Results
          </h2>
          <p className="text-[11px] text-neutral-400">Mar 1 – Apr 30, 2026</p>
        </div>
        <div className="flex items-center gap-2">
          <ProjectSelector />
          <button className="flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-[11px] font-medium text-neutral-500 shadow-sm hover:border-neutral-300 transition-colors">
            <RefreshCw size={11} />
            Refresh
          </button>
        </div>
      </motion.div>

      {/* KPI cards */}
      <motion.div variants={item} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {STATS.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="rounded-2xl border border-neutral-100 bg-white p-4 sm:p-5 shadow-card">
            <div className={`mb-3 flex h-8 w-8 items-center justify-center rounded-xl ${bg}`}>
              <Icon size={15} className={color} />
            </div>
            <p className="text-2xl font-bold text-neutral-900 leading-none tracking-tight">{value}</p>
            <p className="mt-1.5 text-xs text-neutral-500">{label}</p>
          </div>
        ))}
      </motion.div>

      {/* Donut + Work Area side by side */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[380px_1fr]">
        <DonutCard />
        <WorkAreaChart />
      </div>

      {/* Assignee chart */}
      <AssigneeChart />

      {/* Generate Report */}
      <GenerateReportCard />
    </motion.div>
  );
}
