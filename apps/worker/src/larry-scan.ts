import { randomUUID } from "node:crypto";
import { getProjectSnapshot, runAutoActions, storeSuggestions, updateProjectLarryContext } from "@larry/db";
import { runIntelligence, ProviderError, loadOrgTimelineContext, runOrgIntelligencePass, shouldRunOrgPass } from "@larry/ai";
import { db } from "./context.js";
import { buildWorkerIntelligenceConfig, buildWorkerFallbackIntelligenceConfig } from "./intelligence-config.js";
import { reserveTokens, LLMQuotaError } from "./llm-budget.js";
import { notifySafe } from "./notifications.js";

// Per-project estimated token cost for runIntelligence. Empirically ~9k
// post-N-9. We over-estimate slightly so the budget debits a number close
// to reality without a post-call reconcile step (runIntelligence doesn't
// surface usage today; see future work in the rate-limit hardening spec).
const SCAN_ESTIMATED_TOKENS = 9_500;

// N-11: dropped from 5 → 1 to keep the scan within the Groq free-tier
// 12k-TPM bucket. Per-project runIntelligence cost is ~9k tokens post-N-9;
// bursting 5 of those in the same minute reliably exceeds 12k/min and
// ~38 projects fail the scan. Serial execution adds ~1-2s per project to
// the total scan time (still well under the 30-minute cron interval).
const SCAN_CONCURRENCY = 1;

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
  const fallbackConfig = buildWorkerFallbackIntelligenceConfig();
  // Per-tenant change counts so we can emit a single scan.completed
  // notification per tenant (not per project) at the end of the run.
  const tenantChanges = new Map<string, number>();
  const scanBatchId = randomUUID();

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
        // Reserve LLM budget before the scan. If the tenant or the provider's
        // global daily cap is exhausted we skip this project — the next cron
        // tick will retry once the day rolls over. This is the last line of
        // defence against a runaway tenant burning the Groq free-tier TPD.
        try {
          await reserveTokens({
            tenantId,
            provider: config.provider,
            estimatedTokens: SCAN_ESTIMATED_TOKENS,
          });
        } catch (err) {
          if (err instanceof LLMQuotaError) {
            console.warn(
              `[larry-scan] quota exceeded (${err.scope}), skipping project ${projectId} (tenant ${tenantId})`
            );
            // Don't count this as a "failed" scan — quota skips are expected.
            continue;
          }
          throw err;
        }

        const snapshot = await getProjectSnapshot(db, tenantId, projectId);
        const result = await runIntelligence(config, snapshot, "scheduled health scan", fallbackConfig);
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
        const delta =
          autoResult.executedCount +
          suggestResult.suggestedCount +
          autoResult.suggestedCount;
        if (delta > 0) {
          tenantChanges.set(tenantId, (tenantChanges.get(tenantId) ?? 0) + delta);
        }
      } catch (err) {
        if (err instanceof ProviderError && err.code === "quota_exhausted_daily") {
          // All providers exhausted — skip without counting as failure; next cron tick retries.
          console.warn(
            `[larry-scan] provider quota exhausted (${err.provider}), skipping project ${projectId} (tenant ${tenantId})`
          );
          continue;
        }
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

  // Org-wide timeline intelligence pass. Runs once per tenant per hour, gated
  // by shouldRunOrgPass and the larry_org_scan_runs last_run_at. Larry may
  // propose a timeline_regroup action into the Action Centre.
  const distinctTenants = Array.from(new Set(projectRows.map((r) => r.tenant_id)));
  for (const tenantId of distinctTenants) {
    try {
      const pendingRows = await db.queryTenant<{ count: string }>(tenantId,
        `SELECT count(*)::text FROM larry_events
          WHERE tenant_id = $1
            AND action_type LIKE 'timeline\\_%' ESCAPE '\\'
            AND event_type = 'suggested'`,
        [tenantId]);
      const pendingCount = Number(pendingRows[0]?.count ?? 0);

      const lastRunRows = await db.queryTenant<{ minutesAgo: number | null }>(tenantId,
        `SELECT (EXTRACT(EPOCH FROM (NOW() - last_run_at))::int / 60) AS "minutesAgo"
           FROM larry_org_scan_runs WHERE tenant_id = $1`,
        [tenantId]);
      const lastRunMinutesAgo = lastRunRows[0]?.minutesAgo ?? Number.POSITIVE_INFINITY;

      if (!shouldRunOrgPass({ pendingCount, lastRunMinutesAgo })) continue;

      // Budget: the org pass uses generateText with a small tool set, cheaper
      // than per-project runIntelligence. Use half the per-project estimate.
      try {
        await reserveTokens({
          tenantId,
          provider: config.provider,
          estimatedTokens: Math.floor(SCAN_ESTIMATED_TOKENS / 2),
        });
      } catch (err) {
        if (err instanceof LLMQuotaError) continue;
        throw err;
      }

      const ctx = await loadOrgTimelineContext(db, tenantId);
      await runOrgIntelligencePass({ db, tenantId, context: ctx, config });

      await db.queryTenant(tenantId,
        `INSERT INTO larry_org_scan_runs (tenant_id, last_run_at)
         VALUES ($1, NOW())
         ON CONFLICT (tenant_id) DO UPDATE SET last_run_at = NOW()`,
        [tenantId]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[larry-scan] org pass failed for tenant ${tenantId}: ${message}`);
      // Never let an org pass failure take down the whole scan — just log.
    }
  }

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

  // Emit one scan.completed per tenant that had any changes. We deliberately
  // skip tenants with zero changes to avoid banner noise on quiet cycles.
  // If the entire scan failed (scanFailed set) OR a tenant's projects all
  // errored (no changes recorded but had active projects), we emit
  // scan.failed — tenant-broadcast (userId: null) so every admin sees it.
  const tenantsWithChanges = new Set(tenantChanges.keys());
  const allTenants = new Set(projectRows.map((r) => r.tenant_id));
  // All-projects-failed heuristic: every active project errored out, so every
  // tenant with an active project sees scan.failed instead of a stale
  // completed toast.
  const scanBroke = processed === 0 && failed > 0;
  const tenantsToNotify = scanBroke
    ? Array.from(allTenants)
    : Array.from(tenantsWithChanges);
  for (const tenantId of tenantsToNotify) {
    if (scanBroke) {
      await notifySafe({
        tenantId,
        userId: null,
        type: "scan.failed",
        payload: { reason: aggregatedError ?? "unknown" },
        batchId: scanBatchId,
      });
    } else {
      await notifySafe({
        tenantId,
        userId: null,
        type: "scan.completed",
        payload: { changeCount: tenantChanges.get(tenantId) ?? 0 },
        batchId: scanBatchId,
      });
    }
  }
}
