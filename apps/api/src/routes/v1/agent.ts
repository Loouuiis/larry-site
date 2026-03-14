import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { evaluateActionPolicy } from "@larry/ai";
import { ExtractedAction } from "@larry/shared";
import { assertTransition } from "../../services/agent/workflow.js";
import { writeAuditLog } from "../../lib/audit.js";

const CreateRunSchema = z.object({
  source: z.enum(["slack", "email", "calendar", "transcript"]),
  sourceRefId: z.string().optional(),
  projectId: z.string().uuid().optional(),
  transcript: z.string().min(20).optional(),
  trigger: z.string().default("manual"),
});

const ActionQuerySchema = z.object({
  state: z.enum(["pending", "approved", "rejected", "overridden", "executed"]).optional(),
});

async function transitionRun(
  fastify: Parameters<FastifyPluginAsync>[0],
  tenantId: string,
  runId: string,
  from: string,
  to: string,
  reason: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  assertTransition(from as never, to as never);

  await fastify.db.queryTenant(
    tenantId,
    `UPDATE agent_runs
     SET state = $3,
         status_message = $4,
         updated_at = NOW()
     WHERE tenant_id = $1 AND id = $2`,
    [tenantId, runId, to, reason]
  );

  await fastify.db.queryTenant(
    tenantId,
    `INSERT INTO agent_run_transitions
     (tenant_id, agent_run_id, previous_state, next_state, reason, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [tenantId, runId, from, to, reason, JSON.stringify(metadata)]
  );
}

async function persistAction(
  fastify: Parameters<FastifyPluginAsync>[0],
  tenantId: string,
  runId: string,
  projectId: string | undefined,
  action: ExtractedAction
): Promise<{ id: string; requiresApproval: boolean }> {
  const policy = evaluateActionPolicy(action);
  const state = policy.requiresApproval ? "pending" : "executed";

  const rows = await fastify.db.queryTenant<{ id: string }>(
    tenantId,
    `INSERT INTO extracted_actions
      (tenant_id, agent_run_id, project_id, action_type, impact, confidence, reason, signals, payload, state, requires_approval, executed_at)
     VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11, CASE WHEN $11 = false THEN NOW() ELSE NULL END)
     RETURNING id`,
    [
      tenantId,
      runId,
      projectId ?? null,
      "task_proposal",
      action.impact,
      action.confidence,
      `${action.reason} | ${policy.reason}`,
      JSON.stringify(action.signals),
      JSON.stringify(action),
      state,
      policy.requiresApproval,
    ]
  );

  return { id: rows[0].id, requiresApproval: policy.requiresApproval };
}

export const agentRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/runs",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm"])] },
    async (request, reply) => {
      const body = CreateRunSchema.parse(request.body);
      const tenantId = request.user.tenantId;

      const runRows = await fastify.db.queryTenant<{ id: string; state: string }>(
        tenantId,
        `INSERT INTO agent_runs (tenant_id, project_id, source, source_ref_id, state, status_message, correlation_id, created_by_user_id)
         VALUES ($1, $2, $3, $4, 'INGESTED', $5, $6, $7)
         RETURNING id, state`,
        [
          tenantId,
          body.projectId ?? null,
          body.source,
          body.sourceRefId ?? null,
          `Agent run started (${body.trigger})`,
          crypto.randomUUID(),
          request.user.userId,
        ]
      );

      const runId = runRows[0].id;
      let currentState = runRows[0].state;

      await fastify.db.queryTenant(
        tenantId,
        `INSERT INTO agent_run_transitions
         (tenant_id, agent_run_id, previous_state, next_state, reason)
         VALUES ($1, $2, NULL, 'INGESTED', $3)`,
        [tenantId, runId, "Agent run created"]
      );

      await transitionRun(fastify, tenantId, runId, currentState, "NORMALIZED", "Signals normalized");
      currentState = "NORMALIZED";

      const transcript = body.transcript;
      let extracted: ExtractedAction[] = [];
      if (transcript) {
        extracted = await fastify.llmProvider.extractActionsFromTranscript({
          transcript,
          projectName: body.projectId,
        });
      }

      await transitionRun(
        fastify,
        tenantId,
        runId,
        currentState,
        "EXTRACTED",
        "Action candidates extracted",
        { extractedCount: extracted.length }
      );
      currentState = "EXTRACTED";

      await transitionRun(fastify, tenantId, runId, currentState, "PROPOSED", "Task delta proposals generated");
      currentState = "PROPOSED";

      const savedActions: Array<{ id: string; requiresApproval: boolean }> = [];
      for (const action of extracted) {
        const result = await persistAction(fastify, tenantId, runId, body.projectId, action);
        savedActions.push(result);
      }

      const requiresApproval = savedActions.some((item) => item.requiresApproval);
      const nextState = requiresApproval ? "APPROVAL_PENDING" : "EXECUTED";
      await transitionRun(
        fastify,
        tenantId,
        runId,
        currentState,
        nextState,
        requiresApproval
          ? "High-impact or low-confidence actions routed to Action Center"
          : "All actions auto-executed by policy",
        {
          actionIds: savedActions.map((action) => action.id),
          requiresApproval,
        }
      );
      currentState = nextState;

      if (!requiresApproval) {
        await transitionRun(
          fastify,
          tenantId,
          runId,
          currentState,
          "VERIFIED",
          "Execution complete and verified",
          { autoExecutedActions: savedActions.length }
        );
      }

      await fastify.queue.publish({
        type: "agent_run.processed",
        tenantId,
        payload: {
          runId,
          actions: savedActions.map((item) => item.id),
          requiresApproval,
        },
      });

      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId: request.user.userId,
        actionType: "agent.run.create",
        objectType: "agent_run",
        objectId: runId,
        details: { source: body.source, extractedActions: savedActions.length },
      });

      return reply.code(202).send({
        runId,
        state: requiresApproval ? "APPROVAL_PENDING" : "VERIFIED",
        actionCount: savedActions.length,
        pendingApprovals: savedActions.filter((item) => item.requiresApproval).length,
      });
    }
  );

  fastify.get(
    "/runs/:id",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const tenantId = request.user.tenantId;

      const runRows = await fastify.db.queryTenant(
        tenantId,
        `SELECT id, project_id as "projectId", source, source_ref_id as "sourceRefId", state,
                status_message as "statusMessage", correlation_id as "correlationId",
                created_at as "createdAt", updated_at as "updatedAt"
         FROM agent_runs
         WHERE tenant_id = $1 AND id = $2
         LIMIT 1`,
        [tenantId, params.id]
      );

      if (!runRows[0]) {
        throw fastify.httpErrors.notFound("Agent run not found.");
      }

      const transitions = await fastify.db.queryTenant(
        tenantId,
        `SELECT previous_state as "previousState", next_state as "nextState", reason,
                metadata, created_at as "createdAt"
         FROM agent_run_transitions
         WHERE tenant_id = $1 AND agent_run_id = $2
         ORDER BY created_at ASC`,
        [tenantId, params.id]
      );

      const actions = await fastify.db.queryTenant(
        tenantId,
        `SELECT id, state, requires_approval as "requiresApproval", confidence,
                impact, reason, payload, created_at as "createdAt"
         FROM extracted_actions
         WHERE tenant_id = $1 AND agent_run_id = $2
         ORDER BY created_at ASC`,
        [tenantId, params.id]
      );

      return {
        run: runRows[0],
        transitions,
        actions,
      };
    }
  );

  fastify.get(
    "/actions",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const query = ActionQuerySchema.parse(request.query);
      const tenantId = request.user.tenantId;

      const values: unknown[] = [tenantId];
      let sql = `SELECT id, agent_run_id as "agentRunId", project_id as "projectId", action_type as "actionType",
                        impact, confidence, reason, payload, state,
                        requires_approval as "requiresApproval", created_at as "createdAt"
                 FROM extracted_actions
                 WHERE tenant_id = $1`;

      if (query.state) {
        values.push(query.state);
        sql += ` AND state = $${values.length}`;
      }

      sql += " ORDER BY created_at DESC LIMIT 100";

      const rows = await fastify.db.queryTenant(tenantId, sql, values);
      return { items: rows };
    }
  );
};
