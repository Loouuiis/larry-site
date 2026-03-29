import { test, expect } from "@playwright/test";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const CONVERSATION_ID = "22222222-2222-4222-8222-222222222222";
const REQUEST_MESSAGE_ID = "33333333-3333-4333-8333-333333333333";
const RESPONSE_MESSAGE_ID = "44444444-4444-4444-8444-444444444444";
const EVENT_ID = "55555555-5555-4555-8555-555555555555";

test("links project chat actions back into the action centre and acceptance flow", async ({ page }) => {
  const requestedByName = "Taylor";
  const assistantReply = "I drafted the update and queued it for approval.";

  let conversationPreview = {
    id: CONVERSATION_ID,
    projectId: PROJECT_ID,
    title: "Launch update email",
    createdAt: "2026-03-28T10:00:00.000Z",
    updatedAt: "2026-03-28T10:00:05.000Z",
    lastMessagePreview: assistantReply,
    lastMessageAt: "2026-03-28T10:00:05.000Z",
  };

  const suggestedEvent = {
    id: EVENT_ID,
    projectId: PROJECT_ID,
    eventType: "suggested" as const,
    actionType: "email_draft",
    displayText: "Draft launch update email",
    reasoning: "The launch milestone is coming up and the team needs a concise update.",
    payload: { recipient: "team@example.com" },
    executedAt: null,
    triggeredBy: "chat" as const,
    chatMessage: "Draft a launch update email for the team.",
    createdAt: "2026-03-28T10:00:05.000Z",
    conversationId: CONVERSATION_ID,
    requestMessageId: REQUEST_MESSAGE_ID,
    responseMessageId: RESPONSE_MESSAGE_ID,
    requestedByUserId: "66666666-6666-4666-8666-666666666666",
    requestedByName,
    approvedByUserId: null,
    approvedByName: null,
    approvedAt: null,
    dismissedByUserId: null,
    dismissedByName: null,
    dismissedAt: null,
    executedByKind: null,
    executedByUserId: null,
    executedByName: null,
    executionMode: "approval" as const,
    sourceKind: "chat",
    sourceRecordId: REQUEST_MESSAGE_ID,
    conversationTitle: "Launch update email",
    requestMessagePreview: "Draft a launch update email for the team.",
    responseMessagePreview: assistantReply,
  };

  const acceptedEvent = {
    ...suggestedEvent,
    eventType: "accepted" as const,
    approvedByUserId: suggestedEvent.requestedByUserId,
    approvedByName: requestedByName,
    approvedAt: "2026-03-28T10:01:00.000Z",
    executedByKind: "user" as const,
    executedByUserId: suggestedEvent.requestedByUserId,
    executedByName: requestedByName,
    executedAt: "2026-03-28T10:01:00.000Z",
  };

  let messages: Array<Record<string, unknown>> = [];
  let actionCentre = {
    suggested: [] as Array<Record<string, unknown>>,
    activity: [] as Array<Record<string, unknown>>,
    conversations: [] as Array<Record<string, unknown>>,
  };

  await page.route("**/api/workspace/home", async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        projects: [
          {
            id: PROJECT_ID,
            name: "Alpha Launch",
            description: "Prepare the April launch communications.",
            status: "active",
            riskLevel: "medium",
            targetDate: "2026-04-30",
            updatedAt: "2026-03-28T10:00:00.000Z",
          },
        ],
        tasks: [],
        connectors: {},
      },
    });
  });

  await page.route("**/api/workspace/larry/briefing", async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        briefing: {
          greeting: "Good morning, Taylor.",
          projects: [],
          totalNeedsYou: 0,
        },
      },
    });
  });

  await page.route(`**/api/workspace/projects/${PROJECT_ID}/overview`, async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        project: {
          id: PROJECT_ID,
          name: "Alpha Launch",
          description: "Prepare the April launch communications.",
          status: "active",
          riskLevel: "medium",
          targetDate: "2026-04-30",
          updatedAt: "2026-03-28T10:00:00.000Z",
          completionRate: 45,
        },
        tasks: [
          {
            id: "77777777-7777-4777-8777-777777777777",
            projectId: PROJECT_ID,
            title: "Finalize launch messaging",
            description: null,
            status: "in_progress",
            priority: "high",
            dueDate: "2026-04-15",
            assigneeName: "Taylor",
          },
        ],
        timeline: null,
        health: {
          completionRate: 45,
          blockedCount: 1,
          avgRiskScore: 61,
          riskLevel: "medium",
        },
        outcomes: {
          narrative: "Launch prep is moving, but communications still need a coordinated update.",
        },
        meetings: [],
      },
    });
  });

  await page.route(`**/api/workspace/projects/${PROJECT_ID}/action-centre`, async (route) => {
    await route.fulfill({
      status: 200,
      json: actionCentre,
    });
  });

  await page.route(`**/api/workspace/larry/conversations?projectId=${PROJECT_ID}`, async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        conversations: actionCentre.conversations,
      },
    });
  });

  await page.route(`**/api/workspace/larry/conversations/${CONVERSATION_ID}/messages`, async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        messages,
      },
    });
  });

  await page.route("**/api/workspace/larry/chat", async (route) => {
    const payload = route.request().postDataJSON() as { projectId: string; message: string };
    expect(payload).toMatchObject({
      projectId: PROJECT_ID,
      message: "Draft a launch update email for the team.",
    });

    messages = [
      {
        id: REQUEST_MESSAGE_ID,
        role: "user",
        content: payload.message,
        reasoning: null,
        createdAt: "2026-03-28T10:00:00.000Z",
        actorUserId: suggestedEvent.requestedByUserId,
        actorDisplayName: requestedByName,
        linkedActions: [],
      },
      {
        id: RESPONSE_MESSAGE_ID,
        role: "larry",
        content: assistantReply,
        reasoning: null,
        createdAt: "2026-03-28T10:00:05.000Z",
        actorUserId: null,
        actorDisplayName: null,
        linkedActions: [suggestedEvent],
      },
    ];
    actionCentre = {
      suggested: [suggestedEvent],
      activity: [],
      conversations: [conversationPreview],
    };

    await route.fulfill({
      status: 200,
      json: {
        conversationId: CONVERSATION_ID,
        message: assistantReply,
        userMessage: messages[0],
        assistantMessage: messages[1],
        linkedActions: [suggestedEvent],
        actionsExecuted: 0,
        suggestionCount: 1,
      },
    });
  });

  await page.route(`**/api/workspace/larry/events/${EVENT_ID}/accept`, async (route) => {
    messages = [
      messages[0],
      {
        ...messages[1],
        linkedActions: [acceptedEvent],
      },
    ];
    actionCentre = {
      suggested: [],
      activity: [acceptedEvent],
      conversations: [conversationPreview],
    };

    await route.fulfill({
      status: 200,
      json: {
        accepted: true,
        event: acceptedEvent,
      },
    });
  });

  await page.goto("/login");
  await page.getByRole("button", { name: "Enter Dashboard (Dev)" }).click();
  await page.waitForURL("**/workspace");

  await page.goto(`/workspace/projects/${PROJECT_ID}`);
  await expect(page.getByRole("heading", { name: "Alpha Launch" })).toBeVisible();

  const heroSection = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Alpha Launch" }),
  }).first();
  await heroSection.getByRole("button", { name: "Ask Larry" }).click();
  await page.getByRole("textbox", { name: "Tell Larry what to do..." }).fill(
    "Draft a launch update email for the team."
  );
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText(assistantReply)).toBeVisible();
  await expect(page.getByText("Draft launch update email")).toHaveCount(2);
  await expect(page.getByText("Requested by Taylor")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Accept" })).toBeVisible();

  await page.getByRole("button", { name: "Accept" }).click();

  await expect(page.getByText("Accepted by Taylor")).toBeVisible();
  await expect(page.getByText("Accepted", { exact: true })).toBeVisible();
});
