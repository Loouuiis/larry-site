import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { writeAuditLog } from "../../lib/audit.js";
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

const CreateProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(4_000).optional(),
  ownerUserId: z.string().uuid().optional(),
  startDate: z.string().date().optional(),
  targetDate: z.string().date().optional(),
});

const ProjectIdParamSchema = z.object({ id: z.string().uuid() });
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
      const ownerUserId = body.ownerUserId ?? request.user.userId;
      const rows = await fastify.db.queryTenant<{ id: string }>(
        request.user.tenantId,
        `INSERT INTO projects (tenant_id, name, description, owner_user_id, start_date, target_date)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          request.user.tenantId,
          body.name,
          body.description ?? null,
          ownerUserId,
          body.startDate ?? null,
          body.targetDate ?? null,
        ]
      );

      const projectId = rows[0].id;
      await createProjectOwnerMembership(
        fastify.db,
        request.user.tenantId,
        projectId,
        ownerUserId
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

      await getProjectAccessOrThrow({
        tenantId,
        userId,
        tenantRole: request.user.role,
        projectId: params.id,
        mode: "manage",
      });

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

      await getProjectAccessOrThrow({
        tenantId,
        userId,
        tenantRole: request.user.role,
        projectId: params.id,
        mode: "manage",
      });

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

      await getProjectAccessOrThrow({
        tenantId,
        userId,
        tenantRole: request.user.role,
        projectId: params.id,
        mode: "manage",
      });

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

      await getProjectAccessOrThrow({
        tenantId,
        userId,
        tenantRole: request.user.role,
        projectId: params.id,
        mode: "read",
      });

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
