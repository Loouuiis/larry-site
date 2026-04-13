import { describe, expect, it } from "vitest";
import { toLocalDateKey } from "./calendar-date";

// Regression guard for QA-2026-04-13 calendar bug.
// Pre-fix the key was built via `new Date(y,m,d).toISOString().slice(0,10)`,
// which shifts one day backwards in any timezone east of UTC. When the file
// is run under TZ=Europe/Dublin (or any UTC+X zone), these assertions
// would fail with the old implementation.

describe("toLocalDateKey", () => {
  it("returns the local calendar date, independent of timezone offset", () => {
    const april15Local = new Date(2026, 3, 15); // local midnight, April 15 2026
    expect(toLocalDateKey(april15Local)).toBe("2026-04-15");
  });

  it("pads single-digit month and day", () => {
    expect(toLocalDateKey(new Date(2026, 0, 1))).toBe("2026-01-01");
    expect(toLocalDateKey(new Date(2026, 8, 9))).toBe("2026-09-09");
  });

  it("handles end-of-year correctly", () => {
    expect(toLocalDateKey(new Date(2025, 11, 31))).toBe("2025-12-31");
  });

  it("produces the same key that a bare YYYY-MM-DD dueDate would yield", () => {
    // Task dueDates arrive as "2026-04-30"; the grid cell for that day must
    // produce the same key so `events.filter(e => e.date === key)` matches.
    const dueDate = "2026-04-30";
    const localCell = new Date(2026, 3, 30);
    expect(toLocalDateKey(localCell)).toBe(dueDate);
  });
});
