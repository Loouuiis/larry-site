import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@larry/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@larry/ai")>();
  return { ...actual, runIntelligence: vi.fn() };
});

vi.mock("@larry/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@larry/db")>();
  return {
    ...actual,
    backfillLarryEventSourceRecord: vi.fn(),
    getPendingSuggestionTexts: vi.fn(),
    getProjectSnapshot: vi.fn(),
    runAutoActions: vi.fn(),
    storeSuggestions: vi.fn(),
  };
});

import type { Db } from "@larry/db";
import {
  backfillLarryEventSourceRecord,
  getPendingSuggestionTexts,
  getProjectSnapshot,
  runAutoActions,
  storeSuggestions,
} from "@larry/db";
import { runIntelligence } from "@larry/ai";
import { generateBriefing } from "../src/services/larry-briefing.js";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";

afterEach(() => {
  vi.clearAllMocks();
});

describe("generateBriefing", () => {
  it("stamps briefing provenance onto generated Larry events and backfills the source record", async () => {
    let insertedBriefingId: string | null = null;
    const db = {
      queryTenant: vi.fn(async (_tenantId: string, sql: string, values?: unknown[]) => {
        if (sql.includes("SELECT p.id")) {
          return [{ id: PROJECT_ID, name: "Board Prep", risk_level: "medium" }];
        }
        if (sql.includes("INSERT INTO larry_briefings")) {
          insertedBriefingId = String(values?.[0] ?? "");
          return [{ id: insertedBriefingId }];
        }
        return [];
      }),
    } as unknown as Db;

    vi.mocked(getProjectSnapshot).mockResolvedValue({
      project: {
        id: PROJECT_ID,
        tenantId: TENANT_ID,
        name: "Board Prep",
        description: null,
        status: "active",
        riskScore: 62,
        riskLevel: "medium",
        startDate: null,
        targetDate: null,
      },
      tasks: [],
      team: [],
      recentActivity: [],
      signals: [],
      generatedAt: "2026-03-29T09:00:00.000Z",
    });
    vi.mocked(getPendingSuggestionTexts).mockResolvedValue([]);
    vi.mocked(runIntelligence).mockResolvedValue({
      briefing: "Board prep needs tighter ownership before the next review.",
      autoActions: [
        {
          type: "risk_flag",
          displayText: "Flagged the prep stream as at risk",
          reasoning: "Open blockers are accumulating",
          payload: { taskId: "task-1", taskTitle: "Prep stream", riskLevel: "high" },
        },
      ],
      suggestedActions: [
        {
          type: "owner_change",
          displayText: "Reassign the prep stream owner",
          reasoning: "The current owner is overloaded",
          payload: { taskId: "task-1", taskTitle: "Prep stream", newOwnerName: "Taylor" },
        },
      ],
    });
    vi.mocked(runAutoActions).mockResolvedValue({
      executedCount: 1,
      suggestedCount: 1,
      eventIds: ["ev-auto-1"],
    });
    vi.mocked(storeSuggestions).mockResolvedValue({
      executedCount: 0,
      suggestedCount: 1,
      eventIds: ["ev-suggest-1"],
    });

    const result = await generateBriefing(
      db,
      { provider: "mock", model: "mock" },
      USER_ID,
      TENANT_ID,
      "Taylor"
    );

    expect(insertedBriefingId).toEqual(expect.any(String));
    expect(result).toMatchObject({
      briefingId: insertedBriefingId,
      content: {
        greeting: expect.stringContaining("Taylor"),
        totalNeedsYou: 1,
        projects: [
          {
            projectId: PROJECT_ID,
            suggestionCount: 2,
            needsYou: true,
          },
        ],
      },
    });
    expect(runAutoActions).toHaveBeenCalledWith(
      db,
      TENANT_ID,
      PROJECT_ID,
      "login",
      expect.any(Array),
      undefined,
      {
        requesterUserId: USER_ID,
        sourceKind: "briefing",
        sourceRecordId: insertedBriefingId,
      }
    );
    expect(storeSuggestions).toHaveBeenCalledWith(
      db,
      TENANT_ID,
      PROJECT_ID,
      "login",
      expect.any(Array),
      undefined,
      {
        requesterUserId: USER_ID,
        sourceKind: "briefing",
        sourceRecordId: insertedBriefingId,
      }
    );
    expect(backfillLarryEventSourceRecord).toHaveBeenCalledWith(
      db,
      TENANT_ID,
      ["ev-auto-1", "ev-suggest-1"],
      "briefing",
      insertedBriefingId
    );
  });
});
