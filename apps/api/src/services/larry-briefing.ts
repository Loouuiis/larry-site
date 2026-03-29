import { randomUUID } from "node:crypto";
import { Db, backfillLarryEventSourceRecord, getProjectSnapshot } from "@larry/db";
import { runIntelligence } from "@larry/ai";
import type { IntelligenceConfig } from "@larry/shared";
import { runAutoActions, storeSuggestions, getPendingSuggestionTexts } from "@larry/db";
import { buildPendingClause } from "../lib/intelligence-hints.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LarryBriefingProject {
  projectId: string;
  name: string;
  statusLabel: "At Risk" | "Needs Attention" | "On Track";
  summary: string;
  actionsCount: number;
  needsYou: boolean;
  suggestionCount: number;
}

export interface LarryBriefingContent {
  greeting: string;
  projects: LarryBriefingProject[];
  totalNeedsYou: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildGreeting(displayName: string): string {
  const hour = new Date().getHours();
  const timeOfDay = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  const firstName = displayName.trim().split(/\s+/)[0] ?? displayName.trim();
  return `Good ${timeOfDay}, ${firstName}.`;
}

function deriveStatusLabel(riskLevel: string): LarryBriefingProject["statusLabel"] {
  if (riskLevel === "high") return "At Risk";
  if (riskLevel === "medium") return "Needs Attention";
  return "On Track";
}

// ── Core ──────────────────────────────────────────────────────────────────────

/**
 * Generate a fresh briefing for a user across all their active projects.
 * Runs intelligence for each project in parallel, executes auto-actions,
 * stores suggestions, writes the result to larry_briefings, and returns it.
 */
export async function generateBriefing(
  db: Db,
  config: IntelligenceConfig,
  userId: string,
  tenantId: string,
  userDisplayName: string
): Promise<{ content: LarryBriefingContent; briefingId: string }> {
  const briefingId = randomUUID();

  // 1. Load all active projects this user is a member of (cap at 20 for latency)
  const projectRows = await db.queryTenant<{ id: string; name: string; risk_level: string }>(
    tenantId,
    `SELECT p.id, p.name, p.risk_level
     FROM projects p
     JOIN memberships m ON m.tenant_id = p.tenant_id AND m.user_id = $2
     WHERE p.tenant_id = $1
       AND p.status = 'active'
     ORDER BY p.updated_at DESC
     LIMIT 20`,
    [tenantId, userId]
  );

  // 2. Run intelligence for each project in parallel — errors in individual
  //    projects are logged and skipped so one bad project can't kill the briefing
  const settled = await Promise.allSettled(
    projectRows.map(async (project) => {
      const ledgerContext = {
        requesterUserId: userId,
        sourceKind: "briefing",
        sourceRecordId: briefingId,
      } as const;
      const [snapshot, pendingTexts] = await Promise.all([
        getProjectSnapshot(db, tenantId, project.id),
        getPendingSuggestionTexts(db, tenantId, project.id).catch(() => [] as string[]),
      ]);
      const result = await runIntelligence(config, snapshot, `user logged in${buildPendingClause(pendingTexts)}`);

      const [autoResult, suggestResult] = await Promise.all([
        runAutoActions(db, tenantId, project.id, "login", result.autoActions, undefined, ledgerContext),
        storeSuggestions(db, tenantId, project.id, "login", result.suggestedActions, undefined, ledgerContext),
      ]);

      return { project, result, autoResult, suggestResult };
    })
  );

  const projectBriefings: LarryBriefingProject[] = [];
  const allEventIds: string[] = [];

  for (const outcome of settled) {
    if (outcome.status === "rejected") {
      console.error("[larry-briefing] Project intelligence failed:", outcome.reason);
      continue;
    }
    const { project, result, autoResult, suggestResult } = outcome.value;
    allEventIds.push(...autoResult.eventIds, ...suggestResult.eventIds);

    projectBriefings.push({
      projectId: project.id,
      name: project.name,
      statusLabel: deriveStatusLabel(project.risk_level),
      summary: result.briefing,
      actionsCount: autoResult.executedCount,
      needsYou: suggestResult.suggestedCount > 0,
      suggestionCount: suggestResult.suggestedCount,
    });
  }

  const totalNeedsYou = projectBriefings.filter((p) => p.needsYou).length;

  const content: LarryBriefingContent = {
    greeting: buildGreeting(userDisplayName),
    projects: projectBriefings,
    totalNeedsYou,
  };

  // 6. Persist — store event IDs so the briefing is auditable
  const briefingRows = await db.queryTenant<{ id: string }>(
    tenantId,
    `INSERT INTO larry_briefings (id, tenant_id, user_id, content, event_ids)
     VALUES ($1, $2, $3, $4::jsonb, $5::uuid[])
     RETURNING id`,
    [briefingId, tenantId, userId, JSON.stringify(content), allEventIds]
  );

  const persistedBriefingId = briefingRows[0].id;
  await backfillLarryEventSourceRecord(db, tenantId, allEventIds, "briefing", persistedBriefingId);

  return { content, briefingId: persistedBriefingId };
}

/**
 * Return a cached briefing if one was generated within the last 4 hours,
 * otherwise generate a fresh one.
 */
export async function getOrGenerateBriefing(
  db: Db,
  config: IntelligenceConfig,
  userId: string,
  tenantId: string,
  userDisplayName: string
): Promise<{ content: LarryBriefingContent; fresh: boolean; briefingId: string | null }> {
  const cached = await db.queryTenant<{ id: string; content: LarryBriefingContent }>(
    tenantId,
    `SELECT id, content
     FROM larry_briefings
     WHERE tenant_id = $1
       AND user_id = $2
       AND created_at > NOW() - INTERVAL '4 hours'
     ORDER BY created_at DESC
     LIMIT 1`,
    [tenantId, userId]
  );

  if (cached[0]) {
    return { content: cached[0].content, fresh: false, briefingId: cached[0].id };
  }

  const { content, briefingId } = await generateBriefing(db, config, userId, tenantId, userDisplayName);
  return { content, fresh: true, briefingId };
}
