#!/usr/bin/env node

import process from "node:process";
import {
  createPgQueryRunner,
  writePhase27RehearsalArtifacts,
} from "./phase-2.7-rehearsal-lib.mjs";
import {
  getPhase27RetirementWindowUsage,
  parsePhase27RetirementWindowArgs,
  runPhase27RetirementWindow,
  writePhase27RetirementWindowArtifacts,
} from "./phase-2.7-retirement-window-lib.mjs";

function shouldExitNonZero(finalDecision) {
  return ["precheck_blocked", "blocked", "postcheck_failed", "error"].includes(finalDecision);
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(getPhase27RetirementWindowUsage());
    return;
  }

  const options = parsePhase27RetirementWindowArgs(argv);
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  const generatedAtUtc = new Date().toISOString();
  const queryRunner = createPgQueryRunner(databaseUrl);
  await queryRunner.connect();

  try {
    const report = await runPhase27RetirementWindow({
      queryRunner,
      options,
      env,
      generatedAtUtc,
    });

    if (report.precheck.rehearsal?.report) {
      report.precheck.rehearsal.artifacts = await writePhase27RehearsalArtifacts(
        report.precheck.rehearsal.report,
        {
          outputDirectory: options.outDir,
        }
      );
    }

    const summaryArtifacts = await writePhase27RetirementWindowArtifacts(report, {
      outputDirectory: options.outDir,
    });

    console.log(`final_decision=${report.finalDecision}`);
    console.log(`destructive_sql_executed=${report.destructiveSqlExecuted ? "yes" : "no"}`);
    if (report.precheck.rehearsal?.artifacts) {
      console.log(`rehearsal_artifact_json=${report.precheck.rehearsal.artifacts.jsonPath}`);
      console.log(`rehearsal_artifact_markdown=${report.precheck.rehearsal.artifacts.markdownPath}`);
    }
    console.log(`artifact_json=${summaryArtifacts.jsonPath}`);
    console.log(`artifact_markdown=${summaryArtifacts.markdownPath}`);

    if (shouldExitNonZero(report.finalDecision)) {
      process.exitCode = 1;
    }
  } finally {
    await queryRunner.close();
  }
}

main().catch((error) => {
  console.error(`[phase-2.7-retirement-window] ${error.message}`);
  process.exitCode = 1;
});
