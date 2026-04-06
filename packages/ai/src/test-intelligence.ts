/**
 * Phase 1 smoke test — run directly with:
 *   npx tsx packages/ai/src/test-intelligence.ts
 *
 * Tests runIntelligence() with a realistic project snapshot.
 * Does NOT require database — snapshot is hard-coded.
 * Requires OPENAI_API_KEY or ANTHROPIC_API_KEY in apps/api/.env
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { runIntelligence } from "./intelligence.js";
import type { IntelligenceConfig, ProjectSnapshot } from "@larry/shared";

// Load env from API .env
const envPath = path.resolve(process.cwd(), "apps/api/.env");
if (existsSync(envPath)) {
  loadEnv({ path: envPath });
  console.log("[test] Loaded env from apps/api/.env");
} else {
  console.warn("[test] No apps/api/.env found — will use mock provider");
}

// Build config from env — detect provider from available keys
const envProvider = process.env.MODEL_PROVIDER;
const provider: "openai" | "anthropic" | "mock" =
  envProvider === "anthropic" && process.env.ANTHROPIC_API_KEY ? "anthropic"
  : envProvider === "openai" && process.env.OPENAI_API_KEY ? "openai"
  : process.env.OPENAI_API_KEY ? "openai"
  : process.env.ANTHROPIC_API_KEY ? "anthropic"
  : "mock";

const config: IntelligenceConfig = {
  provider,
  apiKey:
    provider === "openai"
      ? process.env.OPENAI_API_KEY
      : provider === "anthropic"
      ? process.env.ANTHROPIC_API_KEY
      : undefined,
  model:
    provider === "openai"
      ? (process.env.OPENAI_MODEL ?? "gpt-4o-mini")
      : provider === "anthropic"
      ? (process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001")
      : "mock",
};

console.log(`[test] Using provider: ${config.provider}, model: ${config.model}`);
if (config.provider !== "mock" && !config.apiKey) {
  console.warn("[test] No API key found — falling back to mock");
  config.provider = "mock";
}

// Hard-coded realistic snapshot — simulates a project with real issues
const today = new Date();
const daysAgo = (n: number) => new Date(today.getTime() - n * 86400000).toISOString();
const daysFromNow = (n: number) => {
  const d = new Date(today.getTime() + n * 86400000);
  return d.toISOString().split("T")[0];
};

const snapshot: ProjectSnapshot = {
  project: {
    id: "proj-001",
    tenantId: "tenant-001",
    name: "Q2 Product Launch",
    description: "Launch the new authentication module and dashboard redesign by end of Q2.",
    status: "active",
    riskScore: 42,
    riskLevel: "medium",
    startDate: "2026-03-01",
    targetDate: daysFromNow(14),
  },
  tasks: [
    {
      id: "task-001",
      title: "Authentication module implementation",
      description: "Build OAuth 2.0 + JWT auth flow",
      status: "in_progress",
      priority: "critical",
      assigneeId: "user-001",
      assigneeName: "Marcus",
      progressPercent: 30,
      riskScore: 78,
      riskLevel: "high",
      dueDate: daysFromNow(2),
      startDate: "2026-03-10",
      lastActivityAt: daysAgo(8),
      dependsOnTitles: [],
    },
    {
      id: "task-002",
      title: "Dashboard redesign",
      description: "Redesign the main dashboard with new component library",
      status: "not_started",
      priority: "high",
      assigneeId: "user-002",
      assigneeName: "Anton",
      progressPercent: 0,
      riskScore: 45,
      riskLevel: "medium",
      dueDate: daysFromNow(7),
      startDate: null,
      lastActivityAt: daysAgo(3),
      dependsOnTitles: ["Authentication module implementation"],
    },
    {
      id: "task-003",
      title: "Write API documentation",
      description: "Document all new endpoints for external partners",
      status: "not_started",
      priority: "medium",
      assigneeId: null,
      assigneeName: null,
      progressPercent: 0,
      riskScore: 20,
      riskLevel: "low",
      dueDate: daysFromNow(10),
      startDate: null,
      lastActivityAt: daysAgo(15),
      dependsOnTitles: ["Authentication module implementation"],
    },
    {
      id: "task-004",
      title: "QA testing round 1",
      description: "End-to-end testing of auth and dashboard",
      status: "backlog",
      priority: "high",
      assigneeId: "user-003",
      assigneeName: "Joel",
      progressPercent: 0,
      riskScore: 10,
      riskLevel: "low",
      dueDate: daysFromNow(12),
      startDate: null,
      lastActivityAt: daysAgo(2),
      dependsOnTitles: ["Authentication module implementation", "Dashboard redesign"],
    },
    {
      id: "task-005",
      title: "Set up CI/CD pipeline",
      description: "Configure GitHub Actions for automated deployment",
      status: "completed",
      priority: "medium",
      assigneeId: "user-001",
      assigneeName: "Marcus",
      progressPercent: 100,
      riskScore: 0,
      riskLevel: "low",
      dueDate: "2026-03-20",
      startDate: "2026-03-15",
      lastActivityAt: daysAgo(5),
      dependsOnTitles: [],
    },
  ],
  team: [
    { id: "user-001", name: "Marcus", email: "marcus@example.com", role: "member", activeTaskCount: 1 },
    { id: "user-002", name: "Anton", email: "anton@example.com", role: "member", activeTaskCount: 1 },
    { id: "user-003", name: "Joel", email: "joel@example.com", role: "member", activeTaskCount: 1 },
    { id: "user-004", name: "Fergus", email: "fergus@example.com", role: "pm", activeTaskCount: 0 },
  ],
  recentActivity: [
    { description: "Marcus updated Authentication module implementation", timestamp: daysAgo(8) },
    { description: "Anton created Dashboard redesign", timestamp: daysAgo(3) },
    { description: "Joel completed Set up CI/CD pipeline", timestamp: daysAgo(5) },
  ],
  signals: [],
  generatedAt: today.toISOString(),
};

// ── Run the test ──────────────────────────────────────────────────────────────

async function main() {
  console.log("\n━━━ Phase 1 Smoke Test: runIntelligence() ━━━\n");
  console.log(`Project: "${snapshot.project.name}"`);
  console.log(`Tasks: ${snapshot.tasks.length} total, ${snapshot.tasks.filter(t => t.status === "completed").length} completed`);
  console.log(`Target date: ${snapshot.project.targetDate}`);
  console.log("\nCalling runIntelligence()...\n");

  const start = Date.now();

  try {
    const result = await runIntelligence(config, snapshot, "scheduled health scan");
    const elapsed = Date.now() - start;

    console.log(`✓ Intelligence returned in ${elapsed}ms\n`);
    console.log("── BRIEFING ──────────────────────────────────────");
    console.log(result.briefing);
    console.log(`\n── AUTO-EXECUTED (${result.autoActions.length}) ─────────────────────────────`);
    for (const action of result.autoActions) {
      console.log(`  [${action.type}] ${action.displayText}`);
      console.log(`    ↳ ${action.reasoning}`);
    }
    console.log(`\n── SUGGESTED (${result.suggestedActions.length}) ─────────────────────────────────`);
    for (const action of result.suggestedActions) {
      console.log(`  [${action.type}] ${action.displayText}`);
      console.log(`    ↳ ${action.reasoning}`);
    }

    console.log("\n── PAYLOAD SAMPLE ────────────────────────────────");
    const firstAction = result.autoActions[0] ?? result.suggestedActions[0];
    if (firstAction) {
      console.log(JSON.stringify(firstAction.payload, null, 2));
    }

    // Assertions
    let passed = 0;
    let failed = 0;

    function assert(condition: boolean, label: string) {
      if (condition) {
        console.log(`  ✓ ${label}`);
        passed++;
      } else {
        console.log(`  ✗ ${label}`);
        failed++;
      }
    }

    console.log("\n── ASSERTIONS ────────────────────────────────────");
    assert(typeof result.briefing === "string" && result.briefing.length > 20, "briefing is a non-empty string");
    assert(Array.isArray(result.autoActions), "autoActions is an array");
    assert(Array.isArray(result.suggestedActions), "suggestedActions is an array");

    // Expect at least one auto-action (auth task is 8 days inactive, 2 days to deadline)
    assert(result.autoActions.length > 0, "at least one auto-action returned");

    // Every action must have the required fields
    const allActions = [...result.autoActions, ...result.suggestedActions];
    assert(
      allActions.every(a => a.displayText && a.reasoning && a.payload && a.type),
      "all actions have required fields"
    );
    assert(
      allActions.every(a => typeof a.displayText === "string" && a.displayText.length > 5),
      "all displayText fields are non-trivial strings"
    );
    assert(
      allActions.every(a => typeof a.reasoning === "string" && a.reasoning.length > 5),
      "all reasoning fields are non-trivial strings"
    );

    // No action should have task IDs that weren't in the snapshot
    const validTaskIds = new Set(snapshot.tasks.map(t => t.id));
    const actionsWithTaskId = allActions.filter(a => typeof a.payload["taskId"] === "string");
    assert(
      actionsWithTaskId.every(a => validTaskIds.has(a.payload["taskId"] as string)),
      "all taskId references point to real tasks from snapshot"
    );

    console.log(`\n── RESULT: ${passed} passed, ${failed} failed ─────────────────`);
    if (failed > 0) {
      console.error("\nSome assertions failed. Review output above.");
      process.exitCode = 1;
    } else {
      console.log("\n✓ Phase 1 complete — runIntelligence() is working correctly.");
    }
  } catch (err) {
    console.error(`\n✗ runIntelligence() threw an error after ${Date.now() - start}ms:`);
    console.error(err);
    process.exitCode = 1;
  }
}

main();
