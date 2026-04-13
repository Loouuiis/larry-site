import { describe, expect, it } from "vitest";
import { deriveMeetingTitleFromTranscript } from "../src/lib/meeting-title.js";

describe("deriveMeetingTitleFromTranscript (QA-2026-04-12 polish)", () => {
  it("extracts the label after a 'Meeting:' header and strips a trailing date clause", () => {
    const transcript =
      "Meeting: Q3 Security Audit Response Planning (12 April 2026)\nAttendees: Louis, Anna.\n";
    expect(deriveMeetingTitleFromTranscript(transcript)).toBe(
      "Q3 Security Audit Response Planning"
    );
  });

  it("recognises 'Subject:', 'Topic:', and 'Re:' as header variants", () => {
    expect(deriveMeetingTitleFromTranscript("Subject: Standup notes")).toBe("Standup notes");
    expect(deriveMeetingTitleFromTranscript("Topic: Mobile launch gate review")).toBe(
      "Mobile launch gate review"
    );
    expect(deriveMeetingTitleFromTranscript("Re: Onboarding redesign sync")).toBe(
      "Onboarding redesign sync"
    );
  });

  it("falls back to the first short, terminator-free line when no header matches", () => {
    expect(deriveMeetingTitleFromTranscript("Weekly Engineering Sync — 12 Apr\n\nWe covered…")).toBe(
      "Weekly Engineering Sync — 12 Apr"
    );
  });

  it("returns null when the first line looks like body prose, not a title", () => {
    expect(
      deriveMeetingTitleFromTranscript(
        "We met today to discuss the Q3 plan and agreed on the following steps. Anna will…"
      )
    ).toBeNull();
    expect(deriveMeetingTitleFromTranscript("- Anna will own X by Friday")).toBeNull();
  });

  it("returns null for empty / blank / non-string input", () => {
    expect(deriveMeetingTitleFromTranscript(null)).toBeNull();
    expect(deriveMeetingTitleFromTranscript(undefined)).toBeNull();
    expect(deriveMeetingTitleFromTranscript("")).toBeNull();
    expect(deriveMeetingTitleFromTranscript("   \n  \n  ")).toBeNull();
  });

  it("caps long titles at 120 chars to keep the meetings list tidy", () => {
    const long = "Meeting: " + "x".repeat(200);
    const result = deriveMeetingTitleFromTranscript(long);
    expect(result).not.toBeNull();
    expect((result ?? "").length).toBeLessThanOrEqual(120);
  });
});
