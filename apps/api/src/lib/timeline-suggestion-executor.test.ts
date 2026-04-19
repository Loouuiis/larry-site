import { describe, it, expect, vi } from "vitest";
import { executeTimelineSuggestion } from "./timeline-suggestion-executor.js";

const TENANT = "00000000-0000-0000-0000-000000000001";
const USER = "00000000-0000-0000-0000-0000000000aa";
const EVENT = "00000000-0000-0000-0000-0000000000ee";

type Row = { rows: unknown[] };

function makeFakeDb(scripted: Row[]) {
  const clientQuery = vi.fn();
  for (const r of scripted) clientQuery.mockResolvedValueOnce({ rows: r.rows });
  const tx = vi.fn(async (fn: (c: { query: typeof clientQuery }) => Promise<unknown>) =>
    fn({ query: clientQuery }),
  );
  return { db: { tx, queryTenant: vi.fn() }, clientQuery, tx };
}

function fakeFastify(db: unknown) {
  return { db } as unknown as Parameters<typeof executeTimelineSuggestion>[0];
}

describe("executeTimelineSuggestion — concurrency guard", () => {
  it("no-ops when the event is already accepted", async () => {
    // Scripted statements in order:
    // 1. set_config for tenant
    // 2. SELECT ... FOR UPDATE → returns a row with event_type='accepted'
    const { db, clientQuery } = makeFakeDb([
      { rows: [] },                                            // set_config
      { rows: [{ id: EVENT, eventType: "accepted" }] },        // lock row
    ]);
    const result = await executeTimelineSuggestion(
      fakeFastify(db), TENANT, EVENT,
      { displayText: "x", reasoning: "x" }, USER,
    );
    expect(result.applied).toEqual({ categories: 0, moves: 0, recolours: 0 });
    expect(result.skipped).toContainEqual({ reason: "already_resolved" });
    // Only two queries should have run — set_config + the SELECT FOR UPDATE.
    expect(clientQuery).toHaveBeenCalledTimes(2);
  });

  it("throws when the event does not exist", async () => {
    const { db } = makeFakeDb([
      { rows: [] },    // set_config
      { rows: [] },    // SELECT FOR UPDATE returns no rows
    ]);
    await expect(
      executeTimelineSuggestion(
        fakeFastify(db), TENANT, EVENT,
        { displayText: "x", reasoning: "x" }, USER,
      ),
    ).rejects.toThrow(/not found/i);
  });

  it("proceeds past the guard when event_type is 'suggested'", async () => {
    // Set_config, lock (suggested), then UPDATE larry_events to accepted.
    const { db, clientQuery } = makeFakeDb([
      { rows: [] },                                               // set_config
      { rows: [{ id: EVENT, eventType: "suggested" }] },          // lock row
      { rows: [] },                                               // UPDATE accepted
    ]);
    const result = await executeTimelineSuggestion(
      fakeFastify(db), TENANT, EVENT,
      { displayText: "x", reasoning: "x" }, USER,
    );
    expect(result.applied).toEqual({ categories: 0, moves: 0, recolours: 0 });
    expect(result.skipped).toEqual([]);
    expect(clientQuery).toHaveBeenCalledTimes(3);
  });
});

describe("executeTimelineSuggestion — createCategories", () => {
  it("inserts new categories and returns applied count", async () => {
    // scripted:
    // 1. set_config
    // 2. SELECT FOR UPDATE → suggested
    // 3. INSERT cat A → { id: 'uuid-a' }
    // 4. INSERT cat B → { id: 'uuid-b' }
    // 5. UPDATE accepted
    const { db, clientQuery } = makeFakeDb([
      { rows: [] },
      { rows: [{ id: EVENT, eventType: "suggested" }] },
      { rows: [{ id: "uuid-a" }] },
      { rows: [{ id: "uuid-b" }] },
      { rows: [] },
    ]);
    const result = await executeTimelineSuggestion(
      fakeFastify(db), TENANT, EVENT,
      {
        displayText: "x", reasoning: "x",
        createCategories: [
          { tempId: "cat_a1", name: "Customer Onboarding", colour: "#5fb4d3" },
          { tempId: "cat_b2", name: "Internal Tooling",    colour: "#f5b143" },
        ],
      },
      USER,
    );
    expect(result.applied.categories).toBe(2);
    expect(clientQuery).toHaveBeenCalledTimes(5);
    // Second INSERT call — third arg (values) should carry the second category.
    const insertA = clientQuery.mock.calls[2];
    expect(insertA[0]).toMatch(/INSERT INTO project_categories/);
    expect(insertA[1]).toEqual([TENANT, "Customer Onboarding", "#5fb4d3"]);
  });

  it("reuses an existing category on unique-name collision", async () => {
    // Reject the INSERT with a pg unique-violation error, then the SELECT
    // to look up the existing id returns one row.
    const { db } = (() => {
      const q = vi.fn();
      q.mockResolvedValueOnce({ rows: [] });                                     // set_config
      q.mockResolvedValueOnce({ rows: [{ id: EVENT, eventType: "suggested" }] }); // lock
      const uniqueErr = Object.assign(new Error("dup"), { code: "23505" });
      q.mockRejectedValueOnce(uniqueErr);                                        // INSERT dup
      q.mockResolvedValueOnce({ rows: [{ id: "existing-id" }] });                // SELECT
      q.mockResolvedValueOnce({ rows: [] });                                     // UPDATE accepted
      const tx = vi.fn(async (fn: (c: { query: typeof q }) => Promise<unknown>) =>
        fn({ query: q }),
      );
      return { db: { tx, queryTenant: vi.fn() }, q };
    })();
    const result = await executeTimelineSuggestion(
      fakeFastify(db), TENANT, EVENT,
      {
        displayText: "x", reasoning: "x",
        createCategories: [{ tempId: "cat_x", name: "Existing", colour: "#111" }],
      },
      USER,
    );
    expect(result.applied.categories).toBe(0);
    expect(result.skipped).toContainEqual(
      expect.objectContaining({ reason: "category_name_already_exists", categoryId: "existing-id" }),
    );
  });
});
