"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { BoardTaskRow, TaskGroup } from "@/app/dashboard/types";
import { StatusChip } from "./StatusChip";

interface TaskTableProps {
  groups: TaskGroup[];
  onTaskClick: (task: BoardTaskRow) => void;
  onAddTask: (group: TaskGroup, title: string) => Promise<void> | void;
  onAddGroup: () => void;
}

function formatDueDate(value: string | null): string {
  if (!value) return "No date";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function getInitials(name?: string | null): string {
  if (!name) return "UN";
  const parts = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) return "UN";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function getAvatarTone(name?: string | null): string {
  const palette = [
    "bg-[#21304a] text-[#b5c3d7]",
    "bg-[#342154] text-[#d7c3ff]",
    "bg-[#183d36] text-[#bbefe4]",
    "bg-[#4a2c1d] text-[#ffd7ba]",
  ];
  const key = name ?? "unassigned";
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash + key.charCodeAt(index)) % palette.length;
  }
  return palette[hash];
}

function GroupProgressStrip({ tasks }: { tasks: BoardTaskRow[] }) {
  const counts = {
    completed: tasks.filter((task) => task.status === "completed").length,
    in_progress: tasks.filter((task) => task.status === "in_progress").length,
    blocked: tasks.filter((task) => task.status === "blocked").length,
    other: tasks.filter(
      (task) => task.status !== "completed" && task.status !== "in_progress" && task.status !== "blocked"
    ).length,
  };
  const total = tasks.length || 1;

  return (
    <div className="flex h-1.5 overflow-hidden rounded-full bg-[#1a2332]">
      <span className="bg-[#00C875]" style={{ width: `${(counts.completed / total) * 100}%` }} />
      <span className="bg-[#FDAB3D]" style={{ width: `${(counts.in_progress / total) * 100}%` }} />
      <span className="bg-[#E2445C]" style={{ width: `${(counts.blocked / total) * 100}%` }} />
      <span className="bg-[#676879]" style={{ width: `${(counts.other / total) * 100}%` }} />
    </div>
  );
}

export function TaskTable({ groups, onTaskClick, onAddTask, onAddGroup }: TaskTableProps) {
  const defaultCollapsed = useMemo(
    () => Object.fromEntries(
      groups.map((group) => [group.key, group.key === "completed" && group.tasks.length > 3])
    ) as Record<TaskGroup["key"], boolean>,
    [groups]
  );

  const [collapsed, setCollapsed] = useState<Record<TaskGroup["key"], boolean>>(defaultCollapsed);
  const [addingGroupKey, setAddingGroupKey] = useState<TaskGroup["key"] | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setCollapsed((previous) => ({
      todo: previous.todo ?? defaultCollapsed.todo,
      in_progress: previous.in_progress ?? defaultCollapsed.in_progress,
      blocked: previous.blocked ?? defaultCollapsed.blocked,
      completed: previous.completed ?? defaultCollapsed.completed,
    }));
  }, [defaultCollapsed]);

  async function handleSubmit(group: TaskGroup) {
    const title = draftTitle.trim();
    if (!title) return;
    setSubmitting(true);
    try {
      await onAddTask(group, title);
      setDraftTitle("");
      setAddingGroupKey(null);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-[24px] border border-[#223047] bg-[#101827] shadow-[0_20px_60px_rgba(5,10,20,0.35)]">
        <div className="grid grid-cols-[minmax(0,1.8fr)_120px_140px_110px_40px] border-b border-[#1d2738] px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7f8ca3]">
          <span>Task</span>
          <span>Owner</span>
          <span>Status</span>
          <span>Due date</span>
          <span />
        </div>

        <div className="space-y-4 p-4">
          {groups.map((group) => {
            const isCollapsed = collapsed[group.key] ?? false;

            return (
              <section key={group.key} className={`overflow-hidden rounded-[20px] border border-[#1d2738] bg-[#0d141f] ${group.accentClass}`}>
                <button
                  type="button"
                  onClick={() => setCollapsed((previous) => ({ ...previous, [group.key]: !isCollapsed }))}
                  className="flex w-full items-center justify-between gap-3 border-b border-[#162032] bg-[#111b2a] px-4 py-3 text-left"
                >
                  <div className="flex items-center gap-3">
                    <ChevronDown
                      size={16}
                      className={`text-[#8f9bb2] transition-transform ${isCollapsed ? "-rotate-90" : "rotate-0"}`}
                    />
                    <div>
                      <p className="text-[15px] font-semibold text-[#eef3ff]">{group.label}</p>
                      <p className="text-[11px] text-[#7f8ca3]">{group.tasks.length} tasks</p>
                    </div>
                  </div>
                </button>

                {!isCollapsed && (
                  <div>
                    {group.tasks.map((task) => (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => onTaskClick(task)}
                        className="grid w-full grid-cols-[minmax(0,1.8fr)_120px_140px_110px_40px] items-center gap-3 border-b border-[#162032] px-5 py-3 text-left transition-colors hover:bg-[#121d2d]"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-medium text-[#eef3ff]">{task.title}</p>
                          {task.description && (
                            <p className="truncate text-[12px] text-[#7f8ca3]">{task.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold ${getAvatarTone(task.assigneeName)}`}>
                            {getInitials(task.assigneeName)}
                          </span>
                          <span className="truncate text-[12px] text-[#c7d1e2]">{task.assigneeName ?? "Unassigned"}</span>
                        </div>
                        <StatusChip status={task.status} />
                        <span className="text-[12px] text-[#d0d9e8]">{formatDueDate(task.dueDate)}</span>
                        <span className="text-right text-[#4a5a77]">+</span>
                      </button>
                    ))}

                    <div className="border-b border-[#162032] px-5 py-3">
                      {addingGroupKey === group.key ? (
                        <div className="flex items-center gap-2">
                          <input
                            value={draftTitle}
                            onChange={(event) => setDraftTitle(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                void handleSubmit(group);
                              }
                              if (event.key === "Escape") {
                                setAddingGroupKey(null);
                                setDraftTitle("");
                              }
                            }}
                            placeholder={`Add a task to ${group.label.toLowerCase()}`}
                            className="h-10 flex-1 rounded-xl border border-[#2d3b52] bg-[#101827] px-3 text-[13px] text-[#eef3ff] outline-none focus:border-[#8B5CF6]"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => void handleSubmit(group)}
                            disabled={submitting}
                            className="rounded-xl bg-[#8B5CF6] px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-50"
                          >
                            Save
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setAddingGroupKey(group.key);
                            setDraftTitle("");
                          }}
                          className="flex w-full items-center gap-2 rounded-xl border border-dashed border-[#2a3447] bg-[#0f1724] px-3 py-2 text-[13px] text-[#7f8ca3] transition-colors hover:border-[#3a4864] hover:text-[#d6deed]"
                        >
                          <Plus size={14} />
                          Add task
                        </button>
                      )}
                    </div>

                    <div className="px-5 py-3">
                      <GroupProgressStrip tasks={group.tasks} />
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={onAddGroup}
        className="flex w-full items-center justify-center gap-2 rounded-[18px] border border-dashed border-[#31415d] bg-[#0f1724] px-4 py-3 text-[13px] font-medium text-[#9aa8c1] transition-colors hover:border-[#4a5f83] hover:text-[#eef3ff]"
      >
        <Plus size={14} />
        Add new group
      </button>
    </div>
  );
}
