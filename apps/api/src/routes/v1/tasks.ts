import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { classifyRiskLevel, computeRiskScore } from "@larry/ai";
import { writeAuditLog } from "../../lib/audit.js";

const CreateTaskSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1).max(300),
  description: z.string().max(4_000).optional(),
  assigneeUserId: z.string().uuid().optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  startDate: z.string().date().optional(),
  dueDate: z.string().date().optional(),
});

const AddDependencySchema = z.object({
  dependsOnTaskId: z.string().uuid(),
  relation: z.string().default("finish_to_start"),
});

const UpdateStatusSchema = z.object({
  status: z.enum(["backlog", "not_started", "in_progress", "waiting", "completed", "blocked"]),
  progressPercent: z.number().int().min(0).max(100).optional(),
});

export const taskRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const query = z.object({ projectId: z.string().uuid().optional() }).parse(request.query);
      const tenantId = request.user.tenantId;

      const values: unknown[] = [tenantId];
      let sql = `SELECT id, project_id as "projectId", title, description, status, priority,
                        assignee_user_id as "assigneeUserId", progress_percent as "progressPercent",
                        risk_score as "riskScore", risk_level as "riskLevel",
                        start_date as "startDate", due_date as "dueDate",
                        created_at as "createdAt", updated_at as "updatedAt"
                 FROM tasks
                 WHERE tenant_id = $1`;

      if (query.projectId) {
        values.push(query.projectId);
        sql += " AND project_id = $2";
      }

      sql += " ORDER BY created_at DESC";

      const rows = await fastify.db.queryTenant(tenantId, sql, values);
      return { items: rows };
    }
  );

  fastify.post(
    "/",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request, reply) => {
      const body = CreateTaskSchema.parse(request.body);
      const tenantId = request.user.tenantId;

      const dueDate = body.dueDate ? new Date(body.dueDate) : null;
      const daysToDeadline = dueDate ? Math.ceil((dueDate.getTime() - Date.now()) / 86_400_000) : 30;
      const riskScore = computeRiskScore({
        daysToDeadline,
        progressPercent: 0,
        inactivityDays: 0,
        dependencyBlockedCount: 0,
      });
      const riskLevel = classifyRiskLevel(riskScore);

      const rows = await fastify.db.queryTenant<{ id: string }>(
        tenantId,
        `INSERT INTO tasks (
          tenant_id, project_id, title, description, priority,
          assignee_user_id, created_by_user_id, start_date, due_date, risk_score, risk_level
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id`,
        [
          tenantId,
          body.projectId,
          body.title,
          body.description ?? null,
          body.priority,
          body.assigneeUserId ?? null,
          request.user.userId,
          body.startDate ?? null,
          body.dueDate ?? null,
          riskScore,
          riskLevel,
        ]
      );

      const taskId = rows[0].id;

      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId: request.user.userId,
        actionType: "task.create",
        objectType: "task",
        objectId: taskId,
        details: { projectId: body.projectId, title: body.title },
      });

      return reply.code(201).send({ id: taskId, riskScore, riskLevel });
    }
  );

  fastify.get(
    "/:id",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const tenantId = request.user.tenantId;

      const rows = await fastify.db.queryTenant<{
        id: string; project_id: string; title: string; description: string | null;
        status: string; priority: string; assignee_user_id: string | null;
        progress_percent: number; risk_score: number; risk_level: string;
        start_date: string | null; due_date: string | null; created_at: string; updated_at: string;
      }>(
        tenantId,
        `SELECT id, project_id, title, description, status, priority,
                assignee_user_id, progress_percent, risk_score, risk_level,
                start_date, due_date, created_at, updated_at
         FROM tasks WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
        [tenantId, params.id]
      );

      if (!rows[0]) throw fastify.httpErrors.notFound("Task not found.");

      const r = rows[0];
      return {
        id: r.id, projectId: r.project_id, title: r.title, description: r.description,
        status: r.status, priority: r.priority, assigneeUserId: r.assignee_user_id,
        progressPercent: r.progress_percent, riskScore: r.risk_score, riskLevel: r.risk_level,
        startDate: r.start_date, dueDate: r.due_date, createdAt: r.created_at, updatedAt: r.updated_at,
      };
    }
  );

  fastify.patch(
    "/:id",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const body = z.object({
        title: z.string().min(1).max(300).optional(),
        description: z.string().max(4000).optional(),
        status: z.enum(["backlog", "not_started", "in_progress", "waiting", "completed", "blocked"]).optional(),
        progressPercent: z.number().int().min(0).max(100).optional(),
        dueDate: z.string().date().optional(),
        assigneeUserId: z.string().uuid().optional().nullable(),
      }).parse(request.body);
      const tenantId = request.user.tenantId;

      const setClauses: string[] = ["updated_at = NOW()"];
      const values: unknown[] = [tenantId, params.id];
      let idx = 3;

      if (body.title !== undefined) { setClauses.push(`title = $${idx++}`); values.push(body.title); }
      if (body.description !== undefined) { setClauses.push(`description = $${idx++}`); values.push(body.description); }
      if (body.status !== undefined) { setClauses.push(`status = $${idx++}`); values.push(body.status); }
      if (body.progressPercent !== undefined) { setClauses.push(`progress_percent = $${idx++}`); values.push(body.progressPercent); }
      if (body.dueDate !== undefined) { setClauses.push(`due_date = $${idx++}`); values.push(body.dueDate); }
      if (body.assigneeUserId !== undefined) { setClauses.push(`assignee_user_id = $${idx++}`); values.push(body.assigneeUserId); }

      if (setClauses.length === 1) return { success: true };

      // Recalculate risk score when due date or progress changes
      if (body.dueDate !== undefined || body.progressPercent !== undefined) {
        const existing = await fastify.db.queryTenant<{
          due_date: string | null;
          progress_percent: number;
        }>(
          tenantId,
          "SELECT due_date, progress_percent FROM tasks WHERE tenant_id = $1 AND id = $2 LIMIT 1",
          [tenantId, params.id]
        );
        if (existing[0]) {
          const dueDate = body.dueDate ? new Date(body.dueDate) : (existing[0].due_date ? new Date(existing[0].due_date) : null);
          const daysToDeadline = dueDate ? Math.ceil((dueDate.getTime() - Date.now()) / 86_400_000) : 30;
          const progressPercent = body.progressPercent ?? existing[0].progress_percent;
          const riskScore = computeRiskScore({ daysToDeadline, progressPercent, inactivityDays: 0, dependencyBlockedCount: 0 });
          const riskLevel = classifyRiskLevel(riskScore);
          setClauses.push(`risk_score = $${idx++}`); values.push(riskScore);
          setClauses.push(`risk_level = $${idx++}`); values.push(riskLevel);
        }
      }

      await fastify.db.queryTenant(
        tenantId,
        `UPDATE tasks SET ${setClauses.join(", ")} WHERE tenant_id = $1 AND id = $2`,
        values
      );

      return { success: true };
    }
  );

  fastify.get(
    "/:id/comments",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const tenantId = request.user.tenantId;

      const rows = await fastify.db.queryTenant<{
        id: string; body: string; author_user_id: string; created_at: string;
      }>(
        tenantId,
        `SELECT id, body, author_user_id, created_at
         FROM task_comments WHERE tenant_id = $1 AND task_id = $2 ORDER BY created_at ASC`,
        [tenantId, params.id]
      );

      return { items: rows.map((r) => ({ id: r.id, body: r.body, authorUserId: r.author_user_id, createdAt: r.created_at })) };
    }
  );

  fastify.post(
    "/:id/comments",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request, reply) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const body = z.object({ body: z.string().min(1).max(4000) }).parse(request.body);
      const tenantId = request.user.tenantId;

      // Look up project_id from the task (required by task_comments schema)
      const taskRow = await fastify.db.queryTenant<{ project_id: string }>(
        tenantId,
        `SELECT project_id FROM tasks WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
        [tenantId, params.id]
      );
      if (!taskRow[0]) throw fastify.httpErrors.notFound("Task not found.");

      const rows = await fastify.db.queryTenant<{ id: string; created_at: string }>(
        tenantId,
        `INSERT INTO task_comments (tenant_id, project_id, task_id, author_user_id, body)
         VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at`,
        [tenantId, taskRow[0].project_id, params.id, request.user.userId, body.body]
      );

      return reply.code(201).send({
        id: rows[0].id,
        body: body.body,
        authorUserId: request.user.userId,
        createdAt: rows[0].created_at,
      });
    }
  );

  fastify.post(
    "/:id/dependencies",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm"])] },
    async (request, reply) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const body = AddDependencySchema.parse(request.body);
      const tenantId = request.user.tenantId;

      // Self-dependency guard
      if (params.id === body.dependsOnTaskId) {
        throw fastify.httpErrors.conflict("A task cannot depend on itself.");
      }

      // Circular dependency guard: check if dependsOnTaskId already transitively depends on params.id
      const cycleCheck = await fastify.db.queryTenant<{ cycle: boolean }>(
        tenantId,
        `WITH RECURSIVE chain(task_id, depends_on_task_id) AS (
           SELECT task_id, depends_on_task_id FROM task_dependencies
           WHERE tenant_id = $1 AND task_id = $2
           UNION ALL
           SELECT d.task_id, d.depends_on_task_id
           FROM task_dependencies d
           JOIN chain c ON c.depends_on_task_id = d.task_id
           WHERE d.tenant_id = $1
         )
         SELECT EXISTS (SELECT 1 FROM chain WHERE depends_on_task_id = $3) AS cycle`,
        [tenantId, body.dependsOnTaskId, params.id]
      );

      if (cycleCheck[0]?.cycle) {
        throw fastify.httpErrors.conflict("Circular dependency detected.");
      }

      await fastify.db.queryTenant(
        tenantId,
        `INSERT INTO task_dependencies (tenant_id, task_id, depends_on_task_id, relation)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (tenant_id, task_id, depends_on_task_id)
         DO UPDATE SET relation = EXCLUDED.relation`,
        [tenantId, params.id, body.dependsOnTaskId, body.relation]
      );

      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId: request.user.userId,
        actionType: "task.add_dependency",
        objectType: "task_dependency",
        objectId: `${params.id}:${body.dependsOnTaskId}`,
        details: { relation: body.relation },
      });

      return reply.code(201).send({ success: true });
    }
  );

  fastify.patch(
    "/:id/status",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const body = UpdateStatusSchema.parse(request.body);
      const tenantId = request.user.tenantId;

      const existing = await fastify.db.queryTenant<{
        due_date: string | null;
        progress_percent: number;
      }>(
        tenantId,
        "SELECT due_date, progress_percent FROM tasks WHERE tenant_id = $1 AND id = $2 LIMIT 1",
        [tenantId, params.id]
      );

      if (!existing[0]) {
        throw fastify.httpErrors.notFound("Task not found.");
      }

      const dueDate = existing[0].due_date ? new Date(existing[0].due_date) : null;
      const daysToDeadline = dueDate ? Math.ceil((dueDate.getTime() - Date.now()) / 86_400_000) : 30;
      const progressPercent = body.progressPercent ?? existing[0].progress_percent;

      const riskScore = computeRiskScore({
        daysToDeadline,
        progressPercent,
        inactivityDays: body.status === "in_progress" ? 0 : 2,
        dependencyBlockedCount: body.status === "blocked" ? 1 : 0,
      });
      const riskLevel = classifyRiskLevel(riskScore);

      await fastify.db.queryTenant(
        tenantId,
        `UPDATE tasks
         SET status = $3,
             progress_percent = $4,
             risk_score = $5,
             risk_level = $6,
             started_at = CASE WHEN $3 = 'in_progress' THEN COALESCE(started_at, NOW()) ELSE started_at END,
             completed_at = CASE WHEN $3 = 'completed' THEN NOW() ELSE completed_at END,
             updated_at = NOW()
         WHERE tenant_id = $1 AND id = $2`,
        [tenantId, params.id, body.status, progressPercent, riskScore, riskLevel]
      );

      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId: request.user.userId,
        actionType: "task.update_status",
        objectType: "task",
        objectId: params.id,
        details: { status: body.status, progressPercent, riskScore, riskLevel },
      });

      return { success: true, riskScore, riskLevel };
    }
  );
};
