import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { classifyRiskLevel } from "@larry/ai";

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
  fastify.get(
    "/projects/:id/health",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const tenantId = request.user.tenantId;

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

      await insertProjectRiskSnapshotOncePerDay(fastify, tenantId, params.id, avgRiskScore, riskLevel);

      return response;
    }
  );

  fastify.get(
    "/projects/:id/outcomes",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const tenantId = request.user.tenantId;

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
        narrative: `Completion ${totalTasks === 0 ? 0 : Number(((completedTasks / totalTasks) * 100).toFixed(0))}%, ${highRiskTasks} high-risk tasks, ${pendingApprovals} pending suggestions, ${autoExecuted} actions auto-executed.`,
      };

      await insertReportSnapshotOncePerDay(
        fastify,
        tenantId,
        params.id,
        "outcomes",
        outcome as Record<string, unknown>,
        request.user.userId
      );

      return outcome;
    }
  );

  fastify.get(
    "/projects/:id/weekly-summary",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const tenantId = request.user.tenantId;

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

      await insertReportSnapshotOncePerDay(
        fastify,
        tenantId,
        params.id,
        "weekly_summary",
        summary as Record<string, unknown>,
        request.user.userId
      );

      return summary;
    }
  );

  fastify.get(
    "/projects/:id/task-breakdown",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const tenantId = request.user.tenantId;

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
};
