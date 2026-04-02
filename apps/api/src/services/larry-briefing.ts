import { randomUUID } from "node:crypto";
import { Db, backfillLarryEventSourceRecord, getProjectSnapshot } from "@larry/db";
import { runIntelligence } from "@larry/ai";
import type { IntelligenceConfig } from "@larry/shared";
import { runAutoActions, storeSuggestions, getPendingSuggestionTexts } from "@larry/db";
import { buildPendingClause } from "../lib/intelligence-hints.js";
import { ACTIVE_PROJECT_STATUS, projectStatusSql } from "../lib/project-status.js";

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

// ── Guidance helpers ──────────────────────────────────────────────────────────

interface LarryRuleRow {
  title: string;
  description: string;
  rule_type: string;
}

interface CorrectionRow {
  correction_type: string;
  correction_payload: Record<string, unknown>;
  created_at: string;
}

async function loadTenantGuidanceHint(db: Db, tenantId: string): Promise<string> {
  const [rules, corrections] = await Promise.all([
    db.queryTenant<LarryRuleRow>(
      tenantId,
      `SELECT title, description, rule_type
       FROM larry_rules
       WHERE tenant_id = $1 AND is_active = true
       ORDER BY created_at DESC
       LIMIT 10`,
      [tenantId]
    ).catch(() => [] as LarryRuleRow[]),
    db.queryTenant<CorrectionRow>(
      tenantId,
      `SELECT correction_type, correction_payload, created_at
       FROM correction_feedback
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [tenantId]
    ).catch(() => [] as CorrectionRow[]),
  ]);

  const chunks: string[] = [];

  if (rules.length > 0) {
    const lines = rules.map(
      (rule, i) => `${i + 1}. [${rule.rule_type}] ${rule.title}: ${rule.description}`
    );
    chunks.push(`USER-DEFINED RULES Larry must follow:\n${lines.join("\n")}`);
  }

  if (corrections.length > 0) {
    const lines = corrections.map((item, i) => {
      const actionType = (item.correction_payload as Record<string, unknown>)?.actionType ?? "unknown";
      const reason = (item.correction_payload as Record<string, unknown>)?.reason ?? "";
      const reasonSuffix = typeof reason === "string" && reason.length > 0 ? ` — ${reason}` : "";
      return `${i + 1}. ${item.correction_type.toUpperCase()}: ${actionType} (${item.created_at.slice(0, 10)})${reasonSuffix}`;
    });
    chunks.push(`PAST CORRECTIONS from the user — use these to calibrate your judgment:\n${lines.join("\n")}`);
  }

  return chunks.join("\n\n");
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
       AND ${projectStatusSql("p.status")} = '${ACTIVE_PROJECT_STATUS}'
     ORDER BY p.updated_at DESC
     LIMIT 20`,
    [tenantId, userId]
  );

  // 2. Load tenant-level guidance once so every per-project intelligence call
  //    receives the same rules and correction calibration context.
  const guidanceHint = await loadTenantGuidanceHint(db, tenantId);

  // 3. Run intelligence for each project in parallel — errors in individual
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
      const result = await runIntelligence(
        config,
        snapshot,
        `user logged in${buildPendingClause(pendingTexts)}${guidanceHint ? `\n\n${guidanceHint}` : ""}`
      );

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
      needsYou: suggestResult.suggestedCount + autoResult.suggestedCount > 0,
      suggestionCount: suggestResult.suggestedCount + autoResult.suggestedCount,
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
