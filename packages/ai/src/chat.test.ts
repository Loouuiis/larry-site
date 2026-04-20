import { describe, it, expect } from "vitest";
import { DraftSlackInputSchema, fallbackDisplayText } from "./chat.js";

describe("DraftSlackInputSchema (B-008)", () => {
  it("accepts a minimal valid Slack draft payload", () => {
    const parsed = DraftSlackInputSchema.parse({
      channelName: "#launch",
      message: "Kickoff tomorrow at 10am. Blockers to call out?",
      reasoning: "User asked for a launch-channel ping ahead of kickoff",
      displayText: "Draft Slack to #launch",
    });
    expect(parsed.channelName).toBe("#launch");
    expect(parsed.message).toContain("Kickoff");
    expect(parsed.threadTs).toBeUndefined();
  });

  it("accepts an optional threadTs for reply-in-thread", () => {
    const parsed = DraftSlackInputSchema.parse({
      channelName: "#launch",
      message: "Thanks — following up.",
      threadTs: "1713456789.001200",
      reasoning: "Replying in thread to Priya's update",
      displayText: "Reply in #launch thread",
    });
    expect(parsed.threadTs).toBe("1713456789.001200");
  });

  it("rejects a payload missing channelName", () => {
    const r = DraftSlackInputSchema.safeParse({
      message: "hi",
      reasoning: "x",
      displayText: "Draft Slack",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a payload missing message", () => {
    const r = DraftSlackInputSchema.safeParse({
      channelName: "#launch",
      reasoning: "x",
      displayText: "Draft Slack",
    });
    expect(r.success).toBe(false);
  });
});

describe("fallbackDisplayText (B-008)", () => {
  it("renders a draft_slack fallback with the channel name", () => {
    expect(
      fallbackDisplayText("draft_slack", { channelName: "#launch" })
    ).toBe("Draft Slack message to #launch");
  });

  it("renders a safe default when channelName is absent", () => {
    expect(fallbackDisplayText("draft_slack", {})).toBe(
      "Draft Slack message to channel"
    );
  });
});
