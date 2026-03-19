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
  agentRunId: string | null;
  state: "pending" | "approved" | "rejected" | "overridden" | "executed";
}> {
  const rows = await fastify.db.queryTenant<{
    id: string;
    agentRunId: string | null;
    state: "pending" | "approved" | "rejected" | "overridden" | "executed";
  }>(
    tenantId,
    `SELECT id, agent_run_id as "agentRunId", state
     FROM extracted_actions
     WHERE tenant_id = $1 AND id = $2
     LIMIT 1`,
    [tenantId, actionId]
  );

  if (!rows[0]) {
    throw fastify.httpErrors.notFound("Action not found.");
  }

  return rows[0];
}

async function finalizeAgentRunIfResolved(
  fastify: Parameters<FastifyPluginAsync>[0],
  options: { tenantId: string; runId: string | null; actorUserId: string }
): Promise<void> {
  if (!options.runId) return;

  const runRows = await fastify.db.queryTenant<{ state: "APPROVAL_PENDING" | "EXECUTED" | "VERIFIED" | "FAILED" }>(
    options.tenantId,
    `SELECT state
     FROM agent_runs
     WHERE tenant_id = $1 AND id = $2
     LIMIT 1`,
    [options.tenantId, options.runId]
  );

  const run = runRows[0];
  if (!run || run.state !== "APPROVAL_PENDING") {
    return;
  }

  const pendingRows = await fastify.db.queryTenant<{ count: number }>(
    options.tenantId,
    `SELECT COUNT(*)::int as count
     FROM extracted_actions
     WHERE tenant_id = $1
       AND agent_run_id = $2
       AND state = 'pending'`,
    [options.tenantId, options.runId]
  );

  if ((pendingRows[0]?.count ?? 0) > 0) {
    return;
  }

  await fastify.db.queryTenant(
    options.tenantId,
    `UPDATE agent_runs
     SET state = 'EXECUTED',
         status_message = $3,
         updated_at = NOW()
     WHERE tenant_id = $1 AND id = $2`,
    [options.tenantId, options.runId, "All approval-required actions resolved"]
  );

  await fastify.db.queryTenant(
    options.tenantId,
    `INSERT INTO agent_run_transitions
     (tenant_id, agent_run_id, previous_state, next_state, reason, metadata)
     VALUES ($1, $2, 'APPROVAL_PENDING', 'EXECUTED', $3, $4::jsonb)`,
    [
      options.tenantId,
      options.runId,
      "All pending actions reviewed",
      JSON.stringify({ resolution: "approvals_resolved" }),
    ]
  );

  await fastify.db.queryTenant(
    options.tenantId,
    `UPDATE agent_runs
     SET state = 'VERIFIED',
         status_message = $3,
         updated_at = NOW()
     WHERE tenant_id = $1 AND id = $2`,
    [options.tenantId, options.runId, "Run verified after approval decisions"]
  );

  await fastify.db.queryTenant(
    options.tenantId,
    `INSERT INTO agent_run_transitions
     (tenant_id, agent_run_id, previous_state, next_state, reason, metadata)
     VALUES ($1, $2, 'EXECUTED', 'VERIFIED', $3, $4::jsonb)`,
    [
      options.tenantId,
      options.runId,
      "Approval loop completed",
      JSON.stringify({ resolution: "approvals_resolved" }),
    ]
  );

  await writeAuditLog(fastify.db, {
    tenantId: options.tenantId,
    actorUserId: options.actorUserId,
    actionType: "agent.run.auto-verify",
    objectType: "agent_run",
    objectId: options.runId,
    details: { reason: "no_pending_actions_remaining" },
  });
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

async function updateInterventionStatus(
  fastify: Parameters<FastifyPluginAsync>[0],
  tenantId: string,
  actionId: string,
  status: string
): Promise<void> {
  await fastify.db.queryTenant(
    tenantId,
    `UPDATE interventions
     SET status = $3,
         updated_at = NOW()
     WHERE tenant_id = $1 AND action_id = $2`,
    [tenantId, actionId, status]
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
      await updateInterventionStatus(fastify, tenantId, params.id, "approved");

      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId: request.user.userId,
        actionType: "action.approve",
        objectType: "extracted_action",
        objectId: params.id,
        details: { note: body.note ?? null },
      });

      await finalizeAgentRunIfResolved(fastify, {
        tenantId,
        runId: action.agentRunId,
        actorUserId: request.user.userId,
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
      await updateInterventionStatus(fastify, tenantId, params.id, "rejected");

      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId: request.user.userId,
        actionType: "action.reject",
        objectType: "extracted_action",
        objectId: params.id,
        details: { note: body.note ?? null },
      });

      await finalizeAgentRunIfResolved(fastify, {
        tenantId,
        runId: action.agentRunId,
        actorUserId: request.user.userId,
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
      await updateInterventionStatus(fastify, tenantId, params.id, "overridden");

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

      await finalizeAgentRunIfResolved(fastify, {
        tenantId,
        runId: action.agentRunId,
        actorUserId: request.user.userId,
      });

      return { success: true, state: "overridden" };
    }
  );
};
