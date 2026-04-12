import { describe, expect, it, vi } from "vitest";
import type { Db } from "@larry/db";
import { runAutoActions } from "@larry/db";
import type { LarryAction } from "@larry/shared";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";

const CHAT_CONTEXT = {
  conversationId: "44444444-4444-4444-8444-444444444444",
  requestMessageId: "55555555-5555-4555-8555-555555555555",
  responseMessageId: "66666666-6666-4666-8666-666666666666",
  requesterUserId: USER_ID,
  sourceKind: "chat",
  sourceRecordId: "55555555-5555-4555-8555-555555555555",
} as const;

const SCHEDULE_CONTEXT = {
  sourceKind: "schedule",
  sourceRecordId: "77777777-7777-4777-8777-777777777777",
} as const;

const RISK_FLAG_ACTION: LarryAction = {
  type: "risk_flag",
  displayText: "I flagged checkout QA as high risk",
  reasoning: "Only 20% done with one day left",
  payload: {
    taskId: "task-qa",
    taskTitle: "Checkout QA",
    riskLevel: "high",
  },
};

const REMINDER_ACTION: LarryAction = {
  type: "reminder_send",
  displayText: "Send reminder to Alex about checkout QA",
  reasoning: "7 days inactive, deadline Friday",
  payload: {
    taskId: "task-qa",
    taskTitle: "Checkout QA",
    assigneeName: "Alex",
    message: "Checkout QA is 7 days inactive with Friday's deadline approaching.",
  },
};

const STATUS_UPDATE_ACTION: LarryAction = {
  type: "status_update",
  displayText: "Mark checkout QA as blocked",
  reasoning: "Depends on API spec which is 3 days overdue",
  payload: {
    taskId: "task-qa",
    taskTitle: "Checkout QA",
    newStatus: "blocked",
    newRiskLevel: "high",
  },
};

const CALENDAR_CREATE_ACTION: LarryAction = {
  type: "calendar_event_create",
  displayText: "Create project kickoff calendar event",
  reasoning: "User asked to schedule kickoff with attendees",
  payload: {
    summary: "Project kickoff",
    startDateTime: "2026-04-03T10:00:00Z",
    endDateTime: "2026-04-03T10:30:00Z",
    attendees: ["pm@example.com"],
  },
};

function createMockDb(options: {
  autoExecuteLowImpact: boolean;
  role?: "admin" | "pm" | "member";
}) {
  let insertCounter = 0;

  const queryTenant = vi.fn(async (_tenantId: string, sql: string, values?: unknown[]) => {
    if (sql.includes("FROM tenant_policy_settings")) {
      return [{ auto_execute_low_impact: options.autoExecuteLowImpact }];
    }
    if (sql.includes("FROM memberships")) {
      return options.role ? [{ role: options.role }] : [];
    }
    if (sql.includes("SELECT action_type, display_text") && sql.includes("event_type = 'suggested'")) {
      return [];
    }
    if (sql.includes("INSERT INTO larry_events")) {
      insertCounter += 1;
      return [{ id: `event-${insertCounter}` }];
    }
    if (sql.includes("SELECT id FROM tasks") && sql.includes("AND id =")) {
      // ensureTaskId validation — return the task if the ID matches
      const idParam = values?.[1];
      if (idParam === "task-qa") return [{ id: "task-qa" }];
      return [];
    }
    if (sql.includes("UPDATE tasks")) {
      return [
        {
          id: "task-qa",
          tenant_id: TENANT_ID,
          project_id: PROJECT_ID,
          title: "Checkout QA",
          status: "in_progress",
          risk_level: "high",
          updated_at: "2026-03-30T10:00:00.000Z",
        },
      ];
    }
    if (sql.includes("INSERT INTO activity_log")) {
      return [];
    }
    if (sql.includes("UPDATE larry_events")) {
      return [];
    }
    return [];
  });

  return {
    db: { queryTenant } as unknown as Db,
    queryTenant,
  };
}

describe("runAutoActions governance routing", () => {
  it("routes chat actions to approval when requester authority is member", async () => {
    const { db, queryTenant } = createMockDb({ autoExecuteLowImpact: true, role: "member" });

    const result = await runAutoActions(
      db,
      TENANT_ID,
      PROJECT_ID,
      "chat",
      [RISK_FLAG_ACTION],
      "Please flag that task",
      CHAT_CONTEXT
    );

    expect(result).toMatchObject({
      executedCount: 0,
      suggestedCount: 1,
      eventIds: ["event-1"],
    });

    const insertCalls = queryTenant.mock.calls.filter(
      (call) => typeof call[1] === "string" && (call[1] as string).includes("INSERT INTO larry_events")
    );
    const insertValues = (insertCalls[0]?.[2] ?? []) as unknown[];
    expect(insertValues[2]).toBe("suggested");

    const taskMutations = queryTenant.mock.calls.filter(
      (call) => typeof call[1] === "string" && (call[1] as string).includes("UPDATE tasks")
    );
    expect(taskMutations).toHaveLength(0);
  });

  it("routes actions to approval when tenant policy disables auto execution", async () => {
    const { db, queryTenant } = createMockDb({ autoExecuteLowImpact: false });

    const result = await runAutoActions(
      db,
      TENANT_ID,
      PROJECT_ID,
      "schedule",
      [RISK_FLAG_ACTION],
      undefined,
      SCHEDULE_CONTEXT
    );

    expect(result).toMatchObject({
      executedCount: 0,
      suggestedCount: 1,
      eventIds: ["event-1"],
    });

    const insertCalls = queryTenant.mock.calls.filter(
      (call) => typeof call[1] === "string" && (call[1] as string).includes("INSERT INTO larry_events")
    );
    const insertValues = (insertCalls[0]?.[2] ?? []) as unknown[];
    expect(insertValues[2]).toBe("suggested");
  });

  it("keeps low-risk actions (reminder_send) auto-executed when policy and authority allow", async () => {
    const { db, queryTenant } = createMockDb({ autoExecuteLowImpact: true, role: "pm" });

    const result = await runAutoActions(
      db,
      TENANT_ID,
      PROJECT_ID,
      "chat",
      [REMINDER_ACTION],
      "Send the reminder",
      CHAT_CONTEXT
    );

    expect(result).toMatchObject({
      executedCount: 1,
      suggestedCount: 0,
      eventIds: ["event-1"],
    });

    const insertCalls = queryTenant.mock.calls.filter(
      (call) => typeof call[1] === "string" && (call[1] as string).includes("INSERT INTO larry_events")
    );
    const insertValues = (insertCalls[0]?.[2] ?? []) as unknown[];
    expect(insertValues[2]).toBe("auto_executed");
  });

  // Regression for QA-2026-04-12 C-6: a read-only chat query ("What's the status?")
  // was auto-executing risk_flag actions on real tasks. risk_flag is project-visible
  // state; every risk_flag must land in Pending review so the user approves it.
  it("routes risk_flag to approval for ALL trigger sources, even with pm role", async () => {
    for (const triggeredBy of ["chat", "schedule", "login"] as const) {
      const { db, queryTenant } = createMockDb({ autoExecuteLowImpact: true, role: "pm" });
      // login and chat both have requesterUserId; schedule does not require one.
      const context = triggeredBy === "schedule" ? SCHEDULE_CONTEXT : CHAT_CONTEXT;

      const result = await runAutoActions(
        db,
        TENANT_ID,
        PROJECT_ID,
        triggeredBy,
        [RISK_FLAG_ACTION],
        triggeredBy === "chat" ? "Flag checkout QA if needed" : undefined,
        context
      );

      expect(result, `triggeredBy=${triggeredBy}`).toMatchObject({
        executedCount: 0,
        suggestedCount: 1,
      });

      const insertCalls = queryTenant.mock.calls.filter(
        (call) => typeof call[1] === "string" && (call[1] as string).includes("INSERT INTO larry_events")
      );
      const insertValues = (insertCalls[0]?.[2] ?? []) as unknown[];
      expect(insertValues[2], `triggeredBy=${triggeredBy}`).toBe("suggested");

      const taskMutations = queryTenant.mock.calls.filter(
        (call) => typeof call[1] === "string" && (call[1] as string).includes("UPDATE tasks")
      );
      expect(taskMutations, `triggeredBy=${triggeredBy}`).toHaveLength(0);
    }
  });

  it("routes status_update to approval for ALL trigger sources (QA-2026-04-12 C-6)", async () => {
    const { db, queryTenant } = createMockDb({ autoExecuteLowImpact: true, role: "pm" });

    const result = await runAutoActions(
      db,
      TENANT_ID,
      PROJECT_ID,
      "chat",
      [STATUS_UPDATE_ACTION],
      "Mark it as blocked",
      CHAT_CONTEXT
    );

    expect(result).toMatchObject({
      executedCount: 0,
      suggestedCount: 1,
    });

    const taskMutations = queryTenant.mock.calls.filter(
      (call) => typeof call[1] === "string" && (call[1] as string).includes("UPDATE tasks")
    );
    expect(taskMutations).toHaveLength(0);
  });

  it("routes calendar actions to approval-only suggestions even when policy allows auto execution", async () => {
    const { db, queryTenant } = createMockDb({ autoExecuteLowImpact: true, role: "pm" });

    const result = await runAutoActions(
      db,
      TENANT_ID,
      PROJECT_ID,
      "chat",
      [CALENDAR_CREATE_ACTION],
      "Schedule a kickoff event",
      CHAT_CONTEXT
    );

    expect(result).toMatchObject({
      executedCount: 0,
      suggestedCount: 1,
      eventIds: ["event-1"],
    });

    const insertCalls = queryTenant.mock.calls.filter(
      (call) => typeof call[1] === "string" && (call[1] as string).includes("INSERT INTO larry_events")
    );
    const insertValues = (insertCalls[0]?.[2] ?? []) as unknown[];
    expect(insertValues[2]).toBe("suggested");

    const taskMutations = queryTenant.mock.calls.filter(
      (call) => typeof call[1] === "string" && (call[1] as string).includes("UPDATE tasks")
    );
    expect(taskMutations).toHaveLength(0);
  });
});
