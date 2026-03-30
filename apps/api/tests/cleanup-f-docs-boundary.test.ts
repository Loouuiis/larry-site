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

const nonCoreDocs = [
  "FRONTEND.md",
  "V1-SCOPE.md",
] as const;

function loadCoreDocsText(): string {
  return coreRuntimeDocs
    .map((fileName) => readFileSync(resolve(docsDir, fileName), "utf8"))
    .join("\n\n");
}

function loadNonCoreDocsText(): string {
  return nonCoreDocs
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

describe("Non-core docs boundary sweep", () => {
  it("does not reintroduce legacy active-path seams in FRONTEND.md or V1-SCOPE.md", () => {
    const docsText = loadNonCoreDocsText();

    // Legacy Larry command/run endpoints are retired (replaced by /larry/chat)
    expect(docsText).not.toContain("/larry/commands");
    expect(docsText).not.toContain("/larry/run");

    // Legacy agent pipeline endpoints
    expect(docsText).not.toContain("/v1/agent/");
  });

  it("does not reference deleted companion docs in V1-SCOPE.md", () => {
    const vScopeText = readFileSync(resolve(docsDir, "V1-SCOPE.md"), "utf8");

    // These docs were deleted and must not be linked again
    expect(vScopeText).not.toContain("SPRINT-4DAY.md");
    expect(vScopeText).not.toContain("larry-mvp-readiness-2026-03-25.md");
  });

  it("does not describe useProjectData as calling the snapshot endpoint in FRONTEND.md", () => {
    const frontendText = readFileSync(resolve(docsDir, "FRONTEND.md"), "utf8");

    // useProjectData was previously described as calling /snapshot — must stay corrected
    expect(frontendText).not.toMatch(/useProjectData[^\n]*snapshot/i);
  });
});
