"use client";

import { Hash, Mail, Video, PenLine } from "lucide-react";

export type TaskSource = "slack" | "email" | "meeting" | "manual";

interface SourceConfig {
  label: string;
  icon: React.ReactNode;
  /** Tailwind classes for the full pill */
  pill: string;
  /** Tailwind classes for the icon-only dot */
  dot: string;
}

const SOURCE_CFG: Record<TaskSource, SourceConfig> = {
  slack: {
    label: "Slack",
    icon:  <Hash size={10} strokeWidth={2.5} />,
    pill:  "bg-violet-50 text-violet-600 border-violet-100",
    dot:   "bg-violet-100 text-violet-500",
  },
  email: {
    label: "Email",
    icon:  <Mail size={10} strokeWidth={2.5} />,
    pill:  "bg-sky-50 text-sky-600 border-sky-100",
    dot:   "bg-sky-100 text-sky-500",
  },
  meeting: {
    label: "Meeting",
    icon:  <Video size={10} strokeWidth={2.5} />,
    pill:  "bg-teal-50 text-teal-600 border-teal-100",
    dot:   "bg-teal-100 text-teal-500",
  },
  manual: {
    label: "Manual",
    icon:  <PenLine size={10} strokeWidth={2.5} />,
    pill:  "bg-[var(--surface-2)] text-[var(--text-muted)] border-[var(--border)]",
    dot:   "bg-[var(--surface-2)] text-[var(--text-disabled)]",
  },
};

/** Full pill — icon + label. Use in detail panels or lists with space. */
export function SourceBadge({ source }: { source: TaskSource }) {
  const cfg = SOURCE_CFG[source];
  return (
    <span
      className="inline-flex items-center gap-1 font-medium"
      style={{
        fontSize: 11,
        color: "#8b8fa8",
        background: "#fafaff",
        padding: "2px 7px",
        borderRadius: 4,
      }}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

/** Icon-only dot — use in compact rows (Gantt, tables). */
export function SourceDot({ source }: { source: TaskSource }) {
  const cfg = SOURCE_CFG[source];
  return (
    <span
      title={`Source: ${cfg.label}`}
      className={[
        "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-md",
        cfg.dot,
      ].join(" ")}
    >
      {cfg.icon}
    </span>
  );
}
