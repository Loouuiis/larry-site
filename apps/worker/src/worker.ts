import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Job, QueueEvents, Worker } from "bullmq";
import {
  buildActionReasoning,
  buildInterventionDecision,
  createLlmProvider,
  PolicyThresholds,
} from "@larry/ai";
import { getWorkerEnv } from "@larry/config";
import { Db } from "@larry/db";
import { AgentRunState, EVENT_QUEUE_NAME, ExtractedAction, QueueMessage } from "@larry/shared";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);

// Cascading .env loader: tries apps/worker/.env first, falls back to apps/api/.env.
// Both must point to the same DATABASE_URL. If they differ, the worker and API
// write to different databases and extracted actions will not appear in the UI.
const envCandidates = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../api/.env"),
  path.resolve(process.cwd(), "../../apps/api/.env"),
  path.resolve(process.cwd(), "apps/worker/.env"),
  path.resolve(process.cwd(), "apps/api/.env"),
  path.resolve(currentDir, "../.env"),
  path.resolve(currentDir, "../../api/.env"),
  path.resolve(currentDir, "../../../apps/api/.env"),
];

for (const candidate of envCandidates) {
  if (existsSync(candidate)) {
    loadEnv({ path: candidate, override: false });
    if (process.env.DATABASE_URL && process.env.REDIS_URL) {
      break;
    }
  }
}

const env = getWorkerEnv();
const db = new Db(env.DATABASE_URL);
console.log(`[worker] Database: ${new URL(env.DATABASE_URL).host}`);
const llmProvider = createLlmProvider({
  openAiApiKey: env.OPENAI_API_KEY,
  openAiModel: env.OPENAI_MODEL,
});

type IngestSource = "slack" | "email" | "calendar" | "transcript";

const RUN_TRANSITIONS: Record<AgentRunState, AgentRunState[]> = {
  INGESTED: ["NORMALIZED", "FAILED"],
  NORMALIZED: ["EXTRACTED", "FAILED"],
  EXTRACTED: ["PROPOSED", "FAILED"],
  PROPOSED: ["APPROVAL_PENDING", "EXECUTED", "FAILED"],
  APPROVAL_PENDING: ["EXECUTED", "FAILED"],
  EXECUTED: ["VERIFIED", "FAILED"],
  VERIFIED: [],
  FAILED: [],
};

const TERMINAL_RUN_STATES = new Set<AgentRunState>(["APPROVAL_PENDING", "VERIFIED", "FAILED"]);
const IGNORED_SLACK_SUBTYPES = new Set([
  "bot_message",
  "channel_join",
  "channel_leave",
  "message_changed",
  "message_deleted",
]);

interface AgentRunRow {
  id: string;
  state: AgentRunState;
  source: IngestSource;
  projectId: string | null;
  sourceRefId: string | null;
}

interface CanonicalEventRow {
  id: string;
  source: IngestSource;
  payload: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAgentRunState(value: unknown): value is AgentRunState {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(RUN_TRANSITIONS, value);
}

function isIngestSource(value: unknown): value is IngestSource {
  return value === "slack" || value === "email" || value === "calendar" || value === "transcript";
}

function canTransition(from: AgentRunState, to: AgentRunState): boolean {
  return RUN_TRANSITIONS[from].includes(to);
}

async function loadAgentRun(tenantId: string, runId: string): Promise<AgentRunRow | null> {
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
  if (!isAgentRunState(row.state)) {
    throw new Error(`Unknown agent run state: ${row.state}`);
  }
  if (!isIngestSource(row.source)) {
    throw new Error(`Unknown agent run source: ${row.source}`);
  }

  return {
    id: row.id,
    state: row.state,
    source: row.source,
    projectId: row.projectId,
    sourceRefId: row.sourceRefId,
  };
}

async function loadCanonicalEvent(tenantId: string, canonicalEventId: string): Promise<CanonicalEventRow | null> {
  const rows = await db.queryTenant<{
    id: string;
    source: string;
    payload: unknown;
  }>(
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

  return {
    id: row.id,
    source: row.source,
    payload: row.payload,
  };
}

function extractActionableText(source: IngestSource, payload: Record<string, unknown>): string | null {
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

async function ensureRunForCanonicalEvent(
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

async function transitionRun(
  tenantId: string,
  runId: string,
  from: AgentRunState,
  to: AgentRunState,
  reason: string,
  metadata: Record<string, unknown> = {}
): Promise<AgentRunState> {
  if (from === to) return from;
  if (!canTransition(from, to)) {
    throw new Error(`Invalid state transition from ${from} to ${to}`);
  }

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
      JSON.stringify({
        impact: intervention.impact,
        confidence: intervention.confidence,
        signals: intervention.signals,
      }),
    ]
  );

  return {
    id: actionId,
    requiresApproval: intervention.requiresApproval,
  };
}

async function loadTenantPolicyThresholds(tenantId: string): Promise<Partial<PolicyThresholds>> {
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

async function extractActions(transcript: string, projectId: string | null): Promise<ExtractedAction[]> {
  const trimmed = transcript.trim();
  if (trimmed.length === 0) return [];

  return llmProvider.extractActionsFromTranscript({
    transcript: trimmed,
    projectName: projectId ?? undefined,
  });
}

async function processAgentRunLifecycle(
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
    extracted = await extractActions(transcript, run.projectId);
    currentState = await transitionRun(
      tenantId,
      runId,
      currentState,
      "EXTRACTED",
      "Action candidates extracted",
      { extractedCount: extracted.length, source }
    );
  }

  if (currentState === "EXTRACTED") {
    currentState = await transitionRun(
      tenantId,
      runId,
      currentState,
      "PROPOSED",
      "Task delta proposals generated"
    );
  }

  if (currentState === "PROPOSED") {
    const thresholds = await loadTenantPolicyThresholds(tenantId);

    if (!extracted) {
      extracted = await extractActions(transcript, run.projectId);
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
      {
        actionIds: savedActions.map((action) => action.id),
        requiresApproval,
      }
    );
  }

  if (currentState === "EXECUTED") {
    await transitionRun(
      tenantId,
      runId,
      currentState,
      "VERIFIED",
      "Execution complete and verified",
      {}
    );
  }
}

async function handleAgentRunIngested(job: Job<QueueMessage>): Promise<void> {
  const runId = job.data.payload.runId;
  const tenantId = job.data.tenantId;
  if (typeof runId !== "string") return;

  let transcript = typeof job.data.payload.transcript === "string" ? job.data.payload.transcript : "";

  if (transcript.trim().length === 0) {
    const fallbackCanonicalEventId =
      typeof job.data.payload.canonicalEventId === "string" ? job.data.payload.canonicalEventId : null;
    if (fallbackCanonicalEventId) {
      const canonical = await loadCanonicalEvent(tenantId, fallbackCanonicalEventId);
      if (canonical) {
        transcript = extractActionableText(canonical.source, canonical.payload) ?? "";
      }
    }
  }

  const run = await loadAgentRun(tenantId, runId);
  if (!run) return;

  await processAgentRunLifecycle(tenantId, runId, transcript, run.source);
}

async function handleCanonicalEventCreated(job: Job<QueueMessage>): Promise<void> {
  const tenantId = job.data.tenantId;
  const canonicalEventId = job.data.payload.canonicalEventId;
  if (typeof canonicalEventId !== "string") return;

  const canonical = await loadCanonicalEvent(tenantId, canonicalEventId);
  if (!canonical) return;

  // Transcript uploads have a dedicated ingest route and job flow.
  if (canonical.source === "transcript") return;

  const transcript = extractActionableText(canonical.source, canonical.payload);
  if (!transcript) return;

  const run = await ensureRunForCanonicalEvent(tenantId, canonical.source, canonical.id);
  await processAgentRunLifecycle(tenantId, run.id, transcript, canonical.source);
}

async function processQueueJob(job: Job<QueueMessage>): Promise<void> {
  switch (job.name) {
    case "agent_run.ingested":
      await handleAgentRunIngested(job);
      break;
    case "canonical_event.created":
      await handleCanonicalEventCreated(job);
      break;
    case "agent_run.processed":
    default:
      // Keep Stage 1 simple; additional handlers added iteratively.
      break;
  }
}

const worker = new Worker<QueueMessage>(EVENT_QUEUE_NAME, processQueueJob, {
  connection: { url: env.REDIS_URL },
  concurrency: env.WORKER_CONCURRENCY,
});

// Phase 8: Escalation scan — runs hourly to detect overdue / at-risk tasks
async function runEscalationScan(): Promise<void> {
  try {
    const now = new Date();
    const cutoffInactivity = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000); // 5 days ago
    const cutoff48h = new Date(now.getTime() + 48 * 60 * 60 * 1000); // 48 hours from now

    // Load all tenants
    const tenantRows = await db.tx(async (client) => {
      await client.query("SELECT set_config('app.tenant_id', $1, true)", ["__system__"]);
      const r = await client.query<{ id: string }>("SELECT id FROM tenants");
      return r.rows;
    });

    for (const tenant of tenantRows) {
      const tenantId = tenant.id;

      type TaskRow = {
        id: string;
        title: string;
        status: string;
        due_date: string | null;
        start_date: string | null;
        progress_percent: number;
        updated_at: string;
        assignee_user_id: string | null;
      };

      const tasks = await db.queryTenant<TaskRow>(
        tenantId,
        `SELECT id, title, status, due_date, start_date, progress_percent, updated_at, assignee_user_id
         FROM tasks
         WHERE tenant_id = $1
           AND status NOT IN ('completed', 'backlog')`,
        [tenantId]
      );

      const notifications: Array<{ userId: string | null; channel: string; subject: string; body: string; metadata: string }> = [];

      for (const task of tasks) {
        const dueDate = task.due_date ? new Date(task.due_date) : null;
        const startDate = task.start_date ? new Date(task.start_date) : null;
        const updatedAt = new Date(task.updated_at);

        // Start reminder: start_date = today, status = not_started
        if (startDate && task.status === "not_started") {
          const startDay = new Date(startDate.toDateString());
          const today = new Date(now.toDateString());
          if (startDay.getTime() === today.getTime()) {
            notifications.push({
              userId: task.assignee_user_id,
              channel: "system",
              subject: `Task starting today: ${task.title}`,
              body: `Your task "${task.title}" is scheduled to start today.`,
              metadata: JSON.stringify({ taskId: task.id, type: "start_reminder" }),
            });
          }
        }

        // Inactivity warning: in_progress, no activity for 5+ days
        if (task.status === "in_progress" && updatedAt < cutoffInactivity) {
          notifications.push({
            userId: task.assignee_user_id,
            channel: "system",
            subject: `Inactivity warning: ${task.title}`,
            body: `Task "${task.title}" has had no activity for 5+ days.`,
            metadata: JSON.stringify({ taskId: task.id, type: "inactivity_warning" }),
          });
        }

        // Pre-deadline alert: due within 48h, progress < 70%
        if (dueDate && dueDate <= cutoff48h && dueDate > now && task.progress_percent < 70) {
          notifications.push({
            userId: task.assignee_user_id,
            channel: "system",
            subject: `Deadline approaching: ${task.title}`,
            body: `Task "${task.title}" is due within 48 hours but is only ${task.progress_percent}% complete.`,
            metadata: JSON.stringify({ taskId: task.id, type: "pre_deadline_alert" }),
          });
        }

        // Deadline breach: past due, not completed
        if (dueDate && dueDate < now && task.status !== "completed") {
          notifications.push({
            userId: task.assignee_user_id,
            channel: "system",
            subject: `Deadline breached: ${task.title}`,
            body: `Task "${task.title}" passed its due date of ${task.due_date} and is not yet complete.`,
            metadata: JSON.stringify({ taskId: task.id, type: "deadline_breach" }),
          });
        }
      }

      // Insert notifications (deduplicate by subject + user for the day)
      for (const notif of notifications) {
        try {
          await db.queryTenant(
            tenantId,
            `INSERT INTO notifications (tenant_id, user_id, channel, subject, body, metadata)
             VALUES ($1, $2, $3, $4, $5, $6::jsonb)
             ON CONFLICT DO NOTHING`,
            [tenantId, notif.userId, notif.channel, notif.subject, notif.body, notif.metadata]
          );
        } catch {
          // ignore individual insert failures
        }
      }
    }

    console.log(`[escalation-scan] completed — checked ${tenantRows.length} tenants`);
  } catch (err) {
    console.error("[escalation-scan] error", err);
  }
}

// Run escalation scan every hour
setInterval(() => { void runEscalationScan(); }, 60 * 60 * 1000);
// Also run at startup
void runEscalationScan();

const queueEvents = new QueueEvents(EVENT_QUEUE_NAME, { connection: { url: env.REDIS_URL } });

worker.on("completed", (job) => {
  console.log(`[worker] completed job ${job?.id} (${job?.name})`);
});

worker.on("failed", (job, error) => {
  console.error(`[worker] failed job ${job?.id} (${job?.name})`, error);
});

queueEvents.on("waiting", ({ jobId }) => {
  console.log(`[worker] waiting job ${jobId}`);
});

async function shutdown(): Promise<void> {
  await worker.close();
  await queueEvents.close();
  await db.close();
}

process.on("SIGINT", async () => {
  await shutdown();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await shutdown();
  process.exit(0);
});

console.log(`[worker] started queue=${EVENT_QUEUE_NAME} concurrency=${env.WORKER_CONCURRENCY}`);
