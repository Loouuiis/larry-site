import { expect, test } from "@playwright/test";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const MEETING_ID = "22222222-2222-4222-8222-222222222222";
const EVENT_ID = "33333333-3333-4333-8333-333333333333";

test("queues transcript intake and surfaces non-chat meeting provenance in the project action centre", async ({
  page,
}) => {
  let transcriptQueued = false;

  const project = {
    id: PROJECT_ID,
    name: "Alpha Launch",
    description: "Prepare the April launch communications.",
    status: "active",
    riskLevel: "medium",
    targetDate: "2026-04-30",
    updatedAt: "2026-03-29T10:00:00.000Z",
  };

  const meetingEvent = {
    id: EVENT_ID,
    projectId: PROJECT_ID,
    eventType: "suggested" as const,
    actionType: "task_create",
    displayText: "Create launch follow-up task",
    reasoning: "The meeting captured a new follow-up for the launch plan.",
    payload: { title: "Follow up on launch prep" },
    executedAt: null,
    triggeredBy: "signal" as const,
    chatMessage: null,
    createdAt: "2026-03-29T10:05:00.000Z",
    conversationId: null,
    requestMessageId: null,
    responseMessageId: null,
    requestedByUserId: "44444444-4444-4444-8444-444444444444",
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
    sourceKind: "meeting",
    sourceRecordId: MEETING_ID,
    conversationTitle: null,
    requestMessagePreview: null,
    responseMessagePreview: null,
  };

  await page.route("**/api/workspace/projects", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 200,
        json: { id: PROJECT_ID },
      });
      return;
    }

    await route.fulfill({
      status: 200,
      json: {
        items: [project],
      },
    });
  });

  await page.route("**/api/workspace/home", async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        projects: [project],
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

  await page.route("**/api/workspace/meetings/overview", async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        projects: [project],
        meetings: transcriptQueued
          ? [
              {
                id: MEETING_ID,
                title: "Launch sync",
                summary: null,
                actionCount: 0,
                meetingDate: null,
                createdAt: "2026-03-29T10:05:00.000Z",
                projectId: PROJECT_ID,
                agentRunId: null,
                agentRunState: null,
              },
            ]
          : [],
      },
    });
  });

  await page.route("**/api/workspace/meetings/transcript", async (route) => {
    transcriptQueued = true;
    await route.fulfill({
      status: 202,
      json: {
        accepted: true,
        canonicalEventId: "55555555-5555-4555-8555-555555555555",
        meetingNoteId: MEETING_ID,
      },
    });
  });

  await page.route(`**/api/workspace/projects/${PROJECT_ID}/overview`, async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        project: {
          ...project,
          completionRate: 45,
        },
        tasks: [
          {
            id: "66666666-6666-4666-8666-666666666666",
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
          blockedCount: 0,
          avgRiskScore: 35,
          riskLevel: "medium",
        },
        outcomes: {
          narrative: "Launch prep is moving and meeting-led follow-up is now queued for review.",
        },
        meetings: transcriptQueued
          ? [
              {
                id: MEETING_ID,
                title: "Launch sync",
                summary: "The team agreed on one launch follow-up and one communications checkpoint.",
                actionCount: 1,
                meetingDate: null,
                createdAt: "2026-03-29T10:05:00.000Z",
                projectId: PROJECT_ID,
                agentRunId: null,
                agentRunState: null,
              },
            ]
          : [],
      },
    });
  });

  await page.route(`**/api/workspace/projects/${PROJECT_ID}/action-centre`, async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        suggested: transcriptQueued ? [meetingEvent] : [],
        activity: [],
        conversations: [],
      },
    });
  });

  await page.goto("/login");
  await page.getByRole("button", { name: "Enter Dashboard (Dev)" }).click();
  await page.waitForURL("**/workspace");

  await page.goto("/workspace/meetings");
  await page.getByPlaceholder("Paste meeting transcript here... (minimum 20 characters)").fill(
    "Weekly launch sync transcript with concrete follow-up items for communications and approvals."
  );
  await page.getByRole("button", { name: "Queue transcript" }).click();

  await expect(page.getByText("Transcript queued")).toBeVisible();
  await expect(page.getByText("Queued", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /View project/ }).click();
  await page.waitForURL(`**/workspace/projects/${PROJECT_ID}`);

  await expect(page.getByText("Create launch follow-up task")).toBeVisible();
  await expect(page.getByText("Origin: Meeting transcript")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open linked chat" })).toHaveCount(0);
});
