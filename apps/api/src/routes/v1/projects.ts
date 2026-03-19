import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { writeAuditLog } from "../../lib/audit.js";

const CreateProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(4_000).optional(),
  ownerUserId: z.string().uuid().optional(),
  startDate: z.string().date().optional(),
  targetDate: z.string().date().optional(),
});

export const projectRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/:id/timeline",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const tenantId = request.user.tenantId;

      const taskRows = await fastify.db.queryTenant<{
        id: string;
        title: string;
        status: "backlog" | "not_started" | "in_progress" | "waiting" | "completed" | "blocked";
        priority: "low" | "medium" | "high" | "critical";
        assigneeUserId: string | null;
        progressPercent: number;
        startDate: string | null;
        dueDate: string | null;
        riskLevel: "low" | "medium" | "high";
      }>(
        tenantId,
        `SELECT id, title, status, priority,
                assignee_user_id as "assigneeUserId",
                progress_percent as "progressPercent",
                start_date as "startDate",
                due_date as "dueDate",
                risk_level as "riskLevel"
         FROM tasks
         WHERE tenant_id = $1 AND project_id = $2
         ORDER BY created_at ASC`,
        [tenantId, params.id]
      );

      const dependencyRows = await fastify.db.queryTenant<{
        taskId: string;
        dependsOnTaskId: string;
        relation: string;
      }>(
        tenantId,
        `SELECT task_id as "taskId", depends_on_task_id as "dependsOnTaskId", relation
         FROM task_dependencies
         WHERE tenant_id = $1
           AND task_id IN (SELECT id FROM tasks WHERE tenant_id = $1 AND project_id = $2)`,
        [tenantId, params.id]
      );

      const byColumn = {
        backlog: taskRows.filter((task) => task.status === "backlog"),
        not_started: taskRows.filter((task) => task.status === "not_started"),
        in_progress: taskRows.filter((task) => task.status === "in_progress"),
        waiting: taskRows.filter((task) => task.status === "waiting"),
        blocked: taskRows.filter((task) => task.status === "blocked"),
        completed: taskRows.filter((task) => task.status === "completed"),
      };

      return {
        projectId: params.id,
        generatedAt: new Date().toISOString(),
        gantt: taskRows,
        dependencies: dependencyRows,
        kanban: byColumn,
      };
    }
  );

  fastify.get(
    "/",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const rows = await fastify.db.queryTenant(
        request.user.tenantId,
        `SELECT id, name, description, owner_user_id as "ownerUserId", status,
                risk_score as "riskScore", risk_level as "riskLevel",
                start_date as "startDate", target_date as "targetDate",
                created_at as "createdAt", updated_at as "updatedAt"
         FROM projects
         WHERE tenant_id = $1
         ORDER BY created_at DESC`,
        [request.user.tenantId]
      );

      return { items: rows };
    }
  );

  fastify.post(
    "/",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm"])] },
    async (request, reply) => {
      const body = CreateProjectSchema.parse(request.body);
      const rows = await fastify.db.queryTenant<{ id: string }>(
        request.user.tenantId,
        `INSERT INTO projects (tenant_id, name, description, owner_user_id, start_date, target_date)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          request.user.tenantId,
          body.name,
          body.description ?? null,
          body.ownerUserId ?? request.user.userId,
          body.startDate ?? null,
          body.targetDate ?? null,
        ]
      );

      const projectId = rows[0].id;

      await writeAuditLog(fastify.db, {
        tenantId: request.user.tenantId,
        actorUserId: request.user.userId,
        actionType: "project.create",
        objectType: "project",
        objectId: projectId,
        details: { name: body.name },
      });

      return reply.code(201).send({ id: projectId });
    }
  );
};
