import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { writeAuditLog } from "../../lib/audit.js";
import {
  ACTIVE_PROJECT_STATUS,
  ARCHIVED_PROJECT_STATUS,
  ProjectStatusFilterSchema,
  appendProjectStatusFilter,
  normalizeProjectStatus,
  projectStatusSql,
} from "../../lib/project-status.js";
import {
  createProjectNote,
  isProjectCollaborator,
  listProjectNotesForUser,
} from "../../lib/project-notes.js";
import {
  countProjectOwners,
  createProjectOwnerMembership,
  deleteProjectMembership,
  getProjectMembershipAccess,
  getProjectMembershipRole,
  hasTenantMembership,
  listProjectMembers,
  upsertProjectMembership,
} from "../../lib/project-memberships.js";
import {
  ARCHIVED_PROJECT_WRITE_LOCK_MESSAGE,
  isProjectWriteLocked,
  loadProjectWriteState,
} from "../../lib/project-write-lock.js";

const CreateProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(4_000).optional(),
  ownerUserId: z.string().uuid().optional(),
  startDate: z.string().date().optional(),
  targetDate: z.string().date().optional(),
  categoryId: z.string().uuid().nullable().optional(),
});

const UpdateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(4_000).optional(),
  startDate: z.string().date().optional().nullable(),
  targetDate: z.string().date().optional().nullable(),
  status: z.enum(["active", "archived"]).optional(),
  categoryId: z.string().uuid().nullable().optional(),
});
const ProjectListQuerySchema = z.object({
  status: ProjectStatusFilterSchema.optional().default("all"),
});

const ProjectIdParamSchema = z.object({ id: z.string().uuid() });
const DeleteProjectSchema = z.object({
  confirmProjectName: z.string().min(1).max(200),
});
const ProjectMemberRoleSchema = z.enum(["owner", "editor", "viewer"]);
const ProjectMemberParamsSchema = z.object({ id: z.string().uuid(), userId: z.string().uuid() });
const UpsertProjectMemberSchema = z.object({
  userId: z.string().uuid(),
  role: ProjectMemberRoleSchema,
});
const UpdateProjectMemberRoleSchema = z.object({
  role: ProjectMemberRoleSchema,
});
const ProjectNotesQuerySchema = z.object({
  visibility: z.enum(["all", "shared", "personal"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
const CreateProjectNoteSchema = z
  .object({
    visibility: z.enum(["shared", "personal"]),
    recipientUserId: z.string().uuid().optional(),
    content: z.string().trim().min(1).max(4_000),
  })
  .superRefine((value, context) => {
    if (value.visibility === "shared" && value.recipientUserId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Shared notes cannot target a specific recipient.",
        path: ["recipientUserId"],
      });
    }
    if (value.visibility === "personal" && !value.recipientUserId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Personal notes require recipientUserId.",
        path: ["recipientUserId"],
      });
    }
  });

export const projectRoutes: FastifyPluginAsync = async (fastify) => {
  function parseOrBadRequest<T>(schema: z.ZodType<T>, value: unknown): T {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      throw fastify.httpErrors.badRequest(
        parsed.error.issues[0]?.message ?? "Invalid request payload."
      );
    }
    return parsed.data;
  }

  async function getProjectAccessOrThrow(input: {
    tenantId: string;
    userId: string;
    tenantRole: string;
    projectId: string;
    mode: "read" | "manage";
  }) {
    const access = await getProjectMembershipAccess({
      db: fastify.db,
      tenantId: input.tenantId,
      projectId: input.projectId,
      userId: input.userId,
      tenantRole: input.tenantRole,
    });

    if (!access.projectExists) {
      throw fastify.httpErrors.notFound("Project not found.");
    }

    if (input.mode === "read" && !access.canRead) {
      throw fastify.httpErrors.forbidden("Project access denied.");
    }

    if (input.mode === "manage" && !access.canManage) {
      throw fastify.httpErrors.forbidden(
        "Project collaborator management requires owner or editor access."
      );
    }

    return access;
  }

  function assertProjectWritableOrThrow(projectStatus: string | null | undefined) {
    if (isProjectWriteLocked(projectStatus)) {
      throw fastify.httpErrors.conflict(ARCHIVED_PROJECT_WRITE_LOCK_MESSAGE);
    }
  }

  async function buildProjectMembersResponse(input: {
    tenantId: string;
    userId: string;
    tenantRole: string;
    projectId: string;
  }) {
    const [members, currentUserRole] = await Promise.all([
      listProjectMembers(fastify.db, input.tenantId, input.projectId),
      getProjectMembershipRole(fastify.db, input.tenantId, input.projectId, input.userId),
    ]);
    const canManage =
      input.tenantRole === "admin" || currentUserRole === "owner" || currentUserRole === "editor";

    return {
      projectId: input.projectId,
      currentUserRole,
      canManage,
      members,
    };
  }

  fastify.get(
    "/:id/timeline",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const params = ProjectIdParamSchema.parse(request.params);
      const tenantId = request.user.tenantId;

      await getProjectAccessOrThrow({
        tenantId,
        userId: request.user.userId,
        tenantRole: request.user.role,
        projectId: params.id,
        mode: "read",
      });

      const taskRows = await fastify.db.queryTenant<{
        id: string;
        title: string;
        status: "backlog" | "not_started" | "in_progress" | "waiting" | "completed" | "blocked";
        priority: "low" | "medium" | "high" | "critical";
        parentTaskId: string | null;
        assigneeUserId: string | null;
        assigneeName: string | null;
        progressPercent: number;
        startDate: string | null;
        dueDate: string | null;
        riskLevel: "low" | "medium" | "high";
      }>(
        tenantId,
        `SELECT tasks.id, tasks.title, tasks.status, tasks.priority,
                tasks.parent_task_id as "parentTaskId",
                tasks.assignee_user_id as "assigneeUserId",
                COALESCE(NULLIF(u.display_name, ''), split_part(u.email, '@', 1)) as "assigneeName",
                tasks.progress_percent as "progressPercent",
                tasks.start_date as "startDate",
                tasks.due_date as "dueDate",
                tasks.risk_level as "riskLevel"
         FROM tasks
         LEFT JOIN users u ON u.id = tasks.assignee_user_id
         WHERE tasks.tenant_id = $1 AND tasks.project_id = $2
         ORDER BY tasks.created_at ASC`,
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
      const query = parseOrBadRequest(ProjectListQuerySchema, request.query);
      const values: unknown[] = [request.user.tenantId];
      const filters = ["projects.tenant_id = $1"];
      appendProjectStatusFilter({
        filters,
        values,
        filter: query.status,
        statusColumn: "projects.status",
      });

      const rows = await fastify.db.queryTenant(
        request.user.tenantId,
        `SELECT id, name, description, owner_user_id as "ownerUserId",
                ${projectStatusSql("projects.status")} as status,
                risk_score as "riskScore", risk_level as "riskLevel",
                start_date as "startDate", target_date as "targetDate",
                category_id as "categoryId",
                created_at as "createdAt", updated_at as "updatedAt"
         FROM projects
         WHERE ${filters.join(" AND ")}
         ORDER BY updated_at DESC, created_at DESC`,
        values
      );

      return { items: rows };
    }
  );

  fastify.post(
    "/",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm"])] },
    async (request, reply) => {
      const body = CreateProjectSchema.parse(request.body);
      const ownerUserId = body.ownerUserId ?? request.user.userId;
      const rows = await fastify.db.queryTenant<{ id: string }>(
        request.user.tenantId,
        `INSERT INTO projects (tenant_id, name, description, owner_user_id, start_date, target_date, category_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          request.user.tenantId,
          body.name,
          body.description ?? null,
          ownerUserId,
          body.startDate ?? null,
          body.targetDate ?? null,
          body.categoryId ?? null,
        ]
      );

      const projectId = rows[0].id;
      await createProjectOwnerMembership(
        fastify.db,
        request.user.tenantId,
        projectId,
        ownerUserId
      );

      // Auto-create root folder for the new project
      await fastify.db.queryTenant(
        request.user.tenantId,
        `INSERT INTO folders (tenant_id, project_id, name, folder_type, depth, created_by_user_id)
         VALUES ($1, $2, $3, 'project', 0, $4)`,
        [request.user.tenantId, projectId, body.name, request.user.userId]
      );

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

  fastify.patch(
    "/:id",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm"])] },
    async (request) => {
      const params = parseOrBadRequest(ProjectIdParamSchema, request.params);
      const body = parseOrBadRequest(UpdateProjectSchema, request.body);
      const tenantId = request.user.tenantId;

      const projectRows = await fastify.db.queryTenant<{ id: string; tenantId: string; status: string }>(
        tenantId,
        `SELECT id, tenant_id as "tenantId", ${projectStatusSql("status")} as status
           FROM projects
          WHERE tenant_id = $1
            AND id = $2
          LIMIT 1`,
        [tenantId, params.id]
      );
      const project = projectRows[0];
      if (!project) {
        throw fastify.httpErrors.notFound("Project not found.");
      }
      assertProjectWritableOrThrow(project.status);

      const setClauses: string[] = ["updated_at = NOW()"];
      const values: unknown[] = [tenantId, params.id];
      let idx = 3;

      if (body.name !== undefined) { setClauses.push(`name = $${idx++}`); values.push(body.name); }
      if (body.description !== undefined) { setClauses.push(`description = $${idx++}`); values.push(body.description); }
      if (body.startDate !== undefined) { setClauses.push(`start_date = $${idx++}`); values.push(body.startDate ?? null); }
      if (body.targetDate !== undefined) { setClauses.push(`target_date = $${idx++}`); values.push(body.targetDate ?? null); }
      if (body.status !== undefined) { setClauses.push(`status = $${idx++}`); values.push(body.status); }

      // categoryId uses CASE-WHEN flag pattern so null (uncategorise) is distinguishable
      // from "not provided" (leave unchanged).
      const categoryIdFlag = body.categoryId !== undefined;
      const categoryIdValue = body.categoryId ?? null;
      setClauses.push(`category_id = CASE WHEN $${idx}::boolean THEN $${idx + 1} ELSE category_id END`);
      values.push(categoryIdFlag, categoryIdValue);
      idx += 2;

      if (setClauses.length === 1) {
        return { id: params.id };
      }

      const updated = await fastify.db.queryTenant<{
        id: string;
        name: string;
        status: string;
        categoryId: string | null;
      }>(
        tenantId,
        `UPDATE projects
            SET ${setClauses.join(", ")}
          WHERE tenant_id = $1
            AND id = $2
         RETURNING id, name, ${projectStatusSql("status")} as status, category_id as "categoryId"`,
        values
      );

      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId: request.user.userId,
        actionType: "project.update",
        objectType: "project",
        objectId: params.id,
        details: { fields: Object.keys(body) },
      });

      return updated[0] ?? { id: params.id };
    }
  );

  async function updateProjectArchiveStatus(input: {
    tenantId: string;
    actorUserId: string;
    projectId: string;
    nextStatus: typeof ACTIVE_PROJECT_STATUS | typeof ARCHIVED_PROJECT_STATUS;
    actionType: "project.archive" | "project.unarchive";
  }) {
    const rows = await fastify.db.queryTenant<{ id: string; status: string }>(
      input.tenantId,
      `SELECT id, ${projectStatusSql("status")} as status
         FROM projects
        WHERE tenant_id = $1
          AND id = $2
        LIMIT 1`,
      [input.tenantId, input.projectId]
    );

    const project = rows[0];
    if (!project) {
      throw fastify.httpErrors.notFound("Project not found.");
    }

    const previousStatus = normalizeProjectStatus(project.status);
    const changed = previousStatus !== input.nextStatus;

    if (changed) {
      await fastify.db.queryTenant(
        input.tenantId,
        `UPDATE projects
            SET status = $3,
                updated_at = NOW()
          WHERE tenant_id = $1
            AND id = $2`,
        [input.tenantId, input.projectId, input.nextStatus]
      );
    }

    await writeAuditLog(fastify.db, {
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      actionType: input.actionType,
      objectType: "project",
      objectId: input.projectId,
      details: {
        previousStatus,
        newStatus: input.nextStatus,
        changed,
      },
    });

    return { id: input.projectId, status: input.nextStatus };
  }

  fastify.post(
    "/:id/archive",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm"])] },
    async (request) => {
      const params = parseOrBadRequest(ProjectIdParamSchema, request.params);
      return updateProjectArchiveStatus({
        tenantId: request.user.tenantId,
        actorUserId: request.user.userId,
        projectId: params.id,
        nextStatus: ARCHIVED_PROJECT_STATUS,
        actionType: "project.archive",
      });
    }
  );

  fastify.post(
    "/:id/unarchive",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm"])] },
    async (request) => {
      const params = parseOrBadRequest(ProjectIdParamSchema, request.params);
      return updateProjectArchiveStatus({
        tenantId: request.user.tenantId,
        actorUserId: request.user.userId,
        projectId: params.id,
        nextStatus: ACTIVE_PROJECT_STATUS,
        actionType: "project.unarchive",
      });
    }
  );

  fastify.post(
    "/:id/delete",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm"])] },
    async (request) => {
      const params = parseOrBadRequest(ProjectIdParamSchema, request.params);
      const body = parseOrBadRequest(DeleteProjectSchema, request.body);
      const tenantId = request.user.tenantId;
      const actorUserId = request.user.userId;

      const project = await loadProjectWriteState(fastify.db, tenantId, params.id);
      if (!project) {
        throw fastify.httpErrors.notFound("Project not found.");
      }

      if (project.ownerUserId !== actorUserId) {
        throw fastify.httpErrors.forbidden(
          "Only the project owner can permanently delete a project."
        );
      }

      if (body.confirmProjectName !== project.name) {
        throw fastify.httpErrors.conflict(
          "confirmProjectName must exactly match the current project name."
        );
      }

      const purgeResult = await fastify.db.tx(async (client) => {
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);

        const PURGEABLE_TABLES = ["meeting_notes", "documents", "email_outbound_drafts", "larry_conversations"] as const;
        type PurgeableTable = typeof PURGEABLE_TABLES[number];

        async function deleteAndCount(tableName: PurgeableTable): Promise<number> {
          const rows = await client.query<{ row_count: number }>(
            `WITH deleted AS (
               DELETE FROM ${tableName}
               WHERE tenant_id = $1
                 AND project_id = $2
               RETURNING id
             )
             SELECT COUNT(*)::int AS row_count
             FROM deleted`,
            [tenantId, params.id]
          );
          return Number(rows.rows[0]?.row_count ?? 0);
        }

        const [meetingNotesPurged, documentsPurged, emailDraftsPurged, conversationsPurged] =
          await Promise.all([
            deleteAndCount("meeting_notes"),
            deleteAndCount("documents"),
            deleteAndCount("email_outbound_drafts"),
            deleteAndCount("larry_conversations"),
          ]);

        const deletedProjectRows = await client.query<{ id: string }>(
          `DELETE FROM projects
            WHERE tenant_id = $1
              AND id = $2
          RETURNING id`,
          [tenantId, params.id]
        );

        if (!deletedProjectRows.rows[0]) {
          throw fastify.httpErrors.notFound("Project not found.");
        }

        return {
          meetingNotesPurged,
          documentsPurged,
          emailDraftsPurged,
          conversationsPurged,
        };
      });

      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId,
        actionType: "project.delete",
        objectType: "project",
        objectId: params.id,
        details: {
          previousStatus: project.status,
          projectName: project.name,
          purgedCounts: purgeResult,
        },
      });

      return { id: params.id, deleted: true };
    }
  );

  fastify.get(
    "/:id/members",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request) => {
      const params = parseOrBadRequest(ProjectIdParamSchema, request.params);
      const tenantId = request.user.tenantId;
      const userId = request.user.userId;

      await getProjectAccessOrThrow({
        tenantId,
        userId,
        tenantRole: request.user.role,
        projectId: params.id,
        mode: "read",
      });

      return buildProjectMembersResponse({
        tenantId,
        userId,
        tenantRole: request.user.role,
        projectId: params.id,
      });
    }
  );

  fastify.post(
    "/:id/members",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request) => {
      const params = parseOrBadRequest(ProjectIdParamSchema, request.params);
      const body = parseOrBadRequest(UpsertProjectMemberSchema, request.body);
      const tenantId = request.user.tenantId;
      const userId = request.user.userId;

      const access = await getProjectAccessOrThrow({
        tenantId,
        userId,
        tenantRole: request.user.role,
        projectId: params.id,
        mode: "manage",
      });
      assertProjectWritableOrThrow(access.projectStatus);

      const userInTenant = await hasTenantMembership(fastify.db, tenantId, body.userId);
      if (!userInTenant) {
        throw fastify.httpErrors.notFound("User is not a tenant member.");
      }

      const existingRole = await getProjectMembershipRole(
        fastify.db,
        tenantId,
        params.id,
        body.userId
      );

      await upsertProjectMembership(fastify.db, tenantId, params.id, body.userId, body.role);

      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId: userId,
        actionType: existingRole ? "project.member.role_updated" : "project.member.added",
        objectType: "project_membership",
        objectId: `${params.id}:${body.userId}`,
        details: {
          projectId: params.id,
          userId: body.userId,
          previousRole: existingRole,
          role: body.role,
        },
      });

      return buildProjectMembersResponse({
        tenantId,
        userId,
        tenantRole: request.user.role,
        projectId: params.id,
      });
    }
  );

  fastify.patch(
    "/:id/members/:userId",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request) => {
      const params = parseOrBadRequest(ProjectMemberParamsSchema, request.params);
      const body = parseOrBadRequest(UpdateProjectMemberRoleSchema, request.body);
      const tenantId = request.user.tenantId;
      const userId = request.user.userId;

      const access = await getProjectAccessOrThrow({
        tenantId,
        userId,
        tenantRole: request.user.role,
        projectId: params.id,
        mode: "manage",
      });
      assertProjectWritableOrThrow(access.projectStatus);

      const existingRole = await getProjectMembershipRole(
        fastify.db,
        tenantId,
        params.id,
        params.userId
      );
      if (!existingRole) {
        throw fastify.httpErrors.notFound("Project collaborator not found.");
      }

      if (existingRole === "owner" && body.role !== "owner") {
        const ownerCount = await countProjectOwners(fastify.db, tenantId, params.id);
        if (ownerCount <= 1) {
          throw fastify.httpErrors.conflict("Cannot demote the last project owner.");
        }
      }

      await upsertProjectMembership(fastify.db, tenantId, params.id, params.userId, body.role);

      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId: userId,
        actionType: "project.member.role_updated",
        objectType: "project_membership",
        objectId: `${params.id}:${params.userId}`,
        details: {
          projectId: params.id,
          userId: params.userId,
          previousRole: existingRole,
          role: body.role,
        },
      });

      return buildProjectMembersResponse({
        tenantId,
        userId,
        tenantRole: request.user.role,
        projectId: params.id,
      });
    }
  );

  fastify.delete(
    "/:id/members/:userId",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request) => {
      const params = parseOrBadRequest(ProjectMemberParamsSchema, request.params);
      const tenantId = request.user.tenantId;
      const userId = request.user.userId;

      const access = await getProjectAccessOrThrow({
        tenantId,
        userId,
        tenantRole: request.user.role,
        projectId: params.id,
        mode: "manage",
      });
      assertProjectWritableOrThrow(access.projectStatus);

      const existingRole = await getProjectMembershipRole(
        fastify.db,
        tenantId,
        params.id,
        params.userId
      );
      if (!existingRole) {
        throw fastify.httpErrors.notFound("Project collaborator not found.");
      }

      if (existingRole === "owner") {
        const ownerCount = await countProjectOwners(fastify.db, tenantId, params.id);
        if (ownerCount <= 1) {
          throw fastify.httpErrors.conflict("Cannot remove the last project owner.");
        }
      }

      const deleted = await deleteProjectMembership(
        fastify.db,
        tenantId,
        params.id,
        params.userId
      );
      if (!deleted) {
        throw fastify.httpErrors.notFound("Project collaborator not found.");
      }

      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId: userId,
        actionType: "project.member.removed",
        objectType: "project_membership",
        objectId: `${params.id}:${params.userId}`,
        details: {
          projectId: params.id,
          userId: params.userId,
          previousRole: existingRole,
        },
      });

      return buildProjectMembersResponse({
        tenantId,
        userId,
        tenantRole: request.user.role,
        projectId: params.id,
      });
    }
  );

  fastify.get(
    "/:id/notes",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request) => {
      const params = parseOrBadRequest(ProjectIdParamSchema, request.params);
      const query = parseOrBadRequest(ProjectNotesQuerySchema, request.query);
      const tenantId = request.user.tenantId;
      const userId = request.user.userId;

      await getProjectAccessOrThrow({
        tenantId,
        userId,
        tenantRole: request.user.role,
        projectId: params.id,
        mode: "read",
      });

      const notes = await listProjectNotesForUser(
        fastify.db,
        tenantId,
        params.id,
        userId,
        {
          visibility: query.visibility ?? "all",
          limit: query.limit,
        }
      );

      return {
        projectId: params.id,
        visibility: query.visibility ?? "all",
        notes,
      };
    }
  );

  fastify.post(
    "/:id/notes",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request, reply) => {
      const params = parseOrBadRequest(ProjectIdParamSchema, request.params);
      const body = parseOrBadRequest(CreateProjectNoteSchema, request.body);
      const tenantId = request.user.tenantId;
      const userId = request.user.userId;

      const access = await getProjectAccessOrThrow({
        tenantId,
        userId,
        tenantRole: request.user.role,
        projectId: params.id,
        mode: "read",
      });
      assertProjectWritableOrThrow(access.projectStatus);

      if (body.visibility === "personal") {
        const recipientUserId = body.recipientUserId ?? null;
        if (!recipientUserId) {
          throw fastify.httpErrors.badRequest("Personal notes require recipientUserId.");
        }

        const recipientIsCollaborator = await isProjectCollaborator(
          fastify.db,
          tenantId,
          params.id,
          recipientUserId
        );
        if (!recipientIsCollaborator) {
          throw fastify.httpErrors.notFound("Recipient is not a project collaborator.");
        }
      }

      const note = await createProjectNote(fastify.db, tenantId, {
        projectId: params.id,
        authorUserId: userId,
        visibility: body.visibility,
        recipientUserId: body.recipientUserId ?? null,
        content: body.content,
        sourceKind: "manual",
        sourceRecordId: null,
      });

      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId: userId,
        actionType: "project.note.created",
        objectType: "project_note",
        objectId: note.id,
        details: {
          projectId: params.id,
          visibility: note.visibility,
          recipientUserId: note.recipientUserId,
          sourceKind: note.sourceKind,
        },
      });

      return reply.code(201).send({ note });
    }
  );
};
