"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";

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

const STATUS_COLORS: Record<string, string> = {
  backlog: "#bdb7d0",
  not_started: "#bdb7d0",
  in_progress: "#b29cf8",
  waiting: "#b29cf8",
  blocked: "#9a7fa7",
  completed: "#6c44f6",
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

  let cumAngle = -90; // start at top
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
        {segments.map(({ key, val, angle, startAngle }) => {
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
        <text x={cx} y={cy - 6} textAnchor="middle" className="text-[18px] font-bold" fill="#323338" fontSize={18} fontWeight={700}>
          {total}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" fill="#9699a8" fontSize={12}>
          tasks
        </text>
      </svg>
      <div className="space-y-2">
        {entries.map(([key, val]) => (
          <div key={key} className="flex items-center gap-2 text-[13px]">
            <span className="h-3 w-3 rounded-sm shrink-0" style={{ background: STATUS_COLORS[key] ?? "#9699a8" }} />
            <span className="text-[var(--pm-text-secondary)]">{STATUS_LABELS[key] ?? key}</span>
            <span className="font-semibold text-[var(--pm-text)]">{val}</span>
            <span className="text-[var(--pm-text-muted)]">({Math.round((val / total) * 100)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AssigneeBar({ byAssignee }: { byAssignee: Record<string, { total: number; completed: number }> }) {
  const entries = Object.entries(byAssignee).slice(0, 8);
  if (entries.length === 0) return <p className="text-[13px] text-[var(--pm-text-muted)]">No assignee data.</p>;
  return (
    <div className="space-y-2">
      {entries.map(([assignee, { total, completed }]) => {
        const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
        return (
          <div key={assignee} className="flex items-center gap-3">
            <div className="w-24 shrink-0 truncate text-[12px] text-[var(--pm-text-secondary)]">
              {assignee.slice(0, 8)}…
            </div>
            <div className="flex-1 h-4 rounded-full bg-[var(--pm-gray-light)] overflow-hidden">
              <div
                className="h-full rounded-full bg-[#6c44f6]"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-10 shrink-0 text-right text-[12px] font-semibold text-[var(--pm-text)]">{pct}%</span>
            <span className="text-[11px] text-[var(--pm-text-muted)]">{completed}/{total}</span>
          </div>
        );
      })}
    </div>
  );
}

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
        const d = await res.json() as DashboardData;
        setData(d);
      }
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

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
      <div className="min-h-0 flex-1 overflow-y-auto p-8">
        <p className="text-[14px] text-[var(--pm-text-muted)]">Loading analytics…</p>
      </div>
    );
  }

  const byStatus = data?.breakdown?.byStatus ?? {};
  const byAssignee = data?.breakdown?.byAssignee ?? {};
  const health = data?.health ?? {};
  const outcomes = data?.outcomes;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div ref={dashboardRef} className="px-8 py-6 space-y-6">
        <div className="flex justify-end print:hidden">
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || loading}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium transition-colors disabled:opacity-50"
            style={{ borderColor: "var(--border, var(--pm-border))", color: "var(--text-2, var(--pm-text-secondary))" }}
          >
            <Download size={14} />
            {exporting ? "Exporting..." : "Export PDF"}
          </button>
        </div>
        {/* KPI row */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Completion", value: `${(health.completionRate ?? 0).toFixed(0)}%`, color: "#6c44f6" },
            { label: "Risk Score", value: (health.avgRiskScore ?? 0).toFixed(0), color: (health.avgRiskScore ?? 0) >= 70 ? "#9a7fa7" : (health.avgRiskScore ?? 0) >= 35 ? "#b29cf8" : "#6c44f6" },
            { label: "Blocked Tasks", value: String(health.blockedCount ?? 0), color: "#9a7fa7" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl border border-[var(--pm-border)] bg-white p-5">
              <p className="text-[12px] font-semibold uppercase tracking-wider text-[var(--pm-text-muted)]">{label}</p>
              <p className="mt-1 text-[28px] font-bold" style={{ color }}>{value}</p>
            </div>
          ))}
        </div>

        {/* Task status donut */}
        <div className="rounded-xl border border-[var(--pm-border)] bg-white p-6">
          <h2 className="mb-4 text-[14px] font-semibold text-[var(--pm-text)]">Task Status Breakdown</h2>
          {Object.keys(byStatus).length > 0 ? (
            <DonutChart byStatus={byStatus} />
          ) : (
            <p className="text-[13px] text-[var(--pm-text-muted)]">No task data available.</p>
          )}
        </div>

        {/* Assignee breakdown */}
        <div className="rounded-xl border border-[var(--pm-border)] bg-white p-6">
          <h2 className="mb-4 text-[14px] font-semibold text-[var(--pm-text)]">Completion by Assignee</h2>
          <AssigneeBar byAssignee={byAssignee} />
        </div>

        {/* Narrative */}
        {outcomes?.narrative && (
          <div className="rounded-xl border border-[var(--pm-border)] bg-white p-6">
            <h2 className="mb-2 text-[14px] font-semibold text-[var(--pm-text)]">Larry's Assessment</h2>
            <p className="text-[14px] text-[var(--pm-text-secondary)] leading-relaxed">{outcomes.narrative}</p>
          </div>
        )}
      </div>
    </div>
  );
}
