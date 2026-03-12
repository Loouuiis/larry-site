import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { writeAuditLog } from "../../lib/audit.js";

const DecisionBodySchema = z.object({
  note: z.string().max(1_000).optional(),
  overridePayload: z.record(z.string(), z.unknown()).optional(),
});

async function loadActionOrThrow(
  fastify: Parameters<FastifyPluginAsync>[0],
  tenantId: string,
  actionId: string
): Promise<{
  id: string;
  state: "pending" | "approved" | "rejected" | "overridden" | "executed";
}> {
  const rows = await fastify.db.queryTenant<{ id: string; state: "pending" | "approved" | "rejected" | "overridden" | "executed" }>(
    tenantId,
    "SELECT id, state FROM extracted_actions WHERE tenant_id = $1 AND id = $2 LIMIT 1",
    [tenantId, actionId]
  );

  if (!rows[0]) {
    throw fastify.httpErrors.notFound("Action not found.");
  }

  return rows[0];
}

async function recordDecision(
  fastify: Parameters<FastifyPluginAsync>[0],
  options: {
    tenantId: string;
    actionId: string;
    userId: string;
    decision: "approved" | "rejected" | "overridden";
    note?: string;
  }
): Promise<void> {
  await fastify.db.queryTenant(
    options.tenantId,
    `INSERT INTO approval_decisions (tenant_id, action_id, decision, decided_by_user_id, note)
     VALUES ($1, $2, $3, $4, $5)`,
    [options.tenantId, options.actionId, options.decision, options.userId, options.note ?? null]
  );
}

export const actionRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/:id/approve",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm"])] },
    async (request) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const body = DecisionBodySchema.parse(request.body);
      const tenantId = request.user.tenantId;

      const action = await loadActionOrThrow(fastify, tenantId, params.id);
      if (action.state !== "pending") {
        throw fastify.httpErrors.conflict(`Action is already in state ${action.state}.`);
      }

      await fastify.db.queryTenant(
        tenantId,
        "UPDATE extracted_actions SET state = 'approved', updated_at = NOW() WHERE tenant_id = $1 AND id = $2",
        [tenantId, params.id]
      );

      await recordDecision(fastify, {
        tenantId,
        actionId: params.id,
        userId: request.user.userId,
        decision: "approved",
        note: body.note,
      });

      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId: request.user.userId,
        actionType: "action.approve",
        objectType: "extracted_action",
        objectId: params.id,
        details: { note: body.note ?? null },
      });

      return { success: true, state: "approved" };
    }
  );

  fastify.post(
    "/:id/reject",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm"])] },
    async (request) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const body = DecisionBodySchema.parse(request.body);
      const tenantId = request.user.tenantId;

      const action = await loadActionOrThrow(fastify, tenantId, params.id);
      if (action.state !== "pending") {
        throw fastify.httpErrors.conflict(`Action is already in state ${action.state}.`);
      }

      await fastify.db.queryTenant(
        tenantId,
        "UPDATE extracted_actions SET state = 'rejected', updated_at = NOW() WHERE tenant_id = $1 AND id = $2",
        [tenantId, params.id]
      );

      await recordDecision(fastify, {
        tenantId,
        actionId: params.id,
        userId: request.user.userId,
        decision: "rejected",
        note: body.note,
      });

      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId: request.user.userId,
        actionType: "action.reject",
        objectType: "extracted_action",
        objectId: params.id,
        details: { note: body.note ?? null },
      });

      return { success: true, state: "rejected" };
    }
  );

  fastify.post(
    "/:id/override",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm"])] },
    async (request) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const body = DecisionBodySchema.parse(request.body);
      const tenantId = request.user.tenantId;

      const action = await loadActionOrThrow(fastify, tenantId, params.id);
      if (action.state !== "pending") {
        throw fastify.httpErrors.conflict(`Action is already in state ${action.state}.`);
      }

      await fastify.db.queryTenant(
        tenantId,
        `UPDATE extracted_actions
         SET state = 'overridden',
             payload = COALESCE($3::jsonb, payload),
             updated_at = NOW()
         WHERE tenant_id = $1 AND id = $2`,
        [tenantId, params.id, body.overridePayload ? JSON.stringify(body.overridePayload) : null]
      );

      await recordDecision(fastify, {
        tenantId,
        actionId: params.id,
        userId: request.user.userId,
        decision: "overridden",
        note: body.note,
      });

      await fastify.db.queryTenant(
        tenantId,
        `INSERT INTO correction_feedback
         (tenant_id, action_id, corrected_by_user_id, correction_type, correction_payload)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [
          tenantId,
          params.id,
          request.user.userId,
          "manual_override",
          JSON.stringify({ overridePayload: body.overridePayload ?? {}, note: body.note ?? null }),
        ]
      );

      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId: request.user.userId,
        actionType: "action.override",
        objectType: "extracted_action",
        objectId: params.id,
        details: { overridePayload: body.overridePayload ?? null, note: body.note ?? null },
      });

      return { success: true, state: "overridden" };
    }
  );
};
