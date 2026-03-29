import { expect, test, type Page } from "@playwright/test";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_PROJECT_ID = "99999999-9999-4999-8999-999999999999";
const CONVERSATION_ID = "22222222-2222-4222-8222-222222222222";
const REQUEST_MESSAGE_ID = "33333333-3333-4333-8333-333333333333";
const RESPONSE_MESSAGE_ID = "44444444-4444-4444-8444-444444444444";
const EVENT_ID = "55555555-5555-4555-8555-555555555555";
const REQUESTED_BY_USER_ID = "66666666-6666-4666-8666-666666666666";
const REQUESTED_BY_NAME = "Taylor";

const alphaProject = {
  id: PROJECT_ID,
  name: "Alpha Launch",
  description: "Prepare the April launch communications.",
  status: "active",
  riskLevel: "medium",
  targetDate: "2026-04-30",
  updatedAt: "2026-03-28T10:00:00.000Z",
};

const betaProject = {
  id: OTHER_PROJECT_ID,
  name: "Beta Expansion",
  description: "Coordinate the follow-up launch wave.",
  status: "active",
  riskLevel: "low",
  targetDate: "2026-05-15",
  updatedAt: "2026-03-28T09:30:00.000Z",
};

const conversationPreview = {
  id: CONVERSATION_ID,
  projectId: PROJECT_ID,
  title: "Launch update email",
  createdAt: "2026-03-28T10:00:00.000Z",
  updatedAt: "2026-03-28T10:00:05.000Z",
  lastMessagePreview: "I drafted it and queued it for approval.",
  lastMessageAt: "2026-03-28T10:00:05.000Z",
};

const betaActivityEvent = {
  id: REQUESTED_BY_USER_ID,
  projectId: OTHER_PROJECT_ID,
  projectName: "Beta Expansion",
  eventType: "auto_executed" as const,
  actionType: "task_create",
  displayText: "Created follow-up task for beta rollout",
  reasoning: "The rollout team agreed on a new follow-up task.",
  payload: { title: "Confirm beta rollout checklist" },
  executedAt: "2026-03-28T09:45:00.000Z",
  triggeredBy: "signal" as const,
  chatMessage: null,
  createdAt: "2026-03-28T09:40:00.000Z",
  conversationId: null,
  requestMessageId: null,
  responseMessageId: null,
  requestedByUserId: REQUESTED_BY_USER_ID,
  requestedByName: REQUESTED_BY_NAME,
  approvedByUserId: null,
  approvedByName: null,
  approvedAt: null,
  dismissedByUserId: null,
  dismissedByName: null,
  dismissedAt: null,
  executedByKind: "larry" as const,
  executedByUserId: null,
  executedByName: null,
  executionMode: "auto" as const,
  sourceKind: "meeting",
  sourceRecordId: "meeting-2",
  conversationTitle: null,
  requestMessagePreview: null,
  responseMessagePreview: "I added the follow-up task for the beta rollout.",
};

function createSuggestedEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: EVENT_ID,
    projectId: PROJECT_ID,
    projectName: "Alpha Launch",
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
    requestedByUserId: REQUESTED_BY_USER_ID,
    requestedByName: REQUESTED_BY_NAME,
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
    responseMessagePreview: "I drafted it and queued it for approval.",
    ...overrides,
  };
}

function createAcceptedEvent(suggestedEvent: ReturnType<typeof createSuggestedEvent>) {
  return {
    ...suggestedEvent,
    eventType: "accepted" as const,
    approvedByUserId: suggestedEvent.requestedByUserId,
    approvedByName: REQUESTED_BY_NAME,
    approvedAt: "2026-03-28T10:06:00.000Z",
    executedByKind: "user" as const,
    executedByUserId: suggestedEvent.requestedByUserId,
    executedByName: REQUESTED_BY_NAME,
    executedAt: "2026-03-28T10:06:00.000Z",
  };
}

async function routeWorkspaceShell(page: Page) {
  await page.route("**/api/workspace/projects", async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        items: [alphaProject, betaProject],
      },
    });
  });

  await page.route("**/api/workspace/home", async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        projects: [alphaProject, betaProject],
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
          ...alphaProject,
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
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Enter Dashboard (Dev)" }).click();
  await page.waitForURL("**/workspace");
}

async function routeLegacyLarryEventsReadBoundary(page: Page): Promise<() => number> {
  let legacyEventsReadCount = 0;

  await page.route(/\/api\/workspace\/larry\/events(?:\?.*)?$/, async (route) => {
    legacyEventsReadCount += 1;
    await route.fulfill({
      status: 410,
      json: {
        error:
          "Legacy workspace event-list reads have been retired. Use /api/workspace/projects/:id/action-centre (project) or /api/workspace/larry/action-centre (global).",
      },
    });
  });

  return () => legacyEventsReadCount;
}

test("keeps the global and project action centres in sync for the same suggestion", async ({ page }) => {
  const suggestedEvent = createSuggestedEvent();
  const acceptedEvent = createAcceptedEvent(suggestedEvent);
  const getLegacyEventsReadCount = await routeLegacyLarryEventsReadBoundary(page);

  let globalActionCentre = {
    suggested: [suggestedEvent],
    activity: [betaActivityEvent],
    conversations: [conversationPreview],
  };

  let projectActionCentre = {
    suggested: [suggestedEvent],
    activity: [],
    conversations: [conversationPreview],
  };

  await routeWorkspaceShell(page);

  await page.route("**/api/workspace/larry/action-centre", async (route) => {
    await route.fulfill({
      status: 200,
      json: globalActionCentre,
    });
  });

  await page.route(`**/api/workspace/projects/${PROJECT_ID}/action-centre`, async (route) => {
    await route.fulfill({
      status: 200,
      json: projectActionCentre,
    });
  });

  await page.route(`**/api/workspace/larry/events/${EVENT_ID}/accept`, async (route) => {
    globalActionCentre = {
      ...globalActionCentre,
      suggested: [],
      activity: [acceptedEvent, betaActivityEvent],
    };
    projectActionCentre = {
      ...projectActionCentre,
      suggested: [],
      activity: [acceptedEvent],
    };

    await route.fulfill({
      status: 200,
      json: {
        accepted: true,
        event: acceptedEvent,
      },
    });
  });

  await login(page);

  await page.goto("/workspace/actions");
  await expect(page.getByRole("heading", { name: "Workspace Action Centre" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Alpha Launch" }).last()).toBeVisible();
  await expect(page.getByRole("link", { name: "Beta Expansion" }).last()).toBeVisible();
  await expect(page.getByText("Draft launch update email")).toBeVisible();

  await page.getByRole("link", { name: "Open project" }).first().click();
  await page.waitForURL(`**/workspace/projects/${PROJECT_ID}`);
  await expect(page.getByRole("heading", { name: "Alpha Launch" })).toBeVisible();
  await expect(page.getByText("Draft launch update email")).toBeVisible();
  await expect(page.getByText("Requested by Taylor")).toBeVisible();

  await page.getByRole("button", { name: "Accept" }).click();

  await expect(page.getByText("Accepted by Taylor")).toBeVisible();
  await expect(page.getByText("Accepted", { exact: true })).toBeVisible();

  await page.goto("/workspace/actions");
  await expect(page.getByRole("heading", { name: "Workspace Action Centre" })).toBeVisible();
  await expect(page.getByText("Draft launch update email")).toBeVisible();
  await expect(page.getByText("Accepted by Taylor")).toBeVisible();
  expect(getLegacyEventsReadCount()).toBe(0);
});

test("global action centre linked-chat actions support quick panel and rich chat launches", async ({ page }) => {
  const suggestedEvent = createSuggestedEvent();
  const getLegacyEventsReadCount = await routeLegacyLarryEventsReadBoundary(page);
  const acceptedActivityEvent = createAcceptedEvent(
    createSuggestedEvent({
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      displayText: "Calendar follow-up approved",
      actionType: "calendar_event_create",
      reasoning: "A calendar-origin follow-up was approved and linked to this thread.",
      sourceKind: "calendar",
      sourceRecordId: "calendar-event-1",
      responseMessagePreview: "Marked the calendar follow-up as approved.",
    })
  );

  const globalActionCentre = {
    suggested: [suggestedEvent],
    activity: [acceptedActivityEvent],
    conversations: [conversationPreview],
  };

  await routeWorkspaceShell(page);

  await page.route("**/api/workspace/larry/action-centre", async (route) => {
    await route.fulfill({
      status: 200,
      json: globalActionCentre,
    });
  });

  await page.route("**/api/workspace/larry/conversations", async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        conversations: [conversationPreview],
      },
    });
  });

  await page.route(`**/api/workspace/larry/conversations/${CONVERSATION_ID}/messages`, async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        messages: [
          {
            id: REQUEST_MESSAGE_ID,
            role: "user",
            content: "Draft a launch update email for the team.",
            reasoning: null,
            createdAt: "2026-03-28T10:00:00.000Z",
            actorUserId: REQUESTED_BY_USER_ID,
            actorDisplayName: REQUESTED_BY_NAME,
            linkedActions: [],
          },
          {
            id: RESPONSE_MESSAGE_ID,
            role: "larry",
            content: "I drafted it and queued it for approval.",
            reasoning: null,
            createdAt: "2026-03-28T10:00:05.000Z",
            actorUserId: null,
            actorDisplayName: null,
            linkedActions: [suggestedEvent],
          },
        ],
      },
    });
  });

  await login(page);

  await page.goto("/workspace/actions");
  await expect(page.getByRole("heading", { name: "Workspace Action Centre" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open linked chat" })).toHaveCount(2);
  await expect(page.getByRole("link", { name: "Open in chats" })).toHaveCount(2);

  const suggestedOpenInChats = page.getByRole("link", { name: "Open in chats" }).first();
  await expect(suggestedOpenInChats).toHaveAttribute(
    "href",
    `/workspace/chats?projectId=${PROJECT_ID}&conversationId=${CONVERSATION_ID}&launch=action-centre&sourceKind=chat&eventType=suggested`
  );

  await suggestedOpenInChats.click();
  await page.waitForURL(
    `**/workspace/chats?projectId=${PROJECT_ID}&conversationId=${CONVERSATION_ID}&launch=action-centre&sourceKind=chat&eventType=suggested`
  );
  await expect(page.getByText("Opened from Workspace Action Centre")).toBeVisible();
  await expect(page.getByText("Project: Alpha Launch | Source: Larry chat | Event: Pending approval")).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to Workspace Action Centre" })).toBeVisible();

  await page.getByRole("link", { name: "Back to Workspace Action Centre" }).click();
  await page.waitForURL("**/workspace/actions");

  const activityOpenInChats = page.getByRole("link", { name: "Open in chats" }).nth(1);
  await expect(activityOpenInChats).toHaveAttribute(
    "href",
    `/workspace/chats?projectId=${PROJECT_ID}&conversationId=${CONVERSATION_ID}&launch=action-centre&sourceKind=calendar&eventType=accepted`
  );

  await activityOpenInChats.click();
  await page.waitForURL(
    `**/workspace/chats?projectId=${PROJECT_ID}&conversationId=${CONVERSATION_ID}&launch=action-centre&sourceKind=calendar&eventType=accepted`
  );
  await expect(page.getByText("Opened from Workspace Action Centre")).toBeVisible();
  await expect(page.getByText("Project: Alpha Launch | Source: Calendar signal | Event: Accepted")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Launch update email" })).toBeVisible();
  expect(getLegacyEventsReadCount()).toBe(0);
});

test("dismiss in global action centre removes the suggestion and stays in sync with project view", async ({ page }) => {
  const dismissEventId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const getLegacyEventsReadCount = await routeLegacyLarryEventsReadBoundary(page);
  const suggestedEvent = createSuggestedEvent({
    id: dismissEventId,
    displayText: "Draft partner follow-up email",
    reasoning: "The account team requested a partner-facing follow-up draft.",
    payload: { recipient: "partner@example.com" },
    chatMessage: "Draft a partner follow-up email for this project.",
    requestMessagePreview: "Draft a partner follow-up email for this project.",
    responseMessagePreview: "Queued the partner follow-up email for approval.",
  });

  let globalActionCentre = {
    suggested: [suggestedEvent],
    activity: [betaActivityEvent],
    conversations: [conversationPreview],
  };

  let projectActionCentre = {
    suggested: [suggestedEvent],
    activity: [],
    conversations: [conversationPreview],
  };

  await routeWorkspaceShell(page);

  await page.route("**/api/workspace/larry/action-centre", async (route) => {
    await route.fulfill({
      status: 200,
      json: globalActionCentre,
    });
  });

  await page.route(`**/api/workspace/projects/${PROJECT_ID}/action-centre`, async (route) => {
    await route.fulfill({
      status: 200,
      json: projectActionCentre,
    });
  });

  await page.route(`**/api/workspace/larry/events/${dismissEventId}/dismiss`, async (route) => {
    globalActionCentre = {
      ...globalActionCentre,
      suggested: [],
    };
    projectActionCentre = {
      ...projectActionCentre,
      suggested: [],
    };

    await route.fulfill({
      status: 200,
      json: {
        dismissed: true,
        event: {
          ...suggestedEvent,
          eventType: "dismissed",
          dismissedByUserId: REQUESTED_BY_USER_ID,
          dismissedByName: REQUESTED_BY_NAME,
          dismissedAt: "2026-03-28T10:07:00.000Z",
        },
      },
    });
  });

  await login(page);

  await page.goto("/workspace/actions");
  await expect(page.getByRole("heading", { name: "Workspace Action Centre" })).toBeVisible();
  await expect(page.getByText("Draft partner follow-up email")).toBeVisible();

  await page.getByRole("button", { name: "Dismiss" }).first().click();

  await expect(page.getByText("Nothing waiting for review")).toBeVisible();
  await expect(page.getByText("Draft partner follow-up email")).toHaveCount(0);

  await page.goto(`/workspace/projects/${PROJECT_ID}`);
  await expect(page.getByRole("heading", { name: "Alpha Launch" })).toBeVisible();
  await expect(page.getByText("No pending Larry actions for this project.")).toBeVisible();
  await expect(page.getByText("Draft partner follow-up email")).toHaveCount(0);
  expect(getLegacyEventsReadCount()).toBe(0);
});

test("global action centre picks up new cross-project suggestions via background refresh without navigation", async ({
  page,
}) => {
  const alphaSuggestedEvent = createSuggestedEvent();
  const getLegacyEventsReadCount = await routeLegacyLarryEventsReadBoundary(page);
  const betaSuggestedEvent = createSuggestedEvent({
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    projectId: OTHER_PROJECT_ID,
    projectName: "Beta Expansion",
    displayText: "Create beta rollout escalation checklist",
    actionType: "task_create",
    reasoning: "The beta thread surfaced a new escalation checklist requirement.",
    payload: { title: "Create beta rollout escalation checklist" },
    conversationId: null,
    requestMessageId: null,
    responseMessageId: null,
    sourceKind: "meeting",
    sourceRecordId: "meeting-beta-1",
    conversationTitle: null,
    requestMessagePreview: null,
    responseMessagePreview: null,
  });

  let includeBetaSuggestion = false;

  await routeWorkspaceShell(page);

  await page.route("**/api/workspace/larry/action-centre", async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        suggested: includeBetaSuggestion ? [alphaSuggestedEvent, betaSuggestedEvent] : [alphaSuggestedEvent],
        activity: [betaActivityEvent],
        conversations: [conversationPreview],
      },
    });
  });

  await login(page);

  await page.goto("/workspace/actions");
  await expect(page.getByRole("heading", { name: "Workspace Action Centre" })).toBeVisible();
  await expect(page.getByText("Draft launch update email")).toBeVisible();
  await expect(page.getByText("Create beta rollout escalation checklist")).toHaveCount(0);

  includeBetaSuggestion = true;

  await expect(page.getByText("Create beta rollout escalation checklist")).toBeVisible({
    timeout: 15_000,
  });
  expect(getLegacyEventsReadCount()).toBe(0);
});
