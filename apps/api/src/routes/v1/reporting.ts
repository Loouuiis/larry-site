import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { classifyRiskLevel } from "@larry/ai";
import { getProjectMembershipAccess } from "../../lib/project-memberships.js";

async function insertProjectRiskSnapshotOncePerDay(
  fastify: Parameters<FastifyPluginAsync>[0],
  tenantId: string,
  projectId: string,
  avgRiskScore: number,
  riskLevel: "low" | "medium" | "high"
): Promise<void> {
  await fastify.db.queryTenant(
    tenantId,
    `INSERT INTO risk_snapshots (tenant_id, project_id, risk_score, risk_level, signals)
     SELECT $1, $2, $3, $4, $5::jsonb
     WHERE NOT EXISTS (
       SELECT 1
       FROM risk_snapshots
       WHERE tenant_id = $1
         AND project_id = $2
         AND task_id IS NULL
         AND created_at::date = CURRENT_DATE
     )`,
    [tenantId, projectId, avgRiskScore, riskLevel, JSON.stringify(["aggregated_task_risk"])]
  );
}

async function insertReportSnapshotOncePerDay(
  fastify: Parameters<FastifyPluginAsync>[0],
  tenantId: string,
  projectId: string,
  reportType: "outcomes" | "weekly_summary",
  summary: Record<string, unknown>,
  createdByUserId: string
): Promise<void> {
  await fastify.db.queryTenant(
    tenantId,
    `INSERT INTO report_snapshots
      (tenant_id, project_id, report_type, summary, created_by_user_id)
     SELECT $1, $2, $3, $4::jsonb, $5
     WHERE NOT EXISTS (
       SELECT 1
       FROM report_snapshots
       WHERE tenant_id = $1
         AND project_id = $2
         AND report_type = $3
         AND created_at::date = CURRENT_DATE
     )`,
    [tenantId, projectId, reportType, JSON.stringify(summary), createdByUserId]
  );
}

export const reportingRoutes: FastifyPluginAsync = async (fastify) => {
  async function assertProjectReadOrThrow(tenantId: string, userId: string, tenantRole: string, projectId: string) {
    const access = await getProjectMembershipAccess({
      db: fastify.db,
      tenantId,
      projectId,
      userId,
      tenantRole,
    });
    if (!access.projectExists) {
      throw fastify.httpErrors.notFound("Project not found.");
    }
    if (!access.canRead) {
      throw fastify.httpErrors.forbidden("Project access denied.");
    }
  }

  fastify.get(
    "/projects/:id/health",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const tenantId = request.user.tenantId;
      await assertProjectReadOrThrow(tenantId, request.user.userId, request.user.role, params.id);

      const taskRows = await fastify.db.queryTenant<{
        status: "backlog" | "not_started" | "in_progress" | "waiting" | "completed" | "blocked";
        risk_score: number;
      }>(
        tenantId,
        `SELECT status, risk_score
         FROM tasks
         WHERE tenant_id = $1 AND project_id = $2`,
        [tenantId, params.id]
      );

      const total = taskRows.length;
      const completed = taskRows.filter((row) => row.status === "completed").length;
      const blocked = taskRows.filter((row) => row.status === "blocked").length;
      const avgRiskScore =
        total === 0 ? 0 : Number((taskRows.reduce((sum, row) => sum + Number(row.risk_score), 0) / total).toFixed(2));
      const riskLevel = classifyRiskLevel(avgRiskScore);

      const response = {
        projectId: params.id,
        taskCount: total,
        completionRate: total === 0 ? 0 : Number(((completed / total) * 100).toFixed(2)),
        blockedCount: blocked,
        avgRiskScore,
        riskLevel,
        generatedAt: new Date().toISOString(),
      };

      try {
        await insertProjectRiskSnapshotOncePerDay(fastify, tenantId, params.id, avgRiskScore, riskLevel);
      } catch (err) {
        fastify.log.warn({ err, projectId: params.id }, "failed to write risk snapshot");
      }

      return response;
    }
  );

  fastify.get(
    "/projects/:id/outcomes",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const tenantId = request.user.tenantId;
      await assertProjectReadOrThrow(tenantId, request.user.userId, request.user.role, params.id);

      const taskRows = await fastify.db.queryTenant<{
        status: "backlog" | "not_started" | "in_progress" | "waiting" | "completed" | "blocked";
        priority: "low" | "medium" | "high" | "critical";
        risk_level: "low" | "medium" | "high";
      }>(
        tenantId,
        `SELECT status, priority, risk_level
         FROM tasks
         WHERE tenant_id = $1 AND project_id = $2`,
        [tenantId, params.id]
      );

      const actionRows = await fastify.db.queryTenant<{ state: string }>(
        tenantId,
        `SELECT event_type AS state
         FROM larry_events
         WHERE tenant_id = $1 AND project_id = $2`,
        [tenantId, params.id]
      );

      const totalTasks = taskRows.length;
      const completedTasks = taskRows.filter((task) => task.status === "completed").length;
      const highRiskTasks = taskRows.filter((task) => task.risk_level === "high").length;
      const highPriorityTasks = taskRows.filter(
        (task) => task.priority === "high" || task.priority === "critical"
      ).length;

      const pendingApprovals = actionRows.filter((action) => action.state === "suggested").length;
      const autoExecuted = actionRows.filter(
        (action) => action.state === "auto_executed" || action.state === "accepted"
      ).length;

      const outcome = {
        projectId: params.id,
        generatedAt: new Date().toISOString(),
        metrics: {
          completionRate:
            totalTasks === 0 ? 0 : Number(((completedTasks / totalTasks) * 100).toFixed(2)),
          highRiskTaskRate:
            totalTasks === 0 ? 0 : Number(((highRiskTasks / totalTasks) * 100).toFixed(2)),
          highPriorityCoverage:
            highPriorityTasks === 0
              ? 100
              : Number(
                  (
                    (taskRows.filter(
                      (task) =>
                        (task.priority === "high" || task.priority === "critical") &&
                        task.status === "completed"
                    ).length /
                      highPriorityTasks) *
                    100
                  ).toFixed(2)
                ),
          pendingApprovals,
          autoExecutedActions: autoExecuted,
        },
        narrative: (() => {
          const completionPct = totalTasks === 0 ? 0 : Number(((completedTasks / totalTasks) * 100).toFixed(0));
          const parts: string[] = [];
          parts.push(`The project is currently at ${completionPct}% completion.`);
          if (highRiskTasks > 0) {
            parts.push(`There ${highRiskTasks === 1 ? "is" : "are"} ${highRiskTasks} high-risk task${highRiskTasks === 1 ? "" : "s"} that need attention.`);
          }
          if (pendingApprovals > 0) {
            parts.push(`${pendingApprovals} suggestion${pendingApprovals === 1 ? " is" : "s are"} pending review.`);
          } else {
            parts.push("There are no pending suggestions at the moment.");
          }
          if (autoExecuted > 0) {
            parts.push(`Larry has auto-executed ${autoExecuted} action${autoExecuted === 1 ? "" : "s"} on behalf of the team.`);
          }
          return parts.join(" ");
        })(),
      };

      try {
        await insertReportSnapshotOncePerDay(
          fastify,
          tenantId,
          params.id,
          "outcomes",
          outcome as Record<string, unknown>,
          request.user.userId
        );
      } catch (err) {
        fastify.log.warn({ err, projectId: params.id }, "failed to write outcomes snapshot");
      }

      return outcome;
    }
  );

  fastify.get(
    "/projects/:id/weekly-summary",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const tenantId = request.user.tenantId;
      await assertProjectReadOrThrow(tenantId, request.user.userId, request.user.role, params.id);

      const taskRows = await fastify.db.queryTenant<{
        id: string;
        title: string;
        status: string;
        priority: string;
        risk_level: "low" | "medium" | "high";
        assignee_user_id: string | null;
        updated_at: string;
      }>(
        tenantId,
        `SELECT id, title, status, priority, risk_level, assignee_user_id, updated_at
         FROM tasks
         WHERE tenant_id = $1 AND project_id = $2
         ORDER BY updated_at DESC
         LIMIT 200`,
        [tenantId, params.id]
      );

      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - 7);

      const updatedThisWeek = taskRows.filter((task) => new Date(task.updated_at) >= weekStart);
      const highRisk = taskRows.filter((task) => task.risk_level === "high");

      const summary = {
        projectId: params.id,
        period: {
          start: weekStart.toISOString(),
          end: now.toISOString(),
        },
        totals: {
          tasks: taskRows.length,
          updatedThisWeek: updatedThisWeek.length,
          highRisk: highRisk.length,
          completed: taskRows.filter((task) => task.status === "completed").length,
        },
        highlights: {
          recentlyUpdated: updatedThisWeek.slice(0, 10),
          highRisk: highRisk.slice(0, 10),
        },
        narrative: `Updated ${updatedThisWeek.length} tasks this week. ${highRisk.length} tasks are currently high risk and need intervention.`,
      };

      try {
        await insertReportSnapshotOncePerDay(
          fastify,
          tenantId,
          params.id,
          "weekly_summary",
          summary as Record<string, unknown>,
          request.user.userId
        );
      } catch (err) {
        fastify.log.warn({ err, projectId: params.id }, "failed to write weekly summary snapshot");
      }

      return summary;
    }
  );

  fastify.get(
    "/projects/:id/task-breakdown",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const tenantId = request.user.tenantId;
      await assertProjectReadOrThrow(tenantId, request.user.userId, request.user.role, params.id);

      const rows = await fastify.db.queryTenant<{
        status: string;
        assignee_user_id: string | null;
      }>(
        tenantId,
        `SELECT status, assignee_user_id FROM tasks WHERE tenant_id = $1 AND project_id = $2`,
        [tenantId, params.id]
      );

      const byStatus: Record<string, number> = {};
      const byAssignee: Record<string, { total: number; completed: number }> = {};

      for (const row of rows) {
        byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
        const key = row.assignee_user_id ?? "unassigned";
        if (!byAssignee[key]) byAssignee[key] = { total: 0, completed: 0 };
        byAssignee[key].total++;
        if (row.status === "completed") byAssignee[key].completed++;
      }

      return { byStatus, byAssignee };
    }
  );

  fastify.get(
    "/projects/:id/status-history",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const query = z.object({ months: z.coerce.number().int().min(1).max(24).default(6) }).parse(request.query);
      const tenantId = request.user.tenantId;
      await assertProjectReadOrThrow(tenantId, request.user.userId, request.user.role, params.id);
      const months = query.months;

      const [completedRows, createdRows, activeRows] = await Promise.all([
        // Tasks completed per calendar month
        fastify.db.queryTenant<{ month: string; completed: number }>(
          tenantId,
          `SELECT DATE_TRUNC('month', completed_at)::date AS month,
                  COUNT(*)::int AS completed
           FROM tasks
           WHERE tenant_id = $1 AND project_id = $2
             AND completed_at IS NOT NULL
             AND completed_at >= DATE_TRUNC('month', NOW()) - ($3 - 1) * INTERVAL '1 month'
           GROUP BY 1 ORDER BY 1`,
          [tenantId, params.id, months]
        ),
        // Tasks created per calendar month
        fastify.db.queryTenant<{ month: string; created: number }>(
          tenantId,
          `SELECT DATE_TRUNC('month', created_at)::date AS month,
                  COUNT(*)::int AS created
           FROM tasks
           WHERE tenant_id = $1 AND project_id = $2
             AND created_at >= DATE_TRUNC('month', NOW()) - ($3 - 1) * INTERVAL '1 month'
           GROUP BY 1 ORDER BY 1`,
          [tenantId, params.id, months]
        ),
        // Active tasks (started, not yet completed) at end of each month
        fastify.db.queryTenant<{ month: string; active: number }>(
          tenantId,
          `SELECT month_series.month::date AS month,
                  COUNT(t.id)::int AS active
           FROM (
             SELECT generate_series(
               DATE_TRUNC('month', NOW()) - ($3 - 1) * INTERVAL '1 month',
               DATE_TRUNC('month', NOW()),
               '1 month'
             ) AS month
           ) month_series
           LEFT JOIN tasks t
             ON t.tenant_id = $1 AND t.project_id = $2
             AND t.started_at IS NOT NULL
             AND t.started_at < month_series.month + INTERVAL '1 month'
             AND (t.completed_at IS NULL OR t.completed_at >= month_series.month + INTERVAL '1 month')
           GROUP BY 1 ORDER BY 1`,
          [tenantId, params.id, months]
        ),
      ]);

      // Build ordered month buckets for the last N months
      const completedMap = new Map(completedRows.map((r) => [r.month.substring(0, 7), Number(r.completed)]));
      const createdMap = new Map(createdRows.map((r) => [r.month.substring(0, 7), Number(r.created)]));
      const activeMap = new Map(activeRows.map((r) => [r.month.substring(0, 7), Number(r.active)]));

      const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      const history: { period: string; label: string; completed: number; created: number; active: number }[] = [];

      for (let i = months - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(1);
        d.setMonth(d.getMonth() - i);
        const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        history.push({
          period,
          label: MONTH_LABELS[d.getMonth()],
          completed: completedMap.get(period) ?? 0,
          created: createdMap.get(period) ?? 0,
          active: activeMap.get(period) ?? 0,
        });
      }

      return { history };
    }
  );
};
