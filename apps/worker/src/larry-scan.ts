import { getProjectSnapshot, runAutoActions, storeSuggestions } from "@larry/db";
import { runIntelligence } from "@larry/ai";
import { db } from "./context.js";
import { buildWorkerIntelligenceConfig } from "./intelligence-config.js";

const SCAN_CONCURRENCY = 5;

export async function runLarryScan(): Promise<void> {
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
  let totalExecuted = 0;
  let totalSuggested = 0;

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
        const ledgerContext = { sourceKind: "schedule" } as const;

        const [autoResult, suggestResult] = await Promise.all([
          runAutoActions(db, tenantId, projectId, "schedule", result.autoActions, undefined, ledgerContext),
          storeSuggestions(db, tenantId, projectId, "schedule", result.suggestedActions, undefined, ledgerContext),
        ]);

        processed++;
        totalExecuted += autoResult.executedCount;
        totalSuggested += suggestResult.suggestedCount;
      } catch (err) {
        console.error(
          `[larry-scan] project ${projectId} (tenant ${tenantId}) failed`,
          err instanceof Error ? err.message : String(err)
        );
      }
    }
  });

  await Promise.all(workers);

  console.log(
    `[larry-scan] Processed ${processed} projects, executed ${totalExecuted} actions, stored ${totalSuggested} suggestions`
  );
}
