import { describe, expect, it, vi } from "vitest";
import type { Db } from "@larry/db";
import { countRemainingAdmins, assertTenantHasRemainingAdmin } from "./last-admin-guard.js";

function mockDb(count: number) {
  return {
    queryTenant: vi.fn().mockResolvedValue([{ n: count }]),
  } as unknown as Db;
}

describe("last-admin-guard", () => {
  it("countRemainingAdmins queries memberships excluding the given user", async () => {
    const db = mockDb(2);
    const n = await countRemainingAdmins(db, "t1", "u-exclude");
    expect(n).toBe(2);
    const calls = (db.queryTenant as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0][0]).toBe("t1");
    expect(calls[0][1]).toMatch(/role IN \('owner','admin'\)/);
    expect(calls[0][2]).toEqual(["t1", "u-exclude"]);
  });

  it("assertTenantHasRemainingAdmin throws LastAdminRequiredError when count is 0", async () => {
    const db = mockDb(0);
    await expect(assertTenantHasRemainingAdmin(db, "t1", "u1"))
      .rejects.toThrow(/last_admin_required|Operation would leave/i);
  });

  it("assertTenantHasRemainingAdmin resolves when count >= 1", async () => {
    const db = mockDb(1);
    await expect(assertTenantHasRemainingAdmin(db, "t1", "u1")).resolves.toBeUndefined();
  });

  it("countRemainingAdmins handles string count (pg default)", async () => {
    const db = {
      queryTenant: vi.fn().mockResolvedValue([{ n: "3" }]),
    } as unknown as Db;
    expect(await countRemainingAdmins(db, "t1", "u1")).toBe(3);
  });
});
