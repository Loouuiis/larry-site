import { expect, test, type Page } from "@playwright/test";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const PLAN_ID = "22222222-2222-4222-8222-222222222222";
const REVISION_ID = "33333333-3333-4333-8333-333333333333";
const ROOT_NODE_ID = "44444444-4444-4444-8444-444444444444";
const CHILD_NODE_ID = "55555555-5555-4555-8555-555555555555";
const LEAF_NODE_ID = "66666666-6666-4666-8666-666666666666";
const USER_ID = "77777777-7777-4777-8777-777777777777";
const USER_2_ID = "88888888-8888-4888-8888-888888888888";
const DEPENDENCY_ID = "99999999-9999-4999-8999-999999999999";
const BRANCH_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OPERATION_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const project = {
  id: PROJECT_ID,
  name: "Neural Integration",
  description: "Coordinate a cross-functional project on the v2 planning surface.",
  status: "active",
  riskLevel: "medium",
  targetDate: "2026-05-28",
  updatedAt: "2026-05-04T09:00:00.000Z",
};

const teamMembers = [
  {
    userId: USER_ID,
    name: "Philip",
    email: "philip@example.com",
    tenantRole: "pm",
    projectRole: "owner",
  },
  {
    userId: USER_2_ID,
    name: "Ada",
    email: "ada@example.com",
    tenantRole: "member",
    projectRole: "editor",
  },
];

function node(overrides: Record<string, unknown>) {
  return {
    id: ROOT_NODE_ID,
    planId: PLAN_ID,
    parentId: null,
    kind: "group",
    title: "Coordination layer",
    description: null,
    status: "not_started",
    priority: "medium",
    startDate: "2026-05-06",
    dueDate: "2026-05-09",
    sortOrder: 0,
    actionRequired: { required: false, note: null },
    assignees: [],
    rollup: {
      healthStatus: "blocked",
      priority: "critical",
      startDate: "2026-05-06",
      dueDate: "2026-05-20",
      assignees: [
        { userId: USER_2_ID, name: "Ada", email: "ada@example.com" },
        { userId: USER_ID, name: "Philip", email: "philip@example.com" },
      ],
      actionRequiredCount: 1,
      dependencyWarningCount: 1,
      descendantCount: 2,
    },
    children: [],
    createdAt: "2026-05-04T08:00:00.000Z",
    updatedAt: "2026-05-04T09:00:00.000Z",
    ...overrides,
  };
}

const leafNode = node({
  id: LEAF_NODE_ID,
  parentId: CHILD_NODE_ID,
  kind: "milestone",
  title: "Ground truth review",
  status: "waiting",
  priority: "critical",
  startDate: "2026-05-18",
  dueDate: "2026-05-20",
  actionRequired: { required: true, note: "Confirm source of truth before launch." },
  assignees: [{ userId: USER_2_ID, name: "Ada", email: "ada@example.com" }],
  rollup: {
    healthStatus: "blocked",
    priority: "critical",
    startDate: "2026-05-18",
    dueDate: "2026-05-20",
    assignees: [{ userId: USER_2_ID, name: "Ada", email: "ada@example.com" }],
    actionRequiredCount: 1,
    dependencyWarningCount: 1,
    descendantCount: 0,
  },
  children: [],
});

const childNode = node({
  id: CHILD_NODE_ID,
  parentId: ROOT_NODE_ID,
  kind: "task",
  title: "Autonomous coordination",
  status: "in_progress",
  priority: "high",
  startDate: "2026-05-10",
  dueDate: "2026-05-17",
  assignees: [{ userId: USER_ID, name: "Philip", email: "philip@example.com" }],
  rollup: {
    healthStatus: "blocked",
    priority: "critical",
    startDate: "2026-05-10",
    dueDate: "2026-05-20",
    assignees: [
      { userId: USER_2_ID, name: "Ada", email: "ada@example.com" },
      { userId: USER_ID, name: "Philip", email: "philip@example.com" },
    ],
    actionRequiredCount: 1,
    dependencyWarningCount: 1,
    descendantCount: 1,
  },
  children: [leafNode],
});

const rootNode = node({
  children: [childNode],
});

const branch = {
  id: BRANCH_ID,
  projectId: PROJECT_ID,
  planId: PLAN_ID,
  title: "Timeline 2 AI proposal",
  summary: "AI branch from: Add permit review",
  status: "open",
  baseRevisionId: REVISION_ID,
  baseSnapshot: { nodes: [], dependencies: [] },
  proposedSnapshot: { nodes: [], dependencies: [] },
  operationCounts: { total: 1, pending: 1, applied: 0, rejected: 0 },
  operations: [
    {
      id: OPERATION_ID,
      branchId: BRANCH_ID,
      operationType: "create_node",
      targetNodeId: null,
      dependencyId: null,
      before: null,
      after: {
        kind: "task",
        title: "Permit review",
        status: "not_started",
        priority: "medium",
      },
      rationale: "The v2 AI keeps the proposed task in a reviewable branch.",
      status: "pending",
      sortOrder: 0,
      createdAt: "2026-05-04T09:10:00.000Z",
      updatedAt: "2026-05-04T09:10:00.000Z",
    },
  ],
  createdAt: "2026-05-04T09:10:00.000Z",
  updatedAt: "2026-05-04T09:10:00.000Z",
};

function timeline2Snapshot() {
  return {
    projectId: PROJECT_ID,
    generatedAt: "2026-05-04T09:15:00.000Z",
    plan: {
      id: PLAN_ID,
      projectId: PROJECT_ID,
      createdAt: "2026-05-04T08:00:00.000Z",
      updatedAt: "2026-05-04T09:00:00.000Z",
    },
    activeRevision: {
      id: REVISION_ID,
      revisionNumber: 2,
      reason: "Human edited Timeline 2",
      createdAt: "2026-05-04T09:00:00.000Z",
      createdByUserId: USER_ID,
    },
    tree: [rootNode],
    nodes: [rootNode, childNode, leafNode],
    dependencies: [
      {
        id: DEPENDENCY_ID,
        fromNodeId: CHILD_NODE_ID,
        toNodeId: LEAF_NODE_ID,
        relation: "finish_to_start",
        createdAt: "2026-05-04T09:00:00.000Z",
      },
    ],
    teamMembers,
    openBranches: [branch],
  };
}

async function routeWorkspace(page: Page) {
  let aiStreamCalls = 0;
  let legacyLarryCalls = 0;

  await page.route("**/api/workspace/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (path.startsWith("/api/workspace/larry/") && !path.includes("/briefing")) {
      legacyLarryCalls += 1;
    }

    if (path === "/api/workspace/projects") {
      await route.fulfill({ status: 200, json: { items: [project] } });
      return;
    }

    if (path === "/api/workspace/home") {
      await route.fulfill({
        status: 200,
        json: { projects: [project], tasks: [], connectors: {} },
      });
      return;
    }

    if (path === "/api/workspace/notifications" || path === "/api/workspace/notifications/feed") {
      await route.fulfill({ status: 200, json: { items: [], notifications: [], unreadCount: 0 } });
      return;
    }

    if (path === "/api/workspace/larry/briefing") {
      await route.fulfill({
        status: 200,
        json: { briefing: { greeting: "Good morning.", projects: [], totalNeedsYou: 0 } },
      });
      return;
    }

    if (path === `/api/workspace/projects/${PROJECT_ID}/overview`) {
      await route.fulfill({
        status: 200,
        json: {
          project,
          tasks: [],
          timeline: null,
          health: { completionRate: 0, blockedCount: 0, avgRiskScore: 20, riskLevel: "low" },
          outcomes: { narrative: "The v2 planning surface is ready for review." },
          meetings: [],
        },
      });
      return;
    }

    if (path === `/api/workspace/projects/${PROJECT_ID}/members`) {
      await route.fulfill({
        status: 200,
        json: { projectId: PROJECT_ID, currentUserRole: "owner", canManage: true, members: teamMembers },
      });
      return;
    }

    if (path === `/api/workspace/projects/${PROJECT_ID}/action-centre`) {
      await route.fulfill({ status: 200, json: { suggested: [], activity: [], conversations: [] } });
      return;
    }

    if (path === `/api/workspace/projects/${PROJECT_ID}/memory`) {
      await route.fulfill({ status: 200, json: { items: [] } });
      return;
    }

    if (path === `/api/workspace/timeline2/projects/${PROJECT_ID}/ensure` && method === "POST") {
      await route.fulfill({ status: 200, json: { planId: PLAN_ID } });
      return;
    }

    if (path === `/api/workspace/timeline2/projects/${PROJECT_ID}/snapshot`) {
      await route.fulfill({ status: 200, json: timeline2Snapshot() });
      return;
    }

    if (path === `/api/workspace/timeline2/projects/${PROJECT_ID}/ai2/chat/stream` && method === "POST") {
      aiStreamCalls += 1;
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
        body: [
          `data: ${JSON.stringify({ type: "token", delta: "I read the Timeline 2 JSON snapshot. " })}`,
          `data: ${JSON.stringify({ type: "branch_created", branch })}`,
          `data: ${JSON.stringify({ type: "done", message: "Timeline 2 AI proposal created." })}`,
          "",
        ].join("\n\n"),
      });
      return;
    }

    await route.fulfill({ status: 200, json: {} });
  });

  return {
    aiStreamCalls: () => aiStreamCalls,
    legacyLarryCalls: () => legacyLarryCalls,
  };
}

async function login(page: Page): Promise<boolean> {
  const response = await page.request.post("/api/auth/dev-login");
  if (response.ok()) {
    await page.goto("/workspace");
    await page.waitForURL("**/workspace");
    return true;
  }

  await page.goto("/auth/login");
  const devLoginButton = page.getByRole("button", { name: /dev login/i });
  if (await devLoginButton.count()) {
    await devLoginButton.first().click();
    await page.waitForURL("**/workspace");
    return true;
  }

  return false;
}

test("Timeline 2 and Task Center 2 render isolated v2 data and the v2 AI panel", async ({ page }) => {
  const counters = await routeWorkspace(page);
  test.skip(
    !(await login(page)),
    "The running Playwright server does not have ALLOW_DEV_AUTH_BYPASS enabled.",
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/workspace/projects/${PROJECT_ID}?tab=tasks2`);
  await expect(page.getByText("Task Center 2").first()).toBeVisible();
  await expect(page.getByText("Workflow status stays manual")).toBeVisible();
  await expect(page.getByPlaceholder("Add a task...")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create rich sample" })).toHaveCount(0);
  await expect(page.getByText("Task outline", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Outline", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Status", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "People", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "New workstream" })).toBeVisible();
  await expect(page.getByRole("button", { name: "New task" })).toBeVisible();
  await expect(page.getByRole("button", { name: "New milestone" })).toBeVisible();
  await expect(page.locator("select")).toHaveCount(1);
  await expect(page.getByText("Coordination layer").first()).toBeVisible();
  await expect(page.getByText("1", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("1.1", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Autonomous coordination").first()).toBeVisible();
  await expect(page.getByText("Ada").first()).toBeVisible();
  await page.getByRole("button", { name: "New workstream" }).click();
  await expect(page.getByText("Create a planning item")).toBeVisible();
  await expect(page.locator("select").first()).toHaveValue("group");
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.screenshot({ path: "test-results/task-center-2-mobile.png", fullPage: true });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/workspace/projects/${PROJECT_ID}?tab=timeline2`);
  await expect(page.getByText("Timeline 2").first()).toBeVisible();
  await expect(page.getByText("Workflow status stays manual")).toHaveCount(0);
  await expect(page.getByPlaceholder("Add a task...")).toHaveCount(0);
  await expect(page.getByText("AI proposal review")).toHaveCount(0);
  await expect(page.getByText("Task", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Workflow", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Signals", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Health: Blocked")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit dependencies" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reset layout" })).toBeVisible();
  await expect(page.getByText("Autonomous coordination").first()).toBeVisible();
  await expect(page.getByText("Ground truth review").first()).toBeVisible();
  await page.getByText("Autonomous coordination").first().click();
  await expect(page.getByText("Edit planning item")).toBeVisible();
  await page.getByRole("button", { name: "Edit dependencies on Timeline 2" }).click();
  await expect(page.getByText("Dependencies for Autonomous coordination")).toBeVisible();
  await expect(page.getByText("Click one target to add, remove, or replace that single relationship.")).toBeVisible();
  await page.screenshot({ path: "test-results/timeline-2-desktop.png", fullPage: true });

  await page.getByRole("button", { name: "AI" }).first().click();
  await expect(page.getByText("Structured planner with reviewable branches")).toBeVisible();
  await page.getByPlaceholder("Ask Timeline 2 AI 2...").fill("Add permit review");
  await page.getByPlaceholder("Ask Timeline 2 AI 2...").press("Enter");
  await expect(page.getByText("Created branch: Timeline 2 AI proposal")).toBeVisible();

  expect(counters.aiStreamCalls()).toBe(1);
  expect(counters.legacyLarryCalls()).toBe(0);
});
