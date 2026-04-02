"use client";

import { motion } from "framer-motion";
import { Calendar, LogOut } from "lucide-react";

const EASE = [0.22, 1, 0.36, 1] as const;

/* ─── Types ──────────────────────────────────────────────────────────────── */

type Health = "on-track" | "at-risk" | "overdue" | "not-started";

interface Project {
  id: string;
  name: string;
  description: string;
  health: Health;
  progress: number;
  deadline: string;
  team: string[];
  lastUpdated: string;
}

/* ─── Mock data ──────────────────────────────────────────────────────────── */

const PROJECTS: Project[] = [
  {
    id: "alpha",
    name: "Alpha Launch",
    description: "Client-facing platform MVP — targeting Q2 go-live.",
    health: "on-track",
    progress: 72,
    deadline: "Apr 5",
    team: ["SR", "TK", "ME"],
    lastUpdated: "2h ago",
  },
  {
    id: "q3",
    name: "Q3 Programme",
    description: "Cross-functional delivery across 3 workstreams.",
    health: "at-risk",
    progress: 45,
    deadline: "Mar 28",
    team: ["LP", "SR", "AK"],
    lastUpdated: "20m ago",
  },
  {
    id: "vendor",
    name: "Vendor Onboarding",
    description: "Supply-chain vendor onboarding and integration.",
    health: "on-track",
    progress: 88,
    deadline: "Apr 12",
    team: ["AK", "JP"],
    lastUpdated: "1d ago",
  },
  {
    id: "platform",
    name: "Platform Migration",
    description: "Legacy infrastructure migration to cloud-native stack.",
    health: "overdue",
    progress: 31,
    deadline: "Mar 20",
    team: ["ME", "TK", "LP"],
    lastUpdated: "5m ago",
  },
  {
    id: "analytics",
    name: "Data Analytics Setup",
    description: "Internal BI tooling and data warehouse implementation.",
    health: "not-started",
    progress: 0,
    deadline: "May 30",
    team: ["JP", "AK"],
    lastUpdated: "3d ago",
  },
];

/* ─── Health config ──────────────────────────────────────────────────────── */

const HEALTH_CFG: Record<
  Health,
  { dot: string; bar: string; badge: string; label: string }
> = {
  "on-track": {
    dot: "bg-emerald-400",
    bar: "bg-emerald-400",
    badge: "bg-emerald-50 text-emerald-600 border-emerald-100",
    label: "On track",
  },
  "at-risk": {
    dot: "bg-amber-400",
    bar: "bg-amber-400",
    badge: "bg-amber-50 text-amber-600 border-amber-100",
    label: "At risk",
  },
  overdue: {
    dot: "bg-red-400",
    bar: "bg-red-400",
    badge: "bg-red-50 text-red-500 border-red-100",
    label: "Overdue",
  },
  "not-started": {
    dot: "bg-neutral-300",
    bar: "bg-neutral-300",
    badge: "bg-neutral-100 text-neutral-500 border-neutral-200",
    label: "Not started",
  },
};

/* ─── Animation variants ─────────────────────────────────────────────────── */

const container = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.055, delayChildren: 0.08 },
  },
};

const cardItem = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE } },
};

/* ─── Avatar bubble ──────────────────────────────────────────────────────── */

function Avatar({ initials, size = "sm" }: { initials: string; size?: "sm" | "md" }) {
  const dim = size === "md" ? "h-7 w-7 text-[10px]" : "h-5 w-5 text-[8px]";
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] font-bold text-[var(--color-muted)] ring-1 ring-white ${dim}`}
    >
      {initials}
    </span>
  );
}

/* ─── Project card ───────────────────────────────────────────────────────── */

function ProjectCard({
  project,
  onSelect,
}: {
  project: Project;
  onSelect: () => void;
}) {
  const cfg = HEALTH_CFG[project.health];

  return (
    <motion.button
      variants={cardItem}
      onClick={onSelect}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.22, ease: EASE }}
      className="group w-full rounded-2xl border border-[var(--color-border)] bg-white p-5 text-left transition-colors duration-200 hover:border-[var(--color-brand)]/20 hover:shadow-sm"
    >
      {/* Top row */}
      <div className="mb-2 flex items-center gap-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${cfg.dot}`} />
        <span className="flex-1 truncate text-sm font-semibold text-neutral-900">
          {project.name}
        </span>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-medium ${cfg.badge}`}
        >
          {cfg.label}
        </span>
      </div>

      {/* Description */}
      <p className="mb-3.5 truncate text-xs text-neutral-400">
        {project.description}
      </p>

      {/* Progress bar */}
      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-neutral-100">
        <motion.div
          className="h-full rounded-full bg-neutral-900"
          initial={{ width: 0 }}
          animate={{ width: `${project.progress}%` }}
          transition={{ duration: 0.7, ease: EASE, delay: 0.15 }}
        />
      </div>

      {/* Bottom row */}
      <div className="flex items-center gap-2">
        {/* Deadline */}
        <span className="flex items-center gap-1 rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[10px] text-neutral-500">
          <Calendar size={9} />
          {project.deadline}
        </span>

        {/* Team avatars */}
        <div className="flex -space-x-1.5 ml-1">
          {project.team.map((initials) => (
            <Avatar key={initials} initials={initials} />
          ))}
        </div>

        {/* Progress % */}
        <span className="ml-auto text-xs font-bold text-neutral-900 tabular-nums">
          {project.progress}%
        </span>
      </div>
    </motion.button>
  );
}

/* ─── Props ──────────────────────────────────────────────────────────────── */

interface ProjectSelectionScreenProps {
  onSelectProject: (id: string, name: string) => void;
  onNewProject: () => void;
  /** When provided, overrides the built-in mock projects */
  externalProjects?: Project[];
}

/* ─── Screen ─────────────────────────────────────────────────────────────── */

export function ProjectSelectionScreen({
  onSelectProject,
  onNewProject,
  externalProjects,
}: ProjectSelectionScreenProps) {
  const projects = externalProjects ?? PROJECTS;
  const isEmpty = externalProjects !== undefined && externalProjects.length === 0;
  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-end px-6">
        {/* User avatar */}
        <div className="group relative">
          <button className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-900 text-[10px] font-bold text-white transition-colors hover:bg-neutral-700">
            A
          </button>
          {/* Sign-out tooltip */}
          <div className="pointer-events-none absolute right-0 top-full mt-2 flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-[11px] text-neutral-500 opacity-0 shadow-sm transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100">
            <LogOut size={11} />
            Sign out
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
        {/* Heading */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
            Your Projects
          </h1>
          <p className="mt-1.5 text-sm text-neutral-500">
            Select a project to get started.
          </p>
        </div>

        {/* Grid */}
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)]">
              <span className="text-2xl font-bold text-neutral-300">L</span>
            </div>
            <p className="text-base font-medium text-neutral-700">No projects yet</p>
            <p className="mt-1 text-sm text-neutral-400">Create your first project to get started.</p>
          </div>
        ) : (
          <motion.div
            variants={container}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-1 gap-4 sm:grid-cols-3"
          >
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onSelect={() => onSelectProject(project.id, project.name)}
              />
            ))}
          </motion.div>
        )}

        {/* New project button */}
        <div className="mt-8 flex justify-center">
          <motion.button
            onClick={onNewProject}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            transition={{ duration: 0.18, ease: EASE }}
            className="rounded-xl border border-[var(--color-border)] px-5 py-2.5 text-sm font-medium text-neutral-500 transition-colors hover:border-[var(--color-brand)]/40 hover:text-[var(--color-brand)]"
          >
            + New Project
          </motion.button>
        </div>
      </main>
    </div>
  );
}
