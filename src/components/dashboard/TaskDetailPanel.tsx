"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, ChevronDown, Calendar, User, Paperclip,
  Send, Smile, MoreHorizontal, Check,
} from "lucide-react";

const EASE = [0.22, 1, 0.36, 1] as const;

/* ─── Types ─────────────────────────────────────────────────────────────── */

export type TaskStatus   = "done" | "on-track" | "at-risk" | "overdue" | "upcoming";
export type TaskPriority = "critical" | "high" | "medium" | "low";

export interface TaskPanelData {
  id: string;
  name: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee: string;
  assigneeFull: string;
  project: string;
  deadline: string;
  progress: number;
  subtasks?: { name: string; status: TaskStatus; progress: number }[];
}

interface Comment {
  id: string;
  initials: string;
  name: string;
  time: string;
  text: string;
}

/* ─── Mock comments per task ─────────────────────────────────────────────── */

const MOCK_COMMENTS: Record<string, Comment[]> = {
  t3a2: [
    { id: "c1", initials: "TK", name: "Tom K.",   time: "2h ago",  text: "The spec is 95% done — just finalising the auth error handling section. Should be ready to share by EOD." },
    { id: "c2", initials: "SR", name: "Sarah R.", time: "1h ago",  text: "Client is asking for an ETA. Can we confirm sign-off by tomorrow morning latest?" },
    { id: "c3", initials: "ME", name: "M. Evans", time: "30m ago", text: "Flagged as a blocker in today's standup. Larry has sent a follow-up to TK." },
  ],
  t3a: [
    { id: "c1", initials: "TK", name: "Tom K.",   time: "3h ago",  text: "Auth endpoints are done and tested. Moving on to integration endpoints next." },
    { id: "c2", initials: "ME", name: "M. Evans", time: "1h ago",  text: "Great progress. Keep an eye on the rate-limiting logic — we had issues in the last project." },
  ],
  default: [
    { id: "c1", initials: "SR", name: "Sarah R.", time: "1d ago",  text: "Kicked off this task. Initial plan looks good, no blockers yet." },
    { id: "c2", initials: "LP", name: "L. Park",  time: "4h ago",  text: "Reviewed and aligned with the approach. Let me know if you need anything." },
  ],
};

/* ─── Config maps ───────────────────────────────────────────────────────── */

const STATUS_OPTIONS: { value: TaskStatus; label: string; dot: string; badge: string }[] = [
  { value: "done",      label: "Done",       dot: "bg-emerald-400", badge: "bg-emerald-50 text-emerald-600 border-emerald-100"   },
  { value: "on-track",  label: "On track",   dot: "bg-[var(--color-brand)]", badge: "bg-[var(--color-brand)]/8 text-[var(--color-brand)] border-[var(--color-brand)]/20" },
  { value: "at-risk",   label: "At risk",    dot: "bg-amber-400",   badge: "bg-amber-50 text-amber-600 border-amber-100"         },
  { value: "overdue",   label: "Overdue",    dot: "bg-red-400",     badge: "bg-red-50 text-red-500 border-red-100"               },
  { value: "upcoming",  label: "Upcoming",   dot: "bg-neutral-300", badge: "bg-neutral-100 text-neutral-500 border-neutral-200"  },
];

const PRIORITY_OPTIONS: { value: TaskPriority; label: string; color: string; dot: string }[] = [
  { value: "critical", label: "Critical", color: "text-red-500",     dot: "bg-red-400"     },
  { value: "high",     label: "High",     color: "text-orange-500",  dot: "bg-orange-400"  },
  { value: "medium",   label: "Medium",   color: "text-amber-500",   dot: "bg-amber-400"   },
  { value: "low",      label: "Low",      color: "text-neutral-400", dot: "bg-neutral-300" },
];

/* ─── Section heading ───────────────────────────────────────────────────── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
      {children}
    </p>
  );
}

/* ─── Status dropdown ───────────────────────────────────────────────────── */

function StatusDropdown({
  value, onChange,
}: { value: TaskStatus; onChange: (v: TaskStatus) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = STATUS_OPTIONS.find((s) => s.value === value)!;

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
        className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-medium transition-colors hover:border-neutral-200 ${current.badge}`}
      >
        <span className={`h-2 w-2 rounded-full shrink-0 ${current.dot}`} />
        {current.label}
        <ChevronDown
          size={12}
          className={`ml-auto transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.16, ease: EASE }}
            className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-neutral-100 bg-white shadow-card-xl"
          >
            {STATUS_OPTIONS.map((opt) => (
              <li key={opt.value}>
                <button
                  onClick={() => { onChange(opt.value); setOpen(false); }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
                >
                  <span className={`h-2 w-2 rounded-full ${opt.dot}`} />
                  {opt.label}
                  {opt.value === value && <Check size={11} className="ml-auto text-[var(--color-brand)]" />}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Priority pills ─────────────────────────────────────────────────────── */

function PrioritySelector({
  value, onChange,
}: { value: TaskPriority; onChange: (v: TaskPriority) => void }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {PRIORITY_OPTIONS.map((opt) => {
        const isActive = opt.value === value;
        return (
          <motion.button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            whileTap={{ scale: 0.95 }}
            transition={{ duration: 0.14 }}
            className={[
              "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium transition-all duration-150",
              isActive
                ? `${opt.color} border-current bg-current/8`
                : "border-neutral-200 text-neutral-400 hover:border-neutral-300",
            ].join(" ")}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${isActive ? opt.dot : "bg-neutral-300"}`} />
            {opt.label}
          </motion.button>
        );
      })}
    </div>
  );
}

/* ─── Progress control ───────────────────────────────────────────────────── */

function ProgressControl({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const step = (dir: 1 | -1) => onChange(Math.min(100, Math.max(0, value + dir * 5)));
  const statusColor =
    value === 100 ? "bg-emerald-400"
    : value >= 60  ? "bg-[var(--color-brand)]"
    : value >= 30  ? "bg-amber-400"
    : "bg-red-400";

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-neutral-900">{value}%</span>
        <div className="flex items-center gap-1">
          <button onClick={() => step(-1)} className="flex h-6 w-6 items-center justify-center rounded-lg border border-neutral-200 text-xs text-neutral-500 hover:bg-neutral-50 hover:border-neutral-300 transition-colors font-medium leading-none">−</button>
          <button onClick={() => step(1)}  className="flex h-6 w-6 items-center justify-center rounded-lg border border-neutral-200 text-xs text-neutral-500 hover:bg-neutral-50 hover:border-neutral-300 transition-colors font-medium leading-none">+</button>
        </div>
      </div>
      <div className="relative h-2.5 overflow-hidden rounded-full bg-neutral-100 cursor-pointer"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const pct = Math.round(((e.clientX - rect.left) / rect.width) * 100 / 5) * 5;
          onChange(Math.min(100, Math.max(0, pct)));
        }}
      >
        <motion.div
          className={`h-full rounded-full ${statusColor}`}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.35, ease: EASE }}
        />
        {/* Thumb */}
        <motion.div
          className="absolute top-1/2 -translate-y-1/2 h-4 w-4 rounded-full border-2 border-white bg-white shadow-md ring-1 ring-neutral-200"
          animate={{ left: `calc(${value}% - 8px)` }}
          transition={{ duration: 0.35, ease: EASE }}
        />
      </div>
    </div>
  );
}

/* ─── Comment item ───────────────────────────────────────────────────────── */

function CommentItem({ comment }: { comment: Comment }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: EASE }}
      className="flex gap-3"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand)]/10 text-[9px] font-bold text-[var(--color-brand)] mt-0.5">
        {comment.initials}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-xs font-semibold text-neutral-800">{comment.name}</span>
          <span className="text-[10px] text-neutral-400">{comment.time}</span>
        </div>
        <p className="text-xs leading-relaxed text-neutral-600 bg-neutral-50 rounded-xl rounded-tl-sm px-3 py-2.5 border border-neutral-100">
          {comment.text}
        </p>
      </div>
    </motion.div>
  );
}

/* ─── Main panel ─────────────────────────────────────────────────────────── */

interface TaskDetailPanelProps {
  task: TaskPanelData;
  onClose: () => void;
}

const panelVariants = {
  hidden: { x: "100%", opacity: 0 },
  visible: { x: 0, opacity: 1, transition: { duration: 0.3, ease: EASE } },
  exit:   { x: "100%", opacity: 0, transition: { duration: 0.24, ease: EASE } },
};

const sectionVariants = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.055, delayChildren: 0.12 } },
};
const sectionItem = {
  hidden:  { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: EASE } },
};

export function TaskDetailPanel({ task, onClose }: TaskDetailPanelProps) {
  const [status,   setStatus]   = useState<TaskStatus>(task.status);
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [progress, setProgress] = useState(task.progress);
  const [comment,  setComment]  = useState("");
  const [comments, setComments] = useState<Comment[]>(
    MOCK_COMMENTS[task.id] ?? MOCK_COMMENTS.default
  );

  const currentStatus = STATUS_OPTIONS.find((s) => s.value === status)!;

  function submitComment() {
    const trimmed = comment.trim();
    if (!trimmed) return;
    setComments((prev) => [
      ...prev,
      { id: `c${Date.now()}`, initials: "ME", name: "You", time: "just now", text: trimmed },
    ]);
    setComment("");
  }

  return (
    <motion.div
      variants={panelVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="flex h-full w-[360px] shrink-0 flex-col border-l border-neutral-100 bg-white"
    >
      {/* ── Header ── */}
      <div className="flex items-start gap-3 border-b border-neutral-100 px-5 py-4">
        <div className="flex-1 min-w-0">
          {/* Project breadcrumb */}
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-brand)]">
            {task.project}
          </p>
          {/* Title — looks editable */}
          <h2
            className="text-sm font-bold text-neutral-900 leading-snug outline-none rounded focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/30 cursor-text"
            style={{ letterSpacing: "-0.02em" }}
            contentEditable
            suppressContentEditableWarning
          >
            {task.name}
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-1 mt-0.5">
          <button className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-300 hover:bg-neutral-100 hover:text-neutral-600 transition-colors">
            <MoreHorizontal size={14} />
          </button>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-300 hover:bg-neutral-100 hover:text-neutral-600 transition-colors">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto">
        <motion.div
          variants={sectionVariants}
          initial="hidden"
          animate="visible"
          className="space-y-5 px-5 py-5"
        >

          {/* Description */}
          <motion.div variants={sectionItem}>
            <SectionLabel>Description</SectionLabel>
            <p
              className="min-h-[40px] w-full rounded-xl border border-transparent bg-neutral-50 px-3 py-2.5 text-xs leading-relaxed text-neutral-600 outline-none hover:border-neutral-200 focus:border-[var(--color-brand)]/30 focus:ring-2 focus:ring-[var(--color-brand)]/10 transition-all cursor-text"
              contentEditable
              suppressContentEditableWarning
            >
              {task.description}
            </p>
          </motion.div>

          {/* Meta row */}
          <motion.div variants={sectionItem} className="space-y-2.5">
            <SectionLabel>Details</SectionLabel>

            {/* Assignee */}
            <button className="flex w-full items-center gap-3 rounded-xl border border-neutral-100 bg-neutral-50/60 px-3 py-2.5 text-xs hover:border-neutral-200 hover:bg-neutral-50 transition-colors group">
              <User size={13} className="shrink-0 text-neutral-300 group-hover:text-neutral-400 transition-colors" />
              <span className="text-neutral-400 w-16 shrink-0 text-left">Assignee</span>
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-brand)]/10 text-[8px] font-bold text-[var(--color-brand)]">
                  {task.assignee}
                </span>
                <span className="font-medium text-neutral-700">{task.assigneeFull}</span>
              </div>
              <ChevronDown size={11} className="ml-auto text-neutral-300" />
            </button>

            {/* Deadline */}
            <button className="flex w-full items-center gap-3 rounded-xl border border-neutral-100 bg-neutral-50/60 px-3 py-2.5 text-xs hover:border-neutral-200 hover:bg-neutral-50 transition-colors group">
              <Calendar size={13} className="shrink-0 text-neutral-300 group-hover:text-neutral-400 transition-colors" />
              <span className="text-neutral-400 w-16 shrink-0 text-left">Deadline</span>
              <span className="font-medium text-neutral-700">{task.deadline}</span>
              <ChevronDown size={11} className="ml-auto text-neutral-300" />
            </button>
          </motion.div>

          {/* Divider */}
          <motion.div variants={sectionItem} className="border-t border-neutral-100" />

          {/* Status */}
          <motion.div variants={sectionItem}>
            <SectionLabel>Status</SectionLabel>
            <StatusDropdown value={status} onChange={setStatus} />
          </motion.div>

          {/* Priority */}
          <motion.div variants={sectionItem}>
            <SectionLabel>Priority</SectionLabel>
            <PrioritySelector value={priority} onChange={setPriority} />
          </motion.div>

          {/* Divider */}
          <motion.div variants={sectionItem} className="border-t border-neutral-100" />

          {/* Progress */}
          <motion.div variants={sectionItem}>
            <SectionLabel>Progress</SectionLabel>
            <ProgressControl value={progress} onChange={setProgress} />
          </motion.div>

          {/* Subtasks */}
          {task.subtasks?.length ? (
            <motion.div variants={sectionItem}>
              <div className="mb-2.5 flex items-center justify-between">
                <SectionLabel>Subtasks</SectionLabel>
                <span className="text-[10px] text-neutral-400">
                  {task.subtasks.filter((s) => s.status === "done").length} / {task.subtasks.length} done
                </span>
              </div>
              <div className="space-y-1.5">
                {task.subtasks.map((sub, i) => {
                  const sc = STATUS_OPTIONS.find((s) => s.value === sub.status)!;
                  return (
                    <div key={i} className="flex items-center gap-2.5 rounded-lg border border-neutral-50 bg-neutral-50/60 px-3 py-2">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${sc.dot}`} />
                      <span className="flex-1 truncate text-xs text-neutral-600">{sub.name}</span>
                      <span className="text-[10px] text-neutral-400 tabular-nums">{sub.progress}%</span>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          ) : null}

          {/* Divider */}
          <motion.div variants={sectionItem} className="border-t border-neutral-100" />

          {/* Comments */}
          <motion.div variants={sectionItem}>
            <div className="mb-3 flex items-center justify-between">
              <SectionLabel>Comments</SectionLabel>
              <span className="text-[10px] text-neutral-400">{comments.length}</span>
            </div>
            <div className="space-y-4">
              <AnimatePresence initial={false}>
                {comments.map((c) => (
                  <CommentItem key={c.id} comment={c} />
                ))}
              </AnimatePresence>
            </div>
          </motion.div>

        </motion.div>
      </div>

      {/* ── Comment input (pinned to bottom) ── */}
      <div className="border-t border-neutral-100 px-4 py-3">
        <div className="flex items-end gap-2">
          <span className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand)]/10 text-[9px] font-bold text-[var(--color-brand)]">
            ME
          </span>
          <div className="relative flex-1">
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitComment(); }
              }}
              placeholder="Add a comment…"
              rows={1}
              className="w-full resize-none rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 pr-8 text-xs text-neutral-700 placeholder:text-neutral-400 outline-none focus:border-[var(--color-brand)]/40 focus:bg-white focus:ring-2 focus:ring-[var(--color-brand)]/10 transition-all leading-relaxed"
              style={{ minHeight: 36, maxHeight: 96 }}
            />
            <button className="absolute bottom-2 right-2 text-neutral-300 hover:text-neutral-400 transition-colors">
              <Smile size={13} />
            </button>
          </div>
          <div className="flex mb-0.5 flex-col gap-1">
            <button className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-300 hover:bg-neutral-100 hover:text-neutral-500 transition-colors">
              <Paperclip size={13} />
            </button>
            <motion.button
              onClick={submitComment}
              whileHover={comment.trim() ? { scale: 1.05 } : {}}
              whileTap={comment.trim() ? { scale: 0.95 } : {}}
              transition={{ duration: 0.14 }}
              className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                comment.trim()
                  ? "bg-[var(--color-brand)] text-white shadow-[0_2px_8px_rgba(139,92,246,0.3)]"
                  : "bg-neutral-100 text-neutral-300"
              }`}
            >
              <Send size={12} />
            </motion.button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
