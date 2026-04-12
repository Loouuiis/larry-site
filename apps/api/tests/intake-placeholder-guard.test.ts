import { describe, expect, it } from "vitest";
import {
  isPlaceholderAnswer,
  extractMilestoneDates,
} from "../src/routes/v1/project-intake.js";

// QA-2026-04-12 C-4: bootstrap accepted "Not sure yet" and built a task
// titled "Not sure yet" due 2026-04-15. Placeholder answers must short-
// circuit to a follow-up question before any task is emitted.
describe("isPlaceholderAnswer", () => {
  const placeholders = [
    "", "   ", "n/a", "N/A", "na", "NA", "tbd", "TBD",
    "idk", "IDK", "i don't know", "I dont know",
    "not sure", "Not sure", "Not sure yet", "NOT SURE YET",
    "dunno", "unsure", "nothing", "none",
    "Make it better", "Improve it",
    "?", "?!", "hi", // very short fragments (<=3 chars or close)
  ];

  for (const answer of placeholders) {
    it(`flags "${answer}" as placeholder`, () => {
      expect(isPlaceholderAnswer(answer)).toBe(true);
    });
  }

  const realAnswers = [
    "Launch a customer portal with login, dashboard, and billing",
    "Finish the Q3 marketing campaign by July 31",
    "Build the MVP in 6 weeks",
    "Ship the API to pilot customers",
  ];

  for (const answer of realAnswers) {
    it(`accepts "${answer}" as real content`, () => {
      expect(isPlaceholderAnswer(answer)).toBe(false);
    });
  }
});

// QA-2026-04-12 I-1: user said "landing page live by May 15, email sequences
// running by June 1, webinars in June, campaign wrap-up end of July" and all
// six produced tasks were due 2026-04-15 → 2026-04-29. Stated dates must be
// extracted so the bootstrap can preserve them.
describe("extractMilestoneDates", () => {
  const TODAY = new Date("2026-04-12T12:00:00Z");

  it("extracts all three dates from the Test 1.1 intake string", () => {
    const text =
      "Landing page live by May 15, email sequences running by June 1, webinars in June, campaign wrap-up end of July.";
    const dates = extractMilestoneDates(text, TODAY);
    expect(dates).toContain("2026-05-15");
    expect(dates).toContain("2026-06-01");
    expect(dates).toContain("2026-07-31");
  });

  it("returns empty for a string with no dates", () => {
    expect(extractMilestoneDates("ship the thing when it's ready", TODAY)).toEqual([]);
  });

  it("handles ISO dates verbatim", () => {
    expect(extractMilestoneDates("deliver by 2026-08-15", TODAY)).toContain("2026-08-15");
  });

  it("handles month + day with ordinal suffix", () => {
    expect(extractMilestoneDates("due April 18th", TODAY)).toContain("2026-04-18");
  });

  it("handles 'end of' and 'late' phrasing", () => {
    expect(extractMilestoneDates("release end of October", TODAY)).toContain("2026-10-31");
    expect(extractMilestoneDates("cut late February", TODAY)).toContain("2027-02-28");
  });

  it("picks next year when the month has already passed this year", () => {
    const today = new Date("2026-06-15T00:00:00Z");
    // "January" from June 2026 = Jan 2027
    expect(extractMilestoneDates("kickoff in January", today)).toContain("2027-01-15");
  });
});
