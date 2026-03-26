import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { buildActionReasoning, buildInterventionDecision, PolicyThresholds } from "@larry/ai";
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

const CorrectionBodySchema = z.object({
  correctionType: z.enum([
    "false_positive",
    "false_negative",
    "bad_reasoning",
    "payload_edit",
    "manual_override",
  ]),
  note: z.string().max(1_000).optional(),
  correctionPayload: z.record(z.string(), z.unknown()).default({}),
  tunePolicy: z.boolean().default(true),
});

type ActionSourceType = "slack" | "email" | "calendar" | "transcript" | "larry_chat";

interface ActionListRow {
  id: string;
  agentRunId: string | null;
  projectId: string | null;
  actionType: string;
  impact: string;
  confidence: number;
  reason: string;
  signals: string[];
  payload: Record<string, unknown>;
  reasoning: Record<string, unknown> | null;
  state: string;
  requiresApproval: boolean;
  createdAt: string;
  runSource: string | null;
  runSourceRefId: string | null;
  runCreatedAt: string | null;
  canonicalSource: string | null;
  canonicalActor: string | null;
  sourceOccurredAt: string | null;
  canonicalPayload: Record<string, unknown> | null;
  meetingTitle: string | null;
  meetingSummary: string | null;
  meetingTranscript: string | null;
  meetingCreatedAt: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function clipText(value: string, limit = 200): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 3).trimEnd()}...`;
}

function resolveActionSourceType(row: ActionListRow): ActionSourceType | null {
  if (row.runSource === "transcript" && typeof row.runSourceRefId === "string" && row.runSourceRefId.startsWith("larry-")) {
    return "larry_chat";
  }

  const source = row.canonicalSource ?? row.runSource;
  if (source === "slack" || source === "email" || source === "calendar" || source === "transcript") {
    return source;
  }

  return null;
}

function buildSourceExcerpt(row: ActionListRow, sourceType: ActionSourceType): string | null {
  const payload = isRecord(row.canonicalPayload) ? row.canonicalPayload : null;
  const event = payload && isRecord(payload.event) ? payload.event : null;
  const calendarBody = payload && isRecord(payload.body) ? payload.body : null;

  if (sourceType === "larry_chat") {
    const taskCount = Array.isArray(row.payload.tasks) ? row.payload.tasks.length : 0;
    const projectName = readNonEmptyString(row.payload.name);
    return clipText(
      readNonEmptyString(
        row.payload.description,
        taskCount > 0 && projectName ? `${projectName} with ${taskCount} starter tasks.` : projectName,
        row.reason
      ) ?? "Larry prepared a project draft for review."
    );
  }

  return clipText(
    readNonEmptyString(
      row.meetingSummary,
      event?.text,
      payload?.bodyText,
      payload?.text,
      calendarBody?.description,
      calendarBody?.summary,
      payload?.summary,
      payload?.description,
      payload?.title,
      row.meetingTranscript,
      row.reason
    ) ?? row.reason
  );
}

function buildSourceLabel(row: ActionListRow, sourceType: ActionSourceType): string | null {
  const payload = isRecord(row.canonicalPayload) ? row.canonicalPayload : null;
  const event = payload && isRecord(payload.event) ? payload.event : null;
  const calendarBody = payload && isRecord(payload.body) ? payload.body : null;

  if (sourceType === "slack") {
    return readNonEmptyString(payload?.channelName, event?.channelName, payload?.channel, event?.channel, "Slack");
  }
  if (sourceType === "email") {
    return readNonEmptyString(payload?.subject, payload?.accountEmail, "Email thread");
  }
  if (sourceType === "calendar") {
    return readNonEmptyString(calendarBody?.summary, payload?.summary, payload?.calendarId, "Calendar event");
  }
  if (sourceType === "transcript") {
    return readNonEmptyString(row.meetingTitle, payload?.meetingTitle, "Meeting transcript");
  }
  if (sourceType === "larry_chat") {
    return "Larry project intake";
  }
  return null;
}

function buildActionSource(row: ActionListRow) {
  const sourceType = resolveActionSourceType(row);
  if (!sourceType) return undefined;

  return {
    type: sourceType,
    excerpt: buildSourceExcerpt(row, sourceType),
    timestamp: row.sourceOccurredAt ?? row.meetingCreatedAt ?? row.runCreatedAt ?? row.createdAt,
    channelOrTitle: buildSourceLabel(row, sourceType),
    actor: readNonEmptyString(row.canonicalActor),
  };
}

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
  action: ExtractedAction,
  thresholds?: Partial<PolicyThresholds>
): Promise<{ id: string; requiresApproval: boolean }> {
  const intervention = buildInterventionDecision(action, thresholds);
  const reasoning = buildActionReasoning(action, thresholds);
  const state = intervention.requiresApproval ? "pending" : "executed";

  const rows = await fastify.db.queryTenant<{ id: string }>(
    tenantId,
    `INSERT INTO extracted_actions
      (tenant_id, agent_run_id, project_id, action_type, impact, confidence, reason, signals, payload, reasoning, state, requires_approval, executed_at)
     VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11, $12, CASE WHEN $12 = false THEN NOW() ELSE NULL END)
     RETURNING id`,
    [
      tenantId,
      runId,
      projectId ?? null,
      intervention.actionType,
      intervention.impact,
      action.confidence,
      `${action.reason} | ${intervention.reason}`,
      JSON.stringify(action.signals),
      JSON.stringify(action),
      JSON.stringify(reasoning),
      state,
      intervention.requiresApproval,
    ]
  );

  const actionId = rows[0].id;

  await fastify.db.queryTenant(
    tenantId,
    `INSERT INTO interventions
      (tenant_id, project_id, agent_run_id, action_id, intervention_type, threshold, decision, requires_approval, status, reason, metadata)
     VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)`,
    [
      tenantId,
      projectId ?? null,
      runId,
      actionId,
      intervention.actionType,
      intervention.threshold,
      intervention.decision,
      intervention.requiresApproval,
      intervention.requiresApproval ? "approval_pending" : "executed",
      intervention.reason,
      JSON.stringify({
        impact: intervention.impact,
        confidence: intervention.confidence,
        signals: intervention.signals,
      }),
    ]
  );

  return { id: actionId, requiresApproval: intervention.requiresApproval };
}

async function loadTenantPolicyThresholds(
  fastify: Parameters<FastifyPluginAsync>[0],
  tenantId: string
): Promise<Partial<PolicyThresholds>> {
  const rows = await fastify.db.queryTenant<{
    lowImpactMinConfidence: number;
    mediumImpactMinConfidence: number;
  }>(
    tenantId,
    `SELECT low_impact_min_confidence as "lowImpactMinConfidence",
            medium_impact_min_confidence as "mediumImpactMinConfidence"
     FROM tenant_policy_settings
     WHERE tenant_id = $1
     LIMIT 1`,
    [tenantId]
  );

  if (!rows[0]) return {};
  return rows[0];
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
      const thresholds = await loadTenantPolicyThresholds(fastify, tenantId);

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
        const result = await persistAction(fastify, tenantId, runId, body.projectId, action, thresholds);
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

      if (body.source === "transcript" && body.transcript) {
        await fastify.db.queryTenant(
          tenantId,
          `INSERT INTO meeting_notes
            (tenant_id, project_id, agent_run_id, title, transcript, action_count, created_by_user_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            tenantId,
            body.projectId ?? null,
            runId,
            null,
            body.transcript,
            savedActions.length,
            request.user.userId,
          ]
        );

        try {
          const { title, summary } = await fastify.llmProvider.summarizeTranscript({
            transcript: body.transcript,
          });
          await fastify.db.queryTenant(
            tenantId,
            `UPDATE meeting_notes SET title = $1, summary = $2 WHERE tenant_id = $3 AND agent_run_id = $4`,
            [title, summary, tenantId, runId]
          );
        } catch (err) {
          fastify.log.warn({ err, runId }, "Failed to generate meeting summary — meeting saved without summary");
        }
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
                impact, reason, signals, payload, reasoning, created_at as "createdAt"
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
      let sql = `SELECT ea.id,
                        ea.agent_run_id as "agentRunId",
                        ea.project_id as "projectId",
                        ea.action_type as "actionType",
                        ea.impact,
                        ea.confidence,
                        ea.reason,
                        ea.signals,
                        ea.payload,
                        ea.reasoning,
                        ea.state,
                        ea.requires_approval as "requiresApproval",
                        ea.created_at as "createdAt",
                        ar.source as "runSource",
                        ar.source_ref_id as "runSourceRefId",
                        ar.created_at as "runCreatedAt",
                        ce.source as "canonicalSource",
                        ce.actor as "canonicalActor",
                        ce.occurred_at as "sourceOccurredAt",
                        ce.payload as "canonicalPayload",
                        mn.title as "meetingTitle",
                        mn.summary as "meetingSummary",
                        mn.transcript as "meetingTranscript",
                        mn.created_at as "meetingCreatedAt"
                 FROM extracted_actions ea
                 LEFT JOIN agent_runs ar
                   ON ar.tenant_id = ea.tenant_id
                  AND ar.id = ea.agent_run_id
                 LEFT JOIN LATERAL (
                   SELECT source, actor, occurred_at, payload
                   FROM canonical_events
                   WHERE tenant_id = ea.tenant_id
                     AND ar.source_ref_id IS NOT NULL
                     AND (id::text = ar.source_ref_id OR source_event_id = ar.source_ref_id)
                   ORDER BY created_at DESC
                   LIMIT 1
                 ) ce ON TRUE
                 LEFT JOIN LATERAL (
                   SELECT title, summary, transcript, created_at
                   FROM meeting_notes
                   WHERE tenant_id = ea.tenant_id
                     AND agent_run_id = ea.agent_run_id
                   ORDER BY created_at DESC
                   LIMIT 1
                 ) mn ON TRUE
                 WHERE ea.tenant_id = $1`;

      if (query.state) {
        values.push(query.state);
        sql += ` AND ea.state = $${values.length}`;
      }

      sql += " ORDER BY ea.created_at DESC LIMIT 100";

      const rows = await fastify.db.queryTenant<ActionListRow>(tenantId, sql, values);
      return {
        items: rows.map((row) => ({
          id: row.id,
          agentRunId: row.agentRunId,
          projectId: row.projectId,
          actionType: row.actionType,
          impact: row.impact,
          confidence: row.confidence,
          reason: row.reason,
          signals: row.signals,
          payload: row.payload,
          reasoning: row.reasoning,
          state: row.state,
          requiresApproval: row.requiresApproval,
          createdAt: row.createdAt,
          source: buildActionSource(row),
        })),
      };
    }
  );

  fastify.post(
    "/actions/:id/correct",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm"])] },
    async (request) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const body = CorrectionBodySchema.parse(request.body);
      const tenantId = request.user.tenantId;

      const actionRows = await fastify.db.queryTenant<{ id: string; impact: "low" | "medium" | "high" }>(
        tenantId,
        `SELECT id, impact
         FROM extracted_actions
         WHERE tenant_id = $1 AND id = $2
         LIMIT 1`,
        [tenantId, params.id]
      );

      if (!actionRows[0]) {
        throw fastify.httpErrors.notFound("Action not found.");
      }

      await fastify.db.queryTenant(
        tenantId,
        `INSERT INTO correction_feedback
         (tenant_id, action_id, corrected_by_user_id, correction_type, correction_payload)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [
          tenantId,
          params.id,
          request.user.userId,
          body.correctionType,
          JSON.stringify({ note: body.note ?? null, ...body.correctionPayload }),
        ]
      );

      await fastify.db.queryTenant(
        tenantId,
        `UPDATE extracted_actions
         SET state = CASE WHEN state = 'pending' THEN 'overridden' ELSE state END,
             updated_at = NOW()
         WHERE tenant_id = $1 AND id = $2`,
        [tenantId, params.id]
      );

      let thresholdTuned = false;
      if (body.tunePolicy) {
        await fastify.db.queryTenant(
          tenantId,
          `INSERT INTO tenant_policy_settings (tenant_id)
           VALUES ($1)
           ON CONFLICT (tenant_id) DO NOTHING`,
          [tenantId]
        );

        if (body.correctionType === "false_positive") {
          await fastify.db.queryTenant(
            tenantId,
            `UPDATE tenant_policy_settings
             SET low_impact_min_confidence = LEAST(0.99, low_impact_min_confidence + 0.02),
                 medium_impact_min_confidence = LEAST(0.99, medium_impact_min_confidence + 0.02),
                 updated_at = NOW()
             WHERE tenant_id = $1`,
            [tenantId]
          );
          thresholdTuned = true;
        } else if (body.correctionType === "false_negative") {
          await fastify.db.queryTenant(
            tenantId,
            `UPDATE tenant_policy_settings
             SET low_impact_min_confidence = GREATEST(0.5, low_impact_min_confidence - 0.02),
                 medium_impact_min_confidence = GREATEST(0.6, medium_impact_min_confidence - 0.02),
                 updated_at = NOW()
             WHERE tenant_id = $1`,
            [tenantId]
          );
          thresholdTuned = true;
        }
      }

      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId: request.user.userId,
        actionType: "action.correct",
        objectType: "extracted_action",
        objectId: params.id,
        details: {
          correctionType: body.correctionType,
          note: body.note ?? null,
          thresholdTuned,
        },
      });

      return {
        success: true,
        corrected: true,
        thresholdTuned,
      };
    }
  );
};
