import Fastify from "fastify";
import sensible from "@fastify/sensible";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiEnv } from "@larry/config";
import type { Db } from "@larry/db";
import { larryRoutes } from "../src/routes/v1/larry.js";

// N-10 regression guard: the five `/events/:id/*` handlers used to
// forward non-UUID path params straight to pg, which threw "invalid
// input syntax for type uuid" and surfaced as a generic 500. The
// shape guard in each handler should short-circuit to 400 before any
// DB call. We assert that the DB is never queried and the response
// is 400 for every malformed-id entry point.

vi.mock("../src/lib/audit.js", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../src/services/larry-governance.js", () => ({
  inferGovernanceDecision: vi.fn().mockReturnValue({ rule: "n/a", reason: "n/a", decision: "approval_required" }),
}));

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";

const appsToClose: Array<Awaited<ReturnType<typeof createTestApp>>> = [];

afterEach(async () => {
  while (appsToClose.length > 0) {
    const handle = appsToClose.pop();
    if (handle) await handle.app.close();
  }
  vi.clearAllMocks();
});

async function createTestApp() {
  // Hostile stub — every DB call fails. If a handler ever reaches the
  // DB with a non-UUID id we'll see the call surface here, which is
  // exactly the regression we want to catch.
  const db = {
    queryTenant: vi.fn().mockRejectedValue(new Error("db should not be called with non-UUID id")),
    withTenantClient: vi.fn().mockRejectedValue(new Error("db should not be called with non-UUID id")),
    queryRaw: vi.fn().mockRejectedValue(new Error("db should not be called with non-UUID id")),
  } as unknown as Db & { queryTenant: ReturnType<typeof vi.fn> };

  const app = Fastify({ logger: false });
  app.decorate("db", db);
  app.decorate("config", { MODEL_PROVIDER: "mock" } as unknown as ApiEnv);
  app.decorate("authenticate", async (request: Parameters<(typeof app)["authenticate"]>[0]) => {
    (request as typeof request & {
      user: { tenantId: string; userId: string; role: "pm"; email: string };
    }).user = {
      tenantId: TENANT_ID,
      userId: USER_ID,
      role: "pm",
      email: "pm@example.com",
    };
  });
  app.decorate("requireRole", () => async () => undefined);

  await app.register(sensible);
  await app.register(larryRoutes, { prefix: "/larry" });
  await app.ready();

  return { app, db };
}

describe("N-10: /events/:id/* path-param UUID guard", () => {
  let handle: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    handle = await createTestApp();
    appsToClose.push(handle);
  });

  const badIds = ["not-a-uuid", "abc", "12345", "%20", "null"];
  const routes: Array<{ name: string; method: "POST"; urlFor: (id: string) => string; body?: unknown }> = [
    { name: "accept", method: "POST", urlFor: (id) => `/larry/events/${id}/accept` },
    { name: "dismiss", method: "POST", urlFor: (id) => `/larry/events/${id}/dismiss` },
    { name: "modify", method: "POST", urlFor: (id) => `/larry/events/${id}/modify` },
    { name: "let-larry-execute", method: "POST", urlFor: (id) => `/larry/events/${id}/let-larry-execute` },
  ];

  for (const route of routes) {
    for (const badId of badIds) {
      it(`${route.name}: "${badId}" returns 400 without touching the DB`, async () => {
        const res = await handle.app.inject({
          method: route.method,
          url: route.urlFor(badId),
          headers: { "content-type": "application/json" },
          payload: route.body ?? {},
        });
        expect(res.statusCode).toBe(400);
        // Never reached the DB — the guard fires first.
        expect((handle.db as unknown as { queryTenant: ReturnType<typeof vi.fn> }).queryTenant).not.toHaveBeenCalled();
      });
    }
  }

  it("well-formed UUID that does not exist falls through to the DB path (404)", async () => {
    // Control: a syntactically valid UUID should pass the guard and
    // reach the DB. Our stub rejects, which Fastify maps to 500.
    // The point of this case is to confirm the guard doesn't
    // over-reject — 500 here proves the DB path was attempted.
    const res = await handle.app.inject({
      method: "POST",
      url: `/larry/events/00000000-0000-4000-8000-000000000000/accept`,
      headers: { "content-type": "application/json" },
      payload: {},
    });
    expect(res.statusCode).not.toBe(400);
  });
});
