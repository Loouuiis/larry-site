import { generateText } from "ai";
import type { Db } from "@larry/db";
import type { IntelligenceConfig } from "@larry/shared";
import { createModel } from "./provider.js";
import { buildProposeTimelineRegroupTool } from "./timeline-tools.js";

export interface OrgTimelineContextInput {
  tenantId: string;
  categories: Array<{
    id: string; name: string; colour: string | null;
    parentCategoryId: string | null; projectId: string | null;
    createdAt: string; lastRenamedAt: string | null;
  }>;
  projects: Array<{
    id: string; name: string; categoryId: string | null;
    status: string; createdAt: string;
  }>;
  recentSignals: Array<{ projectId: string; source: string; excerpt: string }>;
  pendingTimelineSuggestions: string[];
}

// Pipe-separated tabular format: cheap to tokenise, parseable, stable.
export function buildOrgTimelineContext(input: OrgTimelineContextInput): string {
  const lines: string[] = [];
  lines.push("# Categories (cat|id|name|parentId|projectScope)");
  for (const c of input.categories) {
    lines.push(`cat|${c.id}|${c.name}|${c.parentCategoryId ?? ""}|${c.projectId ?? ""}`);
  }
  lines.push("");
  lines.push("# Projects (proj|id|name|categoryId|status)");
  for (const p of input.projects) {
    lines.push(`proj|${p.id}|${p.name}|${p.categoryId ?? ""}|${p.status}`);
  }
  lines.push("");
  lines.push("# Recent signals (signal|projectId|source|excerpt<=200)");
  for (const s of input.recentSignals.slice(0, 20)) {
    const excerpt = s.excerpt.slice(0, 200).replace(/\|/g, "/");
    lines.push(`signal|${s.projectId}|${s.source}|${excerpt}`);
  }
  lines.push("");
  lines.push("# Pending timeline suggestions — DO NOT duplicate");
  for (const t of input.pendingTimelineSuggestions.slice(0, 10)) {
    lines.push(`pending|${t}`);
  }
  return lines.join("\n");
}

export interface OrgPassGateInput {
  pendingCount: number;
  lastRunMinutesAgo: number;
}
export function shouldRunOrgPass(g: OrgPassGateInput): boolean {
  if (g.pendingCount >= 3) return false;
  if (g.lastRunMinutesAgo < 60) return false;
  return true;
}

export const ORG_TIMELINE_SYSTEM_PROMPT = [
  "You are Larry — a senior PM running the workspace's org-wide timeline pass.",
  "Your only purpose here is to spot opportunities to reorganise the timeline.",
  "",
  "Available tool: proposeTimelineRegroup — call it AT MOST ONCE per pass.",
  "",
  "Trigger it when:",
  "- 3+ projects share a theme (customer, product area, quarter, stakeholder).",
  "- An existing category's projects cleanly split into sub-themes.",
  "- Two categories share the exact same colour, or a meaningful category still",
  "  uses the default Larry purple.",
  "",
  "Do NOT call the tool when:",
  "- Fewer than 3 projects would change.",
  "- A similar pending suggestion already exists (check pendingTimelineSuggestions).",
  "- Signal is weak — doing nothing is better than guessing.",
].join("\n");

export async function runOrgIntelligencePass(args: {
  db: Db;
  tenantId: string;
  context: OrgTimelineContextInput;
  config: IntelligenceConfig;
}): Promise<{ toolCallMade: boolean }> {
  const contextBlock = buildOrgTimelineContext(args.context);
  const regroupTool = buildProposeTimelineRegroupTool({
    db: args.db, tenantId: args.tenantId,
  });

  const result = await generateText({
    model: createModel(args.config),
    system: ORG_TIMELINE_SYSTEM_PROMPT,
    prompt: `Workspace snapshot:\n\n${contextBlock}`,
    tools: { proposeTimelineRegroup: regroupTool },
  });

  return { toolCallMade: (result.toolCalls ?? []).length > 0 };
}
