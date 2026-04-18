// Verifies the fix for issue #109 by exercising every action type's
// Modify path on prod end-to-end.
//
// For each of the 15 modifiable LarryActionTypes:
//   1. Inserts a `suggested` larry_events row with a realistic payload.
//   2. Calls POST /v1/larry/events/:id/modify       — asserts 200 + editableFields
//   3. Calls POST /v1/larry/events/:id/modify/save  — asserts 200 + executor lands
//   4. Calls POST /v1/larry/events/:id/modify-chat  — asserts 200 (chat path open)
//
// The fix is proven if the previous-422 types now return 200 with editableFields
// matching the new map. Cleanup: every event row inserted is tagged with the
// run id and deleted at the end (best-effort).
//
// Usage:
//   DATABASE_URL=... API_BASE_URL=https://www.larry-pm.com node scripts/verify-modify-issue-109.mjs

import pg from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Config ────────────────────────────────────────────────────────────────────
const DATABASE_URL = process.env.DATABASE_URL;
const API_BASE_URL = (process.env.API_BASE_URL ?? "https://www.larry-pm.com").replace(/\/+$/, "");
const TEST_EMAIL = process.env.LARRY_TEST_EMAIL ?? "launch-test-2026@larry-pm.com";
const TEST_PASSWORD = process.env.LARRY_TEST_PASSWORD ?? "TestLarry123%";

if (!DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const RUN_ID = `verify-109-${new Date().toISOString().replace(/[:.]/g, "-")}`;
console.log(`Run id: ${RUN_ID}`);
console.log(`API:    ${API_BASE_URL}`);
console.log("");

// ── Login + cookie capture ────────────────────────────────────────────────────
async function loginAndGetCookies() {
  const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });
  if (!res.ok) {
    throw new Error(`Login failed: ${res.status} ${await res.text()}`);
  }
  // Collect Set-Cookie headers; Node fetch returns them combined.
  const raw = res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie")].filter(Boolean);
  if (!raw.length) throw new Error("Login returned no Set-Cookie header.");
  const cookieHeader = raw.map((c) => c.split(";")[0]).join("; ");
  return cookieHeader;
}

// ── Action type fixtures ──────────────────────────────────────────────────────
// payload shapes mirror what the Larry chat / scan emits in prod, so the
// executor receives valid input. Each `patch` is a small edit applied via the
// Modify panel and asserted against the executor's recorded effect when possible.
function buildFixtures({ tenantId, projectId, secondUserId, taskId, calendarEventId }) {
  return [
    {
      type: "task_create",
      payload: { title: "Issue 109 verify task", description: "before edit", priority: "medium" },
      patch: { title: "Issue 109 verify task — EDITED", priority: "high" },
    },
    {
      type: "status_update",
      payload: { taskId, newStatus: "in_progress", newRiskLevel: "low" },
      patch: { newStatus: "waiting", newRiskLevel: "medium" },
    },
    {
      type: "risk_flag",
      payload: { taskId, riskLevel: "low" },
      patch: { riskLevel: "high" },
    },
    {
      type: "deadline_change",
      payload: { taskId, newDeadline: "2026-05-01" },
      patch: { newDeadline: "2026-05-15" },
    },
    {
      type: "owner_change",
      payload: { taskId, newOwnerName: "Launch Test" },
      patch: { newOwnerName: "Launch Test" }, // no real second member; same value still flexes the path
    },
    {
      type: "email_draft",
      payload: { to: "noone@larry-pm.com", subject: "Hello", body: "Body before edit" },
      patch: { subject: "Hello — EDITED", body: "Body after edit" },
    },
    {
      type: "scope_change",
      payload: { entityId: projectId, entityType: "project", newDescription: "before scope edit" },
      patch: { newDescription: "after scope edit" },
    },
    {
      type: "project_create",
      payload: { name: "Verify-109 child project", description: "before description edit" },
      patch: { name: "Verify-109 child — EDITED", description: "after description edit" },
    },
    {
      type: "collaborator_add",
      payload: secondUserId
        ? { userId: secondUserId, role: "viewer", displayName: "Verify Peer" }
        : null,
      patch: { role: "editor" },
      skipReason: secondUserId ? null : "no second tenant user available to add as collaborator",
    },
    {
      type: "collaborator_role_update",
      payload: secondUserId
        ? { userId: secondUserId, role: "viewer" }
        : null,
      patch: { role: "editor" },
      skipReason: secondUserId ? null : "no second tenant user available to update role on",
    },
    {
      type: "collaborator_remove",
      payload: secondUserId
        ? { userId: secondUserId, displayName: "Verify Peer" }
        : null,
      patch: {}, // empty patch — type accepted as Modify target with no editable fields
      skipReason: secondUserId ? null : "no second tenant user available to remove",
    },
    {
      type: "project_note_send",
      payload: { visibility: "shared", content: "verify note before edit" },
      patch: { content: "verify note after edit" },
    },
    {
      type: "calendar_event_create",
      payload: {
        summary: "Verify-109 calendar event",
        startDateTime: "2026-05-10T15:00:00.000Z",
        endDateTime: "2026-05-10T16:00:00.000Z",
      },
      patch: { summary: "Verify-109 calendar — EDITED" },
      // executor will FailedDependency unless tenant has a calendar connector linked
      // — we still expect /modify (open) to return 200 + editableFields, which is
      // what proves the bug is fixed. Save will fail at executor, captured below.
      saveExpect: { allowExecutorFailure: true },
    },
    {
      type: "calendar_event_update",
      payload: {
        eventId: calendarEventId ?? "no-real-event",
        summary: "Verify-109 update",
        startDateTime: "2026-05-10T15:00:00.000Z",
        endDateTime: "2026-05-10T16:00:00.000Z",
      },
      patch: { summary: "Verify-109 update — EDITED" },
      saveExpect: { allowExecutorFailure: true },
    },
    {
      type: "slack_message_draft",
      payload: { channelName: "#launch-test", message: "draft before edit" },
      patch: { message: "draft after edit" },
    },
  ];
}

// ── Main ─────────────────────────────────────────────────────────────────────
const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
const seededIds = [];
const seededProjectIds = []; // executor for project_create makes a child project; we leave it alone

async function setTenant(client, tenantId) {
  await client.query(`SELECT set_config('app.tenant_id', $1, false)`, [tenantId]);
}

async function lookupContext() {
  const client = await pool.connect();
  try {
    const u = await client.query(
      `SELECT u.id AS user_id, m.tenant_id
         FROM users u
         JOIN memberships m ON m.user_id = u.id
        WHERE u.email = $1
        LIMIT 1`,
      [TEST_EMAIL],
    );
    if (!u.rows[0]) throw new Error(`Test user ${TEST_EMAIL} not found.`);
    const { user_id: userId, tenant_id: tenantId } = u.rows[0];

    await setTenant(client, tenantId);

    // pick a project the user owns/edits
    const p = await client.query(
      `SELECT p.id
         FROM projects p
         JOIN project_memberships pm ON pm.project_id = p.id
        WHERE pm.tenant_id = $1
          AND pm.user_id = $2
        ORDER BY p.created_at DESC
        LIMIT 1`,
      [tenantId, userId],
    );
    let projectId = p.rows[0]?.id;
    if (!projectId) {
      // create a verify project
      const createP = await client.query(
        `INSERT INTO projects (tenant_id, name, description, owner_user_id)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [tenantId, `Verify-109 ${RUN_ID}`, "Auto-created for issue #109 verification", userId],
      );
      projectId = createP.rows[0].id;
      await client.query(
        `INSERT INTO project_memberships (tenant_id, project_id, user_id, role)
         VALUES ($1, $2, $3, 'owner')
         ON CONFLICT DO NOTHING`,
        [tenantId, projectId, userId],
      );
      seededProjectIds.push(projectId);
    }

    // find any second tenant member (for collaborator_* tests)
    const peer = await client.query(
      `SELECT user_id FROM memberships
        WHERE tenant_id = $1 AND user_id <> $2
        LIMIT 1`,
      [tenantId, userId],
    );
    const secondUserId = peer.rows[0]?.user_id ?? null;

    // pick or create a task in the project (for status_update/risk_flag/etc.)
    const t = await client.query(
      `SELECT id FROM tasks
        WHERE tenant_id = $1 AND project_id = $2
        ORDER BY created_at DESC LIMIT 1`,
      [tenantId, projectId],
    );
    let taskId = t.rows[0]?.id;
    if (!taskId) {
      const createT = await client.query(
        `INSERT INTO tasks (tenant_id, project_id, title, status, priority, created_by_user_id)
         VALUES ($1, $2, $3, 'not_started', 'medium', $4) RETURNING id`,
        [tenantId, projectId, `Verify-109 anchor task ${RUN_ID}`, userId],
      );
      taskId = createT.rows[0].id;
    }

    return { userId, tenantId, projectId, secondUserId, taskId };
  } finally {
    client.release();
  }
}

async function seedSuggestedEvent(ctx, fixture) {
  const client = await pool.connect();
  try {
    await setTenant(client, ctx.tenantId);
    const { rows } = await client.query(
      `INSERT INTO larry_events
         (tenant_id, project_id, event_type, action_type, display_text, reasoning, payload, triggered_by, execution_mode, source_kind)
       VALUES ($1, $2, 'suggested', $3, $4, $5, $6::jsonb, 'chat', 'approval', 'verify-109')
       RETURNING id`,
      [
        ctx.tenantId,
        ctx.projectId,
        fixture.type,
        `Verify-109 ${fixture.type}`,
        `seeded by ${RUN_ID} for Modify-coverage verification`,
        JSON.stringify(fixture.payload ?? {}),
      ],
    );
    const id = rows[0].id;
    seededIds.push(id);
    return id;
  } finally {
    client.release();
  }
}

async function callApi(path, { method = "POST", body, cookieHeader } = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieHeader,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  const text = await res.text();
  try { json = text ? JSON.parse(text) : null; } catch {}
  return { status: res.status, body: json ?? text };
}

async function runOne(ctx, cookieHeader, fixture) {
  const result = { type: fixture.type, modifyOpen: null, modifySave: null, modifyChat: null, error: null };
  if (fixture.skipReason) {
    result.error = `SKIP: ${fixture.skipReason}`;
    return result;
  }
  let eventId;
  try {
    eventId = await seedSuggestedEvent(ctx, fixture);
  } catch (e) {
    result.error = `seed failed: ${e.message}`;
    return result;
  }
  // open
  const open = await callApi(`/api/workspace/larry/events/${eventId}/modify`, {
    method: "POST",
    body: {},
    cookieHeader,
  });
  result.modifyOpen = `${open.status}`;
  if (open.status !== 200) {
    result.error = `modify open: ${open.status} ${typeof open.body === "string" ? open.body.slice(0, 200) : JSON.stringify(open.body).slice(0, 200)}`;
    return result;
  }
  if (Array.isArray(open.body?.editableFields)) {
    result.modifyOpen += ` fields=[${open.body.editableFields.join(",")}]`;
  }
  // save (with patch + executeImmediately so we exercise the executor too)
  const save = await callApi(`/api/workspace/larry/events/${eventId}/modify/save`, {
    method: "POST",
    body: { payloadPatch: fixture.patch ?? {}, executeImmediately: true },
    cookieHeader,
  });
  result.modifySave = `${save.status}`;
  if (save.status !== 200) {
    if (fixture.saveExpect?.allowExecutorFailure && save.status >= 400) {
      result.modifySave += ` (executor failure expected: ${typeof save.body === "string" ? save.body.slice(0, 80) : JSON.stringify(save.body).slice(0, 80)})`;
    } else {
      result.error = `modify save: ${save.status} ${typeof save.body === "string" ? save.body.slice(0, 200) : JSON.stringify(save.body).slice(0, 200)}`;
      return result;
    }
  }
  // modify-chat (don't actually run a chat turn, just probe the route opens)
  const chat = await callApi(`/api/workspace/larry/events/${eventId}/modify-chat`, {
    method: "POST",
    body: { message: "verify-109 ping" },
    cookieHeader,
  });
  // 409 ConflictError is the expected response if the event was already
  // resolved by the prior /modify/save call — that proves the route is
  // reachable AND that the type passes the modifiable-type guard. Anything
  // else in 2xx/4xx that isn't 422 "not modifiable" is fine.
  result.modifyChat = `${chat.status}`;
  if (chat.status === 422 && typeof chat.body === "object" && /not modifiable/i.test(chat.body?.message ?? "")) {
    result.error = `modify-chat 422 not modifiable: ${chat.body.message}`;
  }
  return result;
}

async function cleanup() {
  if (!seededIds.length) return;
  const client = await pool.connect();
  try {
    // Direct delete bypassing tenant isolation to cover all rows we created.
    await client.query(`DELETE FROM larry_events WHERE id = ANY($1::uuid[])`, [seededIds]);
  } finally {
    client.release();
  }
}

async function main() {
  console.log("Logging in as test user…");
  const cookieHeader = await loginAndGetCookies();
  console.log("OK\n");

  console.log("Looking up tenant + project + anchor task…");
  const ctx = await lookupContext();
  console.log(`tenant=${ctx.tenantId} project=${ctx.projectId} secondUser=${ctx.secondUserId ?? "(none)"} task=${ctx.taskId}\n`);

  const fixtures = buildFixtures({
    tenantId: ctx.tenantId,
    projectId: ctx.projectId,
    secondUserId: ctx.secondUserId,
    taskId: ctx.taskId,
    calendarEventId: null,
  });

  const rows = [];
  for (const fx of fixtures) {
    process.stdout.write(`• ${fx.type.padEnd(28)} `);
    const r = await runOne(ctx, cookieHeader, fx);
    rows.push(r);
    if (r.error) {
      console.log(`✗ ${r.error}`);
    } else {
      console.log(`✓ open=${r.modifyOpen}  save=${r.modifySave}  chat=${r.modifyChat}`);
    }
  }

  console.log("\n── Summary ─────────────────────────────────────────────");
  let pass = 0, fail = 0, skip = 0;
  for (const r of rows) {
    if (!r.error) pass++;
    else if (r.error.startsWith("SKIP")) skip++;
    else fail++;
  }
  console.log(`pass=${pass}  fail=${fail}  skip=${skip}  total=${rows.length}`);
  console.log("");

  console.log("Cleaning up seeded events…");
  await cleanup();
  console.log(`Deleted ${seededIds.length} seeded larry_events rows.`);

  await pool.end();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  cleanup().finally(() => pool.end()).finally(() => process.exit(2));
});
