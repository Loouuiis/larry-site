"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { getTimezone } from "@/lib/timezone-context";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, ChevronDown, Calendar, User, Paperclip,
  Send, Smile, MoreHorizontal, Check, Layers, Trash2,
} from "lucide-react";
import { SourceBadge, type TaskSource } from "@/components/ui/SourceBadge";

interface Member { userId: string; name: string; }

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
  assigneeUserId?: string | null;
  project: string;
  deadline: string;
  deadlineRaw?: string;
  progress: number;
  source?: TaskSource;
  subtasks?: { name: string; status: TaskStatus; progress: number }[];
}

interface Comment {
  id: string;
  initials: string;
  name: string;
  time: string;
  text: string;
}

/* ─── API helpers ─────────────────────────────────────────────────────────── */

interface ApiComment {
  id: string;
  body: string;
  authorUserId: string;
  createdAt: string;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function mapApiComment(c: ApiComment): Comment {
  return {
    id: c.id,
    initials: (c.authorUserId ?? "?").replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase() || "??",
    name: c.authorUserId ?? "User",
    time: timeAgo(c.createdAt),
    text: c.body,
  };
}

const PANEL_TO_API_STATUS: Record<TaskStatus, string> = {
  done:       "completed",
  "on-track": "in_progress",
  "at-risk":  "in_progress",
  overdue:    "in_progress",
  upcoming:   "not_started",
};

/* ─── Config maps ───────────────────────────────────────────────────────── */

const STATUS_OPTIONS: { value: TaskStatus; label: string; dot: string; badge: string }[] = [
  { value: "done",      label: "Done",       dot: "bg-[#6ab86a]", badge: "bg-[#6ab86a]/10 text-[#245820] border-[#6ab86a]/20"   },
  { value: "on-track",  label: "On track",   dot: "bg-[#7ab0d8]", badge: "bg-[#7ab0d8]/10 text-[#1a3f70] border-[#7ab0d8]/20" },
  { value: "at-risk",   label: "At risk",    dot: "bg-[#d4b84a]",   badge: "bg-[#d4b84a]/10 text-[#705800] border-[#d4b84a]/20"         },
  { value: "overdue",   label: "Overdue",    dot: "bg-[#e87878]",     badge: "bg-[#e87878]/10 text-[#701818] border-[#e87878]/20"               },
  { value: "upcoming",  label: "Upcoming",   dot: "bg-[var(--text-disabled)]", badge: "bg-[var(--surface-2)] text-[var(--text-muted)] border-[var(--border)]"  },
];

const PRIORITY_OPTIONS: { value: TaskPriority; label: string; color: string; dot: string }[] = [
  { value: "critical", label: "Critical", color: "text-red-500",     dot: "bg-red-400"     },
  { value: "high",     label: "High",     color: "text-orange-500",  dot: "bg-orange-400"  },
  { value: "medium",   label: "Medium",   color: "text-amber-500",   dot: "bg-amber-400"   },
  { value: "low",      label: "Low",      color: "text-[var(--text-disabled)]", dot: "bg-[var(--text-disabled)]" },
];

/* ─── Section heading ───────────────────────────────────────────────────── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-disabled)]">
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
        className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-medium transition-colors hover:border-[var(--border)] ${current.badge}`}
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
            className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-card-xl"
          >
            {STATUS_OPTIONS.map((opt) => (
              <li key={opt.value}>
                <button
                  onClick={() => { onChange(opt.value); setOpen(false); }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-xs font-medium text-[var(--text-2)] hover:bg-[var(--surface-2)] transition-colors"
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
                : "border-[var(--border)] text-[var(--text-disabled)] hover:border-[var(--border)]",
            ].join(" ")}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${isActive ? opt.dot : "bg-[var(--text-disabled)]"}`} />
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
    : value >= 60  ? "bg-[var(--text-1)]"
    : value >= 30  ? "bg-amber-400"
    : "bg-red-400";

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-[var(--text-1)]">{value}%</span>
        <div className="flex items-center gap-1">
          <button onClick={() => step(-1)} className="flex h-6 w-6 items-center justify-center rounded-lg border border-[var(--border)] text-xs text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:border-[var(--border)] transition-colors font-medium leading-none">−</button>
          <button onClick={() => step(1)}  className="flex h-6 w-6 items-center justify-center rounded-lg border border-[var(--border)] text-xs text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:border-[var(--border)] transition-colors font-medium leading-none">+</button>
        </div>
      </div>
      <div className="relative h-2.5 overflow-hidden rounded-full bg-[var(--surface-2)] cursor-pointer"
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
          className="absolute top-1/2 -translate-y-1/2 h-4 w-4 rounded-full border-2 border-white bg-white shadow-md ring-1 ring-[var(--border)]"
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
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-[9px] font-bold text-[var(--color-muted)] mt-0.5">
        {comment.initials}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-xs font-semibold text-[var(--text-1)]">{comment.name}</span>
          <span className="text-[10px] text-[var(--text-disabled)]">{comment.time}</span>
        </div>
        <p className="text-xs leading-relaxed text-[var(--text-2)] bg-[var(--surface-2)] rounded-xl rounded-tl-sm px-3 py-2.5 border border-[var(--border)]">
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
  projectId?: string;
  onSave?: () => Promise<void>;
  onDelete?: () => Promise<void>;
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

export function TaskDetailPanel({ task, onClose, projectId, onSave, onDelete }: TaskDetailPanelProps) {
  const [status,   setStatus]   = useState<TaskStatus>(task.status);
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [progress, setProgress] = useState(task.progress);
  const [comment,  setComment]  = useState("");
  const [comments, setComments] = useState<Comment[]>([]);
  const [deleting, setDeleting] = useState(false);

  // Editable fields
  const [titleDraft, setTitleDraft]       = useState(task.name);
  const [descDraft, setDescDraft]         = useState(task.description);
  const [deadlineDraft, setDeadlineDraft] = useState(task.deadlineRaw ?? "");
  const [editingDeadline, setEditingDeadline] = useState(false);
  const [assigneeOpen, setAssigneeOpen]   = useState(false);
  const [assigneeId, setAssigneeId]       = useState<string | null>(task.assigneeUserId ?? null);
  const [assigneeName, setAssigneeName]   = useState(task.assigneeFull);
  const [members, setMembers]             = useState<Member[]>([]);
  const assigneeButtonRef = useRef<HTMLButtonElement>(null);
  const assigneeMenuRef = useRef<HTMLDivElement>(null);
  const onSaveRef = useRef(onSave);
  useEffect(() => { onSaveRef.current = onSave; });

  const currentStatus = STATUS_OPTIONS.find((s) => s.value === status)!;
  const patchTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const isFirstRender = useRef(true);

  // Reset editable state when task changes
  useEffect(() => {
    setTitleDraft(task.name);
    setDescDraft(task.description);
    setDeadlineDraft(task.deadlineRaw ?? "");
    setAssigneeId(task.assigneeUserId ?? null);
    setAssigneeName(task.assigneeFull);
    setEditingDeadline(false);
    setAssigneeOpen(false);
  }, [task.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch members when projectId provided
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    fetch(`/api/workspace/projects/${encodeURIComponent(projectId)}/members`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && Array.isArray(data?.members)) {
          setMembers(data.members.map((m: { userId: string; name?: string; email?: string }) => ({
            userId: m.userId,
            name: m.name || m.email || "Unknown",
          })));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [projectId]);

  // Close assignee dropdown on outside click
  useEffect(() => {
    if (!assigneeOpen) return;
    function handler(e: MouseEvent) {
      if (
        assigneeButtonRef.current?.contains(e.target as Node) ||
        assigneeMenuRef.current?.contains(e.target as Node)
      ) return;
      setAssigneeOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [assigneeOpen]);

  // Patch helper
  const patchAndRefresh = useCallback(async (patch: Record<string, unknown>) => {
    try {
      await fetch(`/api/workspace/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      window.dispatchEvent(new CustomEvent("larry:refresh-snapshot"));
      await onSave?.();
    } catch {
      // silently fail
    }
  }, [task.id, onSave]);

  // Fetch real comments on mount / task change
  useEffect(() => {
    setComments([]);
    fetch(`/api/workspace/tasks/${task.id}/comments`)
      .then((r) => r.json())
      .then((data: { comments?: ApiComment[] }) => {
        setComments((data.comments ?? []).map(mapApiComment));
      })
      .catch(() => {});
  }, [task.id]);

  // Debounced PATCH for status / priority / progress changes
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    clearTimeout(patchTimeout.current);
    patchTimeout.current = setTimeout(() => {
      fetch(`/api/workspace/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: PANEL_TO_API_STATUS[status],
          priority,
          progressPercent: progress,
        }),
      })
        .then(() => {
          window.dispatchEvent(new CustomEvent("larry:refresh-snapshot"));
          onSaveRef.current?.().catch(() => {});
        })
        .catch(() => {});
    }, 800);
    return () => clearTimeout(patchTimeout.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id, status, priority, progress]);

  const submitComment = useCallback(async () => {
    const trimmed = comment.trim();
    if (!trimmed) return;
    const optimistic: Comment = {
      id: `c${Date.now()}`, initials: "ME", name: "You", time: "just now", text: trimmed,
    };
    setComments((prev) => [...prev, optimistic]);
    setComment("");
    try {
      await fetch(`/api/workspace/tasks/${task.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: trimmed }),
      });
    } catch {
      // optimistic update stays
    }
  }, [comment, task.id]);

  return (
    <motion.div
      variants={panelVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="flex h-full w-[360px] shrink-0 flex-col border-l border-[#f0edfa] bg-white"
      style={{ boxShadow: "0 0 40px rgba(0,0,0,0.06)" }}
    >
      {/* ── Header ── */}
      <div className="flex items-start gap-3 border-b border-[#f0edfa] px-5 py-4">
        <div className="flex-1 min-w-0">
          {/* Project breadcrumb */}
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-muted)]">
            {task.project}
          </p>
          {/* Title — editable */}
          <input
            type="text"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => {
              const trimmed = titleDraft.trim();
              if (trimmed && trimmed !== task.name) void patchAndRefresh({ title: trimmed });
              else setTitleDraft(task.name);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") { setTitleDraft(task.name); (e.target as HTMLInputElement).blur(); }
            }}
            className="w-full text-sm font-bold text-[var(--text-1)] leading-snug tracking-[-0.02em] outline-none rounded bg-transparent focus:bg-[var(--surface-2)] focus:px-1.5 focus:ring-2 focus:ring-[var(--color-brand)]/20 transition-all cursor-text"
          />
        </div>
        <div className="flex shrink-0 items-center gap-1 mt-0.5">
          {onDelete && (
            <button
              onClick={async () => {
                if (!confirm("Delete this task?")) return;
                setDeleting(true);
                try { await onDelete(); } finally { setDeleting(false); }
              }}
              disabled={deleting}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-disabled)] hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-50"
              title="Delete task"
            >
              <Trash2 size={13} />
            </button>
          )}
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-disabled)] hover:bg-[var(--surface-2)] hover:text-[var(--text-2)] transition-colors">
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
            <textarea
              value={descDraft}
              onChange={(e) => setDescDraft(e.target.value)}
              onBlur={() => {
                if (descDraft !== task.description) void patchAndRefresh({ description: descDraft });
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") { setDescDraft(task.description); (e.target as HTMLTextAreaElement).blur(); }
              }}
              placeholder="Add a description…"
              rows={3}
              className="min-h-[40px] w-full resize-none rounded-xl border border-transparent bg-[var(--surface-2)] px-3 py-2.5 text-xs leading-relaxed text-[var(--text-2)] outline-none hover:border-[var(--border)] focus:border-[var(--color-brand)]/30 focus:ring-2 focus:ring-[var(--color-brand)]/10 transition-all cursor-text"
            />
          </motion.div>

          {/* Meta row */}
          <motion.div variants={sectionItem} className="space-y-2.5">
            <SectionLabel>Details</SectionLabel>

            {/* Assignee */}
            <div className="relative">
              <button
                ref={assigneeButtonRef}
                onClick={() => setAssigneeOpen((v) => !v)}
                className="flex w-full items-center gap-3 rounded-xl border border-[#f0edfa] bg-[var(--surface-2)] px-3 py-2.5 text-xs hover:border-[var(--border)] transition-colors group"
                style={{ borderBottom: "1px solid #faf8ff" }}
              >
                <User size={13} className="shrink-0 text-[var(--text-disabled)]" />
                <span className="text-[var(--text-disabled)] w-16 shrink-0 text-left">Assignee</span>
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-[8px] font-bold text-[var(--color-muted)]">
                    {assigneeId ? (assigneeName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?") : "—"}
                  </span>
                  <span className="font-medium text-[var(--text-2)]">{assigneeName}</span>
                </div>
                <ChevronDown size={11} className={`ml-auto text-[var(--text-disabled)] transition-transform ${assigneeOpen ? "rotate-180" : ""}`} />
              </button>

              {assigneeOpen && members.length > 0 && assigneeButtonRef.current && createPortal(
                <div
                  ref={assigneeMenuRef}
                  style={{
                    position: "fixed",
                    top: assigneeButtonRef.current.getBoundingClientRect().bottom + 4,
                    left: assigneeButtonRef.current.getBoundingClientRect().left,
                    width: assigneeButtonRef.current.getBoundingClientRect().width,
                    zIndex: 9999,
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                    maxHeight: 200,
                    overflowY: "auto",
                  }}
                >
                  <button
                    onClick={() => {
                      setAssigneeOpen(false);
                      setAssigneeId(null);
                      setAssigneeName("Unassigned");
                      void patchAndRefresh({ assigneeUserId: null });
                    }}
                    className="flex w-full items-center px-3 py-2 text-left text-[12px] transition-colors"
                    style={{ color: "var(--text-disabled)", border: "none", cursor: "pointer", background: !assigneeId ? "var(--surface-2)" : "transparent", fontStyle: "italic", borderBottom: "1px solid var(--border)" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-2)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = !assigneeId ? "var(--surface-2)" : "transparent"; }}
                  >
                    Unassign
                  </button>
                  {members.map((m) => (
                    <button
                      key={m.userId}
                      onClick={() => {
                        setAssigneeOpen(false);
                        setAssigneeId(m.userId);
                        setAssigneeName(m.name);
                        void patchAndRefresh({ assigneeUserId: m.userId });
                      }}
                      className="flex w-full items-center px-3 py-2 text-left text-[12px] transition-colors"
                      style={{ color: "var(--text-1)", border: "none", cursor: "pointer", background: m.userId === assigneeId ? "var(--surface-2)" : "transparent", borderBottom: "1px solid var(--border)" }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-2)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = m.userId === assigneeId ? "var(--surface-2)" : "transparent"; }}
                    >
                      {m.name}
                    </button>
                  ))}
                </div>,
                document.body
              )}
            </div>

            {/* Deadline */}
            {editingDeadline ? (
              <div className="flex w-full items-center gap-3 rounded-xl border border-[var(--color-brand)]/30 bg-[var(--surface-2)] px-3 py-2.5 text-xs ring-2 ring-[var(--color-brand)]/10">
                <Calendar size={13} className="shrink-0 text-[var(--text-disabled)]" />
                <span className="text-[var(--text-disabled)] w-16 shrink-0 text-left">Deadline</span>
                <input
                  type="date"
                  autoFocus
                  value={deadlineDraft}
                  onChange={(e) => setDeadlineDraft(e.target.value)}
                  onBlur={() => {
                    setEditingDeadline(false);
                    if (deadlineDraft !== (task.deadlineRaw ?? "")) {
                      void patchAndRefresh({ dueDate: deadlineDraft || null });
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") { setDeadlineDraft(task.deadlineRaw ?? ""); setEditingDeadline(false); }
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                  className="flex-1 bg-transparent outline-none text-[var(--text-2)] font-medium text-xs"
                />
              </div>
            ) : (
              <button
                onClick={() => setEditingDeadline(true)}
                className="flex w-full items-center gap-3 rounded-xl border border-[#f0edfa] bg-[var(--surface-2)] px-3 py-2.5 text-xs hover:border-[var(--border)] transition-colors group"
                style={{ borderBottom: "1px solid #faf8ff" }}
              >
                <Calendar size={13} className="shrink-0 text-[var(--text-disabled)]" />
                <span className="text-[var(--text-disabled)] w-16 shrink-0 text-left">Deadline</span>
                <span className="font-medium text-[var(--text-2)]">
                  {deadlineDraft
                    ? new Date(deadlineDraft + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: getTimezone() })
                    : task.deadline || "Set date"}
                </span>
                <ChevronDown size={11} className="ml-auto text-[var(--text-disabled)]" />
              </button>
            )}

            {/* Source */}
            {task.source && (
              <div className="flex w-full items-center gap-3 rounded-xl border border-[#f0edfa] bg-[var(--surface-2)] px-3 py-2.5 text-xs" style={{ borderBottom: "1px solid #faf8ff" }}>
                <Layers size={13} className="shrink-0 text-[var(--text-disabled)]" />
                <span className="text-[var(--text-disabled)] w-16 shrink-0 text-left">Source</span>
                <SourceBadge source={task.source} />
              </div>
            )}
          </motion.div>

          {/* Divider */}
          <motion.div variants={sectionItem} className="border-t border-[#f0edfa]" />

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
          <motion.div variants={sectionItem} className="border-t border-[#f0edfa]" />

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
                <span className="text-[10px] text-[var(--text-disabled)]">
                  {task.subtasks.filter((s) => s.status === "done").length} / {task.subtasks.length} done
                </span>
              </div>
              <div className="space-y-1.5">
                {task.subtasks.map((sub, i) => {
                  const sc = STATUS_OPTIONS.find((s) => s.value === sub.status)!;
                  return (
                    <div key={i} className="flex items-center gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${sc.dot}`} />
                      <span className="flex-1 truncate text-xs text-[var(--text-2)]">{sub.name}</span>
                      <span className="text-[10px] text-[var(--text-disabled)] tabular-nums">{sub.progress}%</span>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          ) : null}

          {/* Divider */}
          <motion.div variants={sectionItem} className="border-t border-[#f0edfa]" />

          {/* Comments */}
          <motion.div variants={sectionItem}>
            <div className="mb-3 flex items-center justify-between">
              <SectionLabel>Comments</SectionLabel>
              <span className="text-[10px] text-[var(--text-disabled)]">{comments.length}</span>
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
      <div className="border-t border-[#f0edfa] px-4 py-3">
        <div className="flex items-end gap-2">
          <span className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-[9px] font-bold text-[var(--color-muted)]">
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
              className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 pr-8 text-xs text-[var(--text-2)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[var(--color-brand)]/40 focus:bg-white focus:ring-2 focus:ring-[var(--color-brand)]/10 transition-all leading-relaxed"
              style={{ minHeight: 36, maxHeight: 96 }}
            />
            <button className="absolute bottom-2 right-2 text-[var(--text-disabled)] hover:text-[var(--text-disabled)] transition-colors">
              <Smile size={13} />
            </button>
          </div>
          <div className="flex mb-0.5 flex-col gap-1">
            <button className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-disabled)] hover:bg-[var(--surface-2)] hover:text-[var(--text-muted)] transition-colors">
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
                  : "bg-[var(--surface-2)] text-[var(--text-disabled)]"
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
