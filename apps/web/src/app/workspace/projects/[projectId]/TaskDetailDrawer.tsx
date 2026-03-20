"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, MessageSquare, Link2 } from "lucide-react";
import { BoardTaskRow, TaskStatus } from "@/app/dashboard/types";

interface Comment {
  id: string;
  body: string;
  authorUserId: string;
  createdAt: string;
}

interface TaskDetail {
  id: string;
  title: string;
  status: TaskStatus;
  priority: string;
  dueDate: string | null;
  startDate: string | null;
  progressPercent: number;
  description: string | null;
  assigneeUserId: string | null;
}

interface TaskDetailDrawerProps {
  task: BoardTaskRow | null;
  onClose: () => void;
}

const STATUS_OPTIONS: TaskStatus[] = ["backlog", "not_started", "in_progress", "waiting", "blocked", "completed"];
const STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: "Backlog",
  not_started: "Not Started",
  in_progress: "In Progress",
  waiting: "Waiting",
  blocked: "Blocked",
  completed: "Done",
};

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return {} as T;
  try { return JSON.parse(text) as T; } catch { return {} as T; }
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

export function TaskDetailDrawer({ task, onClose }: TaskDetailDrawerProps) {
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editStatus, setEditStatus] = useState<TaskStatus>("not_started");
  const [editProgress, setEditProgress] = useState(0);
  const [editDescription, setEditDescription] = useState("");
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!task) { setDetail(null); return; }
    setEditTitle(task.title);
    setEditStatus(task.status);
    setEditProgress(task.progressPercent ?? 0);
    setDetail(null);
    setComments([]);

    void (async () => {
      try {
        const res = await fetch(`/api/workspace/tasks/${task.id}`);
        const data = await readJson<{ task?: TaskDetail; comments?: Comment[] }>(res);
        if (data.task) {
          setDetail(data.task);
          setEditTitle(data.task.title);
          setEditStatus(data.task.status);
          setEditProgress(data.task.progressPercent ?? 0);
          setEditDescription(data.task.description ?? "");
        }
        setComments(data.comments ?? []);
      } catch {
        // use row data as fallback
      }
    })();
  }, [task]);

  const handleSave = async () => {
    if (!task) return;
    setSaveBusy(true);
    try {
      await fetch(`/api/workspace/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle,
          status: editStatus,
          progressPercent: editProgress,
          description: editDescription,
        }),
      });
      window.dispatchEvent(new CustomEvent("larry:refresh-snapshot"));
    } finally {
      setSaveBusy(false);
    }
  };

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task || !commentText.trim()) return;
    setCommentBusy(true);
    try {
      const res = await fetch(`/api/workspace/tasks/${task.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: commentText.trim() }),
      });
      const newComment = await readJson<Comment>(res);
      if (newComment.id) {
        setComments((prev) => [...prev, newComment]);
        setCommentText("");
      }
    } finally {
      setCommentBusy(false);
    }
  };

  if (!task) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20"
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        className="fixed right-0 top-0 z-50 flex h-full w-[480px] flex-col border-l border-[var(--pm-border)] bg-white shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--pm-border)] px-5 py-4">
          <h2 className="text-[15px] font-semibold text-[var(--pm-text)]">Task Detail</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--pm-text-muted)] hover:bg-[var(--pm-gray-light)]"
          >
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Title */}
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[var(--pm-text-muted)]">
              Title
            </label>
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full rounded-lg border border-[var(--pm-border)] px-3 py-2 text-[15px] font-medium outline-none focus:border-[#6366f1]"
            />
          </div>

          {/* Status + Progress */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[var(--pm-text-muted)]">
                Status
              </label>
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as TaskStatus)}
                className="w-full rounded-lg border border-[var(--pm-border)] px-3 py-2 text-[13px] outline-none focus:border-[#6366f1]"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[var(--pm-text-muted)]">
                Progress: {editProgress}%
              </label>
              <input
                type="range"
                min={0}
                max={100}
                value={editProgress}
                onChange={(e) => setEditProgress(Number(e.target.value))}
                className="w-full mt-2"
              />
            </div>
          </div>

          {/* Due date / Priority */}
          <div className="grid grid-cols-2 gap-3 text-[13px]">
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--pm-text-muted)]">Due Date</p>
              <p className="text-[var(--pm-text)]">{task.dueDate?.slice(0, 10) ?? "—"}</p>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--pm-text-muted)]">Priority</p>
              <p className="text-[var(--pm-text)] capitalize">{task.priority}</p>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[var(--pm-text-muted)]">
              Description
            </label>
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              rows={3}
              placeholder="Add a description…"
              className="w-full rounded-lg border border-[var(--pm-border)] px-3 py-2 text-[13px] outline-none focus:border-[#6366f1] resize-none"
            />
          </div>

          {/* Save */}
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saveBusy}
            className="h-9 w-full rounded-lg bg-[#0073EA] text-[13px] font-medium text-white hover:bg-[#0060c2] disabled:opacity-50"
          >
            {saveBusy ? "Saving…" : "Save changes"}
          </button>

          {/* Comments */}
          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--pm-text-muted)]">
              <MessageSquare size={12} /> Comments ({comments.length})
            </h3>
            <div className="space-y-2 max-h-[200px] overflow-y-auto mb-3">
              {comments.map((c) => (
                <div key={c.id} className="rounded-lg border border-[var(--pm-border)] bg-[var(--pm-gray-light)] px-3 py-2">
                  <p className="text-[13px] text-[var(--pm-text)]">{c.body}</p>
                  <p className="mt-0.5 text-[11px] text-[var(--pm-text-muted)]">{timeAgo(c.createdAt)}</p>
                </div>
              ))}
              {comments.length === 0 && (
                <p className="text-[13px] text-[var(--pm-text-muted)]">No comments yet.</p>
              )}
            </div>
            <form onSubmit={handleComment} className="flex gap-2">
              <input
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Add a comment…"
                className="flex-1 h-8 rounded-lg border border-[var(--pm-border)] bg-[var(--pm-gray-light)] px-3 text-[13px] outline-none focus:border-[#6366f1] focus:bg-white"
              />
              <button
                type="submit"
                disabled={commentBusy || !commentText.trim()}
                className="h-8 rounded-lg bg-[#6366f1] px-3 text-[12px] font-medium text-white disabled:opacity-50"
              >
                Post
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
