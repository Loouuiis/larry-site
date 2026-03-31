import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { classifyRiskLevel, computeRiskScore } from "@larry/ai";
import { writeAuditLog } from "../../lib/audit.js";
import {
  ProjectStatusFilterSchema,
  appendProjectStatusFilter,
} from "../../lib/project-status.js";

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

const TaskIdParamSchema = z.object({
  id: z.string().uuid(),
});

const AttachDocumentSchema = z.object({
  documentId: z.string().uuid(),
});

const ListTasksQuerySchema = z.object({
  projectId: z.string().uuid().optional(),
  projectStatus: ProjectStatusFilterSchema.optional().default("all"),
});

export const taskRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const query = ListTasksQuerySchema.parse(request.query);
      const tenantId = request.user.tenantId;

      const values: unknown[] = [tenantId];
      const filters = ["tasks.tenant_id = $1"];
      let sql = `SELECT tasks.id,
                        tasks.project_id as "projectId",
                        tasks.title,
                        tasks.description,
                        tasks.status,
                        tasks.priority,
                        tasks.assignee_user_id as "assigneeUserId",
                        tasks.progress_percent as "progressPercent",
                        COALESCE(NULLIF(users.display_name, ''), split_part(users.email, '@', 1)) as "assigneeName",
                        tasks.risk_score as "riskScore",
                        tasks.risk_level as "riskLevel",
                        tasks.start_date as "startDate",
                        tasks.due_date as "dueDate",
                        tasks.created_at as "createdAt",
                        tasks.updated_at as "updatedAt"
                 FROM tasks
                 LEFT JOIN users ON users.id = tasks.assignee_user_id`;

      if (query.projectId) {
        values.push(query.projectId);
        filters.push(`tasks.project_id = $${values.length}`);
      } else if (query.projectStatus !== "all") {
        sql += `
          JOIN projects
            ON projects.tenant_id = tasks.tenant_id
           AND projects.id = tasks.project_id`;
        appendProjectStatusFilter({
          filters,
          values,
          filter: query.projectStatus,
          statusColumn: "projects.status",
        });
      }

      sql += `
        WHERE ${filters.join(" AND ")}
        ORDER BY tasks.created_at DESC`;

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

  fastify.get(
    "/:id/attachments",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const params = TaskIdParamSchema.parse(request.params);
      const tenantId = request.user.tenantId;

      const taskRows = await fastify.db.queryTenant<{ id: string }>(
        tenantId,
        `SELECT id
           FROM tasks
          WHERE tenant_id = $1
            AND id = $2
          LIMIT 1`,
        [tenantId, params.id]
      );
      if (!taskRows[0]) {
        throw fastify.httpErrors.notFound("Task not found.");
      }

      const rows = await fastify.db.queryTenant<{
        id: string;
        taskId: string;
        documentId: string;
        createdAt: string;
        title: string;
        docType: string;
        projectId: string | null;
        sourceKind: string | null;
        sourceRecordId: string | null;
        version: number;
        metadata: Record<string, unknown>;
        documentCreatedAt: string;
        documentUpdatedAt: string;
      }>(
        tenantId,
        `SELECT tda.id,
                tda.task_id as "taskId",
                tda.document_id as "documentId",
                tda.created_at as "createdAt",
                d.title,
                d.doc_type as "docType",
                d.project_id as "projectId",
                d.source_kind as "sourceKind",
                d.source_record_id as "sourceRecordId",
                d.version,
                d.metadata,
                d.created_at as "documentCreatedAt",
                d.updated_at as "documentUpdatedAt"
           FROM task_document_attachments tda
           JOIN documents d
             ON d.tenant_id = tda.tenant_id
            AND d.id = tda.document_id
          WHERE tda.tenant_id = $1
            AND tda.task_id = $2
          ORDER BY tda.created_at DESC`,
        [tenantId, params.id]
      );

      return { items: rows };
    }
  );

  fastify.post(
    "/:id/attachments",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request, reply) => {
      const params = TaskIdParamSchema.parse(request.params);
      const body = AttachDocumentSchema.parse(request.body);
      const tenantId = request.user.tenantId;
      const actorUserId = request.user.userId;

      const taskRows = await fastify.db.queryTenant<{ id: string; project_id: string }>(
        tenantId,
        `SELECT id, project_id
           FROM tasks
          WHERE tenant_id = $1
            AND id = $2
          LIMIT 1`,
        [tenantId, params.id]
      );
      if (!taskRows[0]) {
        throw fastify.httpErrors.notFound("Task not found.");
      }

      const documentRows = await fastify.db.queryTenant<{ id: string; project_id: string | null }>(
        tenantId,
        `SELECT id, project_id
           FROM documents
          WHERE tenant_id = $1
            AND id = $2
          LIMIT 1`,
        [tenantId, body.documentId]
      );
      if (!documentRows[0]) {
        throw fastify.httpErrors.notFound("Document not found.");
      }
      if (documentRows[0].project_id !== taskRows[0].project_id) {
        throw fastify.httpErrors.conflict(
          "Cannot attach a document from a different project."
        );
      }

      const insertedRows = await fastify.db.queryTenant<{
        id: string;
        taskId: string;
        documentId: string;
        createdAt: string;
      }>(
        tenantId,
        `INSERT INTO task_document_attachments
           (tenant_id, task_id, document_id, attached_by_user_id)
         VALUES
           ($1, $2, $3, $4)
         ON CONFLICT (tenant_id, task_id, document_id) DO NOTHING
         RETURNING id,
                   task_id as "taskId",
                   document_id as "documentId",
                   created_at as "createdAt"`,
        [tenantId, params.id, body.documentId, actorUserId]
      );

      let attachment = insertedRows[0];
      let duplicate = false;

      if (!attachment) {
        const existingRows = await fastify.db.queryTenant<{
          id: string;
          taskId: string;
          documentId: string;
          createdAt: string;
        }>(
          tenantId,
          `SELECT id,
                  task_id as "taskId",
                  document_id as "documentId",
                  created_at as "createdAt"
             FROM task_document_attachments
            WHERE tenant_id = $1
              AND task_id = $2
              AND document_id = $3
            LIMIT 1`,
          [tenantId, params.id, body.documentId]
        );
        attachment = existingRows[0];
        duplicate = true;
      }

      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId,
        actionType: "task.document.attach",
        objectType: "task_document_attachment",
        objectId: `${params.id}:${body.documentId}`,
        details: {
          taskId: params.id,
          documentId: body.documentId,
          duplicate,
        },
      });

      return reply.code(201).send({
        attachment,
        duplicate,
      });
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
        id: string; body: string; author_user_id: string; author_email: string | null; created_at: string;
      }>(
        tenantId,
        `SELECT tc.id, tc.body, tc.author_user_id, tc.created_at, u.email AS author_email
         FROM task_comments tc
         LEFT JOIN users u ON u.id = tc.author_user_id
         WHERE tc.tenant_id = $1 AND tc.task_id = $2
         ORDER BY tc.created_at ASC`,
        [tenantId, params.id]
      );

      return { items: rows.map((r) => ({ id: r.id, body: r.body, authorUserId: r.author_user_id, authorEmail: r.author_email ?? null, createdAt: r.created_at })) };
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

      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId: request.user.userId,
        actionType: "task.comment.create",
        objectType: "task_comment",
        objectId: rows[0].id,
        details: { taskId: params.id },
      });

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
