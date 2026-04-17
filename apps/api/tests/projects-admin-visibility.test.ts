import { afterEach, describe, expect, it, vi } from "vitest";
import { getProjectMembershipAccess } from "../src/lib/project-memberships.js";
import type { Db } from "@larry/db";

function mockDb(projectRow: unknown[], membershipRow: unknown[]) {
  return {
    queryTenant: vi
      .fn()
      .mockResolvedValueOnce(projectRow)
      .mockResolvedValueOnce(membershipRow),
  } as unknown as Db;
}

afterEach(() => vi.clearAllMocks());

describe("getProjectMembershipAccess — admin org-wide visibility", () => {
  const existingProject = [{ id: "proj1", status: "active" }];

  it("owner sees and manages any project even without an explicit membership row", async () => {
    const db = mockDb(existingProject, []);
    const acc = await getProjectMembershipAccess({
      db,
      tenantId: "t1",
      projectId: "proj1",
      userId: "u",
      tenantRole: "owner",
    });
    expect(acc.canRead).toBe(true);
    expect(acc.canManage).toBe(true);
  });

  it("admin sees and manages any project even without an explicit membership row", async () => {
    const db = mockDb(existingProject, []);
    const acc = await getProjectMembershipAccess({
      db,
      tenantId: "t1",
      projectId: "proj1",
      userId: "u",
      tenantRole: "admin",
    });
    expect(acc.canRead).toBe(true);
    expect(acc.canManage).toBe(true);
  });

  it("member without project membership cannot read", async () => {
    const db = mockDb(existingProject, []);
    const acc = await getProjectMembershipAccess({
      db,
      tenantId: "t1",
      projectId: "proj1",
      userId: "u",
      tenantRole: "member",
    });
    expect(acc.canRead).toBe(false);
    expect(acc.canManage).toBe(false);
  });

  it("member with viewer membership can read but not manage", async () => {
    const db = mockDb(existingProject, [{ role: "viewer" }]);
    const acc = await getProjectMembershipAccess({
      db,
      tenantId: "t1",
      projectId: "proj1",
      userId: "u",
      tenantRole: "member",
    });
    expect(acc.canRead).toBe(true);
    expect(acc.canManage).toBe(false);
  });

  it("member with editor membership can manage", async () => {
    const db = mockDb(existingProject, [{ role: "editor" }]);
    const acc = await getProjectMembershipAccess({
      db,
      tenantId: "t1",
      projectId: "proj1",
      userId: "u",
      tenantRole: "member",
    });
    expect(acc.canRead).toBe(true);
    expect(acc.canManage).toBe(true);
  });
});
