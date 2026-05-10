"use client";

import { useMemo, useState } from "react";
import { Check, GitBranch, ListChecks, Sparkles, X } from "lucide-react";
import type { Timeline2Branch, Timeline2Operation } from "@larry/shared";

function operationTitle(op: Timeline2Operation) {
  const afterTitle = typeof op.after?.title === "string" ? op.after.title : null;
  const beforeTitle = typeof op.before?.title === "string" ? op.before.title : null;
  return afterTitle ?? beforeTitle ?? op.operationType.replace(/_/g, " ");
}

function fieldDiffs(op: Timeline2Operation) {
  const before = op.before ?? {};
  const after = op.after ?? {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((key) => {
    const b = before[key];
    const a = after[key];
    return JSON.stringify(b) !== JSON.stringify(a) && !["id", "createdAt", "updatedAt"].includes(key);
  });
  return keys.slice(0, 6).map((key) => ({
    key,
    before: before[key],
    after: after[key],
  }));
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "empty";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

export function Timeline2BranchReview({
  branches,
  onAccept,
  onReject,
  busy,
}: {
  branches: Timeline2Branch[];
  onAccept: (branchId: string, operationIds?: string[]) => Promise<unknown>;
  onReject: (branchId: string, operationIds?: string[]) => Promise<unknown>;
  busy: boolean;
}) {
  const [selected, setSelected] = useState<Record<string, Set<string>>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const pendingBranches = branches.filter((branch) => branch.status === "open");
  const pendingOps = useMemo(() => pendingBranches.reduce((sum, branch) => sum + branch.operationCounts.pending, 0), [pendingBranches]);
  if (branches.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-[24px] border bg-white shadow-sm" style={{ borderColor: "#ddd6fe" }}>
      <div className="flex flex-col gap-4 border-b px-5 py-4 lg:flex-row lg:items-center lg:justify-between" style={{ borderColor: "#ddd6fe", background: "linear-gradient(135deg, #fbf8ff 0%, #ffffff 100%)" }}>
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-lg shadow-purple-200" style={{ background: "linear-gradient(135deg, #7c3aed, #b078ff)" }}>
            <Sparkles size={18} />
          </span>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--cta)" }}>
              AI proposal review
            </p>
            <h3 className="mt-1 text-[20px] font-semibold tracking-[-0.03em]" style={{ color: "var(--text-1)" }}>
              Compare current plan with proposed changes
            </h3>
            <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
              {branches.length} open branch{branches.length === 1 ? "" : "es"} · {pendingOps} pending operation{pendingOps === 1 ? "" : "s"}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4">
        {branches.map((branch) => {
          const selectedOps = selected[branch.id] ?? new Set(branch.operations.filter((op) => op.status === "pending").map((op) => op.id));
          const setBranchSelection = (next: Set<string>) => setSelected((prev) => ({ ...prev, [branch.id]: next }));
          const isExpanded = expanded[branch.id] ?? true;
          return (
            <article key={branch.id} className="rounded-2xl border bg-white" style={{ borderColor: "var(--border)" }}>
              <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <GitBranch size={16} style={{ color: "var(--cta)" }} />
                    <p className="truncate text-[15px] font-semibold" style={{ color: "var(--text-1)" }}>{branch.title}</p>
                    <span className="rounded-full px-2 py-1 text-[11px] font-semibold" style={{ background: "#f3f0ff", color: "var(--cta)" }}>
                      {branch.status}
                    </span>
                  </div>
                  <p className="mt-1 text-[13px] leading-5" style={{ color: "var(--text-2)" }}>{branch.summary}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setExpanded((prev) => ({ ...prev, [branch.id]: !isExpanded }))}
                  className="h-9 rounded-xl border px-3 text-[12px] font-semibold"
                  style={{ borderColor: "var(--border)", color: "var(--text-2)" }}
                >
                  {isExpanded ? "Hide compare" : "Show compare"}
                </button>
              </div>

              {isExpanded && (
                <div className="grid gap-3 border-t p-4 lg:grid-cols-[minmax(0,1fr)_300px]" style={{ borderColor: "var(--border)" }}>
                  <div className="space-y-3">
                    {branch.operations.map((op) => {
                      const pending = op.status === "pending";
                      const diffs = fieldDiffs(op);
                      return (
                        <label key={op.id} className="block rounded-2xl border p-3" style={{ borderColor: pending ? "#ddd6fe" : "var(--border)", background: pending ? "#fbfaff" : "var(--surface-2)" }}>
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              disabled={!pending}
                              checked={selectedOps.has(op.id)}
                              onChange={(e) => {
                                const next = new Set(selectedOps);
                                if (e.target.checked) next.add(op.id);
                                else next.delete(op.id);
                                setBranchSelection(next);
                              }}
                              className="mt-1"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em]" style={{ background: "#f3f0ff", color: "var(--cta)" }}>
                                  {op.operationType.replace(/_/g, " ")}
                                </span>
                                <span className="text-[11px] font-semibold" style={{ color: pending ? "var(--cta)" : "var(--text-muted)" }}>{op.status}</span>
                              </div>
                              <p className="mt-2 text-[14px] font-semibold" style={{ color: "var(--text-1)" }}>{operationTitle(op)}</p>
                              <p className="mt-1 text-[12px] leading-5" style={{ color: "var(--text-2)" }}>{op.rationale}</p>
                              {diffs.length > 0 && (
                                <div className="mt-3 grid gap-2 md:grid-cols-2">
                                  {diffs.map((diff) => (
                                    <div key={diff.key} className="rounded-xl border bg-white p-2" style={{ borderColor: "var(--border)" }}>
                                      <p className="text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--text-muted)" }}>{diff.key}</p>
                                      <div className="mt-1 grid grid-cols-2 gap-2 text-[11px]">
                                        <span className="rounded bg-[var(--surface-2)] px-2 py-1" style={{ color: "var(--text-muted)" }}>{formatValue(diff.before)}</span>
                                        <span className="rounded bg-[#f3f0ff] px-2 py-1 font-semibold" style={{ color: "var(--cta)" }}>{formatValue(diff.after)}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>

                  <aside className="rounded-2xl border bg-white p-4" style={{ borderColor: "var(--border)" }}>
                    <p className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: "var(--text-1)" }}>
                      <ListChecks size={15} style={{ color: "var(--cta)" }} />
                      Review controls
                    </p>
                    <p className="mt-2 text-[12px] leading-5" style={{ color: "var(--text-2)" }}>
                      Apply the selected operations, reject selected rows, or resolve the full branch. Canonical Timeline 2 data changes only after acceptance.
                    </p>
                    <div className="mt-4 space-y-2">
                      <button disabled={busy || selectedOps.size === 0} onClick={() => void onAccept(branch.id, [...selectedOps])} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl px-3 text-[12px] font-semibold text-white disabled:opacity-50" style={{ background: "linear-gradient(135deg, #7c3aed, #9b5cf6)" }}>
                        <Check size={14} /> Accept selected
                      </button>
                      <button disabled={busy || selectedOps.size === 0} onClick={() => void onReject(branch.id, [...selectedOps])} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border px-3 text-[12px] font-semibold disabled:opacity-50" style={{ borderColor: "var(--border)", color: "var(--text-2)" }}>
                        <X size={14} /> Reject selected
                      </button>
                      <div className="grid grid-cols-2 gap-2 pt-2">
                        <button disabled={busy} onClick={() => void onReject(branch.id)} className="h-9 rounded-xl border px-3 text-[12px] font-semibold" style={{ borderColor: "#fecdd3", color: "#be123c", background: "#fff1f2" }}>
                          Reject branch
                        </button>
                        <button disabled={busy} onClick={() => void onAccept(branch.id)} className="h-9 rounded-xl border px-3 text-[12px] font-semibold" style={{ borderColor: "var(--cta)", color: "var(--cta)" }}>
                          Accept branch
                        </button>
                      </div>
                    </div>
                  </aside>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
