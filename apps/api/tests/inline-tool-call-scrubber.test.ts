import { describe, expect, it } from "vitest";
import { scrubInlineToolCallText, InlineToolCallScrubber } from "@larry/ai";

// QA-2026-04-15 #49 regression guard.
//
// Users saw raw tool-call XML in Larry chat bubbles because Gemini sometimes
// emits inline `<function=name>{json}</function>` (or the orphaned trailing
// `{json}</function>` variant) through the text-delta channel. The backend
// forwarded tokens verbatim to the browser and only stripped the opening tag
// at DB-write time, so live UI + on-refresh content diverged.

describe("scrubInlineToolCallText", () => {
  it("strips complete <function=...>...</function> blocks", () => {
    expect(
      scrubInlineToolCallText(
        'hello <function=get_task_list>{"filter":"all"}</function> world'
      )
    ).toBe("hello  world");
  });

  it("strips orphaned {json}</function> payload (observed Gemini leak)", () => {
    expect(
      scrubInlineToolCallText(
        'tasks due this week. {"filter":"all"}</function>'
      )
    ).toBe("tasks due this week. ");
  });

  it("strips bare closing tags", () => {
    expect(scrubInlineToolCallText("prose.</function>")).toBe("prose.");
  });

  it("drops unclosed opening tag + everything after", () => {
    expect(scrubInlineToolCallText("prose <function=foo>partial")).toBe("prose ");
  });

  it("is a no-op for plain prose", () => {
    expect(scrubInlineToolCallText("Just a normal response.")).toBe(
      "Just a normal response."
    );
  });

  it("preserves legitimate JSON without a closing tag", () => {
    expect(scrubInlineToolCallText('API returns {"ok":true} for valid keys.')).toBe(
      'API returns {"ok":true} for valid keys.'
    );
  });

  it("is idempotent", () => {
    const input = 'hi <function=x>{"a":1}</function> there';
    expect(scrubInlineToolCallText(scrubInlineToolCallText(input))).toBe("hi  there");
  });
});

describe("InlineToolCallScrubber (streaming)", () => {
  function streamEverything(scrubber: InlineToolCallScrubber, chunks: string[]): string {
    let out = "";
    for (const c of chunks) out += scrubber.push(c);
    out += scrubber.flush();
    return out;
  }

  it("strips a full <function=X>{}</function> block split across chunks", () => {
    const s = new InlineToolCallScrubber();
    const result = streamEverything(s, [
      "Hello ",
      "<function=",
      "get_task_list>",
      '{"filter":"all"}',
      "</function>",
      " world",
    ]);
    expect(result).toBe("Hello  world");
  });

  it("strips orphaned closing tag split across chunks (the #49 leak)", () => {
    const s = new InlineToolCallScrubber();
    const result = streamEverything(s, [
      "No overdue tasks. ",
      '{"filter":',
      '"all"}',
      "</function>",
    ]);
    expect(result).toBe("No overdue tasks. ");
  });

  it("preserves plain prose across many small chunks", () => {
    const s = new InlineToolCallScrubber();
    const result = streamEverything(s, ["The ", "biggest ", "risk ", "is ", "auth."]);
    expect(result).toBe("The biggest risk is auth.");
  });

  it("does not indefinitely buffer long prose", () => {
    const s = new InlineToolCallScrubber();
    const long = "A".repeat(400);
    const emitted = s.push(long) + s.flush();
    expect(emitted).toBe(long);
  });

  it("drops an incomplete opening tag at end-of-stream", () => {
    const s = new InlineToolCallScrubber();
    const result = streamEverything(s, ["prose ", "<function=foo>incomplete"]);
    expect(result).toBe("prose ");
  });

  it("concatenated stream equals non-streaming scrub for Gemini leak sample", () => {
    const sample =
      'There are no overdue tasks, I\'ll try to find tasks due this week. {"filter":"all"}</function>';
    // Simulate 1-char chunks (worst-case fragmentation).
    const s = new InlineToolCallScrubber();
    let out = "";
    for (const c of sample) out += s.push(c);
    out += s.flush();
    expect(out).toBe(scrubInlineToolCallText(sample));
    expect(out).toBe("There are no overdue tasks, I'll try to find tasks due this week. ");
  });
});
