import type { Timeline2Snapshot, Timeline2UserPreferences } from "@larry/shared";
import { z } from "zod";
import { writeAuditLog } from "../../../../lib/audit.js";
import type { Timeline2RouteContext } from "../shared/route-context.js";

export function registerTimeline2ManualRoutes(ctx: Timeline2RouteContext) {
  const {
    fastify,
    devSampleSeedEnabled,
    parseOrBadRequest,
    ProjectParamSchema,
    NodeParamSchema,
    NodeInputSchema,
    NodePatchSchema,
    AssigneesSchema,
    DependencyInputSchema,
    DependencyParamSchema,
    assertProjectAccess,
    ensurePlan,
    seedDevPlaceholderPlanIfEmpty,
    buildSnapshot,
    loadTimeline2UserPreferences,
    saveTimeline2UserPreferences,
    buildTimeline2CriticalPath,
    validateParent,
    setAssignees,
    recordRevision,
    loadNodePlan,
    patchNode,
    loadDependencyPlan,
    validateDependency,
  } = ctx;

  const PreferencesBodySchema = z.object({
    columnOrder: z.array(z.string().trim().min(1)).max(16),
    visibleColumns: z.array(z.string().trim().min(1)).max(16),
    columnWidths: z.record(z.string().trim().min(1), z.number().finite().min(40).max(600)),
    outlineWidth: z.number().int().min(300).max(960),
    dayWidth: z.number().int().min(28).max(52),
    collapsedNodeIds: z.array(z.string().uuid()).max(2000),
  });

  fastify.post(
    "/projects/:projectId/ensure",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const params = parseOrBadRequest(ProjectParamSchema, request.params);
      const tenantId = request.user.tenantId;
      try {
        await assertProjectAccess({
          tenantId,
          userId: request.user.userId,
          tenantRole: request.user.role,
          projectId: params.projectId,
          mode: "read",
        });
        const plan = await ensurePlan(tenantId, params.projectId, request.user.userId);
        return { planId: plan.id };
      } catch (error) {
        if ((error as { statusCode?: number })?.statusCode) throw error;
        request.log.error({ err: error, projectId: params.projectId }, "Timeline 2 ensure failed");
        throw fastify.httpErrors.internalServerError("Timeline 2 ensure failed. Please try again.");
      }
    },
  );

  fastify.post(
    "/projects/:projectId/dev-seed-sample",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request) => {
      if (!devSampleSeedEnabled) {
        throw fastify.httpErrors.notFound("Timeline 2 sample seeding is unavailable.");
      }
      const params = parseOrBadRequest(ProjectParamSchema, request.params);
      const tenantId = request.user.tenantId;
      await assertProjectAccess({
        tenantId,
        userId: request.user.userId,
        tenantRole: request.user.role,
        projectId: params.projectId,
        mode: "write",
      });
      const plan = await ensurePlan(tenantId, params.projectId, request.user.userId);
      const seeded = await seedDevPlaceholderPlanIfEmpty(
        tenantId,
        params.projectId,
        plan.id,
        request.user.userId,
      );
      return { planId: plan.id, seeded };
    },
  );

  fastify.get(
    "/projects/:projectId/snapshot",
    { preHandler: [fastify.authenticate] },
    async (request): Promise<Timeline2Snapshot> => {
      const params = parseOrBadRequest(ProjectParamSchema, request.params);
      const tenantId = request.user.tenantId;
      try {
        await assertProjectAccess({
          tenantId,
          userId: request.user.userId,
          tenantRole: request.user.role,
          projectId: params.projectId,
          mode: "read",
        });
        return buildSnapshot(tenantId, params.projectId);
      } catch (error) {
        if ((error as { statusCode?: number })?.statusCode) throw error;
        request.log.error({ err: error, projectId: params.projectId }, "Timeline 2 snapshot failed");
        throw fastify.httpErrors.internalServerError("Timeline 2 snapshot failed. Please refresh.");
      }
    },
  );

  fastify.get(
    "/projects/:projectId/preferences",
    { preHandler: [fastify.authenticate] },
    async (request): Promise<Timeline2UserPreferences> => {
      const params = parseOrBadRequest(ProjectParamSchema, request.params);
      const tenantId = request.user.tenantId;
      await assertProjectAccess({
        tenantId,
        userId: request.user.userId,
        tenantRole: request.user.role,
        projectId: params.projectId,
        mode: "read",
      });
      return loadTimeline2UserPreferences(tenantId, request.user.userId, params.projectId);
    },
  );

  fastify.put(
    "/projects/:projectId/preferences",
    { preHandler: [fastify.authenticate] },
    async (request): Promise<Timeline2UserPreferences> => {
      const params = parseOrBadRequest(ProjectParamSchema, request.params);
      const body = parseOrBadRequest(PreferencesBodySchema, request.body);
      const tenantId = request.user.tenantId;
      await assertProjectAccess({
        tenantId,
        userId: request.user.userId,
        tenantRole: request.user.role,
        projectId: params.projectId,
        mode: "read",
      });
      return saveTimeline2UserPreferences(tenantId, request.user.userId, params.projectId, body);
    },
  );

  fastify.get(
    "/projects/:projectId/critical-path",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const params = parseOrBadRequest(ProjectParamSchema, request.params);
      const tenantId = request.user.tenantId;
      try {
        await assertProjectAccess({
          tenantId,
          userId: request.user.userId,
          tenantRole: request.user.role,
          projectId: params.projectId,
          mode: "read",
        });
        return buildTimeline2CriticalPath(tenantId, params.projectId);
      } catch (error) {
        if ((error as { statusCode?: number })?.statusCode) throw error;
        request.log.error(
          { err: error, projectId: params.projectId },
          "Timeline 2 critical-path failed",
        );
        throw fastify.httpErrors.internalServerError(
          "Timeline 2 critical path failed. Please refresh.",
        );
      }
    },
  );

  fastify.post(
    "/projects/:projectId/nodes",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request, reply) => {
      const params = parseOrBadRequest(ProjectParamSchema, request.params);
      const body = parseOrBadRequest(NodeInputSchema, request.body);
      const tenantId = request.user.tenantId;
      await assertProjectAccess({
        tenantId,
        userId: request.user.userId,
        tenantRole: request.user.role,
        projectId: params.projectId,
        mode: "write",
      });
      const plan = await ensurePlan(tenantId, params.projectId, request.user.userId);
      if (body.kind === "group" && body.progress !== undefined) {
        throw fastify.httpErrors.badRequest("Group progress is derived from child items and cannot be set directly.");
      }
      await validateParent(tenantId, plan.id, null, body.parentId ?? null);
      const rows = await fastify.db.queryTenant<{ id: string }>(
        tenantId,
        `INSERT INTO timeline2_nodes
           (tenant_id, plan_id, parent_node_id, kind, title, description, status,
            priority, start_date, due_date, sort_order, progress, action_required,
            action_required_note, created_by_user_id, updated_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                 COALESCE($11, (
                   SELECT COALESCE(MAX(sort_order), -1) + 1
                     FROM timeline2_nodes
                    WHERE tenant_id = $1 AND plan_id = $2 AND parent_node_id IS NOT DISTINCT FROM $3
                 )),
                 $12, $13, $14, $15, $15)
         RETURNING id`,
        [
          tenantId,
          plan.id,
          body.parentId ?? null,
          body.kind,
          body.title,
          body.description ?? null,
          body.status,
          body.priority,
          body.startDate ?? null,
          body.dueDate ?? null,
          body.sortOrder ?? null,
          body.progress ?? 0,
          body.actionRequired?.required ?? false,
          body.actionRequired?.note ?? null,
          request.user.userId,
        ],
      );
      const nodeId = rows[0].id;
      await setAssignees(tenantId, nodeId, body.assigneeUserIds ?? [], request.user.userId);
      await recordRevision(tenantId, plan.id, request.user.userId, "Human created Timeline 2 node");
      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId: request.user.userId,
        actionType: "timeline2.node.create",
        objectType: "timeline2_node",
        objectId: nodeId,
        details: { projectId: params.projectId, title: body.title },
      });
      return reply.code(201).send({ id: nodeId });
    },
  );

  fastify.patch(
    "/nodes/:nodeId",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request) => {
      const params = parseOrBadRequest(NodeParamSchema, request.params);
      const body = parseOrBadRequest(NodePatchSchema, request.body);
      const tenantId = request.user.tenantId;
      const planRef = await loadNodePlan(tenantId, params.nodeId);
      if (!planRef) throw fastify.httpErrors.notFound("Timeline 2 node not found.");
      await assertProjectAccess({
        tenantId,
        userId: request.user.userId,
        tenantRole: request.user.role,
        projectId: planRef.projectId,
        mode: "write",
      });
      await patchNode(tenantId, planRef.planId, params.nodeId, body, request.user.userId, true);
      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId: request.user.userId,
        actionType: "timeline2.node.update",
        objectType: "timeline2_node",
        objectId: params.nodeId,
        details: { projectId: planRef.projectId },
      });
      return { id: params.nodeId };
    },
  );

  fastify.delete(
    "/nodes/:nodeId",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request) => {
      const params = parseOrBadRequest(NodeParamSchema, request.params);
      const tenantId = request.user.tenantId;
      const planRef = await loadNodePlan(tenantId, params.nodeId);
      if (!planRef) throw fastify.httpErrors.notFound("Timeline 2 node not found.");
      await assertProjectAccess({
        tenantId,
        userId: request.user.userId,
        tenantRole: request.user.role,
        projectId: planRef.projectId,
        mode: "write",
      });
      await fastify.db.queryTenant(
        tenantId,
        `DELETE FROM timeline2_nodes WHERE tenant_id = $1 AND id = $2`,
        [tenantId, params.nodeId],
      );
      await recordRevision(tenantId, planRef.planId, request.user.userId, "Human deleted Timeline 2 node");
      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId: request.user.userId,
        actionType: "timeline2.node.delete",
        objectType: "timeline2_node",
        objectId: params.nodeId,
        details: { projectId: planRef.projectId },
      });
      return { id: params.nodeId };
    },
  );

  fastify.put(
    "/nodes/:nodeId/assignees",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request) => {
      const params = parseOrBadRequest(NodeParamSchema, request.params);
      const body = parseOrBadRequest(AssigneesSchema, request.body);
      const tenantId = request.user.tenantId;
      const planRef = await loadNodePlan(tenantId, params.nodeId);
      if (!planRef) throw fastify.httpErrors.notFound("Timeline 2 node not found.");
      await assertProjectAccess({
        tenantId,
        userId: request.user.userId,
        tenantRole: request.user.role,
        projectId: planRef.projectId,
        mode: "write",
      });
      await setAssignees(tenantId, params.nodeId, body.assigneeUserIds, request.user.userId);
      await recordRevision(
        tenantId,
        planRef.planId,
        request.user.userId,
        "Human updated Timeline 2 assignees",
      );
      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId: request.user.userId,
        actionType: "timeline2.node.assignees.update",
        objectType: "timeline2_node",
        objectId: params.nodeId,
        details: { projectId: planRef.projectId, assigneeCount: body.assigneeUserIds.length },
      });
      return { id: params.nodeId };
    },
  );

  fastify.post(
    "/projects/:projectId/dependencies",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request, reply) => {
      const params = parseOrBadRequest(ProjectParamSchema, request.params);
      const body = parseOrBadRequest(DependencyInputSchema, request.body);
      const tenantId = request.user.tenantId;
      await assertProjectAccess({
        tenantId,
        userId: request.user.userId,
        tenantRole: request.user.role,
        projectId: params.projectId,
        mode: "write",
      });
      const plan = await ensurePlan(tenantId, params.projectId, request.user.userId);
      await validateDependency(tenantId, plan.id, body.fromNodeId, body.toNodeId);
      const rows = await fastify.db.queryTenant<{ id: string }>(
        tenantId,
        `INSERT INTO timeline2_dependencies
           (tenant_id, plan_id, from_node_id, to_node_id, relation, lag_days, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (tenant_id, plan_id, from_node_id, to_node_id)
         DO UPDATE SET relation = EXCLUDED.relation, lag_days = EXCLUDED.lag_days
         RETURNING id`,
        [tenantId, plan.id, body.fromNodeId, body.toNodeId, body.relation, body.lagDays, request.user.userId],
      );
      await recordRevision(
        tenantId,
        plan.id,
        request.user.userId,
        "Human updated Timeline 2 dependencies",
      );
      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId: request.user.userId,
        actionType: "timeline2.dependency.upsert",
        objectType: "timeline2_dependency",
        objectId: rows[0].id,
        details: {
          projectId: params.projectId,
          fromNodeId: body.fromNodeId,
          toNodeId: body.toNodeId,
        },
      });
      return reply.code(201).send({ id: rows[0].id });
    },
  );

  fastify.delete(
    "/dependencies/:dependencyId",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request) => {
      const params = parseOrBadRequest(DependencyParamSchema, request.params);
      const tenantId = request.user.tenantId;
      const planRef = await loadDependencyPlan(tenantId, params.dependencyId);
      if (!planRef) throw fastify.httpErrors.notFound("Timeline 2 dependency not found.");
      await assertProjectAccess({
        tenantId,
        userId: request.user.userId,
        tenantRole: request.user.role,
        projectId: planRef.projectId,
        mode: "write",
      });
      await fastify.db.queryTenant(
        tenantId,
        `DELETE FROM timeline2_dependencies WHERE tenant_id = $1 AND id = $2`,
        [tenantId, params.dependencyId],
      );
      await recordRevision(
        tenantId,
        planRef.planId,
        request.user.userId,
        "Human removed Timeline 2 dependency",
      );
      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId: request.user.userId,
        actionType: "timeline2.dependency.delete",
        objectType: "timeline2_dependency",
        objectId: params.dependencyId,
        details: { projectId: planRef.projectId },
      });
      return { id: params.dependencyId };
    },
  );
}
