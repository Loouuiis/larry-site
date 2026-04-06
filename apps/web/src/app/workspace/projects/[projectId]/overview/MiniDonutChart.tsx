"use client";

import { useMemo } from "react";
import type { WorkspaceTask } from "@/app/dashboard/types";

const STATUS_CONFIG = [
  { key: "not_started", label: "Not Started", color: "#b0b0b0" },
  { key: "on_track",    label: "In Progress", color: "#7ab0d8" },
  { key: "at_risk",     label: "At Risk",     color: "#d4b84a" },
  { key: "overdue",     label: "Delayed",     color: "#e87878" },
  { key: "completed",   label: "Completed",   color: "#6ab86a" },
] as const;

function bucketStatus(status: string): string {
  if (status === "backlog") return "not_started";
  if (status === "in_progress" || status === "waiting") return "on_track";
  if (status === "blocked") return "at_risk";
  return status;
}

export function MiniDonutChart({ tasks }: { tasks: WorkspaceTask[] }) {
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

  const segments = useMemo(() => {
    const safeTotal = total || 1;
    let cumAngle = 0;
    return STATUS_CONFIG.filter((cfg) => counts[cfg.key] > 0).map((cfg) => {
      const angle = (counts[cfg.key] / safeTotal) * 360;
      const startAngle = cumAngle;
      cumAngle += angle;
      return { ...cfg, count: counts[cfg.key], angle, startAngle };
    });
  }, [counts, total]);

  const R = 44;
  const innerR = 28;
  const cx = 50;
  const cy = 50;

  const polarToXY = (r: number, angleDeg: number) => {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };

  return (
    <div
      style={{
        borderRadius: "var(--radius-card)",
        border: "1px solid var(--border)",
        background: "var(--surface)",
        padding: "14px 18px",
        minWidth: "150px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "10px",
      }}
    >
      <p className="text-[12px] font-semibold self-start" style={{ color: "var(--text-muted)" }}>
        Distribution
      </p>

      <svg width={100} height={100} viewBox="-6 -6 112 112">
        {total === 0 ? (
          <circle
            cx={cx}
            cy={cy}
            r={R}
            fill="none"
            stroke="var(--border)"
            strokeWidth={R - innerR}
          />
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
        <text
          x={cx}
          y={cy - 5}
          textAnchor="middle"
          fontSize={14}
          fontWeight={800}
          fill="var(--text-1)"
        >
          {total}
        </text>
        <text
          x={cx}
          y={cy + 10}
          textAnchor="middle"
          fontSize={9}
          fill="var(--text-muted)"
        >
          tasks
        </text>
      </svg>

      {/* Compact legend */}
      <div className="grid grid-cols-3 gap-x-3 gap-y-1 self-start">
        {STATUS_CONFIG.map((cfg) => (
          <div key={cfg.key} className="flex items-center gap-1">
            <span
              className="shrink-0 rounded-sm"
              style={{ width: "8px", height: "8px", background: cfg.color }}
            />
            <span className="text-[10px] leading-none" style={{ color: "var(--text-muted)" }}>
              {counts[cfg.key]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
