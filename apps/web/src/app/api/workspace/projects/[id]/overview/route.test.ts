import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock session + proxy before importing the route.
vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(async () => ({ userId: "u1", tenantId: "t1", role: "member" })),
}));

const mockProxy = vi.fn();
vi.mock("@/lib/workspace-proxy", () => ({
  proxyApiRequest: (...args: unknown[]) => mockProxy(...args),
  persistSession: vi.fn(async () => {}),
}));

import { GET } from "./route";

const PROJECT_ID = "fe0afe7a-cacc-43c4-bdd9-7f7105a054a3";

function ok<T>(body: T, status = 200) {
  return { status, body };
}

function okProjectList() {
  return ok({ items: [{ id: PROJECT_ID, name: "Modify Test" }] });
}

function makeReq() {
  return new Request(`http://localhost/api/workspace/projects/${PROJECT_ID}/overview`);
}

function ctx() {
  return { params: Promise.resolve({ id: PROJECT_ID }) };
}

describe("GET /api/workspace/projects/:id/overview — B-006 hardening", () => {
  beforeEach(() => {
    mockProxy.mockReset();
  });

  it("returns project with empty tasks and no error when tasks endpoint 500s", async () => {
    mockProxy.mockImplementation((_session, path: string) => {
      if (path === "/v1/projects?status=all") return okProjectList();
      if (path.startsWith("/v1/tasks")) return ok({ error: "Internal Server Error", message: "An unexpected error occurred." }, 500);
      if (path.endsWith("/timeline")) return ok({ tasks: [], dependencies: [] });
      if (path.endsWith("/health")) return ok({});
      if (path.endsWith("/outcomes")) return ok({});
      if (path.startsWith("/v1/meetings")) return ok({ items: [] });
      throw new Error(`unexpected proxy call: ${path}`);
    });

    const res = await GET(makeReq(), ctx());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.project).toBeTruthy();
    expect(body.project.id).toBe(PROJECT_ID);
    expect(body.tasks).toEqual([]);
    expect(body.error).toBeUndefined();
  });

  it("still returns non-blocking response when health/outcomes/meetings 500", async () => {
    mockProxy.mockImplementation((_session, path: string) => {
      if (path === "/v1/projects?status=all") return okProjectList();
      if (path.startsWith("/v1/tasks")) return ok({ items: [{ id: "t1", title: "Task" }] });
      if (path.endsWith("/timeline")) return ok({ items: [] }, 500);
      if (path.endsWith("/health")) return ok({ error: "boom" }, 500);
      if (path.endsWith("/outcomes")) return ok({ error: "boom" }, 500);
      if (path.startsWith("/v1/meetings")) return ok({ error: "boom" }, 500);
      throw new Error(`unexpected proxy call: ${path}`);
    });

    const res = await GET(makeReq(), ctx());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.tasks).toHaveLength(1);
    expect(body.timeline).toBeNull();
    expect(body.health).toBeNull();
    expect(body.outcomes).toBeNull();
    expect(body.meetings).toEqual([]);
    expect(body.error).toBeUndefined();
  });

  it("surfaces a fatal error only when the projects endpoint itself fails", async () => {
    mockProxy.mockImplementation((_session, path: string) => {
      if (path === "/v1/projects?status=all") return ok({ error: "Unauthorized" }, 401);
      return ok({});
    });

    const res = await GET(makeReq(), ctx());
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.project).toBeNull();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 404 when the project id is not in the list", async () => {
    mockProxy.mockImplementation((_session, path: string) => {
      if (path === "/v1/projects?status=all") return ok({ items: [{ id: "different-id" }] });
      return ok({ items: [] });
    });

    const res = await GET(makeReq(), ctx());
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Project not found.");
  });
});
