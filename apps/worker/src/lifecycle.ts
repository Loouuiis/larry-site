import { buildActionReasoning, buildInterventionDecision, detectInjectionAttempt, PolicyThresholds } from "@larry/ai";
import { AgentRunState, ExtractedAction } from "@larry/shared";
import { db, llmProvider } from "./context.js";
import {
  AgentRunRow,
  CanonicalEventRow,
  canTransition,
  IGNORED_SLACK_SUBTYPES,
  IngestSource,
  isAgentRunState,
  isIngestSource,
  isRecord,
  TERMINAL_RUN_STATES,
} from "./types.js";

export async function loadAgentRun(tenantId: string, runId: string): Promise<AgentRunRow | null> {
  const rows = await db.queryTenant<{
    id: string;
    state: string;
    source: string;
    projectId: string | null;
    sourceRefId: string | null;
  }>(
    tenantId,
    `SELECT id, state, source, project_id as "projectId", source_ref_id as "sourceRefId"
     FROM agent_runs
     WHERE tenant_id = $1 AND id = $2
     LIMIT 1`,
    [tenantId, runId]
  );

  const row = rows[0];
  if (!row) return null;
  if (!isAgentRunState(row.state)) throw new Error(`Unknown agent run state: ${row.state}`);
  if (!isIngestSource(row.source)) throw new Error(`Unknown agent run source: ${row.source}`);

  return { id: row.id, state: row.state, source: row.source, projectId: row.projectId, sourceRefId: row.sourceRefId };
}

export async function loadCanonicalEvent(tenantId: string, canonicalEventId: string): Promise<CanonicalEventRow | null> {
  const rows = await db.queryTenant<{ id: string; source: string; payload: unknown }>(
    tenantId,
    `SELECT id, source, payload
     FROM canonical_events
     WHERE tenant_id = $1 AND id = $2
     LIMIT 1`,
    [tenantId, canonicalEventId]
  );

  const row = rows[0];
  if (!row) return null;
  if (!isIngestSource(row.source)) return null;
  if (!isRecord(row.payload)) return null;

  return { id: row.id, source: row.source, payload: row.payload };
}

export function extractActionableText(source: IngestSource, payload: Record<string, unknown>): string | null {
  if (source === "slack") {
    const event = isRecord(payload.event) ? payload.event : null;
    if (!event) return null;
    const subtype = typeof event.subtype === "string" ? event.subtype : null;
    if (subtype && IGNORED_SLACK_SUBTYPES.has(subtype)) return null;
    const text = typeof event.text === "string" ? event.text.trim() : "";
    return text.length > 0 ? text : null;
  }

  if (source === "transcript") {
    const transcript = typeof payload.transcript === "string" ? payload.transcript.trim() : "";
    return transcript.length > 0 ? transcript : null;
  }

  const candidateFields: unknown[] = [
    payload.text,
    payload.body,
    payload.summary,
    payload.description,
    payload.title,
    isRecord(payload.event) ? payload.event.text : undefined,
  ];

  for (const value of candidateFields) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

export async function ensureRunForCanonicalEvent(
  tenantId: string,
  source: IngestSource,
  canonicalEventId: string
): Promise<AgentRunRow> {
  const existingRows = await db.queryTenant<{
    id: string;
    state: string;
    source: string;
    projectId: string | null;
    sourceRefId: string | null;
  }>(
    tenantId,
    `SELECT id, state, source, project_id as "projectId", source_ref_id as "sourceRefId"
     FROM agent_runs
     WHERE tenant_id = $1 AND source = $2 AND source_ref_id = $3
     ORDER BY created_at DESC
     LIMIT 1`,
    [tenantId, source, canonicalEventId]
  );

  const existing = existingRows[0];
  if (existing && isAgentRunState(existing.state) && isIngestSource(existing.source)) {
    return {
      id: existing.id,
      state: existing.state,
      source: existing.source,
      projectId: existing.projectId,
      sourceRefId: existing.sourceRefId,
    };
  }

  const insertedRows = await db.queryTenant<{
    id: string;
    state: string;
    source: string;
    projectId: string | null;
    sourceRefId: string | null;
  }>(
    tenantId,
    `INSERT INTO agent_runs (tenant_id, project_id, source, source_ref_id, state, status_message, correlation_id)
     VALUES ($1, NULL, $2, $3, 'INGESTED', $4, $5)
     RETURNING id, state, source, project_id as "projectId", source_ref_id as "sourceRefId"`,
    [
      tenantId,
      source,
      canonicalEventId,
      "Canonical event accepted for worker processing",
      `${tenantId}:${canonicalEventId}`,
    ]
  );

  const inserted = insertedRows[0];
  if (!inserted || !isAgentRunState(inserted.state) || !isIngestSource(inserted.source)) {
    throw new Error("Failed to create agent run for canonical event.");
  }

  await db.queryTenant(
    tenantId,
    `INSERT INTO agent_run_transitions
      (tenant_id, agent_run_id, previous_state, next_state, reason, metadata)
     VALUES ($1, $2, NULL, 'INGESTED', $3, $4::jsonb)`,
    [tenantId, inserted.id, "Agent run created from canonical event", JSON.stringify({ canonicalEventId })]
  );

  return {
    id: inserted.id,
    state: inserted.state,
    source: inserted.source,
    projectId: inserted.projectId,
    sourceRefId: inserted.sourceRefId,
  };
}

export async function transitionRun(
  tenantId: string,
  runId: string,
  from: AgentRunState,
  to: AgentRunState,
  reason: string,
  metadata: Record<string, unknown> = {}
): Promise<AgentRunState> {
  if (from === to) return from;
  if (!canTransition(from, to)) throw new Error(`Invalid state transition from ${from} to ${to}`);

  await db.queryTenant(
    tenantId,
    `UPDATE agent_runs
     SET state = $3,
         status_message = $4,
         updated_at = NOW()
     WHERE tenant_id = $1 AND id = $2`,
    [tenantId, runId, to, reason]
  );

  await db.queryTenant(
    tenantId,
    `INSERT INTO agent_run_transitions
      (tenant_id, agent_run_id, previous_state, next_state, reason, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [tenantId, runId, from, to, reason, JSON.stringify(metadata)]
  );

  return to;
}

export async function loadTenantPolicyThresholds(tenantId: string): Promise<Partial<PolicyThresholds>> {
  const rows = await db.queryTenant<{
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

async function persistAction(
  tenantId: string,
  runId: string,
  projectId: string | null,
  action: ExtractedAction,
  thresholds?: Partial<PolicyThresholds>
): Promise<{ id: string; requiresApproval: boolean }> {
  const intervention = buildInterventionDecision(action, thresholds);
  const reasoning = buildActionReasoning(action, thresholds);
  const actionState = intervention.requiresApproval ? "pending" : "executed";

  const rows = await db.queryTenant<{ id: string }>(
    tenantId,
    `INSERT INTO extracted_actions
      (tenant_id, agent_run_id, project_id, action_type, impact, confidence, reason, signals, payload, reasoning, state, requires_approval, executed_at)
     VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11, $12, CASE WHEN $12 = false THEN NOW() ELSE NULL END)
     RETURNING id`,
    [
      tenantId,
      runId,
      projectId,
      intervention.actionType,
      intervention.impact,
      action.confidence,
      `${action.reason} | ${intervention.reason}`,
      JSON.stringify(action.signals),
      JSON.stringify(action),
      JSON.stringify(reasoning),
      actionState,
      intervention.requiresApproval,
    ]
  );

  const actionId = rows[0].id;

  await db.queryTenant(
    tenantId,
    `INSERT INTO interventions
      (tenant_id, project_id, agent_run_id, action_id, intervention_type, threshold, decision, requires_approval, status, reason, metadata)
     VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)`,
    [
      tenantId,
      projectId,
      runId,
      actionId,
      intervention.actionType,
      intervention.threshold,
      intervention.decision,
      intervention.requiresApproval,
      intervention.requiresApproval ? "approval_pending" : "executed",
      intervention.reason,
      JSON.stringify({ impact: intervention.impact, confidence: intervention.confidence, signals: intervention.signals }),
    ]
  );

  return { id: actionId, requiresApproval: intervention.requiresApproval };
}

async function extractActions(
  tenantId: string,
  runId: string,
  transcript: string,
  projectId: string | null
): Promise<ExtractedAction[]> {
  const trimmed = transcript.trim();
  if (trimmed.length === 0) return [];

  const injectionDetected = detectInjectionAttempt(trimmed);
  if (injectionDetected) {
    console.warn(`[lifecycle] injection attempt detected tenantId=${tenantId} runId=${runId}`);
  }

  const actions = await llmProvider.extractActionsFromTranscript({
    transcript: trimmed,
    projectName: projectId ?? undefined,
  });

  // Audit log the LLM call (input length + output count, not full content)
  try {
    await db.queryTenant(
      tenantId,
      `INSERT INTO audit_log (tenant_id, actor_user_id, action_type, object_type, object_id, details)
       VALUES ($1, NULL, 'llm.call', 'agent_run', $2, $3::jsonb)`,
      [
        tenantId,
        runId,
        JSON.stringify({
          model: "extractActionsFromTranscript",
          inputLength: trimmed.length,
          outputCount: actions.length,
          injectionDetected,
        }),
      ]
    );
  } catch {
    // Non-fatal — don't block action extraction if audit write fails
  }

  return actions;
}

export async function processAgentRunLifecycle(
  tenantId: string,
  runId: string,
  transcript: string,
  source: IngestSource
): Promise<void> {
  const run = await loadAgentRun(tenantId, runId);
  if (!run) return;
  if (TERMINAL_RUN_STATES.has(run.state)) return;

  let currentState = run.state;
  let extracted: ExtractedAction[] | null = null;

  if (currentState === "INGESTED") {
    currentState = await transitionRun(tenantId, runId, currentState, "NORMALIZED", "Signals normalized");
  }

  if (currentState === "NORMALIZED") {
    extracted = await extractActions(tenantId, runId, transcript, run.projectId);
    currentState = await transitionRun(tenantId, runId, currentState, "EXTRACTED", "Action candidates extracted", {
      extractedCount: extracted.length,
      source,
    });
  }

  if (currentState === "EXTRACTED") {
    currentState = await transitionRun(tenantId, runId, currentState, "PROPOSED", "Task delta proposals generated");
  }

  if (currentState === "PROPOSED") {
    const thresholds = await loadTenantPolicyThresholds(tenantId);

    if (!extracted) {
      extracted = await extractActions(tenantId, runId, transcript, run.projectId);
    }

    await db.queryTenant(
      tenantId,
      `DELETE FROM extracted_actions
       WHERE tenant_id = $1 AND agent_run_id = $2 AND state IN ('pending', 'executed')`,
      [tenantId, runId]
    );

    const savedActions: Array<{ id: string; requiresApproval: boolean }> = [];
    for (const action of extracted) {
      const result = await persistAction(tenantId, runId, run.projectId, action, thresholds);
      savedActions.push(result);
    }

    const requiresApproval = savedActions.some((item) => item.requiresApproval);
    const nextState: AgentRunState = requiresApproval ? "APPROVAL_PENDING" : "EXECUTED";
    currentState = await transitionRun(
      tenantId,
      runId,
      currentState,
      nextState,
      requiresApproval
        ? "High-impact or low-confidence actions routed to Action Center"
        : "All actions auto-executed by policy",
      { actionIds: savedActions.map((action) => action.id), requiresApproval }
    );
  }

  if (currentState === "EXECUTED") {
    await transitionRun(tenantId, runId, currentState, "VERIFIED", "Execution complete and verified", {});
  }
}
