"use client";

import { useState } from "react";
import { AlertTriangle, CalendarDays, Loader2, Trash2, Users, X } from "lucide-react";
import type {
  Timeline2Dependency,
  Timeline2Node,
  Timeline2NodeKind,
  Timeline2Priority,
  Timeline2Status,
  Timeline2TeamMember,
} from "@larry/shared";
import type { Timeline2NodeInput } from "@/hooks/useTimeline2";
import { KIND_LABELS, type NodeSheetState, PRIORITY_LABELS, STATUS_LABELS } from "./timeline2-ui";
import { PersonAvatar } from "./Timeline2Primitives";

export function Timeline2NodeDrawer({
  state,
  nodes,
  teamMembers,
  dependencies,
  onClose,
  onSave,
  onDelete,
  onDeleteDependency,
  onEditDependenciesOnTimeline,
  onEditParentInTaskCenter,
  saving,
}: {
  state: NodeSheetState;
  nodes: Timeline2Node[];
  dependencies: Timeline2Dependency[];
  teamMembers: Timeline2TeamMember[];
  onClose: () => void;
  onSave: (draft: Timeline2NodeInput) => Promise<void>;
  onDelete?: (nodeId: string) => Promise<void>;
  onDeleteDependency: (dependencyId: string) => Promise<unknown>;
  onEditDependenciesOnTimeline: (nodeId: string) => void;
  onEditParentInTaskCenter: (nodeId: string) => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState<Timeline2NodeInput>(state.draft);
  const selectedAssignees = new Set(draft.assigneeUserIds ?? []);
  const currentNodeId = state.mode === "edit" ? state.nodeId : null;
  const currentParent = draft.parentId ? nodes.find((node) => node.id === draft.parentId) ?? null : null;
  const blockingDependencies = currentNodeId
    ? dependencies.filter((dependency) => dependency.toNodeId === currentNodeId)
    : [];
  const unlockingDependencies = currentNodeId
    ? dependencies.filter((dependency) => dependency.fromNodeId === currentNodeId)
    : [];
  const persistedNode =
    state.mode === "edit" && state.nodeId ? nodes.find((node) => node.id === state.nodeId) ?? null : null;
  const statusRollupLocked = Boolean(persistedNode && persistedNode.children.length > 0);

  const set = <K extends keyof Timeline2NodeInput>(key: K, value: Timeline2NodeInput[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: "rgba(17, 23, 44, 0.38)" }}>
      <div className="flex h-full w-full max-w-[560px] flex-col bg-white shadow-2xl">
        <div className="relative overflow-hidden border-b px-6 py-5" style={{ borderColor: "var(--border)" }}>
          <div className="absolute right-0 top-0 h-24 w-40 rounded-bl-full bg-[#5d8bab]/10" />
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--cta)" }}>
                Timeline 2 node
              </p>
              <h2 className="mt-2 text-[21px] font-semibold tracking-[-0.03em]" style={{ color: "var(--text-1)" }}>
                {state.mode === "create" ? "Create a planning item" : "Edit planning item"}
              </h2>
              <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
                Workstreams, tasks, milestones, assignments, dependencies and AI proposals all resolve through this v2 record.
              </p>
            </div>
            <button type="button" onClick={onClose} className="relative flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[var(--surface-2)]">
              <X size={17} />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <section className="rounded-2xl border bg-white p-4 shadow-sm" style={{ borderColor: "var(--border)" }}>
            <label className="block">
              <span className="text-[12px] font-semibold" style={{ color: "var(--text-2)" }}>Task name</span>
              <input
                value={draft.title}
                onChange={(e) => set("title", e.target.value)}
                className="mt-2 h-12 w-full rounded-xl border px-4 text-[15px] font-semibold outline-none focus:border-[var(--cta)]"
                style={{ borderColor: "var(--border)", color: "var(--text-1)" }}
                placeholder="Name the outcome or deliverable"
              />
            </label>
            <label className="mt-4 block">
              <span className="text-[12px] font-semibold" style={{ color: "var(--text-2)" }}>Description</span>
              <textarea
                value={draft.description ?? ""}
                onChange={(e) => set("description", e.target.value || null)}
                rows={4}
                className="mt-2 w-full resize-none rounded-xl border px-4 py-3 text-[13px] leading-6 outline-none focus:border-[var(--cta)]"
                style={{ borderColor: "var(--border)" }}
                placeholder="Add decisions, risks, acceptance criteria, or context for the AI."
              />
            </label>
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <label className="rounded-2xl border bg-white p-3 shadow-sm" style={{ borderColor: "var(--border)" }}>
              <span className="text-[12px] font-semibold" style={{ color: "var(--text-2)" }}>Kind</span>
              <select value={draft.kind ?? "task"} onChange={(e) => set("kind", e.target.value as Timeline2NodeKind)} className="mt-2 h-10 w-full rounded-xl border px-3 text-[13px]" style={{ borderColor: "var(--border)" }}>
                {Object.entries(KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="rounded-2xl border bg-white p-3 shadow-sm" style={{ borderColor: "var(--border)" }}>
              <span className="text-[12px] font-semibold" style={{ color: "var(--text-2)" }}>Status</span>
              {statusRollupLocked ? (
                <p className="mt-1 text-[11px] leading-4" style={{ color: "var(--text-muted)" }}>
                  Roll-up from child tasks. Edit status on leaf tasks.
                </p>
              ) : null}
              <select
                value={draft.status ?? "not_started"}
                disabled={statusRollupLocked}
                onChange={(e) => set("status", e.target.value as Timeline2Status)}
                className="mt-2 h-10 w-full rounded-xl border px-3 text-[13px] disabled:cursor-not-allowed disabled:opacity-80"
                style={{ borderColor: "var(--border)" }}
              >
                {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="rounded-2xl border bg-white p-3 shadow-sm" style={{ borderColor: "var(--border)" }}>
              <span className="text-[12px] font-semibold" style={{ color: "var(--text-2)" }}>Priority</span>
              <select value={draft.priority ?? "medium"} onChange={(e) => set("priority", e.target.value as Timeline2Priority)} className="mt-2 h-10 w-full rounded-xl border px-3 text-[13px]" style={{ borderColor: "var(--border)" }}>
                {Object.entries(PRIORITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="rounded-2xl border bg-white p-3 shadow-sm" style={{ borderColor: "var(--border)" }}>
              <span className="text-[12px] font-semibold" style={{ color: "var(--text-2)" }}>Progress</span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                disabled={(draft.kind ?? "task") === "group"}
                value={draft.progress ?? 0}
                onChange={(e) => set("progress", Number(e.target.value))}
                className="mt-3 w-full"
              />
              <span className="mt-2 block text-[12px]" style={{ color: "var(--text-muted)" }}>
                {(draft.kind ?? "task") === "group"
                  ? "Group progress is derived from child items."
                  : `${draft.progress ?? 0}% complete`}
              </span>
            </label>
          </section>

          <section className="rounded-2xl border bg-white p-4 shadow-sm" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[13px] font-semibold" style={{ color: "var(--text-1)" }}>Parent in outline</p>
                <p className="mt-1 text-[12px] leading-5" style={{ color: "var(--text-2)" }}>
                  Parenting happens in the Task Center 2 outline so users can place work in context instead of using a long list.
                </p>
              </div>
              {currentNodeId && (
                <button
                  type="button"
                  onClick={() => onEditParentInTaskCenter(currentNodeId)}
                  className="shrink-0 rounded-xl border bg-white px-3 py-2 text-[12px] font-semibold"
                  style={{ borderColor: "var(--border)", color: "var(--text-2)" }}
                >
                  Choose parent in outline
                </button>
              )}
            </div>
            <div className="mt-3 rounded-xl border px-3 py-3 text-[12px]" style={{ borderColor: "var(--border)", background: "#f8fbfd" }}>
              <span className="block font-semibold" style={{ color: "var(--text-1)" }}>
                {currentParent ? currentParent.title : "Top level"}
              </span>
              <span className="mt-1 block" style={{ color: "var(--text-muted)" }}>
                {currentParent ? KIND_LABELS[currentParent.kind] : "This item currently sits at the top level."}
                {!currentNodeId ? " Save first if you want to re-parent it from the outline." : ""}
              </span>
            </div>
          </section>

          <section className="rounded-2xl border bg-white p-4 shadow-sm" style={{ borderColor: "var(--border)" }}>
            <p className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: "var(--text-1)" }}>
              <CalendarDays size={15} style={{ color: "var(--cta)" }} />
              Timeline
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label>
                <span className="text-[12px] font-semibold" style={{ color: "var(--text-2)" }}>Start</span>
                <input type="date" value={draft.startDate ?? ""} onChange={(e) => set("startDate", e.target.value || null)} className="mt-1 h-10 w-full rounded-xl border px-3 text-[13px]" style={{ borderColor: "var(--border)" }} />
              </label>
              <label>
                <span className="text-[12px] font-semibold" style={{ color: "var(--text-2)" }}>Due</span>
                <input type="date" value={draft.dueDate ?? ""} onChange={(e) => set("dueDate", e.target.value || null)} className="mt-1 h-10 w-full rounded-xl border px-3 text-[13px]" style={{ borderColor: "var(--border)" }} />
              </label>
            </div>
          </section>

          <section className="rounded-2xl border bg-white p-4 shadow-sm" style={{ borderColor: "var(--border)" }}>
            <p className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: "var(--text-1)" }}>
              <Users size={15} style={{ color: "var(--cta)" }} />
              Assignees
            </p>
            <div className="mt-3 max-h-[190px] space-y-1 overflow-y-auto rounded-xl border p-2" style={{ borderColor: "var(--border)" }}>
              {teamMembers.length === 0 ? (
                <p className="px-2 py-3 text-[12px]" style={{ color: "var(--text-muted)" }}>No project team members available.</p>
              ) : teamMembers.map((member) => (
                <label key={member.userId} className="flex items-center gap-3 rounded-xl px-2 py-2 text-[13px] hover:bg-[var(--surface-2)]">
                  <input
                    type="checkbox"
                    checked={selectedAssignees.has(member.userId)}
                    onChange={(e) => {
                      const next = new Set(selectedAssignees);
                      if (e.target.checked) next.add(member.userId);
                      else next.delete(member.userId);
                      set("assigneeUserIds", [...next]);
                    }}
                  />
                  <PersonAvatar name={member.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold" style={{ color: "var(--text-1)" }}>{member.name}</span>
                    <span className="block text-[11px]" style={{ color: "var(--text-disabled)" }}>{member.projectRole} · {member.email}</span>
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border bg-white p-4 shadow-sm" style={{ borderColor: "var(--border)" }}>
            <p className="text-[13px] font-semibold" style={{ color: "var(--text-1)" }}>Dependencies</p>
            <p className="mt-1 text-[12px] leading-5" style={{ color: "var(--text-2)" }}>
              Review existing links here. Add new links visually from the Timeline 2 Gantt so large projects do not depend on long dropdowns.
            </p>
            {!currentNodeId ? (
              <p className="mt-3 rounded-xl bg-[var(--surface-2)] px-3 py-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
                Save the task first, then add dependencies.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                <button
                  type="button"
                  onClick={() => currentNodeId && onEditDependenciesOnTimeline(currentNodeId)}
                  className="inline-flex h-10 w-full items-center justify-center rounded-xl px-3 text-[12px] font-semibold text-white"
                  style={{ background: "var(--cta)" }}
                >
                  Edit dependencies on Timeline 2
                </button>
                <div className="space-y-2">
                  {[...blockingDependencies, ...unlockingDependencies].length === 0 && (
                    <p className="rounded-xl bg-[var(--surface-2)] px-3 py-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
                      No dependency links yet.
                    </p>
                  )}
                  {[...blockingDependencies, ...unlockingDependencies].map((dependency) => {
                    const from = nodes.find((node) => node.id === dependency.fromNodeId);
                    const to = nodes.find((node) => node.id === dependency.toNodeId);
                    const label = dependency.toNodeId === currentNodeId
                      ? `Depends on ${from?.title ?? "Unknown"}`
                      : `Unlocks ${to?.title ?? "Unknown"}`;
                    return (
                      <span key={dependency.id} className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-[12px]" style={{ borderColor: "var(--border)", color: "var(--text-2)" }}>
                        <span className="min-w-0 truncate">{label}</span>
                        <button type="button" onClick={() => void onDeleteDependency(dependency.id)} className="shrink-0 font-semibold" style={{ color: "#be123c" }}>
                          Remove
                        </button>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          <section className="rounded-2xl border p-4 shadow-sm" style={{ borderColor: draft.actionRequired?.required ? "#fecdd3" : "var(--border)", background: draft.actionRequired?.required ? "#fff7f8" : "#fff" }}>
            <label className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: "var(--text-1)" }}>
              <input
                type="checkbox"
                checked={draft.actionRequired?.required ?? false}
                onChange={(e) => set("actionRequired", { required: e.target.checked, note: draft.actionRequired?.note ?? null })}
              />
              <AlertTriangle size={15} style={{ color: draft.actionRequired?.required ? "#b4233a" : "var(--text-muted)" }} />
              Action required
            </label>
            <input
              value={draft.actionRequired?.note ?? ""}
              onChange={(e) => set("actionRequired", { required: draft.actionRequired?.required ?? true, note: e.target.value || null })}
              placeholder="What needs a human decision?"
              className="mt-3 h-10 w-full rounded-xl border bg-white px-3 text-[12px] outline-none"
              style={{ borderColor: "var(--border)" }}
            />
          </section>
        </div>

        <div className="flex items-center justify-between border-t px-6 py-4" style={{ borderColor: "var(--border)" }}>
          {state.mode === "edit" && state.nodeId && onDelete ? (
            <button
              type="button"
              onClick={() => void onDelete(state.nodeId!)}
              className="inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-[12px] font-semibold"
              style={{ borderColor: "#fecdd3", color: "#be123c", background: "#fff1f2" }}
            >
              <Trash2 size={13} />
              Delete
            </button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="h-10 rounded-xl border px-4 text-[12px] font-semibold" style={{ borderColor: "var(--border)", color: "var(--text-2)" }}>
              Cancel
            </button>
            <button
              type="button"
              disabled={!draft.title?.trim() || saving}
              onClick={() => void onSave({ ...draft, title: draft.title.trim() })}
              className="inline-flex h-10 items-center gap-2 rounded-xl px-5 text-[12px] font-semibold text-white shadow-lg disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #214968, #5d8bab)", boxShadow: "0 14px 30px rgba(93,139,171,0.24)" }}
            >
              {saving && <Loader2 size={13} className="animate-spin" />}
              {state.mode === "create" ? "Create item" : "Save changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
