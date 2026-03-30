"use client";

import { useEffect, useRef, useState } from "react";
import { MessageSquare, Paperclip, X } from "lucide-react";
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
  sourceType?: string | null;
  sourceRef?: string | null;
}

interface TaskDetailDrawerProps {
  task: BoardTaskRow | null;
  onClose: () => void;
}

interface TaskAttachment {
  id: string;
  taskId: string;
  documentId: string;
  createdAt: string;
  title?: string;
  docType?: string;
  version?: number;
}

interface ProjectDocumentOption {
  id: string;
  title: string;
  docType: string;
  version: number;
}

const STATUS_OPTIONS: { value: TaskStatus; label: string; pillClass: string }[] = [
  { value: "not_started", label: "Not Started",  pillClass: "pm-pill-not-started" },
  { value: "in_progress", label: "In Progress",  pillClass: "pm-pill-working"     },
  { value: "waiting",     label: "Waiting",      pillClass: "pm-pill-not-started" },
  { value: "blocked",     label: "Blocked",      pillClass: "pm-pill-stuck"       },
  { value: "completed",   label: "Done",         pillClass: "pm-pill-done"        },
];

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

function sourceLabel(type: string | null | undefined): string {
  switch (type) {
    case "meeting":     return "Meeting transcript";
    case "slack":       return "Slack message";
    case "manual":      return "Created manually";
    case "larry":       return "Larry suggestion";
    default:            return "Manual creation";
  }
}

function documentTypeLabel(docType: string | undefined): string {
  if (!docType) return "document";
  if (docType === "docx_template") return ".docx template";
  if (docType === "xlsx_template") return ".xlsx template";
  if (docType === "email_draft") return "email draft";
  return docType.replace(/_/g, " ");
}

export function TaskDetailDrawer({ task, onClose }: TaskDetailDrawerProps) {
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [projectDocuments, setProjectDocuments] = useState<ProjectDocumentOption[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [attachBusy, setAttachBusy] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editStatus, setEditStatus] = useState<TaskStatus>("not_started");
  const [editProgress, setEditProgress] = useState(0);
  const [editDescription, setEditDescription] = useState("");
  const [statusOpen, setStatusOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!task) {
      setDetail(null);
      return;
    }
    setEditTitle(task.title);
    setEditStatus(task.status);
    setEditProgress(task.progressPercent ?? 0);
    setStatusOpen(false);
    setDetail(null);
    setComments([]);
    setAttachments([]);
    setProjectDocuments([]);
    setSelectedDocumentId("");
    setAttachError(null);

    void (async () => {
      try {
        const [taskResponse, attachmentResponse, projectDocsResponse] = await Promise.all([
          fetch(`/api/workspace/tasks/${task.id}`),
          fetch(`/api/workspace/tasks/${task.id}/attachments`),
          fetch(`/api/workspace/documents?projectId=${encodeURIComponent(task.projectId)}&limit=100`),
        ]);

        const data = await readJson<{ task?: TaskDetail; comments?: Comment[] }>(taskResponse);
        if (data.task) {
          setDetail(data.task);
          setEditTitle(data.task.title);
          setEditStatus(data.task.status);
          setEditProgress(data.task.progressPercent ?? 0);
          setEditDescription(data.task.description ?? "");
        }
        setComments(data.comments ?? []);

        const attachmentData = await readJson<{ items?: TaskAttachment[] }>(attachmentResponse);
        const attachmentsList = Array.isArray(attachmentData.items) ? attachmentData.items : [];
        setAttachments(attachmentsList);

        const docsData = await readJson<{ items?: ProjectDocumentOption[] }>(projectDocsResponse);
        const docsList = Array.isArray(docsData.items) ? docsData.items : [];
        setProjectDocuments(docsList);
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

  const handleStatusSelect = async (newStatus: TaskStatus) => {
    setEditStatus(newStatus);
    setStatusOpen(false);
    if (!task) return;
    try {
      await fetch(`/api/workspace/tasks/${task.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      window.dispatchEvent(new CustomEvent("larry:refresh-snapshot"));
    } catch {
      // non-critical
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

  const handleAttachDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task || !selectedDocumentId || attachBusy) return;

    setAttachBusy(true);
    setAttachError(null);
    try {
      const response = await fetch(`/api/workspace/tasks/${task.id}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: selectedDocumentId }),
      });
      const payload = await readJson<{
        attachment?: TaskAttachment;
        error?: string;
      }>(response);
      if (!response.ok || !payload.attachment) {
        throw new Error(payload.error ?? "Failed to attach document.");
      }

      const option = projectDocuments.find((entry) => entry.id === payload.attachment?.documentId);
      const hydrated: TaskAttachment = {
        ...payload.attachment,
        title: payload.attachment.title ?? option?.title ?? "Document",
        docType: payload.attachment.docType ?? option?.docType,
        version: payload.attachment.version ?? option?.version,
      };

      setAttachments((current) => [
        hydrated,
        ...current.filter((entry) => entry.documentId !== hydrated.documentId),
      ]);
      setSelectedDocumentId("");
      window.dispatchEvent(new CustomEvent("larry:refresh-snapshot"));
    } catch (attachDocumentError) {
      setAttachError(
        attachDocumentError instanceof Error
          ? attachDocumentError.message
          : "Failed to attach document."
      );
    } finally {
      setAttachBusy(false);
    }
  };

  if (!task) return null;

  const currentStatus = STATUS_OPTIONS.find((s) => s.value === editStatus) ?? STATUS_OPTIONS[0];
  const attachedDocumentIds = new Set(attachments.map((entry) => entry.documentId));
  const attachableDocuments = projectDocuments.filter(
    (entry) => !attachedDocumentIds.has(entry.id)
  );

  return (
    /* No backdrop overlay - drawer uses shadow-3 instead */
    <div
      ref={drawerRef}
      className="fixed right-0 top-0 z-50 flex h-full flex-col"
      style={{
        width: "420px",
        borderLeft: "1px solid var(--border)",
        background: "var(--surface)",
        boxShadow: "var(--shadow-3)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-3 shrink-0"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <h2 className="text-h3">Task Detail</h2>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors"
          style={{ color: "var(--text-muted)" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "")}
        >
          <X size={16} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 space-y-5">

        {/* Title */}
        <div>
          <label className="text-caption block mb-1">Title</label>
          <input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            className="w-full px-3 py-2 text-[15px] font-medium outline-none transition-colors"
            style={{
              borderRadius: "var(--radius-input)",
              border: "1px solid var(--border)",
              color: "var(--text-1)",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--brand)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
          />
        </div>

        {/* Status - coloured pill selector */}
        <div className="relative">
          <label className="text-caption block mb-2">Status</label>
          <button
            type="button"
            onClick={() => setStatusOpen((v) => !v)}
            className={`pm-pill ${currentStatus.pillClass}`}
          >
            {currentStatus.label}
          </button>

          {statusOpen && (
            <div
              className="absolute left-0 top-full mt-1 z-50 overflow-hidden"
              style={{
                minWidth: "160px",
                borderRadius: "var(--radius-dropdown)",
                border: "1px solid var(--border)",
                background: "var(--surface)",
                boxShadow: "var(--shadow-2)",
              }}
            >
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => void handleStatusSelect(opt.value)}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors"
                  style={{ borderBottom: "1px solid var(--border)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                >
                  <span className={`pm-pill ${opt.pillClass}`} style={{ fontSize: "10px", height: "18px", minWidth: "70px" }}>
                    {opt.label}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Progress */}
        <div>
          <label className="text-caption block mb-1">Progress: {editProgress}%</label>
          <input
            type="range"
            min={0}
            max={100}
            value={editProgress}
            onChange={(e) => setEditProgress(Number(e.target.value))}
            className="w-full"
          />
        </div>

        {/* Due date / Priority */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-caption mb-1">Due Date</p>
            <p className="text-[14px]" style={{ color: "var(--text-2)" }}>
              {task.dueDate?.slice(0, 10) ?? "-"}
            </p>
          </div>
          <div>
            <p className="text-caption mb-1">Priority</p>
            <p className="text-[14px] capitalize" style={{ color: "var(--text-2)" }}>
              {task.priority}
            </p>
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="text-caption block mb-1">Description</label>
          <textarea
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
            rows={3}
            placeholder="Add a description..."
            className="w-full px-3 py-2 text-[13px] outline-none resize-none transition-colors"
            style={{
              borderRadius: "var(--radius-input)",
              border: "1px solid var(--border)",
              color: "var(--text-2)",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--brand)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
          />
        </div>

        {/* Save */}
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saveBusy}
          className="pm-btn pm-btn-primary w-full"
          style={{ borderRadius: "var(--radius-btn)" }}
        >
          {saveBusy ? "Saving..." : "Save changes"}
        </button>
        {/* Source section */}
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: "16px" }}>
          <p className="text-caption mb-2">Source</p>
          <div
            className="flex items-center gap-2 px-3 py-2"
            style={{
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-card)",
              background: "var(--surface-2)",
            }}
          >
            <span className="text-[13px]" style={{ color: "var(--text-2)" }}>
              {sourceLabel(detail?.sourceType)}
            </span>
          </div>
        </div>

        {/* Attachments */}
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: "16px" }}>
          <h3 className="text-caption mb-3 flex items-center gap-1.5">
            <Paperclip size={12} />
            Attachments ({attachments.length})
          </h3>

          <div className="space-y-2 mb-3">
            {attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="flex items-start justify-between gap-3 px-3 py-2"
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-card)",
                  background: "var(--surface-2)",
                }}
              >
                <div className="min-w-0">
                  <p
                    className="text-[13px] font-medium"
                    style={{
                      color: "var(--text-1)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {attachment.title ?? "Document"}
                  </p>
                  <p className="text-[11px]" style={{ color: "var(--text-disabled)" }}>
                    {documentTypeLabel(attachment.docType)}
                    {typeof attachment.version === "number" ? ` - v${attachment.version}` : ""}
                    {attachment.createdAt ? ` - attached ${timeAgo(attachment.createdAt)}` : ""}
                  </p>
                </div>
              </div>
            ))}
            {attachments.length === 0 && (
              <p className="text-[13px]" style={{ color: "var(--text-disabled)" }}>
                No documents attached yet.
              </p>
            )}
          </div>

          <form onSubmit={(e) => void handleAttachDocument(e)} className="space-y-2">
            <p className="text-caption">Attach existing project document</p>
            <div className="flex gap-2">
              <select
                value={selectedDocumentId}
                onChange={(e) => setSelectedDocumentId(e.target.value)}
                className="flex-1 h-8 px-3 text-[13px] outline-none transition-colors"
                style={{
                  borderRadius: "var(--radius-input)",
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  color: "var(--text-2)",
                }}
              >
                <option value="">Select document...</option>
                {attachableDocuments.map((documentOption) => (
                  <option key={documentOption.id} value={documentOption.id}>
                    {documentOption.title} ({documentTypeLabel(documentOption.docType)})
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={
                  attachBusy ||
                  !selectedDocumentId ||
                  attachableDocuments.length === 0
                }
                className="pm-btn pm-btn-sm"
                style={{
                  background: "var(--brand)",
                  color: "#fff",
                  borderRadius: "var(--radius-btn)",
                  border: "none",
                }}
              >
                {attachBusy ? "Attaching..." : "Attach"}
              </button>
            </div>
            {projectDocuments.length === 0 && (
              <p className="text-[12px]" style={{ color: "var(--text-disabled)" }}>
                No project documents available yet.
              </p>
            )}
            {projectDocuments.length > 0 && attachableDocuments.length === 0 && (
              <p className="text-[12px]" style={{ color: "var(--text-disabled)" }}>
                All project documents are already attached.
              </p>
            )}
            {attachError && (
              <p className="text-[12px]" style={{ color: "#b91c1c" }}>
                {attachError}
              </p>
            )}
          </form>
        </div>

        {/* Activity feed - comments + timeline */}
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: "16px" }}>
          <h3 className="text-caption mb-3 flex items-center gap-1.5">
            <MessageSquare size={12} />
            Activity ({comments.length})
          </h3>

          <div className="space-y-2 max-h-[220px] overflow-y-auto mb-3">
            {comments.map((c) => (
              <div key={c.id} className="flex gap-2">
                {/* Timeline dot */}
                <div className="flex flex-col items-center pt-1 shrink-0">
                  <div className="h-2 w-2 rounded-full" style={{ background: "var(--border-2)" }} />
                  <div className="mt-1 w-px flex-1" style={{ background: "var(--border)" }} />
                </div>
                <div
                  className="flex-1 mb-2 px-3 py-2"
                  style={{
                    borderRadius: "var(--radius-card)",
                    border: "1px solid var(--border)",
                    background: "var(--surface-2)",
                  }}
                >
                  <p className="text-[13px]" style={{ color: "var(--text-2)" }}>{c.body}</p>
                  <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-disabled)" }}>
                    {timeAgo(c.createdAt)}
                  </p>
                </div>
              </div>
            ))}
            {comments.length === 0 && (
              <p className="text-[13px]" style={{ color: "var(--text-disabled)" }}>
                No activity yet.
              </p>
            )}
          </div>

          {/* Comment form */}
          <form onSubmit={(e) => void handleComment(e)} className="flex gap-2">
            <input
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Add a comment..."
              className="flex-1 h-8 px-3 text-[13px] outline-none transition-colors"
              style={{
                borderRadius: "var(--radius-input)",
                border: "1px solid var(--border)",
                background: "var(--surface-2)",
                color: "var(--text-2)",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "var(--brand)"; e.currentTarget.style.background = "var(--surface)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--surface-2)"; }}
            />
            <button
              type="submit"
              disabled={commentBusy || !commentText.trim()}
              className="pm-btn pm-btn-sm"
              style={{
                background: "var(--brand)",
                color: "#fff",
                borderRadius: "var(--radius-btn)",
                border: "none",
              }}
            >
              Post
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
