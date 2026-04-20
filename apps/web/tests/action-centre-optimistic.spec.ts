import { expect, test, type Page } from "@playwright/test";

// Latency smoke for the withOptimistic pattern applied to Action Centre.
// Delays the /accept endpoint by 2s and asserts the suggestion's DOM row
// disappears within 500ms of the click — which is only possible if the
// optimistic cache update is applied before the network response lands.
//
// Pre-migration behaviour would keep the row visible for the full 2s + the
// subsequent refetch round-trip.

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const CONVERSATION_ID = "22222222-2222-4222-8222-222222222222";
const REQUEST_MESSAGE_ID = "33333333-3333-4333-8333-333333333333";
const RESPONSE_MESSAGE_ID = "44444444-4444-4444-8444-444444444444";
const EVENT_ID = "55555555-5555-4555-8555-555555555555";
const REQUESTED_BY_USER_ID = "66666666-6666-4666-8666-666666666666";

const SUGGESTION_TEXT = "Draft launch update email";

const alphaProject = {
  id: PROJECT_ID,
  name: "Alpha Launch",
  description: "Prepare the April launch communications.",
  status: "active",
  riskLevel: "medium",
  targetDate: "2026-04-30",
  updatedAt: "2026-03-28T10:00:00.000Z",
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

function createSuggestedEvent() {
  return {
    id: EVENT_ID,
    projectId: PROJECT_ID,
    projectName: "Alpha Launch",
    eventType: "suggested" as const,
    actionType: "email_draft",
    displayText: SUGGESTION_TEXT,
    reasoning: "The launch milestone is coming up.",
    payload: { recipient: "team@example.com" },
    executedAt: null,
    triggeredBy: "chat" as const,
    chatMessage: "Draft a launch update email for the team.",
    createdAt: "2026-03-28T10:00:05.000Z",
    conversationId: CONVERSATION_ID,
    requestMessageId: REQUEST_MESSAGE_ID,
    responseMessageId: RESPONSE_MESSAGE_ID,
    requestedByUserId: REQUESTED_BY_USER_ID,
    requestedByName: "Taylor",
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
  };
}

async function routeWorkspaceShell(page: Page) {
  await page.route("**/api/workspace/projects", async (route) => {
    await route.fulfill({ status: 200, json: { items: [alphaProject] } });
  });
  await page.route("**/api/workspace/home", async (route) => {
    await route.fulfill({
      status: 200,
      json: { projects: [alphaProject], tasks: [], connectors: {} },
    });
  });
  await page.route("**/api/workspace/larry/briefing", async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        briefing: { greeting: "Good morning, Taylor.", projects: [], totalNeedsYou: 0 },
      },
    });
  });
  await page.route(`**/api/workspace/projects/${PROJECT_ID}/overview`, async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        project: { ...alphaProject, completionRate: 45 },
        tasks: [],
        timeline: null,
        health: { completionRate: 45, blockedCount: 0, avgRiskScore: 30, riskLevel: "low" },
        outcomes: { narrative: "On track." },
        meetings: [],
      },
    });
  });
}

async function login(page: Page) {
  // POST /api/auth/dev-login directly — the login page no longer renders a
  // dev-bypass button, but the route still honours ALLOW_DEV_AUTH_BYPASS
  // (set in playwright.config.ts webServer env).
  const response = await page.request.post("/api/auth/dev-login");
  if (!response.ok()) {
    throw new Error(`dev-login failed: ${response.status()} ${await response.text()}`);
  }
}

test("accept removes the suggestion from the DOM within 500ms even when /accept takes 2s", async ({
  page,
}) => {
  const suggestedEvent = createSuggestedEvent();

  // action-centre endpoint: first returns the suggestion, subsequent calls
  // (triggered by the reconcile's invalidateQueries after accept settles)
  // return empty.
  let acceptSettled = false;
  await page.route(`**/api/workspace/projects/${PROJECT_ID}/action-centre`, async (route) => {
    await route.fulfill({
      status: 200,
      json: acceptSettled
        ? { suggested: [], activity: [], conversations: [conversationPreview] }
        : { suggested: [suggestedEvent], activity: [], conversations: [conversationPreview] },
    });
  });

  // Same idea for the global action centre (in case the shell prefetches it).
  await page.route("**/api/workspace/larry/action-centre", async (route) => {
    await route.fulfill({
      status: 200,
      json: acceptSettled
        ? { suggested: [], activity: [], conversations: [conversationPreview] }
        : { suggested: [suggestedEvent], activity: [], conversations: [conversationPreview] },
    });
  });

  // The key delay: /accept responds 2s after the request comes in.
  await page.route(`**/api/workspace/larry/events/${EVENT_ID}/accept`, async (route) => {
    await new Promise((r) => setTimeout(r, 2000));
    acceptSettled = true;
    await route.fulfill({
      status: 200,
      json: {
        accepted: true,
        event: {
          ...suggestedEvent,
          eventType: "accepted",
          approvedAt: new Date().toISOString(),
        },
      },
    });
  });

  await routeWorkspaceShell(page);
  await login(page);

  await page.goto("/workspace/actions");
  await expect(
    page.getByRole("heading", { name: "Workspace Action Centre" }),
  ).toBeVisible();
  await expect(page.getByText(SUGGESTION_TEXT)).toBeVisible();

  const clickedAt = Date.now();
  await page.getByRole("button", { name: "Accept" }).first().click();

  // The proof: the suggestion text must be gone within 500ms — before the 2s
  // /accept response can possibly have returned. Optimistic cache edit wins.
  await expect(page.getByText(SUGGESTION_TEXT)).toBeHidden({ timeout: 500 });
  const removalLatencyMs = Date.now() - clickedAt;
  // Sanity: the DOM removal happened WELL before the /accept response.
  expect(removalLatencyMs).toBeLessThan(1500);

  // Let the delayed accept response settle so the test exits cleanly.
  await page.waitForTimeout(2200);
});
