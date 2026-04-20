// Integration-style test for the UI-feed endpoints. The repo's test harness is
// mock-based (no real Postgres), so cross-tenant isolation is verified by
// asserting the SQL carries `tenant_id = $1` + `channel = 'ui'` and the
// authenticated tenantId is the first bound param. A real cross-tenant
// isolation guarantee is enforced by Postgres RLS + those predicates in prod.
import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import sensible from "@fastify/sensible";
import { ZodError } from "zod";
import type { Db } from "@larry/db";
import { notificationRoutes } from "./notifications.js";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const USER_A = "22222222-2222-4222-8222-222222222222";

type QueryCall = { sql: string; params: unknown[] };

async function buildApp(queryImpl: (call: QueryCall) => unknown[]) {
  const calls: QueryCall[] = [];
  const app = Fastify({ logger: false });
  const queryTenant = vi.fn(async (_tid: string, sql: string, params: unknown[]) => {
    const call = { sql, params };
    calls.push(call);
    return queryImpl(call);
  });
  app.decorate("db", { queryTenant } as unknown as Db);
  app.decorate("authenticate", async (req: Parameters<(typeof app)["authenticate"]>[0]) => {
    (req as typeof req & {
      user: { tenantId: string; userId: string; role: "pm"; email: string };
    }).user = { tenantId: TENANT_A, userId: USER_A, role: "pm", email: "a@example.com" };
  });
  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({ error: "Validation Error" });
    }
    return reply.status(error.statusCode ?? 500).send({ error: error.message });
  });
  await app.register(sensible);
  await app.register(notificationRoutes, { prefix: "/v1" });
  await app.ready();
  return { app, calls };
}

const apps: Array<Awaited<ReturnType<typeof buildApp>>["app"]> = [];
afterEach(async () => {
  while (apps.length) await apps.pop()!.close();
  vi.clearAllMocks();
});

describe("GET /v1/notifications/feed", () => {
  it("scopes to the caller tenant + channel='ui' and returns structured items", async () => {
    const row = {
      id: "aaaaaaaa-0000-4000-8000-000000000001",
      type: "task.created",
      severity: "success",
      subject: "Task created: Deck",
      body: null,
      deep_link: "/workspace/projects/p1/tasks/t1",
      batch_id: null,
      metadata: { payload: { taskId: "t1", projectId: "p1", title: "Deck" } },
      created_at: "2026-04-20T12:00:00Z",
      read_at: null,
      dismissed_at: null,
    };

    const { app, calls } = await buildApp((call) => {
      if (/SELECT id, type, severity/.test(call.sql)) return [row];
      if (/COUNT\(\*\)::int AS count/.test(call.sql)) return [{ count: 1 }];
      return [];
    });
    apps.push(app);

    const res = await app.inject({ method: "GET", url: "/v1/notifications/feed" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      id: row.id,
      type: "task.created",
      severity: "success",
      title: "Task created: Deck",
      deepLink: "/workspace/projects/p1/tasks/t1",
      payload: { taskId: "t1", projectId: "p1", title: "Deck" },
    });
    expect(body.unreadCount).toBe(1);
    expect(typeof body.serverTime).toBe("string");

    const select = calls.find((c) => /SELECT id, type, severity/.test(c.sql));
    expect(select).toBeDefined();
    expect(select!.sql).toMatch(/tenant_id = \$1/);
    expect(select!.sql).toMatch(/channel = 'ui'/);
    expect(select!.sql).toMatch(/dismissed_at IS NULL/);
    expect(select!.params[0]).toBe(TENANT_A);
    expect(select!.params[1]).toBe(USER_A);
  });

  it("accepts ?since and appends it to the query", async () => {
    const { app, calls } = await buildApp((call) => {
      if (/COUNT\(\*\)::int AS count/.test(call.sql)) return [{ count: 0 }];
      return [];
    });
    apps.push(app);

    const since = "2026-04-20T00:00:00Z";
    const res = await app.inject({
      method: "GET",
      url: `/v1/notifications/feed?since=${encodeURIComponent(since)}`,
    });
    expect(res.statusCode).toBe(200);

    const select = calls.find((c) => /SELECT id, type, severity/.test(c.sql))!;
    expect(select.sql).toMatch(/AND created_at > \$3/);
    expect(select.params).toContain(since);
  });
});

describe("POST /v1/notifications/read", () => {
  it("marks all unread read when { all: true }", async () => {
    const { app, calls } = await buildApp(() => []);
    apps.push(app);

    const res = await app.inject({
      method: "POST",
      url: "/v1/notifications/read",
      payload: { all: true },
    });
    expect(res.statusCode).toBe(200);

    const update = calls.find((c) => /UPDATE notifications\s+SET read_at/.test(c.sql));
    expect(update).toBeDefined();
    expect(update!.sql).toMatch(/tenant_id = \$1/);
    expect(update!.sql).toMatch(/channel = 'ui'/);
    expect(update!.sql).toMatch(/read_at IS NULL/);
    expect(update!.params[0]).toBe(TENANT_A);
    expect(update!.params[1]).toBe(USER_A);
  });

  it("marks specific ids read when { ids: [...] }", async () => {
    const { app, calls } = await buildApp(() => []);
    apps.push(app);

    const ids = ["aaaaaaaa-0000-4000-8000-000000000001"];
    const res = await app.inject({
      method: "POST",
      url: "/v1/notifications/read",
      payload: { ids },
    });
    expect(res.statusCode).toBe(200);

    const update = calls.find((c) => /UPDATE notifications\s+SET read_at/.test(c.sql))!;
    expect(update.sql).toMatch(/id = ANY\(\$3::uuid\[\]\)/);
    expect(update.params[2]).toEqual(ids);
  });

  it("rejects empty ids with 400", async () => {
    const { app } = await buildApp(() => []);
    apps.push(app);
    const res = await app.inject({
      method: "POST",
      url: "/v1/notifications/read",
      payload: { ids: [] },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /v1/notifications/dismiss", () => {
  it("sets dismissed_at for the given ids scoped to tenant + channel='ui'", async () => {
    const { app, calls } = await buildApp(() => []);
    apps.push(app);

    const ids = ["aaaaaaaa-0000-4000-8000-000000000001"];
    const res = await app.inject({
      method: "POST",
      url: "/v1/notifications/dismiss",
      payload: { ids },
    });
    expect(res.statusCode).toBe(200);

    const update = calls.find((c) => /UPDATE notifications\s+SET dismissed_at/.test(c.sql))!;
    expect(update.sql).toMatch(/tenant_id = \$1/);
    expect(update.sql).toMatch(/channel = 'ui'/);
    expect(update.sql).toMatch(/id = ANY\(\$3::uuid\[\]\)/);
    expect(update.params[0]).toBe(TENANT_A);
    expect(update.params[1]).toBe(USER_A);
    expect(update.params[2]).toEqual(ids);
  });
});
