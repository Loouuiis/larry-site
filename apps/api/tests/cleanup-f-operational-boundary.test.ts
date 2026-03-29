import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const openApiPath = resolve(process.cwd(), "openapi.yaml");
const demoSmokeScriptPath = resolve(process.cwd(), "..", "..", "scripts", "demo-smoke-test.sh");
const pmApiPath = resolve(process.cwd(), "..", "web", "src", "lib", "pm-api.ts");

const openApiSource = readFileSync(openApiPath, "utf8");
const demoSmokeScriptSource = readFileSync(demoSmokeScriptPath, "utf8");
const pmApiSource = readFileSync(pmApiPath, "utf8");

describe("Cleanup F operational contract boundary", () => {
  it("keeps OpenAPI on canonical Larry contracts and excludes legacy action/agent paths", () => {
    expect(openApiSource).toContain("/v1/larry/chat:");
    expect(openApiSource).toContain("/v1/larry/action-centre:");
    expect(openApiSource).toContain("/v1/larry/events/{id}/accept:");
    expect(openApiSource).toContain("/v1/larry/events/{id}/dismiss:");
    expect(openApiSource).toContain("/v1/larry/transcript:");

    expect(openApiSource).not.toContain("/v1/agent/runs:");
    expect(openApiSource).not.toContain("/v1/agent/actions:");
    expect(openApiSource).not.toContain("/v1/actions/{id}/approve:");
    expect(openApiSource).not.toContain("/v1/actions/{id}/reject:");
    expect(openApiSource).not.toContain("/v1/actions/{id}/override:");
  });

  it("keeps demo smoke script on canonical larry runtime endpoints", () => {
    expect(demoSmokeScriptSource).toContain("/v1/larry/transcript");
    expect(demoSmokeScriptSource).toContain("/v1/larry/action-centre");
    expect(demoSmokeScriptSource).toContain("/v1/larry/events/");

    expect(demoSmokeScriptSource).not.toContain("/v1/agent/");
    expect(demoSmokeScriptSource).not.toContain("/v1/actions/");
    expect(demoSmokeScriptSource).not.toContain("/v1/larry/commands");
  });

  it("keeps workspace snapshot helper on canonical action-centre reads", () => {
    expect(pmApiSource).toContain("/v1/larry/action-centre");
    expect(pmApiSource).not.toContain("/v1/agent/");
    expect(pmApiSource).not.toContain("/v1/actions/");
  });
});
