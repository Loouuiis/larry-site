import { describe, it, expect, vi } from "vitest";
import { listCategoriesForTenant, insertCategory, updateCategory, deleteCategory, reorderCategories } from "./categories.js";

const emptyRow = {
  id: "c1",
  tenantId: "t1",
  name: "X",
  colour: null,
  sortOrder: 0,
  parentCategoryId: null,
  projectId: null,
  createdAt: "x",
  updatedAt: "x",
};

const fakeDb = () => ({ queryTenant: vi.fn().mockResolvedValue([]) });
const fakeDbReturning = (rows: unknown[]) => ({ queryTenant: vi.fn().mockResolvedValue(rows) });

describe("categories repository", () => {
  it("listCategoriesForTenant runs a sorted SELECT and selects new columns", async () => {
    const db = fakeDb() as never;
    await listCategoriesForTenant(db, "t1");
    const mock = (db as unknown as { queryTenant: ReturnType<typeof vi.fn> }).queryTenant;
    expect(mock).toHaveBeenCalledWith("t1", expect.stringMatching(/ORDER BY sort_order/i), ["t1"]);
    const sql = mock.mock.calls[0][1] as string;
    expect(sql).toMatch(/parent_category_id\s+AS\s+"parentCategoryId"/);
    expect(sql).toMatch(/project_id\s+AS\s+"projectId"/);
  });

  it("insertCategory (plain) returns the row", async () => {
    const db = fakeDbReturning([emptyRow]) as never;
    const result = await insertCategory(db, "t1", { name: "X", colour: null, sortOrder: 0 });
    expect(result).toEqual(emptyRow);
  });

  it("insertCategory accepts parentCategoryId and passes it through", async () => {
    const row = { ...emptyRow, parentCategoryId: "parent-1" };
    const db = fakeDbReturning([row]) as never;
    const result = await insertCategory(db, "t1", {
      name: "Child", colour: null, sortOrder: 0,
      parentCategoryId: "parent-1",
    });
    expect(result.parentCategoryId).toBe("parent-1");
    const params = (db as unknown as { queryTenant: ReturnType<typeof vi.fn> }).queryTenant.mock.calls[0][2];
    // Params: tenant, name, colour, sortOrder, parentCategoryId, projectId
    expect(params[4]).toBe("parent-1");
    expect(params[5]).toBeNull();
  });

  it("insertCategory accepts projectId and passes it through", async () => {
    const row = { ...emptyRow, projectId: "proj-1" };
    const db = fakeDbReturning([row]) as never;
    const result = await insertCategory(db, "t1", {
      name: "Design", colour: "#6c44f6", sortOrder: 0,
      projectId: "proj-1",
    });
    expect(result.projectId).toBe("proj-1");
    const params = (db as unknown as { queryTenant: ReturnType<typeof vi.fn> }).queryTenant.mock.calls[0][2];
    expect(params[4]).toBeNull();
    expect(params[5]).toBe("proj-1");
  });

  it("insertCategory rejects when both parentCategoryId and projectId are set", async () => {
    const db = fakeDb() as never;
    await expect(
      insertCategory(db, "t1", {
        name: "Bad", colour: null, sortOrder: 0,
        parentCategoryId: "p1", projectId: "pr1",
      }),
    ).rejects.toThrow(/exactly one of parentCategoryId or projectId/i);
    expect((db as unknown as { queryTenant: ReturnType<typeof vi.fn> }).queryTenant).not.toHaveBeenCalled();
  });

  it("updateCategory coalesces unchanged fields", async () => {
    const db = fakeDbReturning([{ id: "c1" }]) as never;
    await updateCategory(db, "t1", "c1", { name: "New" });
    const sql = (db as unknown as { queryTenant: ReturnType<typeof vi.fn> }).queryTenant.mock.calls[0][1] as string;
    expect(sql).toMatch(/UPDATE project_categories/i);
  });

  it("updateCategory sets parentCategoryId to a new value when provided", async () => {
    const db = fakeDbReturning([{ id: "c1" }]) as never;
    await updateCategory(db, "t1", "c1", { parentCategoryId: "parent-2" });
    const params = (db as unknown as { queryTenant: ReturnType<typeof vi.fn> }).queryTenant.mock.calls[0][2];
    // Params:
    // [0]=tenant, [1]=id, [2]=name, [3]=colourFlag, [4]=colourValue,
    // [5]=sortOrder, [6]=parentCategoryIdFlag, [7]=parentCategoryIdValue,
    // [8]=projectIdFlag, [9]=projectIdValue
    expect(params[6]).toBe(true);
    expect(params[7]).toBe("parent-2");
  });

  it("updateCategory clears parentCategoryId when explicitly null", async () => {
    const db = fakeDbReturning([{ id: "c1" }]) as never;
    await updateCategory(db, "t1", "c1", { parentCategoryId: null });
    const params = (db as unknown as { queryTenant: ReturnType<typeof vi.fn> }).queryTenant.mock.calls[0][2];
    expect(params[6]).toBe(true);
    expect(params[7]).toBeNull();
  });

  it("updateCategory does not touch parentCategoryId when undefined", async () => {
    const db = fakeDbReturning([{ id: "c1" }]) as never;
    await updateCategory(db, "t1", "c1", { name: "X" });
    const params = (db as unknown as { queryTenant: ReturnType<typeof vi.fn> }).queryTenant.mock.calls[0][2];
    expect(params[6]).toBe(false);
    expect(params[7]).toBeNull();
  });

  it("updateCategory rejects when both parentCategoryId and projectId are set", async () => {
    const db = fakeDb() as never;
    await expect(
      updateCategory(db, "t1", "c1", { parentCategoryId: "p1", projectId: "pr1" }),
    ).rejects.toThrow(/exactly one of parentCategoryId or projectId/i);
    expect((db as unknown as { queryTenant: ReturnType<typeof vi.fn> }).queryTenant).not.toHaveBeenCalled();
  });

  it("deleteCategory runs DELETE", async () => {
    const db = fakeDb() as never;
    await deleteCategory(db, "t1", "c1");
    expect((db as unknown as { queryTenant: ReturnType<typeof vi.fn> }).queryTenant)
      .toHaveBeenCalledWith("t1", expect.stringMatching(/DELETE FROM project_categories/i), ["t1", "c1"]);
  });

  it("reorderCategories uses UPDATE in CASE WHEN form", async () => {
    const db = fakeDb() as never;
    await reorderCategories(db, "t1", ["c1", "c2", "c3"]);
    const sql = (db as unknown as { queryTenant: ReturnType<typeof vi.fn> }).queryTenant.mock.calls[0][1] as string;
    expect(sql).toMatch(/CASE id/i);
  });

  it("updateCategory sets colour to null when patch.colour is explicitly null", async () => {
    const db = fakeDbReturning([emptyRow]) as never;
    await updateCategory(db, "t1", "c1", { colour: null });
    const params = (db as unknown as { queryTenant: ReturnType<typeof vi.fn> }).queryTenant.mock.calls[0][2];
    expect(params[3]).toBe(true);
    expect(params[4]).toBeNull();
  });

  it("reorderCategories with empty array is a no-op", async () => {
    const db = { queryTenant: vi.fn() } as never;
    await reorderCategories(db, "t1", []);
    expect((db as unknown as { queryTenant: ReturnType<typeof vi.fn> }).queryTenant).not.toHaveBeenCalled();
  });
});
