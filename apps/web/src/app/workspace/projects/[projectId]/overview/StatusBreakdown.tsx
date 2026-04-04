"use client";

import { useMemo } from "react";
import type { WorkspaceTask } from "@/app/dashboard/types";

const STATUS_CONFIG = [
  { key: "completed",   label: "Completed",   color: "#22c55e", bg: "rgba(34,197,94,0.08)",   border: "rgba(34,197,94,0.2)" },
  { key: "not_started", label: "Not Started",  color: "#9ca3af", bg: "rgba(156,163,175,0.08)", border: "rgba(156,163,175,0.2)" },
  { key: "on_track",    label: "In Progress",  color: "#6c44f6", bg: "rgba(108,68,246,0.08)",  border: "rgba(108,68,246,0.2)" },
  { key: "at_risk",     label: "At Risk",      color: "#f59e0b", bg: "rgba(245,158,11,0.08)",  border: "rgba(245,158,11,0.2)" },
  { key: "overdue",     label: "Delayed",      color: "#ef4444", bg: "rgba(239,68,68,0.08)",   border: "rgba(239,68,68,0.2)" },
] as const;

function bucketStatus(status: string): string {
  if (status === "backlog") return "not_started";
  if (status === "in_progress" || status === "waiting") return "on_track";
  if (status === "blocked") return "at_risk";
  return status;
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

  const total = tasks.length;

  return (
    <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-[1fr_auto]">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-5">
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
            <p className="text-[10px]" style={{ color: "var(--text-muted)", marginTop: "4px" }}>
              {cfg.label}
            </p>
          </div>
        ))}
      </div>

      <DonutChart counts={counts} total={total} />
    </div>
  );
}

function DonutChart({ counts, total }: { counts: Record<string, number>; total: number }) {
  const segments = useMemo(() => {
    const entries = STATUS_CONFIG.filter((cfg) => counts[cfg.key] > 0);
    const safeTotal = total || 1;
    let cumAngle = -90;
    return entries.map((cfg) => {
      const angle = (counts[cfg.key] / safeTotal) * 360;
      const startAngle = cumAngle;
      cumAngle += angle;
      return { ...cfg, count: counts[cfg.key], angle, startAngle };
    });
  }, [counts, total]);

  const R = 56;
  const innerR = 36;
  const cx = 70;
  const cy = 70;

  const polarToXY = (r: number, angleDeg: number) => {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };

  return (
    <div style={{ width: "140px", textAlign: "center" }}>
      <svg width={140} height={140} viewBox="0 0 140 140">
        {total === 0 ? (
          <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--border)" strokeWidth={R - innerR} />
        ) : (
          segments.map((seg) => {
            if (seg.angle <= 0) return null;
            const start = polarToXY(R, seg.startAngle);
            const end = polarToXY(R, seg.startAngle + seg.angle);
            const large = seg.angle > 180 ? 1 : 0;
            const innerStart = polarToXY(innerR, seg.startAngle + seg.angle);
            const innerEnd = polarToXY(innerR, seg.startAngle);
            const d = [
              `M ${start.x} ${start.y}`,
              `A ${R} ${R} 0 ${large} 1 ${end.x} ${end.y}`,
              `L ${innerStart.x} ${innerStart.y}`,
              `A ${innerR} ${innerR} 0 ${large} 0 ${innerEnd.x} ${innerEnd.y}`,
              "Z",
            ].join(" ");
            return <path key={seg.key} d={d} fill={seg.color} />;
          })
        )}
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize={18} fontWeight={800} fill="var(--text-1)">
          {total}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" fontSize={9} fill="var(--text-muted)">
          total
        </text>
      </svg>
    </div>
  );
}
