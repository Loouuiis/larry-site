"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Plus } from "lucide-react";

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
    metrics?: Record<string, number>;
  };
  breakdown?: {
    byStatus?: Record<string, number>;
    byAssignee?: Record<string, { total: number; completed: number }>;
  };
}

/* ── Status config — new order & colors from design spec ───────────── */

const STATUS_5_CONFIG = [
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
    label: "Delayed",
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

function mapToFiveStatuses(byStatus: Record<string, number>): Record<string, number> {
  return {
    completed:   byStatus.completed   ?? 0,
    not_started: (byStatus.not_started ?? 0) + (byStatus.backlog ?? 0),
    on_track:    (byStatus.in_progress ?? 0) + (byStatus.waiting ?? 0),
    at_risk:     byStatus.blocked     ?? 0,
    overdue:     byStatus.overdue     ?? 0,
  };
}

/* ── Progress bar ───────────────────────────────────────────────────── */

function DashboardProgress({
  completionRate,
  taskCount,
}: {
  completionRate: number;
  taskCount: number;
}) {
  const pct = Math.round(completionRate);
  const completed = Math.round((completionRate / 100) * taskCount);
  return (
    <div
      style={{
        borderRadius: "var(--radius-card)",
        border: "1px solid var(--border)",
        background: "var(--surface)",
        padding: "20px",
      }}
    >
      <p className="text-[13px] font-semibold mb-3" style={{ color: "var(--text-muted)" }}>
        Progress
      </p>
      <div className="flex items-center gap-3.5">
        <p className="text-[28px] font-extrabold" style={{ color: "#6c44f6" }}>
          {pct}%
        </p>
        <div style={{ flex: 1 }}>
          <div
            className="w-full overflow-hidden"
            style={{ height: "12px", borderRadius: "6px", background: "var(--surface-2)" }}
          >
            <div
              style={{
                width: `${pct > 0 ? Math.max(pct, 2) : 0}%`,
                height: "100%",
                borderRadius: "6px",
                background: "linear-gradient(90deg, #6c44f6, #9b7aff)",
                transition: "width 0.4s ease",
              }}
            />
          </div>
          <div
            className="mt-1 flex items-center justify-between text-[10px]"
            style={{ color: "var(--text-muted)" }}
          >
            <span>{completed} of {taskCount} tasks completed</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Risk score widget ──────────────────────────────────────────────── */

function RiskScoreWidget({
  avgRiskScore,
  riskLevel,
}: {
  avgRiskScore: number;
  riskLevel?: string;
}) {
  const color =
    avgRiskScore >= 70 ? "#ef4444" : avgRiskScore >= 35 ? "#f59e0b" : "#22c55e";
  const label =
    riskLevel ?? (avgRiskScore >= 70 ? "High" : avgRiskScore >= 35 ? "Medium" : "Low");
  return (
    <div
      style={{
        borderRadius: "var(--radius-card)",
        border: "1px solid var(--border)",
        background: "var(--surface)",
        padding: "20px",
        minWidth: "160px",
      }}
    >
      <p className="text-[13px] font-semibold mb-3" style={{ color: "var(--text-muted)" }}>
        Risk Score
      </p>
      <p className="text-[28px] font-extrabold" style={{ color }}>
        {Math.round(avgRiskScore)}
      </p>
      <p className="text-[11px] mt-1 font-semibold" style={{ color }}>
        {label} Risk
      </p>
    </div>
  );
}

/* ── 5 status boxes ─────────────────────────────────────────────────── */

function StatusFiveBoxes({ byStatus }: { byStatus: Record<string, number> }) {
  const counts = useMemo(() => mapToFiveStatuses(byStatus), [byStatus]);
  return (
    <div
      className="rounded-xl p-3"
      style={{ background: "#ffffff", border: "1px solid var(--border)" }}
    >
      <div className="grid grid-cols-5 gap-2.5">
        {STATUS_5_CONFIG.map((cfg) => (
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
    </div>
  );
}

/* ── Bar chart ──────────────────────────────────────────────────────── */

function StatusBarChart({ byStatus }: { byStatus: Record<string, number> }) {
  const counts = useMemo(() => mapToFiveStatuses(byStatus), [byStatus]);
  const maxVal = Math.max(...STATUS_5_CONFIG.map((c) => counts[c.key]), 1);
  return (
    <div
      style={{
        borderRadius: "var(--radius-card)",
        border: "1px solid var(--border)",
        background: "var(--surface)",
        padding: "20px",
        flex: 1,
      }}
    >
      <h2 className="mb-4 text-[14px] font-semibold" style={{ color: "var(--text-1)" }}>
        Tasks by Status
      </h2>
      <div className="flex items-end gap-3" style={{ height: "160px" }}>
        {STATUS_5_CONFIG.map((cfg) => {
          const val = counts[cfg.key];
          const heightPct = (val / maxVal) * 100;
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

/* ── Overview-style donut ───────────────────────────────────────────── */

function OverviewDonutWidget({ byStatus }: { byStatus: Record<string, number> }) {
  const counts = useMemo(() => mapToFiveStatuses(byStatus), [byStatus]);
  const total = useMemo(
    () => STATUS_5_CONFIG.reduce((s, cfg) => s + counts[cfg.key], 0),
    [counts],
  );

  const segments = useMemo(() => {
    const safeTotal = total || 1;
    let cumAngle = 0;
    return STATUS_5_CONFIG.filter((cfg) => counts[cfg.key] > 0).map((cfg) => {
      const angle = (counts[cfg.key] / safeTotal) * 360;
      const startAngle = cumAngle;
      cumAngle += angle;
      return { ...cfg, count: counts[cfg.key], angle, startAngle };
    });
  }, [counts, total]);

  const R = 80;
  const innerR = 52;
  const cx = 100;
  const cy = 100;

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
        padding: "20px",
        flex: 1,
      }}
    >
      <h2 className="mb-4 text-[14px] font-semibold" style={{ color: "var(--text-1)" }}>
        Task Distribution
      </h2>
      <div className="flex items-center gap-6">
        <svg width={200} height={200} viewBox="0 0 200 200">
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
            y={cy - 6}
            textAnchor="middle"
            fontSize={18}
            fontWeight={800}
            fill="var(--text-1)"
          >
            {total}
          </text>
          <text
            x={cx}
            y={cy + 12}
            textAnchor="middle"
            fontSize={12}
            fill="var(--text-muted)"
          >
            total
          </text>
        </svg>
        <div className="space-y-2">
          {STATUS_5_CONFIG.map((cfg) => {
            const val = counts[cfg.key];
            return (
              <div key={cfg.key} className="flex items-center gap-2 text-[13px]">
                <span
                  className="h-3 w-3 rounded-sm shrink-0"
                  style={{ background: cfg.color }}
                />
                <span style={{ color: "var(--text-2)" }}>{cfg.label}</span>
                <span className="font-semibold" style={{ color: "var(--text-1)" }}>
                  {val}
                </span>
                {total > 0 && (
                  <span style={{ color: "var(--text-muted)" }}>
                    ({Math.round((val / total) * 100)}%)
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────────── */

export function ProjectDashboard({ projectId }: { projectId: string }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const dashboardRef = useRef<HTMLDivElement>(null);

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

  async function handleExport() {
    if (!dashboardRef.current) return;
    setExporting(true);
    try {
      const html2canvas = (await import("html2canvas-pro")).default;
      const { jsPDF } = await import("jspdf");

      const canvas = await html2canvas(dashboardRef.current, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "px",
        format: [canvas.width, canvas.height],
      });

      pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
      pdf.save("project-dashboard.pdf");
    } catch {
      // Silently fail — user can try again
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return (
      <p className="text-[14px] py-4" style={{ color: "var(--text-muted)" }}>
        Loading analytics…
      </p>
    );
  }

  const byStatus = data?.breakdown?.byStatus ?? {};
  const health = data?.health ?? {};

  return (
    <div ref={dashboardRef} className="space-y-3">
      {/* Top bar: + Add widget (left) | Export PDF (right) */}
      <div className="flex items-center justify-between print:hidden">
        <button
          type="button"
          className="inline-flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-medium transition-colors"
          style={{
            borderColor: "var(--border)",
            color: "var(--text-muted)",
            borderStyle: "dashed",
          }}
        >
          <Plus size={13} />
          Add widget
        </button>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting || loading}
          className="inline-flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-medium transition-colors disabled:opacity-50"
          style={{
            borderColor: "var(--border)",
            color: "var(--text-2)",
          }}
        >
          <Download size={13} />
          {exporting ? "Exporting..." : "Export PDF"}
        </button>
      </div>

      {/* Progress bar + Risk Score side by side */}
      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr auto", alignItems: "start" }}>
        <DashboardProgress
          completionRate={health.completionRate ?? 0}
          taskCount={health.taskCount ?? 0}
        />
        <RiskScoreWidget
          avgRiskScore={health.avgRiskScore ?? 0}
          riskLevel={health.riskLevel}
        />
      </div>

      {/* 5 status boxes in white card */}
      <StatusFiveBoxes byStatus={byStatus} />

      {/* Bar chart + Overview donut — full row */}
      <div className="flex gap-3">
        <StatusBarChart byStatus={byStatus} />
        <OverviewDonutWidget byStatus={byStatus} />
      </div>
    </div>
  );
}
