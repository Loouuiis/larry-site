import { describe, expect, it } from "vitest";
import { computeDateContext } from "@larry/ai";

// QA-2026-04-12 C-7: chat said "next Friday, due Fri Apr 17" but the task
// landed with due date Sat 2026-04-18. Today (from the QA report) was
// Sun 2026-04-12. Anchor the resolver to those facts and make sure
// "next Friday" from a Sunday resolves to the Friday 5 days out.
describe("computeDateContext", () => {
  it("from Sunday 2026-04-12 resolves 'next Friday' to 2026-04-17 (QA C-7 regression)", () => {
    const sunApr12 = new Date("2026-04-12T12:00:00Z");
    const ctx = computeDateContext(sunApr12);
    expect(ctx.dayOfWeek).toBe("Sunday");
    expect(ctx.today).toBe("2026-04-12");
    expect(ctx.nextFriday).toBe("2026-04-17");
  });

  it("from a Friday resolves 'next Friday' to the Friday 7 days out, not today", () => {
    const friday = new Date("2026-04-17T12:00:00Z");
    const ctx = computeDateContext(friday);
    expect(ctx.dayOfWeek).toBe("Friday");
    expect(ctx.today).toBe("2026-04-17");
    expect(ctx.nextFriday).toBe("2026-04-24");
  });

  it("resolves all weekdays correctly from a Wednesday", () => {
    const wed = new Date("2026-04-15T00:00:00Z");
    const ctx = computeDateContext(wed);
    expect(ctx.dayOfWeek).toBe("Wednesday");
    expect(ctx.nextThursday).toBe("2026-04-16");
    expect(ctx.nextFriday).toBe("2026-04-17");
    expect(ctx.nextMonday).toBe("2026-04-20");
    expect(ctx.nextTuesday).toBe("2026-04-21");
    expect(ctx.nextWednesday).toBe("2026-04-22");
  });
});
