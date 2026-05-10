import { writeAuditLog } from "../../../lib/audit.js";
import type { Timeline2RouteContext } from "./route-context.js";

export function registerTimeline2BranchRoutes(ctx: Timeline2RouteContext) {
  const {
    fastify,
    parseOrBadRequest,
    ProjectParamSchema,
    BranchParamSchema,
    AcceptBranchSchema,
    RejectBranchSchema,
    assertProjectAccess,
    loadBranches,
    applyOperation,
    recordRevision,
    buildSnapshot,
  } = ctx;

  fastify.get(
    "/projects/:projectId/branches",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const params = parseOrBadRequest(ProjectParamSchema, request.params);
      const tenantId = request.user.tenantId;
      await assertProjectAccess({
        tenantId,
        userId: request.user.userId,
        tenantRole: request.user.role,
        projectId: params.projectId,
        mode: "read",
      });
      return { branches: await loadBranches(tenantId, params.projectId) };
    },
  );

  fastify.post(
    "/branches/:branchId/accept",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request) => {
      const params = parseOrBadRequest(BranchParamSchema, request.params);
      const body = parseOrBadRequest(AcceptBranchSchema, request.body ?? {});
      const tenantId = request.user.tenantId;
      const branchRows = await fastify.db.queryTenant<{
        projectId: string;
        planId: string;
        status: string;
      }>(
        tenantId,
        `SELECT project_id AS "projectId", plan_id AS "planId", status
           FROM timeline2_branches
          WHERE tenant_id = $1 AND id = $2
          LIMIT 1`,
        [tenantId, params.branchId],
      );
      const branch = branchRows[0];
      if (!branch) throw fastify.httpErrors.notFound("Timeline 2 branch not found.");
      if (branch.status !== "open") {
        throw fastify.httpErrors.conflict("Only open branches can be accepted.");
      }
      await assertProjectAccess({
        tenantId,
        userId: request.user.userId,
        tenantRole: request.user.role,
        projectId: branch.projectId,
        mode: "write",
      });
      const allOps =
        (await loadBranches(tenantId, branch.projectId)).find((item) => item.id === params.branchId)
          ?.operations ?? [];
      if (body.operationIds && body.operationIds.length === 0) {
        throw fastify.httpErrors.badRequest(
          "operationIds must include at least one pending operation.",
        );
      }
      const selected = new Set(
        body.operationIds ?? allOps.filter((op) => op.status === "pending").map((op) => op.id),
      );
      const tempIdMap = new Map<string, string>();
      let appliedCount = 0;
      for (const operation of allOps.filter(
        (op) => selected.has(op.id) && op.status === "pending",
      )) {
        await applyOperation({
          tenantId,
          planId: branch.planId,
          actorUserId: request.user.userId,
          operation,
          tempIdMap,
        });
        await fastify.db.queryTenant(
          tenantId,
          `UPDATE timeline2_branch_operations
              SET status = 'applied', updated_at = NOW()
            WHERE tenant_id = $1 AND id = $2`,
          [tenantId, operation.id],
        );
        appliedCount += 1;
      }
      if (appliedCount === 0) {
        throw fastify.httpErrors.conflict("No pending operations were selected for acceptance.");
      }
      const remaining = await fastify.db.queryTenant<{ count: number }>(
        tenantId,
        `SELECT COUNT(*)::int AS count
           FROM timeline2_branch_operations
          WHERE tenant_id = $1 AND branch_id = $2 AND status = 'pending'`,
        [tenantId, params.branchId],
      );
      if ((remaining[0]?.count ?? 0) === 0) {
        await fastify.db.queryTenant(
          tenantId,
          `UPDATE timeline2_branches
              SET status = 'accepted', accepted_by_user_id = $3, accepted_at = NOW(), updated_at = NOW()
            WHERE tenant_id = $1 AND id = $2`,
          [tenantId, params.branchId, request.user.userId],
        );
      } else {
        await fastify.db.queryTenant(
          tenantId,
          `UPDATE timeline2_branches SET updated_at = NOW() WHERE tenant_id = $1 AND id = $2`,
          [tenantId, params.branchId],
        );
      }
      await recordRevision(
        tenantId,
        branch.planId,
        request.user.userId,
        "Accepted Timeline 2 AI branch operations",
      );
      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId: request.user.userId,
        actionType: "timeline2.branch.accept",
        objectType: "timeline2_branch",
        objectId: params.branchId,
        details: {
          projectId: branch.projectId,
          appliedCount,
          pendingRemaining: remaining[0]?.count ?? 0,
        },
      });
      return {
        branchId: params.branchId,
        snapshot: await buildSnapshot(tenantId, branch.projectId),
      };
    },
  );

  fastify.post(
    "/branches/:branchId/reject",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request) => {
      const params = parseOrBadRequest(BranchParamSchema, request.params);
      const body = parseOrBadRequest(RejectBranchSchema, request.body ?? {});
      const tenantId = request.user.tenantId;
      const branchRows = await fastify.db.queryTenant<{ projectId: string; status: string }>(
        tenantId,
        `SELECT project_id AS "projectId", status
           FROM timeline2_branches
          WHERE tenant_id = $1 AND id = $2
          LIMIT 1`,
        [tenantId, params.branchId],
      );
      const branch = branchRows[0];
      if (!branch) throw fastify.httpErrors.notFound("Timeline 2 branch not found.");
      if (branch.status !== "open") {
        throw fastify.httpErrors.conflict("Only open branches can be rejected.");
      }
      await assertProjectAccess({
        tenantId,
        userId: request.user.userId,
        tenantRole: request.user.role,
        projectId: branch.projectId,
        mode: "write",
      });
      if (body.operationIds && body.operationIds.length > 0) {
        await fastify.db.queryTenant(
          tenantId,
          `UPDATE timeline2_branch_operations
              SET status = 'rejected', updated_at = NOW()
            WHERE tenant_id = $1 AND branch_id = $2 AND id = ANY($3::uuid[]) AND status = 'pending'`,
          [tenantId, params.branchId, body.operationIds],
        );
      } else {
        await fastify.db.queryTenant(
          tenantId,
          `UPDATE timeline2_branch_operations
              SET status = 'rejected', updated_at = NOW()
            WHERE tenant_id = $1 AND branch_id = $2 AND status = 'pending'`,
          [tenantId, params.branchId],
        );
      }
      const remaining = await fastify.db.queryTenant<{ count: number }>(
        tenantId,
        `SELECT COUNT(*)::int AS count
           FROM timeline2_branch_operations
          WHERE tenant_id = $1 AND branch_id = $2 AND status = 'pending'`,
        [tenantId, params.branchId],
      );
      if ((remaining[0]?.count ?? 0) === 0) {
        await fastify.db.queryTenant(
          tenantId,
          `UPDATE timeline2_branches
              SET status = 'rejected', rejected_by_user_id = $3, rejected_at = NOW(), updated_at = NOW()
            WHERE tenant_id = $1 AND id = $2`,
          [tenantId, params.branchId, request.user.userId],
        );
      }
      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId: request.user.userId,
        actionType: "timeline2.branch.reject",
        objectType: "timeline2_branch",
        objectId: params.branchId,
        details: {
          projectId: branch.projectId,
          selectedOperationCount: body.operationIds?.length ?? null,
          pendingRemaining: remaining[0]?.count ?? 0,
        },
      });
      return { branchId: params.branchId };
    },
  );
}
