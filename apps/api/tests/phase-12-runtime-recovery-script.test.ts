import { beforeAll, describe, expect, it } from "vitest";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

let PHASE_12_BULK_CONFIRM_TOKEN: string;
let parsePhase12RuntimeRecoveryArgs: (argv: string[]) => {
  command: "list" | "retry" | "bulk";
  status: string | null;
  source: string | null;
  limit: number;
  canonicalEventId: string | null;
  reason: string | null;
  execute: boolean;
  confirmToken: string | null;
};
let buildPhase12RuntimeRecoveryRequest: (args: {
  command: "list" | "retry" | "bulk";
  status: string | null;
  source: string | null;
  limit: number;
  canonicalEventId: string | null;
  reason: string | null;
  execute: boolean;
  confirmToken: string | null;
}) => { method: string; path: string; body: Record<string, unknown> | null };

beforeAll(async () => {
  const runtimeRecoveryPath = resolve(
    process.cwd(),
    "..",
    "..",
    "scripts",
    "phase-12-runtime-recovery-lib.mjs"
  );
  const module = (await import(pathToFileURL(runtimeRecoveryPath).href)) as {
    PHASE_12_BULK_CONFIRM_TOKEN: string;
    parsePhase12RuntimeRecoveryArgs: typeof parsePhase12RuntimeRecoveryArgs;
    buildPhase12RuntimeRecoveryRequest: typeof buildPhase12RuntimeRecoveryRequest;
  };

  PHASE_12_BULK_CONFIRM_TOKEN = module.PHASE_12_BULK_CONFIRM_TOKEN;
  parsePhase12RuntimeRecoveryArgs = module.parsePhase12RuntimeRecoveryArgs;
  buildPhase12RuntimeRecoveryRequest = module.buildPhase12RuntimeRecoveryRequest;
});

describe("phase 12 runtime recovery script args", () => {
  it("parses list command defaults", () => {
    const args = parsePhase12RuntimeRecoveryArgs(["list"]);
    expect(args).toMatchObject({
      command: "list",
      status: null,
      source: null,
      limit: 25,
      execute: false,
    });
  });

  it("parses retry command with id and reason", () => {
    const args = parsePhase12RuntimeRecoveryArgs([
      "retry",
      "--id",
      "11111111-1111-4111-8111-111111111111",
      "--reason",
      "manual replay",
    ]);

    expect(args).toMatchObject({
      command: "retry",
      canonicalEventId: "11111111-1111-4111-8111-111111111111",
      reason: "manual replay",
      execute: false,
    });
  });

  it("keeps bulk mode in safe dry-run when --execute is omitted", () => {
    const args = parsePhase12RuntimeRecoveryArgs([
      "bulk",
      "--status",
      "retryable_failed",
      "--limit",
      "10",
    ]);

    expect(args).toMatchObject({
      command: "bulk",
      status: "retryable_failed",
      limit: 10,
      execute: false,
      confirmToken: null,
    });
  });

  it("enforces confirmation token for execute mode", () => {
    expect(() =>
      parsePhase12RuntimeRecoveryArgs([
        "bulk",
        "--execute",
      ])
    ).toThrow(`--execute requires --confirm ${PHASE_12_BULK_CONFIRM_TOKEN}`);

    const args = parsePhase12RuntimeRecoveryArgs([
      "bulk",
      "--execute",
      "--confirm",
      PHASE_12_BULK_CONFIRM_TOKEN,
    ]);
    expect(args.execute).toBe(true);
    expect(args.confirmToken).toBe(PHASE_12_BULK_CONFIRM_TOKEN);
  });
});

describe("phase 12 runtime recovery request payload shaping", () => {
  it("builds canonical list request with filters", () => {
    const request = buildPhase12RuntimeRecoveryRequest(
      parsePhase12RuntimeRecoveryArgs([
        "list",
        "--status",
        "dead_lettered",
        "--source",
        "transcript",
        "--limit",
        "12",
      ])
    );

    expect(request).toEqual({
      method: "GET",
      path: "/v1/larry/runtime/canonical-events?status=dead_lettered&source=transcript&limit=12",
      body: null,
    });
  });

  it("builds single retry request body with optional reason", () => {
    const request = buildPhase12RuntimeRecoveryRequest(
      parsePhase12RuntimeRecoveryArgs([
        "retry",
        "--id",
        "22222222-2222-4222-8222-222222222222",
        "--reason",
        "operator replay",
      ])
    );

    expect(request).toEqual({
      method: "POST",
      path: "/v1/larry/runtime/canonical-events/22222222-2222-4222-8222-222222222222/retry",
      body: {
        reason: "operator replay",
      },
    });
  });

  it("builds bulk payload for dry-run and execute modes", () => {
    const dryRunRequest = buildPhase12RuntimeRecoveryRequest(
      parsePhase12RuntimeRecoveryArgs([
        "bulk",
        "--status",
        "all",
        "--source",
        "slack",
        "--limit",
        "7",
      ])
    );
    expect(dryRunRequest).toEqual({
      method: "POST",
      path: "/v1/larry/runtime/canonical-events/retry-bulk",
      body: {
        status: "all",
        source: "slack",
        limit: 7,
        execute: false,
      },
    });

    const executeRequest = buildPhase12RuntimeRecoveryRequest(
      parsePhase12RuntimeRecoveryArgs([
        "bulk",
        "--status",
        "dead_lettered",
        "--limit",
        "5",
        "--reason",
        "recover after outage",
        "--execute",
        "--confirm",
        PHASE_12_BULK_CONFIRM_TOKEN,
      ])
    );
    expect(executeRequest).toEqual({
      method: "POST",
      path: "/v1/larry/runtime/canonical-events/retry-bulk",
      body: {
        status: "dead_lettered",
        limit: 5,
        execute: true,
        reason: "recover after outage",
      },
    });
  });
});
