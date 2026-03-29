import { expect, test, type Page } from "@playwright/test";

const PROJECT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const PROJECT_LIST = {
  items: [
    {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      name: "Existing workspace project",
      description: "Existing project for shell hydration.",
      status: "active",
      riskLevel: "low",
      targetDate: "2026-06-01",
      updatedAt: "2026-03-29T09:00:00.000Z",
    },
  ],
};

const CHAT_ANSWERS = [
  "Alpha Launch",
  "Deliver coordinated launch readiness across product and comms.",
  "Target milestone is May 20.",
  "Finalize messaging, align launch checklist, prep stakeholder update.",
  "Risk: delayed design assets from external partner.",
];

function expectSeedMessageShape(message: string) {
  expect(message).toContain("I just created a new project from guided intake answers.");
  expect(message).toContain("Project name: Alpha Launch");
  expect(message).toContain("Outcome: Deliver coordinated launch readiness across product and comms.");
  expect(message).toContain("Milestone: Target milestone is May 20.");
}

async function completeIntakeChat(page: Page) {
  for (let index = 0; index < CHAT_ANSWERS.length; index++) {
    await page.getByPlaceholder("Type your answer here...").fill(CHAT_ANSWERS[index]);
    await page.getByRole("button", { name: index === CHAT_ANSWERS.length - 1 ? "Create project" : "Next answer" }).click();
  }
}

async function selectChatIntakeMode(page: Page) {
  await page.getByRole("button", { name: "Build the project with Larry" }).click();
  await expect(page.getByPlaceholder("Type your answer here...")).toBeVisible();
}

test("workspace intake chat creates project, seeds canonical chat, and avoids legacy write endpoints", async ({ page }) => {
  let projectCreateCount = 0;
  let legacyConversationWriteCount = 0;
  let legacyMessageWriteCount = 0;
  let seedCallCount = 0;
  let seededMessage: string | null = null;

  await page.route("**/api/workspace/projects", async (route) => {
    const method = route.request().method();
    if (method === "POST") {
      projectCreateCount += 1;
      await route.fulfill({
        status: 200,
        json: { id: PROJECT_ID },
      });
      return;
    }

    await route.fulfill({ status: 200, json: PROJECT_LIST });
  });

  await page.route("**/api/workspace/larry/chat", async (route) => {
    seedCallCount += 1;
    const payload = route.request().postDataJSON() as { projectId: string; message: string };
    expect(payload.projectId).toBe(PROJECT_ID);
    seededMessage = payload.message;

    await route.fulfill({
      status: 200,
      json: {
        conversationId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        message: "Seeded.",
        userMessage: {
          id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          role: "user",
          content: payload.message,
          reasoning: null,
          createdAt: "2026-03-29T10:00:00.000Z",
          actorUserId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
          actorDisplayName: "Taylor",
          linkedActions: [],
        },
        assistantMessage: {
          id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
          role: "larry",
          content: "Seeded.",
          reasoning: null,
          createdAt: "2026-03-29T10:00:01.000Z",
          actorUserId: null,
          actorDisplayName: null,
          linkedActions: [],
        },
        linkedActions: [],
        actionsExecuted: 0,
        suggestionCount: 0,
      },
    });
  });

  await page.route("**/api/workspace/larry/conversations", async (route) => {
    if (route.request().method() === "POST") legacyConversationWriteCount += 1;
    await route.fulfill({ status: 200, json: { conversations: [] } });
  });

  await page.route("**/api/workspace/larry/conversations/**/messages", async (route) => {
    if (route.request().method() === "POST") legacyMessageWriteCount += 1;
    await route.fulfill({ status: 200, json: { messages: [] } });
  });

  await page.goto("/login");
  await page.getByRole("button", { name: "Enter Dashboard (Dev)" }).click();
  await page.waitForURL("**/workspace");

  await page.goto("/workspace/projects/new");
  await expect(page.getByRole("heading", { name: "Start a project on the workspace path" })).toBeVisible();
  await selectChatIntakeMode(page);

  await completeIntakeChat(page);

  await expect(page.getByText("Alpha Launch is ready")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open project" })).toBeVisible();

  expect(projectCreateCount).toBe(1);
  expect(seedCallCount).toBe(1);
  expect(legacyConversationWriteCount).toBe(0);
  expect(legacyMessageWriteCount).toBe(0);
  expect(seededMessage).not.toBeNull();
  expectSeedMessageShape(seededMessage ?? "");

  await page.getByRole("button", { name: "Open project" }).click();
  await page.waitForURL(`**/workspace/projects/${PROJECT_ID}`);
});

test("workspace intake chat still succeeds when canonical chat seeding fails", async ({ page }) => {
  await page.route("**/api/workspace/projects", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 200,
        json: { id: PROJECT_ID },
      });
      return;
    }

    await route.fulfill({ status: 200, json: PROJECT_LIST });
  });

  await page.route("**/api/workspace/larry/chat", async (route) => {
    await route.fulfill({
      status: 503,
      json: { error: "Temporary model outage." },
    });
  });

  await page.goto("/login");
  await page.getByRole("button", { name: "Enter Dashboard (Dev)" }).click();
  await page.waitForURL("**/workspace");

  await page.goto("/workspace/projects/new");
  await selectChatIntakeMode(page);
  await completeIntakeChat(page);

  await expect(page.getByText("Alpha Launch is ready")).toBeVisible();
  await expect(page.getByText("The project is live, but intake context was not auto-seeded in Larry chat.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open project" })).toBeVisible();
});
