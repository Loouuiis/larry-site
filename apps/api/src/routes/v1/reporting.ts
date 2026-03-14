import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { classifyRiskLevel } from "@larry/ai";

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

      await fastify.db.queryTenant(
        tenantId,
        `INSERT INTO risk_snapshots (tenant_id, project_id, risk_score, risk_level, signals)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [tenantId, params.id, avgRiskScore, riskLevel, JSON.stringify(["aggregated_task_risk"])]
      );

      return response;
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

      return summary;
    }
  );
};
