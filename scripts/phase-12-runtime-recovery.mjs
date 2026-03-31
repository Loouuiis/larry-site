#!/usr/bin/env node

import process from "node:process";
import {
  getPhase12RuntimeRecoveryUsage,
  parsePhase12RuntimeRecoveryArgs,
  runPhase12RuntimeRecovery,
} from "./phase-12-runtime-recovery-lib.mjs";

function printSummary(result, args) {
  console.log(`command=${args.command}`);
  if (args.command === "bulk") {
    console.log(`mode=${args.execute ? "execute" : "dry-run"}`);
  }
  console.log(`status=${result.status}`);
  console.log(`request_method=${result.request.method}`);
  console.log(`request_path=${result.request.path}`);
  console.log(JSON.stringify(result.body, null, 2));
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(getPhase12RuntimeRecoveryUsage());
    return;
  }

  const args = parsePhase12RuntimeRecoveryArgs(argv);
  const result = await runPhase12RuntimeRecovery(args, { env });
  printSummary(result, args);
}

main().catch((error) => {
  console.error(`[phase-12-runtime-recovery] ${error.message}`);
  process.exitCode = 1;
});
