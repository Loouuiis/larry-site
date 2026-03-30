#!/usr/bin/env node

import process from "node:process";
import {
  createPgQueryRunner,
  getPhase27ExtractionRehearsalUsage,
  parsePhase27ExtractionRehearsalArgs,
  runPhase27ExtractionRehearsal,
  writePhase27RehearsalArtifacts,
} from "./phase-2.7-rehearsal-lib.mjs";

export async function main(argv = process.argv.slice(2), env = process.env) {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(getPhase27ExtractionRehearsalUsage());
    return;
  }

  const args = parsePhase27ExtractionRehearsalArgs(argv);
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  const queryRunner = createPgQueryRunner(databaseUrl);
  await queryRunner.connect();

  try {
    const report = await runPhase27ExtractionRehearsal({
      queryRunner,
      tenantId: args.tenantId,
      environment: args.environment,
      dataset: args.dataset,
    });

    const artifacts = await writePhase27RehearsalArtifacts(report, {
      outputDirectory: args.outDir,
    });

    console.log(`status=${report.status}`);
    console.log(`artifact_json=${artifacts.jsonPath}`);
    console.log(`artifact_markdown=${artifacts.markdownPath}`);
  } finally {
    await queryRunner.close();
  }
}

main().catch((error) => {
  console.error(`[phase-2.7-extraction-rehearsal] ${error.message}`);
  process.exitCode = 1;
});
