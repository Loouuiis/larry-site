import { describe, it, expect, vi } from "vitest";
import { listCategoriesForTenant, insertCategory, updateCategory, deleteCategory, reorderCategories } from "./categories.js";

const fakeDb = () => ({ queryTenant: vi.fn().mockResolvedValue([]) });

describe("categories repository", () => {
  it("listCategoriesForTenant runs a sorted SELECT", async () => {
    const db = fakeDb() as never;
    await listCategoriesForTenant(db, "t1");
    expect((db as unknown as { queryTenant: ReturnType<typeof vi.fn> }).queryTenant)
      .toHaveBeenCalledWith("t1", expect.stringMatching(/ORDER BY sort_order/i), ["t1"]);
  });

  it("insertCategory returns the row", async () => {
    const row = { id: "c1", tenantId: "t1", name: "X", colour: null, sortOrder: 0, createdAt: "x", updatedAt: "x" };
    const db = { queryTenant: vi.fn().mockResolvedValue([row]) } as never;
    const result = await insertCategory(db, "t1", { name: "X", colour: null, sortOrder: 0 });
    expect(result).toEqual(row);
  });

  it("updateCategory coalesces unchanged fields", async () => {
    const db = { queryTenant: vi.fn().mockResolvedValue([{ id: "c1" }]) } as never;
    await updateCategory(db, "t1", "c1", { name: "New" });
    expect((db as unknown as { queryTenant: ReturnType<typeof vi.fn> }).queryTenant.mock.calls[0][1])
      .toMatch(/UPDATE project_categories/i);
  });

  it("deleteCategory cascades via SET NULL on projects", async () => {
    const db = { queryTenant: vi.fn().mockResolvedValue([]) } as never;
    await deleteCategory(db, "t1", "c1");
    expect((db as unknown as { queryTenant: ReturnType<typeof vi.fn> }).queryTenant)
      .toHaveBeenCalledWith("t1", expect.stringMatching(/DELETE FROM project_categories/i), ["t1", "c1"]);
  });

  it("reorderCategories uses UPDATE in CASE WHEN form", async () => {
    const db = { queryTenant: vi.fn().mockResolvedValue([]) } as never;
    await reorderCategories(db, "t1", ["c1", "c2", "c3"]);
    const sql = (db as unknown as { queryTenant: ReturnType<typeof vi.fn> }).queryTenant.mock.calls[0][1];
    expect(sql).toMatch(/CASE id/i);
  });

  it("updateCategory sets colour to null when patch.colour is explicitly null", async () => {
    const row = { id: "c1", tenantId: "t1", name: "X", colour: null, sortOrder: 0, createdAt: "x", updatedAt: "x" };
    const db = { queryTenant: vi.fn().mockResolvedValue([row]) } as never;
    await updateCategory(db, "t1", "c1", { colour: null });
    const params = (db as unknown as { queryTenant: ReturnType<typeof vi.fn> }).queryTenant.mock.calls[0][2];
    // Flag is params[3] (patch.colour !== undefined), value is params[4].
    expect(params[3]).toBe(true);
    expect(params[4]).toBeNull();
  });

  it("reorderCategories with empty array is a no-op", async () => {
    const db = { queryTenant: vi.fn() } as never;
    await reorderCategories(db, "t1", []);
    expect((db as unknown as { queryTenant: ReturnType<typeof vi.fn> }).queryTenant).not.toHaveBeenCalled();
  });
});
