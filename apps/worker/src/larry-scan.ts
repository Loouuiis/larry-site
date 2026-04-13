import { randomUUID } from "node:crypto";
import { getProjectSnapshot, runAutoActions, storeSuggestions, updateProjectLarryContext } from "@larry/db";
import { runIntelligence } from "@larry/ai";
import { db } from "./context.js";
import { buildWorkerIntelligenceConfig } from "./intelligence-config.js";

const SCAN_CONCURRENCY = 5;

async function recordJobHeartbeat(
  jobName: string,
  startedAt: Date,
  stats: { processed: number; failed: number; error?: string | null }
): Promise<void> {
  try {
    const now = new Date();
    await db.query(
      `INSERT INTO system_job_runs
         (job_name, last_run_started_at, last_run_finished_at, last_run_duration_ms,
          last_run_processed, last_run_failed, last_run_error, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (job_name) DO UPDATE
         SET last_run_started_at = EXCLUDED.last_run_started_at,
             last_run_finished_at = EXCLUDED.last_run_finished_at,
             last_run_duration_ms = EXCLUDED.last_run_duration_ms,
             last_run_processed = EXCLUDED.last_run_processed,
             last_run_failed = EXCLUDED.last_run_failed,
             last_run_error = EXCLUDED.last_run_error,
             updated_at = NOW()`,
      [
        jobName,
        startedAt.toISOString(),
        now.toISOString(),
        now.getTime() - startedAt.getTime(),
        stats.processed,
        stats.failed,
        stats.error ?? null,
      ]
    );
  } catch (err) {
    // Table may not yet exist on a tenant that hasn't migrated; heartbeat is
    // best-effort — don't fail the scan because the audit write failed.
    console.warn(`[larry-scan] heartbeat write failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function runLarryScan(): Promise<void> {
  const startTime = Date.now();
  const startedAt = new Date(startTime);
  const config = buildWorkerIntelligenceConfig();

  // Load all active projects across all tenants using system bypass identity.
  // This mirrors the pattern established by escalation.ts.
  const projectRows = await db.tx(async (client) => {
    await client.query("SELECT set_config('app.tenant_id', $1, true)", ["__system__"]);
    const r = await client.query<{ id: string; tenant_id: string }>(
      `SELECT p.id, p.tenant_id
       FROM projects p
       WHERE p.status = 'active'
       ORDER BY p.updated_at DESC`
    );
    return r.rows;
  });

  let processed = 0;
  let failed = 0;
  let totalExecuted = 0;
  let totalSuggested = 0;
  // QA-2026-04-12 §15: capture per-project failures so the heartbeat row's
  // last_run_error is never silent. Keep the FIRST error verbatim and
  // append a "(+N more)" suffix when others land — the operations
  // dashboard only needs an actionable signal, not a full transcript.
  const failureSummaries: string[] = [];

  // Process projects in parallel with a bounded concurrency cap so a large tenant
  // does not cause the scan to run for minutes serially.
  const queue = [...projectRows];
  const workers = Array.from({ length: Math.min(SCAN_CONCURRENCY, projectRows.length) }, async () => {
    while (queue.length > 0) {
      const row = queue.shift();
      if (!row) break;
      const { id: projectId, tenant_id: tenantId } = row;
      try {
        const snapshot = await getProjectSnapshot(db, tenantId, projectId);
        const result = await runIntelligence(config, snapshot, "scheduled health scan");
        const ledgerContext = { sourceKind: "project_review", sourceRecordId: randomUUID() } as const;

        if (result.contextUpdate) {
          await updateProjectLarryContext(db, tenantId, projectId, result.contextUpdate);
        }

        const [autoResult, suggestResult] = await Promise.all([
          runAutoActions(db, tenantId, projectId, "schedule", result.autoActions, undefined, ledgerContext),
          storeSuggestions(db, tenantId, projectId, "schedule", result.suggestedActions, undefined, ledgerContext),
        ]);

        processed++;
        totalExecuted += autoResult.executedCount;
        totalSuggested += suggestResult.suggestedCount + autoResult.suggestedCount;
      } catch (err) {
        failed++;
        const message = err instanceof Error ? err.message : String(err);
        failureSummaries.push(`project ${projectId} (tenant ${tenantId}): ${message}`);
        console.error(
          `[larry-scan] project ${projectId} (tenant ${tenantId}) failed`,
          message
        );
      }
    }
  });

  await Promise.all(workers);

  const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(
    `[larry-scan] completed in ${elapsedSeconds}s — processed: ${processed}, failed: ${failed}, actions: ${totalExecuted}`
  );

  // Cap the persisted error column at ~500 chars so a single noisy stack
  // trace can't dominate the row. The first error is the most actionable
  // signal; the count tells the on-call whether to investigate further.
  let aggregatedError: string | null = null;
  if (failureSummaries.length > 0) {
    const head = failureSummaries[0].slice(0, 480);
    aggregatedError =
      failureSummaries.length === 1
        ? head
        : `${head} (+${failureSummaries.length - 1} more)`;
  }

  await recordJobHeartbeat("larry.scan", startedAt, {
    processed,
    failed,
    error: aggregatedError,
  });
}
