"use client";

import { useMemo } from "react";
import type { WorkspaceTask } from "@/app/dashboard/types";

const STATUS_CONFIG = [
  {
    key: "not_started",
    label: "Not Started",
    color: "#b0b0b0",
    bg: "rgba(196,196,196,0.15)",
    border: "rgba(196,196,196,0.35)",
  },
  {
    key: "on_track",
    label: "In Progress",
    color: "#7ab0d8",
    bg: "rgba(122,176,216,0.12)",
    border: "rgba(122,176,216,0.35)",
  },
  {
    key: "at_risk",
    label: "At Risk",
    color: "#d4b84a",
    bg: "rgba(234,217,122,0.18)",
    border: "rgba(234,217,122,0.45)",
  },
  {
    key: "overdue",
    label: "Overdue",
    color: "#e87878",
    bg: "rgba(232,120,120,0.10)",
    border: "rgba(232,120,120,0.30)",
  },
  {
    key: "completed",
    label: "Completed",
    color: "#6ab86a",
    bg: "rgba(136,196,122,0.12)",
    border: "rgba(136,196,122,0.35)",
  },
] as const;

function bucketStatus(status: string): string {
  if (status === "backlog") return "not_started";
  if (status === "in_progress" || status === "waiting") return "on_track";
  if (status === "blocked") return "at_risk";
  return status;
}

function StatusBarChart({ counts, maxVal }: { counts: Record<string, number>; maxVal: number }) {
  return (
    <div
      style={{
        borderRadius: "var(--radius-card)",
        border: "1px solid var(--border)",
        background: "var(--surface)",
        padding: "20px",
      }}
    >
      <h2 className="mb-4 text-[14px] font-semibold" style={{ color: "var(--text-1)" }}>
        Tasks by Status
      </h2>
      <div className="flex items-end gap-3" style={{ height: "160px" }}>
        {STATUS_CONFIG.map((cfg) => {
          const val = counts[cfg.key] ?? 0;
          const safeMax = maxVal || 1;
          const heightPct = (val / safeMax) * 100;
          return (
            <div key={cfg.key} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[11px] font-semibold" style={{ color: cfg.color }}>
                {val}
              </span>
              <div className="w-full flex items-end" style={{ height: "120px" }}>
                <div
                  style={{
                    width: "100%",
                    height: `${heightPct}%`,
                    background: cfg.color,
                    borderRadius: "4px 4px 0 0",
                    minHeight: val > 0 ? "4px" : "0",
                    transition: "height 0.4s ease",
                  }}
                />
              </div>
              <span className="text-[10px] text-center" style={{ color: "var(--text-muted)" }}>
                {cfg.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function StatusBreakdown({ tasks }: { tasks: WorkspaceTask[] }) {
  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const cfg of STATUS_CONFIG) map[cfg.key] = 0;
    for (const t of tasks) {
      const bucket = bucketStatus(t.status);
      if (bucket in map) map[bucket]++;
    }
    return map;
  }, [tasks]);

  const maxVal = Math.max(...STATUS_CONFIG.map((c) => counts[c.key] ?? 0), 1);

  return (
    <div className="space-y-3">
      {/* 5 status boxes with white background */}
      <div
        className="rounded-xl p-3"
        style={{ background: "#ffffff", border: "1px solid var(--border)" }}
      >
        <div className="grid grid-cols-5 gap-2.5">
          {STATUS_CONFIG.map((cfg) => (
            <div
              key={cfg.key}
              style={{
                background: cfg.bg,
                border: `1px solid ${cfg.border}`,
                borderRadius: "var(--radius-card)",
                padding: "14px 8px",
                textAlign: "center",
              }}
            >
              <p className="text-[24px] font-extrabold" style={{ color: cfg.color }}>
                {counts[cfg.key]}
              </p>
              <p
                className="text-[10px]"
                style={{ color: "var(--text-muted)", marginTop: "4px" }}
              >
                {cfg.label}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Full-width bar chart */}
      <StatusBarChart counts={counts} maxVal={maxVal} />
    </div>
  );
}
