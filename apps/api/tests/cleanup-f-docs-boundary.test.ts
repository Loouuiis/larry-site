import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const docsDir = resolve(process.cwd(), "..", "..", "docs");

const coreRuntimeDocs = [
  "AI-AGENT.md",
  "BACKEND-API.md",
  "BACKEND-WORKER.md",
  "DATABASE.md",
  "ARCHITECTURE.md",
] as const;

function loadCoreDocsText(): string {
  return coreRuntimeDocs
    .map((fileName) => readFileSync(resolve(docsDir, fileName), "utf8"))
    .join("\n\n");
}

describe("Cleanup F docs boundary", () => {
  it("keeps core runtime docs on canonical Larry endpoints", () => {
    const docsText = loadCoreDocsText();

    expect(docsText).toContain("/v1/larry/chat");
    expect(docsText).toContain("/v1/larry/action-centre");
    expect(docsText).toContain("/v1/larry/events/:id/accept");
    expect(docsText).toContain("/v1/larry/events/:id/dismiss");
    expect(docsText).toContain("/v1/larry/transcript");
  });

  it("does not reintroduce legacy action/agent seams in core runtime docs", () => {
    const docsText = loadCoreDocsText();

    expect(docsText).not.toContain("/v1/agent/");
    expect(docsText).not.toMatch(/\/v1\/actions\/[^\s`]+\/(approve|reject|override)/);

    expect(docsText).not.toContain("agent_runs");
    expect(docsText).not.toContain("extracted_actions");
    expect(docsText).not.toContain("approval_decisions");
    expect(docsText).not.toContain("interventions");
  });
});
