import { describe, expect, it, vi } from "vitest";
import type { Db } from "@larry/db";
import { assertSeatAvailable, SeatCapReachedError } from "./seat-cap.js";

function mockDb(seatCap: number | null, used: number) {
  return {
    query: vi.fn().mockResolvedValue([{ seat_cap: seatCap, used }]),
  } as unknown as Db;
}

describe("seat-cap", () => {
  it("no cap → passes", async () => {
    await expect(assertSeatAvailable(mockDb(null, 5), "t1")).resolves.toBeUndefined();
  });

  it("under cap → passes", async () => {
    await expect(assertSeatAvailable(mockDb(10, 5), "t1")).resolves.toBeUndefined();
  });

  it("at cap → throws SeatCapReachedError", async () => {
    await expect(assertSeatAvailable(mockDb(10, 10), "t1")).rejects.toBeInstanceOf(
      SeatCapReachedError,
    );
  });

  it("over cap → throws with seat_cap_reached code", async () => {
    await expect(assertSeatAvailable(mockDb(10, 11), "t1"))
      .rejects.toMatchObject({ code: "seat_cap_reached" });
  });
});
