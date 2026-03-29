import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workspaceTaskRoutePath = resolve(
  process.cwd(),
  "..",
  "web",
  "src",
  "app",
  "api",
  "workspace",
  "tasks",
  "route.ts"
);
const workspaceTaskTriageRoutePath = resolve(
  process.cwd(),
  "..",
  "web",
  "src",
  "app",
  "api",
  "workspace",
  "tasks",
  "triage",
  "route.ts"
);

const workspaceTaskRouteSource = readFileSync(workspaceTaskRoutePath, "utf8");
const workspaceTaskTriageRouteSource = readFileSync(workspaceTaskTriageRoutePath, "utf8");

describe("workspace task triage runtime boundary", () => {
  it("routes active task triage writes through canonical /v1/larry/chat", () => {
    expect(workspaceTaskRouteSource).toContain("/v1/larry/chat");
    expect(workspaceTaskTriageRouteSource).toContain("/v1/larry/chat");
  });

  it("does not route active task triage writes through legacy /v1/agent/runs", () => {
    expect(workspaceTaskRouteSource).not.toContain("/v1/agent/runs");
    expect(workspaceTaskTriageRouteSource).not.toContain("/v1/agent/runs");
  });
});
