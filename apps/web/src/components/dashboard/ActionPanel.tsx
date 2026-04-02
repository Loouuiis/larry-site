"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Mail, Calendar, Zap, Bell, Check, ChevronRight, Sparkles } from "lucide-react";

const EASE = [0.22, 1, 0.36, 1] as const;

/* ─── Types ─────────────────────────────────────────────────────────────── */

type ActionType = "email" | "meeting" | "action";
type Resolution  = "approved" | "rejected";

interface ActionItem {
  id: string;
  type: ActionType;
  project: string;
  title: string;
  preview: string;
  meta: string;
  urgent?: boolean;
}

/* ─── Mock data ─────────────────────────────────────────────────────────── */

const INITIAL_ITEMS: ActionItem[] = [
  {
    id: "a1",
    type: "email",
    project: "Q3 Programme",
    title: "Q3 Programme — weekly update",
    preview: "Hi team, here's a summary of this week's progress across all workstreams. 3 actions remain overdue…",
    meta: "Draft ready · Sending to 6 recipients",
  },
  {
    id: "a2",
    type: "action",
    project: "Alpha Launch",
    title: "Escalate API sign-off delay to TK's manager",
    preview: "The API spec sign-off is now 2 days overdue and blocks the sprint start. Larry recommends escalating.",
    meta: "Risk: High · Deadline impact: Apr 5",
    urgent: true,
  },
  {
    id: "a3",
    type: "meeting",
    project: "Platform Migration",
    title: "Security remediation review",
    preview: "Proposed: Fri Mar 22, 2:00 – 3:00pm with ME, TK, LP to unblock the auth layer fix.",
    meta: "Calendar invite · 3 attendees",
  },
  {
    id: "a4",
    type: "email",
    project: "Alpha Launch",
    title: "Follow-up: API spec sign-off overdue",
    preview: "Hi TK, just following up on the API spec sign-off that was due yesterday. Could you confirm your ETA?",
    meta: "Draft ready · To: Tom K.",
    urgent: true,
  },
  {
    id: "a5",
    type: "meeting",
    project: "Q3 Programme",
    title: "Steering committee timeline update",
    preview: "Proposed: Mon Mar 25, 10:00am with LP, SR and 4 others to review the March 28 deadline risk.",
    meta: "Calendar invite · 6 attendees",
  },
  {
    id: "a6",
    type: "action",
    project: "Platform Migration",
    title: "Confirm 5-day delay notification to stakeholders",
    preview: "Larry wants to send a formal delay notice for Platform Migration based on the current security block.",
    meta: "Risk: Critical · Notifies 4 stakeholders",
    urgent: true,
  },
  {
    id: "a7",
    type: "email",
    project: "Vendor Onboarding",
    title: "Contract confirmation to AK",
    preview: "Hi AK, please find the vendor contract terms for your final review before we proceed to sign-off.",
    meta: "Draft ready · To: A. Khan",
  },
];

/* ─── Config ─────────────────────────────────────────────────────────────── */

const TYPE_CFG: Record<ActionType, {
  icon: React.ElementType;
  label: string;
  iconBg: string;
  iconColor: string;
}> = {
  email:   { icon: Mail,     label: "Email Draft",    iconBg: "bg-blue-50",             iconColor: "text-blue-500"             },
  meeting: { icon: Calendar, label: "Meeting Invite", iconBg: "bg-[var(--color-brand)]/8",         iconColor: "text-[var(--color-brand)]"            },
  action:  { icon: Zap,      label: "Action",         iconBg: "bg-amber-50",            iconColor: "text-amber-500"            },
};

const TABS = [
  { key: "all",     label: "All"      },
  { key: "email",   label: "Emails"   },
  { key: "meeting", label: "Meetings" },
  { key: "action",  label: "Actions"  },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/* ─── Single action item ─────────────────────────────────────────────────── */

function ActionCard({
  item,
  onResolve,
}: {
  item: ActionItem;
  onResolve: (id: string, res: Resolution) => void;
}) {
  const cfg = TYPE_CFG[item.type];
  const Icon = cfg.icon;
  const [resolving, setResolving] = useState<Resolution | null>(null);

  function resolve(res: Resolution) {
    setResolving(res);
    setTimeout(() => onResolve(item.id, res), 320);
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: resolving === "approved" ? 40 : -40, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.28, ease: EASE }}
      className={[
        "overflow-hidden rounded-xl border bg-white transition-colors",
        item.urgent
          ? "border-amber-100 shadow-[0_0_0_1px_rgba(251,191,36,0.1)]"
          : "border-[var(--border)]",
      ].join(" ")}
    >
      <div className="p-4">
        {/* Header row */}
        <div className="mb-2.5 flex items-start gap-3">
          {/* Icon */}
          <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${cfg.iconBg}`}>
            <Icon size={14} className={cfg.iconColor} />
          </span>

          <div className="min-w-0 flex-1">
            {/* Type + project */}
            <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
              <span className={`text-[10px] font-semibold uppercase tracking-widest ${cfg.iconColor}`}>
                {cfg.label}
              </span>
              <span className="text-[10px] text-[var(--text-disabled)]">·</span>
              <span className="text-[10px] text-[var(--text-disabled)]">{item.project}</span>
              {item.urgent && (
                <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold text-amber-500 border border-amber-100">
                  Urgent
                </span>
              )}
            </div>
            {/* Title */}
            <p className="text-xs font-semibold text-[var(--text-1)] leading-snug">{item.title}</p>
          </div>
        </div>

        {/* Preview */}
        <p className="mb-2.5 ml-11 line-clamp-2 text-[11px] leading-relaxed text-[var(--text-muted)]">
          {item.preview}
        </p>

        {/* Meta + buttons */}
        <div className="ml-11 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1 text-[10px] text-[var(--text-disabled)] min-w-0 truncate">
            <Bell size={9} className="shrink-0" />
            {item.meta}
          </span>

          <div className="flex shrink-0 items-center gap-1.5">
            <motion.button
              onClick={() => resolve("rejected")}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.95 }}
              transition={{ duration: 0.13 }}
              className="rounded-lg border border-[var(--border)] bg-white px-2.5 py-1.5 text-[10px] font-semibold text-[var(--text-muted)] hover:border-red-200 hover:bg-red-50 hover:text-red-500 transition-colors"
            >
              Reject
            </motion.button>
            <motion.button
              onClick={() => resolve("approved")}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.95 }}
              transition={{ duration: 0.13 }}
              className="flex items-center gap-1 rounded-lg bg-[var(--color-brand)] px-2.5 py-1.5 text-[10px] font-semibold text-white shadow-[0_2px_8px_rgba(139,92,246,0.25)] hover:bg-[var(--color-brand-dark)] transition-colors"
            >
              <Check size={10} strokeWidth={2.5} />
              Approve
            </motion.button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Empty state ────────────────────────────────────────────────────────── */

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: EASE }}
      className="flex flex-col items-center justify-center py-12 text-center"
    >
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50">
        <Check size={20} className="text-emerald-500" strokeWidth={2.5} />
      </div>
      <p className="text-sm font-semibold text-[var(--text-2)]">All caught up!</p>
      <p className="mt-1 text-xs text-[var(--text-disabled)]">No pending actions. Larry will notify you when something needs your input.</p>
    </motion.div>
  );
}

/* ─── Panel ──────────────────────────────────────────────────────────────── */

interface ActionPanelProps {
  onClose: () => void;
}

export function ActionPanel({ onClose }: ActionPanelProps) {
  const [items, setItems]     = useState<ActionItem[]>(INITIAL_ITEMS);
  const [tab, setTab]         = useState<TabKey>("all");
  const [justDone, setJustDone] = useState<Record<string, Resolution>>({});

  function resolve(id: string, res: Resolution) {
    setJustDone((p) => ({ ...p, [id]: res }));
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  function approveAll() {
    const visible = filtered.map((i) => i.id);
    setJustDone((p) => Object.fromEntries([...Object.entries(p), ...visible.map((id) => [id, "approved" as Resolution])]));
    setItems((prev) => prev.filter((i) => !visible.includes(i.id)));
  }

  const filtered = tab === "all" ? items : items.filter((i) => i.type === tab);
  const urgentCount = items.filter((i) => i.urgent).length;

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-40 bg-black/10 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Panel */}
      <motion.div
        initial={{ opacity: 0, y: -12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.98 }}
        transition={{ duration: 0.24, ease: EASE }}
        className="fixed right-4 top-[72px] z-50 flex w-[420px] max-w-[calc(100vw-2rem)] flex-col rounded-2xl border border-[var(--border)] bg-white shadow-card-xl"
        style={{ maxHeight: "calc(100vh - 90px)" }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-[var(--color-brand)] shadow-[0_2px_8px_rgba(139,92,246,0.3)]">
            <Zap size={13} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-[var(--text-1)]">
              Action Tab
            </p>
            <p className="text-[10px] text-[var(--text-disabled)] flex items-center gap-1">
              <Sparkles size={9} className="text-[var(--color-brand)]/60" />
              {items.length > 0
                ? `Larry flagged ${items.length} item${items.length !== 1 ? "s" : ""} for your review`
                : "All actions resolved"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {items.length > 0 && (
              <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[var(--color-brand)] px-1.5 text-[9px] font-bold text-white">
                {items.length}
              </span>
            )}
            {urgentCount > 0 && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-bold text-amber-500 border border-amber-100">
                {urgentCount} urgent
              </span>
            )}
            <button
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-disabled)] hover:bg-[var(--surface-2)] hover:text-[var(--text-2)] transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-[var(--border)] px-4 pt-2">
          {TABS.map(({ key, label }) => {
            const count = key === "all" ? items.length : items.filter((i) => i.type === key).length;
            const isActive = tab === key;
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={[
                  "relative flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-[11px] font-medium transition-colors",
                  isActive ? "text-[var(--color-brand)]" : "text-[var(--text-disabled)] hover:text-[var(--text-2)]",
                ].join(" ")}
              >
                {label}
                {count > 0 && (
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold tabular-nums ${isActive ? "bg-[var(--color-brand)]/10 text-[var(--color-brand)]" : "bg-[var(--surface-2)] text-[var(--text-disabled)]"}`}>
                    {count}
                  </span>
                )}
                {isActive && (
                  <motion.div
                    layoutId="action-tab-underline"
                    className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-[var(--color-brand)]"
                    transition={{ duration: 0.2, ease: EASE }}
                  />
                )}
              </button>
            );
          })}

          {/* Approve all */}
          {filtered.length > 1 && (
            <button
              onClick={approveAll}
              className="ml-auto mb-1.5 flex items-center gap-1 rounded-lg border border-emerald-100 bg-emerald-50 px-2.5 py-1.5 text-[10px] font-semibold text-emerald-600 hover:bg-emerald-100 transition-colors"
            >
              <Check size={10} strokeWidth={2.5} />
              Approve all
            </button>
          )}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {filtered.length === 0 ? (
            <EmptyState />
          ) : (
            <motion.div layout className="space-y-2.5">
              <AnimatePresence mode="popLayout" initial={false}>
                {filtered.map((item) => (
                  <ActionCard key={item.id} item={item} onResolve={resolve} />
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="flex items-center justify-between border-t border-[var(--border)] px-5 py-3">
            <p className="text-[10px] text-[var(--text-disabled)]">
              Larry auto-drafts these — review before approving
            </p>
            <button className="flex items-center gap-1 text-[10px] font-medium text-[var(--color-brand)] hover:underline">
              View history <ChevronRight size={10} />
            </button>
          </div>
        )}
      </motion.div>
    </>
  );
}
