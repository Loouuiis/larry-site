import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { classifyRiskLevel, computeRiskScore } from "@larry/ai";
import { writeAuditLog } from "../../lib/audit.js";
import {
  ARCHIVED_PROJECT_WRITE_LOCK_MESSAGE,
  isProjectWriteLocked,
  loadProjectWriteState,
  loadTaskProjectWriteState,
} from "../../lib/project-write-lock.js";
import {
  ProjectStatusFilterSchema,
  appendProjectStatusFilter,
} from "../../lib/project-status.js";
import { notifySafe } from "../../lib/notifications/safe.js";

export const CreateTaskSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1).max(300),
  description: z.string().max(4_000).optional(),
  assigneeUserId: z.string().uuid().optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  startDate: z.string().date().optional(),
  dueDate: z.string().date().optional(),
  parentTaskId: z.string().uuid().nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
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
  function assertProjectWritableOrThrow(projectStatus: string | null | undefined) {
    if (isProjectWriteLocked(projectStatus)) {
      throw fastify.httpErrors.conflict(ARCHIVED_PROJECT_WRITE_LOCK_MESSAGE);
    }
  }

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
                        tasks.parent_task_id as "parentTaskId",
                        tasks.title,
                        tasks.description,
                        tasks.status,
                        tasks.priority,
                        tasks.assignee_user_id as "assigneeUserId",
                        tasks.progress_percent as "progressPercent",
                        COALESCE(NULLIF(users.display_name, ''), split_part(users.email, '@', 1)) as "assigneeName",
                        tasks.risk_score as "riskScore",
                        tasks.risk_level as "riskLevel",
                        tasks.start_date::text as "startDate",
                        tasks.due_date::text as "dueDate",
                        tasks.category_id as "categoryId",
                        tasks.labels as "labels",
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
        ORDER BY tasks.created_at ASC`;

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

      if (body.parentTaskId) {
        const parentRows = await fastify.db.queryTenant<{ projectId: string; parentTaskId: string | null }>(
          tenantId,
          `SELECT project_id AS "projectId", parent_task_id AS "parentTaskId"
             FROM tasks WHERE tenant_id = $1 AND id = $2`,
          [tenantId, body.parentTaskId],
        );
        if (parentRows.length === 0) throw fastify.httpErrors.notFound("Parent task not found");
        if (parentRows[0].projectId !== body.projectId) {
          throw fastify.httpErrors.badRequest("Parent task must be in the same project");
        }
        if (parentRows[0].parentTaskId !== null) {
          throw fastify.httpErrors.badRequest("Subtask depth limit reached (parent already has a parent)");
        }
      }

      const projectWriteState = await loadProjectWriteState(fastify.db, tenantId, body.projectId);
      if (projectWriteState) {
        assertProjectWritableOrThrow(projectWriteState.status);
      }

      const dueDate = body.dueDate ? new Date(body.dueDate) : null;
      const daysToDeadline = dueDate ? Math.ceil((dueDate.getTime() - Date.now()) / 86_400_000) : 30;
      const riskScore = computeRiskScore({
        daysToDeadline,
        progressPercent: 0,
        inactivityDays: 0,
        dependencyBlockedCount: 0,
      });
      const riskLevel = classifyRiskLevel(riskScore);

      const rows = await fastify.db.queryTenant<{ id: string; parentTaskId: string | null }>(
        tenantId,
        `INSERT INTO tasks (
          tenant_id, project_id, title, description, priority,
          assignee_user_id, created_by_user_id, start_date, due_date, risk_score, risk_level,
          parent_task_id, category_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING id, parent_task_id AS "parentTaskId"`,
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
          body.parentTaskId ?? null,
          body.categoryId ?? null,
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

      await notifySafe({
        db: fastify.db,
        tenantId,
        userId: body.assigneeUserId ?? null,
        type: "task.created",
        payload: { taskId, projectId: body.projectId, title: body.title },
        logger: fastify.log,
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
        id: string; project_id: string; parent_task_id: string | null; title: string; description: string | null;
        status: string; priority: string; assignee_user_id: string | null;
        progress_percent: number; risk_score: number; risk_level: string;
        start_date: string | null; due_date: string | null; created_at: string; updated_at: string;
        source_kind: string | null; source_record_id: string | null;
      }>(
        tenantId,
        `SELECT id, project_id, parent_task_id, title, description, status, priority,
                assignee_user_id, progress_percent, risk_score, risk_level,
                start_date, due_date, created_at, updated_at,
                source_kind, source_record_id
         FROM tasks WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
        [tenantId, params.id]
      );

      if (!rows[0]) throw fastify.httpErrors.notFound("Task not found.");

      const r = rows[0];
      return {
        id: r.id, projectId: r.project_id, parentTaskId: r.parent_task_id ?? null,
        title: r.title, description: r.description,
        status: r.status, priority: r.priority, assigneeUserId: r.assignee_user_id,
        progressPercent: r.progress_percent, riskScore: r.risk_score, riskLevel: r.risk_level,
        startDate: r.start_date, dueDate: r.due_date, createdAt: r.created_at, updatedAt: r.updated_at,
        sourceKind: r.source_kind, sourceRecordId: r.source_record_id,
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
      const taskProjectState = await loadTaskProjectWriteState(fastify.db, tenantId, params.id);
      if (taskProjectState) {
        assertProjectWritableOrThrow(taskProjectState.projectStatus);
      }

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
    async (request, reply) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const body = z.object({
        title: z.string().min(1).max(300).optional(),
        description: z.string().max(4000).optional(),
        status: z.enum(["backlog", "not_started", "in_progress", "waiting", "completed", "blocked"]).optional(),
        priority: z.enum(["low", "medium", "high", "critical"]).optional(),
        progressPercent: z.number().int().min(0).max(100).optional(),
        dueDate: z.string().date().optional().nullable(),
        startDate: z.string().date().optional().nullable(),
        assigneeUserId: z.string().uuid().optional().nullable(),
        parentTaskId: z.string().uuid().nullable().optional(),
        categoryId: z.string().uuid().nullable().optional(),
      }).parse(request.body);
      const tenantId = request.user.tenantId;

      // parentTaskId validation — must happen before write-lock check so we can use the
      // task's own projectId (not from the body) for the same-project constraint.
      if (body.parentTaskId !== undefined) {
        if (body.parentTaskId === params.id) {
          throw fastify.httpErrors.badRequest("Task cannot be its own parent");
        }

        if (body.parentTaskId !== null) {
          // Fetch the task being patched to get its projectId
          const taskRows = await fastify.db.queryTenant<{ projectId: string }>(
            tenantId,
            `SELECT project_id AS "projectId" FROM tasks WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
            [tenantId, params.id],
          );
          if (!taskRows[0]) throw fastify.httpErrors.notFound("Task not found");
          const taskProjectId = taskRows[0].projectId;

          const parentRows = await fastify.db.queryTenant<{ projectId: string; parentTaskId: string | null }>(
            tenantId,
            `SELECT project_id AS "projectId", parent_task_id AS "parentTaskId"
               FROM tasks WHERE tenant_id = $1 AND id = $2`,
            [tenantId, body.parentTaskId],
          );
          if (parentRows.length === 0) throw fastify.httpErrors.notFound("Parent task not found");
          if (parentRows[0].projectId !== taskProjectId) {
            throw fastify.httpErrors.badRequest("Parent task must be in the same project");
          }
          if (parentRows[0].parentTaskId !== null) {
            throw fastify.httpErrors.badRequest("Subtask depth limit reached (parent already has a parent)");
          }
        }
      }

      const taskProjectState = await loadTaskProjectWriteState(fastify.db, tenantId, params.id);
      if (taskProjectState) {
        assertProjectWritableOrThrow(taskProjectState.projectStatus);
      }

      // v4 Slice 4 follow-up — semantic validation: a task's categoryId must
      // resolve (walking up parent_category_id) to a project_id that either
      // equals the task's own project_id OR is null (org-scoped). Null
      // categoryId (Uncategorised) is always valid and skips the check.
      if (body.categoryId !== undefined && body.categoryId !== null && taskProjectState) {
        const owningRows = await fastify.db.queryTenant<{ projectId: string | null }>(
          tenantId,
          `WITH RECURSIVE cat_ancestry AS (
             SELECT id, parent_category_id, project_id
               FROM project_categories
              WHERE tenant_id = $1 AND id = $2
              UNION ALL
             SELECT pc.id, pc.parent_category_id, pc.project_id
               FROM project_categories pc
               JOIN cat_ancestry ca ON pc.id = ca.parent_category_id
              WHERE pc.tenant_id = $1
           )
           SELECT project_id AS "projectId"
             FROM cat_ancestry
            WHERE parent_category_id IS NULL
            LIMIT 1`,
          [tenantId, body.categoryId],
        );
        if (owningRows.length === 0) {
          return reply.code(400).send({
            code: "CATEGORY_PROJECT_MISMATCH",
            message: "Category not found for this tenant.",
            expectedProjectId: taskProjectState.projectId,
            gotProjectId: null,
          });
        }
        const owningProjectId = owningRows[0].projectId;
        if (owningProjectId !== null && owningProjectId !== taskProjectState.projectId) {
          return reply.code(400).send({
            code: "CATEGORY_PROJECT_MISMATCH",
            message: "Category belongs to a different project than the task.",
            expectedProjectId: taskProjectState.projectId,
            gotProjectId: owningProjectId,
          });
        }
      }

      const setClauses: string[] = ["updated_at = NOW()"];
      const values: unknown[] = [tenantId, params.id];
      let idx = 3;

      if (body.title !== undefined) { setClauses.push(`title = $${idx++}`); values.push(body.title); }
      if (body.description !== undefined) { setClauses.push(`description = $${idx++}`); values.push(body.description); }
      if (body.status !== undefined) { setClauses.push(`status = $${idx++}`); values.push(body.status); }
      if (body.priority !== undefined) { setClauses.push(`priority = $${idx++}`); values.push(body.priority); }
      if (body.progressPercent !== undefined) { setClauses.push(`progress_percent = $${idx++}`); values.push(body.progressPercent); }
      if (body.dueDate !== undefined) { setClauses.push(`due_date = $${idx++}`); values.push(body.dueDate); }
      if (body.startDate !== undefined) { setClauses.push(`start_date = $${idx++}`); values.push(body.startDate); }
      if (body.assigneeUserId !== undefined) { setClauses.push(`assignee_user_id = $${idx++}`); values.push(body.assigneeUserId); }

      // parentTaskId / categoryId use CASE-WHEN flag pattern so null (clear)
      // is distinguishable from "not provided" (leave unchanged).
      const parentTaskIdFlag = body.parentTaskId !== undefined;
      const parentTaskIdValue = body.parentTaskId ?? null;
      setClauses.push(`parent_task_id = CASE WHEN $${idx}::boolean THEN $${idx + 1} ELSE parent_task_id END`);
      values.push(parentTaskIdFlag, parentTaskIdValue);
      idx += 2;

      const categoryIdFlag = body.categoryId !== undefined;
      const categoryIdValue = body.categoryId ?? null;
      setClauses.push(`category_id = CASE WHEN $${idx}::boolean THEN $${idx + 1} ELSE category_id END`);
      values.push(categoryIdFlag, categoryIdValue);
      idx += 2;

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

      const rows = await fastify.db.queryTenant<{ parentTaskId: string | null }>(
        tenantId,
        `UPDATE tasks SET ${setClauses.join(", ")} WHERE tenant_id = $1 AND id = $2
         RETURNING parent_task_id AS "parentTaskId"`,
        values
      );

      return { success: true, parentTaskId: rows[0]?.parentTaskId ?? null };
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
      const taskProjectState = await loadTaskProjectWriteState(fastify.db, tenantId, params.id);
      if (taskProjectState) {
        assertProjectWritableOrThrow(taskProjectState.projectStatus);
      }

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
      const taskProjectState = await loadTaskProjectWriteState(fastify.db, tenantId, params.id);
      if (taskProjectState) {
        assertProjectWritableOrThrow(taskProjectState.projectStatus);
      }

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

  fastify.delete(
    "/:id",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request, reply) => {
      const params = TaskIdParamSchema.parse(request.params);
      const tenantId = request.user.tenantId;
      const taskProjectState = await loadTaskProjectWriteState(fastify.db, tenantId, params.id);
      if (taskProjectState) {
        assertProjectWritableOrThrow(taskProjectState.projectStatus);
      }

      const titleRows = await fastify.db.queryTenant<{ title: string; project_id: string }>(
        tenantId,
        `SELECT title, project_id FROM tasks WHERE tenant_id = $1 AND id = $2`,
        [tenantId, params.id]
      );
      const titleRow = titleRows[0];

      await fastify.db.queryTenant(
        tenantId,
        `DELETE FROM tasks WHERE tenant_id = $1 AND id = $2`,
        [tenantId, params.id]
      );

      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId: request.user.userId,
        actionType: "task.delete",
        objectType: "task",
        objectId: params.id,
        details: {},
      });

      if (titleRow) {
        await notifySafe({
          db: fastify.db,
          tenantId,
          userId: null,
          type: "task.deleted",
          payload: { title: titleRow.title, projectId: titleRow.project_id },
          logger: fastify.log,
        });

        try {
          await fastify.db.queryTenant(
            tenantId,
            `UPDATE notifications
             SET dismissed_at = NOW()
             WHERE tenant_id = $1
               AND channel = 'ui'
               AND dismissed_at IS NULL
               AND metadata->'payload'->>'taskId' = $2
               AND type IN ('task.created', 'task.updated')`,
            [tenantId, params.id]
          );
        } catch (err) {
          fastify.log.error(err, "failed to dismiss task notifications on delete");
        }
      }

      return reply.code(204).send();
    }
  );

  fastify.patch(
    "/:id/status",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const body = UpdateStatusSchema.parse(request.body);
      const tenantId = request.user.tenantId;
      const taskProjectState = await loadTaskProjectWriteState(fastify.db, tenantId, params.id);
      if (taskProjectState) {
        assertProjectWritableOrThrow(taskProjectState.projectStatus);
      }

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

  // v4 Slice 4 — DnD commit path for task reparent.
  //
  // Accepts any combination of:
  //   • projectId       — move the task to a different project (cross-project move)
  //   • parentTaskId    — set/clear the parent task (null un-parents to top level)
  //
  // Cross-project moves clear parentTaskId unless the caller also supplies a
  // parentTaskId belonging to the target project (the parent-in-same-project
  // constraint already enforced below).
  //
  // Write-lock is checked on the source project and, for cross-project moves,
  // the target project too. A move that doesn't change anything is a no-op
  // (no audit log written).
  fastify.post(
    "/:id/move",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const body = z.object({
        projectId: z.string().uuid().optional(),
        parentTaskId: z.string().uuid().nullable().optional(),
      }).parse(request.body);
      const tenantId = request.user.tenantId;

      const existing = await fastify.db.queryTenant<{ id: string; projectId: string; parentTaskId: string | null }>(
        tenantId,
        `SELECT id, project_id AS "projectId", parent_task_id AS "parentTaskId"
           FROM tasks WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
        [tenantId, params.id],
      );
      if (!existing[0]) throw fastify.httpErrors.notFound("Task not found.");
      const currentProjectId = existing[0].projectId;

      // Source project writable?
      const sourceState = await loadTaskProjectWriteState(fastify.db, tenantId, params.id);
      if (sourceState) assertProjectWritableOrThrow(sourceState.projectStatus);

      // If moving across projects, target must exist in-tenant and be writable.
      const crossProject = body.projectId !== undefined && body.projectId !== currentProjectId;
      if (crossProject) {
        const targetRows = await fastify.db.queryTenant<{ status: string }>(
          tenantId,
          `SELECT status FROM projects WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
          [tenantId, body.projectId as string],
        );
        if (!targetRows[0]) throw fastify.httpErrors.notFound("Target project not found.");
        assertProjectWritableOrThrow(targetRows[0].status);
      }

      const nextProjectId = body.projectId ?? currentProjectId;

      // parentTaskId validation — same-project constraint + no-self-parent + depth=1.
      if (body.parentTaskId !== undefined && body.parentTaskId !== null) {
        if (body.parentTaskId === params.id) {
          throw fastify.httpErrors.badRequest("Task cannot be its own parent.");
        }
        const parentRows = await fastify.db.queryTenant<{ projectId: string; parentTaskId: string | null }>(
          tenantId,
          `SELECT project_id AS "projectId", parent_task_id AS "parentTaskId"
             FROM tasks WHERE tenant_id = $1 AND id = $2`,
          [tenantId, body.parentTaskId],
        );
        if (!parentRows[0]) throw fastify.httpErrors.notFound("Parent task not found.");
        if (parentRows[0].projectId !== nextProjectId) {
          throw fastify.httpErrors.badRequest("Parent task must be in the target project.");
        }
        if (parentRows[0].parentTaskId !== null) {
          throw fastify.httpErrors.badRequest("Subtask depth limit reached (parent already has a parent).");
        }
      }

      // A cross-project move with no explicit parentTaskId clears the existing
      // parent (which would otherwise orphan into the new project, violating the
      // same-project constraint above).
      const nextParentTaskId =
        body.parentTaskId !== undefined
          ? body.parentTaskId
          : (crossProject ? null : undefined);

      const setClauses: string[] = ["updated_at = NOW()"];
      const values: unknown[] = [tenantId, params.id];
      let idx = 3;
      if (body.projectId !== undefined) {
        setClauses.push(`project_id = $${idx++}`);
        values.push(nextProjectId);
      }
      if (nextParentTaskId !== undefined) {
        setClauses.push(`parent_task_id = $${idx++}`);
        values.push(nextParentTaskId);
      }

      if (setClauses.length === 1) {
        // Nothing to update — no-op, return the existing row.
        return { id: existing[0].id, projectId: currentProjectId, parentTaskId: existing[0].parentTaskId };
      }

      const rows = await fastify.db.queryTenant<{ id: string; projectId: string; parentTaskId: string | null }>(
        tenantId,
        `UPDATE tasks SET ${setClauses.join(", ")}
         WHERE tenant_id = $1 AND id = $2
         RETURNING id, project_id AS "projectId", parent_task_id AS "parentTaskId"`,
        values,
      );

      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId: request.user.userId,
        actionType: "task.moved",
        objectType: "task",
        objectId: params.id,
        details: {
          fromProjectId: currentProjectId,
          toProjectId: nextProjectId,
          parentTaskId: nextParentTaskId ?? null,
        },
      });

      return rows[0];
    }
  );
};
