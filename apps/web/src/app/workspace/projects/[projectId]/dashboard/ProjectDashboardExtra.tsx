"use client";

import { useCallback, useEffect, useState } from "react";

interface DashboardData {
  health?: {
    completionRate?: number;
    blockedCount?: number;
    avgRiskScore?: number;
    riskLevel?: string;
    taskCount?: number;
  };
  outcomes?: {
    narrative?: string;
  };
  breakdown?: {
    byStatus?: Record<string, number>;
    byAssignee?: Record<string, { total: number; completed: number }>;
  };
}

const STATUS_COLORS: Record<string, string> = {
  backlog: "#90d4a0",
  not_started: "#90d4a0",
  in_progress: "#5b8dee",
  waiting: "#5b8dee",
  blocked: "#f07878",
  completed: "#7ec8e3",
};

const STATUS_LABELS: Record<string, string> = {
  backlog: "Backlog",
  not_started: "Not Started",
  in_progress: "In Progress",
  waiting: "Waiting",
  blocked: "Blocked",
  completed: "Done",
};

function DonutChart({ byStatus }: { byStatus: Record<string, number> }) {
  const entries = Object.entries(byStatus).filter(([, v]) => v > 0);
  const total = entries.reduce((s, [, v]) => s + v, 0) || 1;

  let cumAngle = -90;
  const segments = entries.map(([key, val]) => {
    const angle = (val / total) * 360;
    const startAngle = cumAngle;
    cumAngle += angle;
    return { key, val, angle, startAngle };
  });

  const polarToXY = (cx: number, cy: number, r: number, angleDeg: number) => {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };

  const R = 80;
  const cx = 100;
  const cy = 100;
  const innerR = 52;

  return (
    <div className="flex items-center gap-6">
      <svg width={200} height={200} viewBox="0 0 200 200">
        {segments.map(({ key, val: _val, angle, startAngle }) => {
          if (angle <= 0) return null;
          const start = polarToXY(cx, cy, R, startAngle);
          const end = polarToXY(cx, cy, R, startAngle + angle);
          const large = angle > 180 ? 1 : 0;
          const innerStart = polarToXY(cx, cy, innerR, startAngle + angle);
          const innerEnd = polarToXY(cx, cy, innerR, startAngle);
          const d = [
            `M ${start.x} ${start.y}`,
            `A ${R} ${R} 0 ${large} 1 ${end.x} ${end.y}`,
            `L ${innerStart.x} ${innerStart.y}`,
            `A ${innerR} ${innerR} 0 ${large} 0 ${innerEnd.x} ${innerEnd.y}`,
            "Z",
          ].join(" ");
          return <path key={key} d={d} fill={STATUS_COLORS[key] ?? "#9699a8"} />;
        })}
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize={18} fontWeight={700} fill="#323338">
          {total}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" fill="#9699a8" fontSize={12}>
          tasks
        </text>
      </svg>
      <div className="space-y-2">
        {entries.map(([key, val]) => (
          <div key={key} className="flex items-center gap-2 text-[13px]">
            <span
              className="h-3 w-3 rounded-sm shrink-0"
              style={{ background: STATUS_COLORS[key] ?? "#9699a8" }}
            />
            <span style={{ color: "var(--text-2)" }}>{STATUS_LABELS[key] ?? key}</span>
            <span className="font-semibold" style={{ color: "var(--text-1)" }}>{val}</span>
            <span style={{ color: "var(--text-muted)" }}>
              ({Math.round((val / total) * 100)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AssigneeBar({
  byAssignee,
}: {
  byAssignee: Record<string, { total: number; completed: number }>;
}) {
  const entries = Object.entries(byAssignee).slice(0, 8);
  if (entries.length === 0)
    return (
      <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
        No assignee data.
      </p>
    );
  return (
    <div className="space-y-2">
      {entries.map(([assignee, { total, completed }]) => {
        const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
        return (
          <div key={assignee} className="flex items-center gap-3">
            <div
              className="w-24 shrink-0 truncate text-[12px]"
              style={{ color: "var(--text-2)" }}
            >
              {assignee.slice(0, 12)}
            </div>
            <div
              className="flex-1 h-4 rounded-full overflow-hidden"
              style={{ background: "var(--surface-2)" }}
            >
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, background: "#5b8dee" }}
              />
            </div>
            <span
              className="w-10 shrink-0 text-right text-[12px] font-semibold"
              style={{ color: "var(--text-1)" }}
            >
              {pct}%
            </span>
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              {completed}/{total}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function ProjectDashboardExtra({ projectId }: { projectId: string }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/workspace/projects/${projectId}/dashboard`);
      if (res.ok) {
        const d = (await res.json()) as DashboardData;
        setData(d);
      }
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <p className="text-[14px] py-2" style={{ color: "var(--text-muted)" }}>
        Loading analytics…
      </p>
    );
  }

  const byStatus = data?.breakdown?.byStatus ?? {};
  const byAssignee = data?.breakdown?.byAssignee ?? {};
  const health = data?.health ?? {};
  const outcomes = data?.outcomes;

  const riskColor =
    (health.avgRiskScore ?? 0) >= 70
      ? "#f07878"
      : (health.avgRiskScore ?? 0) >= 35
      ? "#f5c842"
      : "#5b8dee";

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          {
            label: "Completion",
            value: `${(health.completionRate ?? 0).toFixed(0)}%`,
            color: "#5b8dee",
          },
          {
            label: "Risk Score",
            value: (health.avgRiskScore ?? 0).toFixed(0),
            color: riskColor,
          },
          {
            label: "Blocked Tasks",
            value: String(health.blockedCount ?? 0),
            color: "#f07878",
          },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            style={{
              borderRadius: "var(--radius-card)",
              border: "1px solid var(--border)",
              background: "var(--surface)",
              padding: "20px",
            }}
          >
            <p
              className="text-[12px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--text-muted)" }}
            >
              {label}
            </p>
            <p className="mt-1 text-[28px] font-bold" style={{ color }}>
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Task Status Breakdown */}
      <div
        style={{
          borderRadius: "var(--radius-card)",
          border: "1px solid var(--border)",
          background: "var(--surface)",
          padding: "20px",
        }}
      >
        <h2 className="mb-4 text-[14px] font-semibold" style={{ color: "var(--text-1)" }}>
          Task Status Breakdown
        </h2>
        {Object.keys(byStatus).length > 0 ? (
          <DonutChart byStatus={byStatus} />
        ) : (
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
            No task data available.
          </p>
        )}
      </div>

      {/* Completion by Assignee */}
      <div
        style={{
          borderRadius: "var(--radius-card)",
          border: "1px solid var(--border)",
          background: "var(--surface)",
          padding: "20px",
        }}
      >
        <h2 className="mb-4 text-[14px] font-semibold" style={{ color: "var(--text-1)" }}>
          Completion by Assignee
        </h2>
        <AssigneeBar byAssignee={byAssignee} />
      </div>

      {/* Larry's Assessment */}
      {outcomes?.narrative && (
        <div
          style={{
            borderRadius: "var(--radius-card)",
            border: "1px solid var(--border)",
            background: "var(--surface)",
            padding: "20px",
          }}
        >
          <h2 className="mb-2 text-[14px] font-semibold" style={{ color: "var(--text-1)" }}>
            Larry&apos;s Assessment
          </h2>
          <p
            className="text-[14px] leading-relaxed"
            style={{ color: "var(--text-2)" }}
          >
            {outcomes.narrative}
          </p>
        </div>
      )}

      {/* Risk Level indicator */}
      <div
        style={{
          borderRadius: "var(--radius-card)",
          border: "1px solid var(--border)",
          background: "var(--surface)",
          padding: "20px",
        }}
      >
        <h2 className="mb-3 text-[14px] font-semibold" style={{ color: "var(--text-1)" }}>
          Risk Level
        </h2>
        <div className="flex items-center gap-3">
          <span
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold"
            style={{
              background: riskColor === "#f07878" ? "#fff1f2" : riskColor === "#f5c842" ? "#fffbeb" : "#eff6ff",
              color: riskColor === "#f07878" ? "#be123c" : riskColor === "#f5c842" ? "#854d0e" : "#1d4ed8",
              borderColor: riskColor === "#f07878" ? "#fecdd3" : riskColor === "#f5c842" ? "#fde68a" : "#bfdbfe",
            }}
          >
            {(health.avgRiskScore ?? 0) >= 70 ? "High" : (health.avgRiskScore ?? 0) >= 35 ? "Medium" : "Low"} risk
          </span>
          <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Risk score: {Math.round(health.avgRiskScore ?? 0)}
          </span>
        </div>
      </div>
    </div>
  );
}
