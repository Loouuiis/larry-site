import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  PHASE_27_ARTIFACTS_OUT_DIR,
  buildArtifactBaseName,
  renderMarkdownTable,
  runPhase27ExtractionRehearsal,
  toNumber,
} from "./phase-2.7-rehearsal-lib.mjs";

export const PHASE_27_DESTRUCTIVE_RETIREMENT_ENV = "LARRY_ALLOW_PHASE27_DESTRUCTIVE_RETIREMENT";
export const PHASE_27_RETIREMENT_CONFIRM_TOKEN = "phase-2.7-retirement";
export const PHASE_27_RETIREMENT_REVIEWER_DEFAULT = "Fergus (temporary)";

const TRUE_ENV_VALUES = new Set(["1", "true", "yes", "on"]);
const EXPECTED_FK_BASELINES = [
  {
    tableName: "correction_feedback",
    columnName: "action_id",
    referencesTable: "extracted_actions",
    constraintName: "correction_feedback_action_id_fkey",
  },
  {
    tableName: "email_outbound_drafts",
    columnName: "action_id",
    referencesTable: "extracted_actions",
    constraintName: "email_outbound_drafts_action_id_fkey",
  },
  {
    tableName: "meeting_notes",
    columnName: "agent_run_id",
    referencesTable: "agent_runs",
    constraintName: "meeting_notes_agent_run_id_fkey",
  },
];
const LEGACY_TABLE_BASELINE_ORDER = [
  "approval_decisions",
  "interventions",
  "agent_run_transitions",
  "extracted_actions",
  "agent_runs",
];
const FK_BASELINE_POLICY = {
  id: "allow-attached-or-detached",
  description:
    "A/B/C dependencies may already be detached before the retirement window. Both attached and detached states are valid.",
  blocksOnMissingDependencies: false,
};

export const PHASE_27_RETIREMENT_STAGES = [
  {
    name: "migration_a_b_c_fk_detach",
    label: "Migration A/B/C FK detach",
    statements: [
      "ALTER TABLE meeting_notes DROP CONSTRAINT IF EXISTS meeting_notes_agent_run_id_fkey;",
      "ALTER TABLE email_outbound_drafts DROP CONSTRAINT IF EXISTS email_outbound_drafts_action_id_fkey;",
      "ALTER TABLE correction_feedback DROP CONSTRAINT IF EXISTS correction_feedback_action_id_fkey;",
    ],
  },
  {
    name: "migration_d_child_table_retirement",
    label: "Migration D child-table retirement",
    statements: [
      "DROP TABLE IF EXISTS approval_decisions;",
      "DROP TABLE IF EXISTS interventions;",
      "DROP TABLE IF EXISTS agent_run_transitions;",
    ],
  },
  {
    name: "migration_e_parent_table_retirement",
    label: "Migration E parent-table retirement",
    statements: [
      "DROP TABLE IF EXISTS extracted_actions;",
      "DROP TABLE IF EXISTS agent_runs;",
    ],
  },
];

export function getPhase27RetirementWindowUsage() {
  return `Usage:
  node scripts/phase-2.7-retirement-window.mjs \\
    --tenant <uuid> \\
    --environment <name> \\
    --baseline-timestamp <iso> \\
    [--out-dir <path>] \\
    [--engineer <name>] \\
    [--reviewer <name>] \\
    [--rollback-owner <name>] \\
    [--window-start <iso>] \\
    [--window-end <iso>] \\
    [--execute --confirm ${PHASE_27_RETIREMENT_CONFIRM_TOKEN}]

Required:
  --tenant             Tenant UUID to operate against.
  --environment        Environment label for artifact metadata.
  --baseline-timestamp Baseline timestamp used for growth-gate checks.

Optional:
  --out-dir            Artifact output directory. Defaults to ${PHASE_27_ARTIFACTS_OUT_DIR}.
  --engineer           Engineer sign-off metadata.
  --reviewer           Reviewer sign-off metadata. Defaults to ${PHASE_27_RETIREMENT_REVIEWER_DEFAULT}.
  --rollback-owner     Rollback owner metadata.
  --window-start       Window start timestamp (UTC).
  --window-end         Window end timestamp (UTC).
  --execute            Run destructive A/B/C/D/E statements after prechecks pass.
  --confirm            Required exact token when --execute is used.
`;
}

function readFlagValue(token, next) {
  if (!next || next.startsWith("--")) {
    throw new Error(`Missing required value for ${token}`);
  }
  return next;
}

function assertValidIsoTimestamp(value, flagName) {
  if (Number.isNaN(Date.parse(value))) {
    throw new Error(`Invalid ${flagName} value: ${value}`);
  }
}

export function parsePhase27RetirementWindowArgs(argv) {
  const args = {
    tenantId: "",
    environment: "",
    baselineTimestamp: "",
    outDir: PHASE_27_ARTIFACTS_OUT_DIR,
    engineer: null,
    reviewer: PHASE_27_RETIREMENT_REVIEWER_DEFAULT,
    rollbackOwner: null,
    windowStart: null,
    windowEnd: null,
    execute: false,
    confirmToken: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    if (token === "--tenant") {
      args.tenantId = readFlagValue(token, next);
      index += 1;
      continue;
    }
    if (token === "--environment") {
      args.environment = readFlagValue(token, next);
      index += 1;
      continue;
    }
    if (token === "--baseline-timestamp") {
      args.baselineTimestamp = readFlagValue(token, next);
      index += 1;
      continue;
    }
    if (token === "--out-dir") {
      args.outDir = readFlagValue(token, next);
      index += 1;
      continue;
    }
    if (token === "--engineer") {
      args.engineer = readFlagValue(token, next);
      index += 1;
      continue;
    }
    if (token === "--reviewer") {
      args.reviewer = readFlagValue(token, next);
      index += 1;
      continue;
    }
    if (token === "--rollback-owner") {
      args.rollbackOwner = readFlagValue(token, next);
      index += 1;
      continue;
    }
    if (token === "--window-start") {
      args.windowStart = readFlagValue(token, next);
      index += 1;
      continue;
    }
    if (token === "--window-end") {
      args.windowEnd = readFlagValue(token, next);
      index += 1;
      continue;
    }
    if (token === "--execute") {
      args.execute = true;
      continue;
    }
    if (token === "--confirm") {
      args.confirmToken = readFlagValue(token, next);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  if (!args.tenantId) throw new Error("Missing required argument: --tenant <uuid>");
  if (!args.environment) throw new Error("Missing required argument: --environment <name>");
  if (!args.baselineTimestamp) {
    throw new Error("Missing required argument: --baseline-timestamp <iso>");
  }
  if (!args.outDir) throw new Error("Invalid --out-dir value.");

  assertValidIsoTimestamp(args.baselineTimestamp, "--baseline-timestamp");
  if (args.windowStart) assertValidIsoTimestamp(args.windowStart, "--window-start");
  if (args.windowEnd) assertValidIsoTimestamp(args.windowEnd, "--window-end");

  if (args.execute && args.confirmToken !== PHASE_27_RETIREMENT_CONFIRM_TOKEN) {
    throw new Error(
      `--execute requires --confirm ${PHASE_27_RETIREMENT_CONFIRM_TOKEN}`
    );
  }

  return args;
}

export function resolvePhase27RetirementEnvEnabled(value) {
  if (!value) return false;
  return TRUE_ENV_VALUES.has(value.trim().toLowerCase());
}

function assertSafeTableName(tableName) {
  if (!/^[a-z_][a-z0-9_]*$/.test(tableName)) {
    throw new Error(`Unsafe table name: ${tableName}`);
  }
}

function normalizeFkRows(rows) {
  return rows.map((row) => ({
    tableName: row.table_name,
    columnName: row.column_name,
    referencesTable: row.references_table,
    constraintName: row.constraint_name,
  }));
}

function summarizeRehearsal(report) {
  return {
    status: report.status,
    preflightPassed: report.preflight.passed,
    anomalyCodes: report.anomalies.map((anomaly) => anomaly.code),
    anomalyCount: report.anomalies.length,
  };
}

function evaluateGrowthGate(row) {
  const counts = {
    newChatMissingSourceRecord: toNumber(row?.new_chat_missing_source_record),
    newScheduleMissingSourceRecord: toNumber(row?.new_schedule_missing_source_record),
    newInvalidChatLinkage: toNumber(row?.new_invalid_chat_linkage),
  };

  return {
    passed:
      counts.newChatMissingSourceRecord === 0 &&
      counts.newScheduleMissingSourceRecord === 0 &&
      counts.newInvalidChatLinkage === 0,
    counts,
  };
}

function evaluateFkBaseline(rows) {
  const normalizedRows = normalizeFkRows(rows);
  const actualKeys = new Set(
    normalizedRows.map((row) => `${row.tableName}|${row.columnName}|${row.referencesTable}`)
  );

  const missingDependencies = EXPECTED_FK_BASELINES.filter(
    (expected) =>
      !actualKeys.has(`${expected.tableName}|${expected.columnName}|${expected.referencesTable}`)
  ).map((expected) => ({
    tableName: expected.tableName,
    columnName: expected.columnName,
    referencesTable: expected.referencesTable,
    expectedConstraintName: expected.constraintName,
  }));

  const expectedDependencyCount = EXPECTED_FK_BASELINES.length;
  const attachedDependencyCount = expectedDependencyCount - missingDependencies.length;

  let observedState = "partially_attached";
  if (attachedDependencyCount === expectedDependencyCount) {
    observedState = "fully_attached";
  } else if (attachedDependencyCount === 0) {
    observedState = "fully_detached";
  }

  return {
    policy: FK_BASELINE_POLICY,
    expectedDependencies: EXPECTED_FK_BASELINES.map((item) => ({ ...item })),
    expectedDependencyCount,
    attachedDependencyCount,
    observedState,
    passed: true,
    rows: normalizedRows,
    missingDependencies,
  };
}

function evaluateLegacyTableBaseline(rows) {
  const missingTables = rows.filter((row) => row.tableExists !== true).map((row) => row.tableName);
  return {
    passed: missingTables.length === 0,
    rows,
    missingTables,
  };
}

function evaluatePostcheckTables(rows) {
  const remainingTables = rows.filter((row) => row.tableExists === true).map((row) => row.tableName);
  return {
    passed: remainingTables.length === 0,
    rows,
    remainingTables,
  };
}

function buildStageResultsTemplate() {
  return PHASE_27_RETIREMENT_STAGES.map((stage) => ({
    name: stage.name,
    label: stage.label,
    status: "not_run",
    statements: [...stage.statements],
  }));
}

async function loadGrowthGate(queryRunner, tenantId, baselineTimestamp) {
  const rows = await queryRunner.query(
    `
      SELECT
        COUNT(*) FILTER (
          WHERE source_kind = 'chat'
            AND source_record_id IS NULL
            AND created_at > $2
        ) AS new_chat_missing_source_record,
        COUNT(*) FILTER (
          WHERE source_kind = 'schedule'
            AND source_record_id IS NULL
            AND created_at > $2
        ) AS new_schedule_missing_source_record,
        COUNT(*) FILTER (
          WHERE source_kind = 'chat'
            AND (
              conversation_id IS NULL
              OR request_message_id IS NULL
              OR response_message_id IS NULL
              OR requested_by_user_id IS NULL
            )
            AND created_at > $2
        ) AS new_invalid_chat_linkage
      FROM larry_events
      WHERE tenant_id = $1
    `,
    [tenantId, baselineTimestamp]
  );

  return evaluateGrowthGate(rows[0]);
}

async function loadFkBaseline(queryRunner) {
  const rows = await queryRunner.query(
    `
      SELECT tc.table_name,
             kcu.column_name,
             ccu.table_name AS references_table,
             tc.constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.table_schema = kcu.table_schema
       AND tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage ccu
        ON tc.table_schema = ccu.table_schema
       AND tc.constraint_name = ccu.constraint_name
      WHERE tc.table_schema = 'public'
        AND tc.constraint_type = 'FOREIGN KEY'
        AND (
          (tc.table_name = 'meeting_notes' AND kcu.column_name = 'agent_run_id' AND ccu.table_name = 'agent_runs')
          OR (tc.table_name = 'email_outbound_drafts' AND kcu.column_name = 'action_id' AND ccu.table_name = 'extracted_actions')
          OR (tc.table_name = 'correction_feedback' AND kcu.column_name = 'action_id' AND ccu.table_name = 'extracted_actions')
        )
      ORDER BY tc.table_name
    `
  );

  return evaluateFkBaseline(rows);
}

async function loadLegacyTableState(queryRunner, tableName) {
  assertSafeTableName(tableName);

  const tableExistsRows = await queryRunner.query(
    `
      SELECT to_regclass($1) IS NOT NULL AS table_exists
    `,
    [`public.${tableName}`]
  );

  const tableExists = tableExistsRows[0]?.table_exists === true;
  if (!tableExists) {
    return {
      tableName,
      tableExists: false,
      rowCount: null,
    };
  }

  const rowCountRows = await queryRunner.query(
    `
      SELECT COUNT(*) AS row_count
      FROM ${tableName}
    `
  );

  return {
    tableName,
    tableExists: true,
    rowCount: toNumber(rowCountRows[0]?.row_count),
  };
}

async function loadLegacyTableBaseline(queryRunner) {
  const rows = [];
  for (const tableName of LEGACY_TABLE_BASELINE_ORDER) {
    rows.push(await loadLegacyTableState(queryRunner, tableName));
  }
  return evaluateLegacyTableBaseline(rows);
}

function buildBlockingReasons({ rehearsal, growthGate, legacyTables, executeRequested, envEnabled }) {
  const reasons = [];

  if (rehearsal.status !== "ok") {
    reasons.push("rehearsal status is not ok");
  }
  if (!growthGate.passed) {
    reasons.push("growth-gate counts are non-zero");
  }
  if (!legacyTables.passed) {
    reasons.push(`required legacy tables are missing: ${legacyTables.missingTables.join(", ")}`);
  }
  if (executeRequested && envEnabled) {
    reasons.push(
      `${PHASE_27_DESTRUCTIVE_RETIREMENT_ENV} must be unset or false before destructive execution`
    );
  }

  return reasons;
}

async function executeRetirementStages(queryRunner, stageResults) {
  for (let index = 0; index < PHASE_27_RETIREMENT_STAGES.length; index += 1) {
    const stage = PHASE_27_RETIREMENT_STAGES[index];
    const stageResult = stageResults[index];
    stageResult.status = "running";

    for (const statement of stage.statements) {
      await queryRunner.query(statement);
    }

    stageResult.status = "completed";
  }
}

export async function runPhase27RetirementWindow({
  queryRunner,
  options,
  env = process.env,
  generatedAtUtc = new Date().toISOString(),
}) {
  const destructiveRetirementEnvValue = env[PHASE_27_DESTRUCTIVE_RETIREMENT_ENV];
  const destructiveRetirementEnvEnabled = resolvePhase27RetirementEnvEnabled(
    destructiveRetirementEnvValue
  );

  const report = {
    schemaVersion: "phase-2.7-retirement-window-v1",
    generatedAtUtc,
    environment: options.environment,
    tenantId: options.tenantId,
    baselineTimestamp: options.baselineTimestamp,
    scriptPath: "scripts/phase-2.7-retirement-window.mjs",
    mode: options.execute ? "execute" : "precheck",
    destructiveSqlExecuted: false,
    safeguards: {
      destructiveRetirementEnv: {
        name: PHASE_27_DESTRUCTIVE_RETIREMENT_ENV,
        value: destructiveRetirementEnvValue ?? null,
        enabled: destructiveRetirementEnvEnabled,
      },
      confirmation: {
        executeRequested: options.execute,
        tokenRequired: PHASE_27_RETIREMENT_CONFIRM_TOKEN,
        tokenProvided: options.confirmToken !== null,
      },
    },
    operator: {
      engineer: options.engineer,
      reviewer: options.reviewer,
      rollbackOwner: options.rollbackOwner,
      windowStart: options.windowStart,
      windowEnd: options.windowEnd,
    },
    precheck: {
      rehearsal: null,
      growthGate: null,
      fkBaseline: null,
      legacyTableBaseline: null,
      passed: false,
      blockingReasons: [],
    },
    execution: {
      requested: options.execute,
      executed: false,
      stages: buildStageResultsTemplate(),
    },
    postcheck: {
      executed: false,
      fkVerification: null,
      tableVerification: null,
      passed: false,
    },
    finalDecision: "precheck_pending",
    failure: null,
  };

  try {
    const rehearsalReport = await runPhase27ExtractionRehearsal({
      queryRunner,
      tenantId: options.tenantId,
      environment: options.environment,
      dataset: options.execute
        ? "phase-2.7-retirement-window-execute-precheck"
        : "phase-2.7-retirement-window-precheck",
      generatedAtUtc,
      signOff: {
        engineer: options.engineer,
        reviewer: options.reviewer,
        status: options.execute ? "execute-requested" : "precheck",
        notes: `Baseline timestamp: ${options.baselineTimestamp}`,
      },
    });

    const growthGate = await loadGrowthGate(queryRunner, options.tenantId, options.baselineTimestamp);
    const fkBaseline = await loadFkBaseline(queryRunner);
    const legacyTableBaseline = await loadLegacyTableBaseline(queryRunner);

    report.precheck.rehearsal = {
      summary: summarizeRehearsal(rehearsalReport),
      report: rehearsalReport,
      artifacts: null,
    };
    report.precheck.growthGate = growthGate;
    report.precheck.fkBaseline = fkBaseline;
    report.precheck.legacyTableBaseline = legacyTableBaseline;
    report.precheck.blockingReasons = buildBlockingReasons({
      rehearsal: rehearsalReport,
      growthGate,
      legacyTables: legacyTableBaseline,
      executeRequested: options.execute,
      envEnabled: destructiveRetirementEnvEnabled,
    });
    report.precheck.passed = report.precheck.blockingReasons.length === 0;

    if (!options.execute) {
      report.finalDecision = report.precheck.passed ? "precheck_passed" : "precheck_blocked";
      return report;
    }

    if (!report.precheck.passed) {
      report.finalDecision = "blocked";
      return report;
    }

    await executeRetirementStages(queryRunner, report.execution.stages);
    report.execution.executed = true;
    report.destructiveSqlExecuted = true;

    const fkVerification = await loadFkBaseline(queryRunner);
    const tableVerification = evaluatePostcheckTables(
      (await loadLegacyTableBaseline(queryRunner)).rows
    );
    report.postcheck.executed = true;
    report.postcheck.fkVerification = fkVerification;
    report.postcheck.tableVerification = tableVerification;
    report.postcheck.passed = fkVerification.rows.length === 0 && tableVerification.passed;

    report.finalDecision = report.postcheck.passed ? "executed" : "postcheck_failed";
  } catch (error) {
    report.failure = error instanceof Error ? error.message : String(error);
    if (report.execution.stages.some((stage) => stage.status === "running")) {
      const failedStage = report.execution.stages.find((stage) => stage.status === "running");
      if (failedStage) {
        failedStage.status = "failed";
      }
    }
    report.finalDecision = "error";
  }

  return report;
}

export function renderPhase27RetirementWindowMarkdown(report) {
  const metadataRows = [
    { key: "Generated At (UTC)", value: report.generatedAtUtc },
    { key: "Environment", value: report.environment },
    { key: "Tenant", value: report.tenantId },
    { key: "Mode", value: report.mode },
    { key: "Baseline Timestamp", value: report.baselineTimestamp },
    { key: "Final Decision", value: report.finalDecision },
    { key: "Destructive SQL Executed", value: report.destructiveSqlExecuted ? "yes" : "no" },
  ];
  const operatorRows = [
    { key: "Engineer", value: report.operator.engineer ?? "[pending]" },
    { key: "Reviewer", value: report.operator.reviewer ?? "[pending]" },
    { key: "Rollback owner", value: report.operator.rollbackOwner ?? "[pending]" },
    { key: "Window start", value: report.operator.windowStart ?? "" },
    { key: "Window end", value: report.operator.windowEnd ?? "" },
  ];
  const growthGateRows = report.precheck.growthGate
    ? [
        {
          newChatMissingSourceRecord: report.precheck.growthGate.counts.newChatMissingSourceRecord,
          newScheduleMissingSourceRecord:
            report.precheck.growthGate.counts.newScheduleMissingSourceRecord,
          newInvalidChatLinkage: report.precheck.growthGate.counts.newInvalidChatLinkage,
        },
      ]
    : [];
  const fkRows = report.precheck.fkBaseline?.rows ?? [];
  const legacyTableRows = report.precheck.legacyTableBaseline?.rows ?? [];
  const stageRows = report.execution.stages.map((stage) => ({
    name: stage.name,
    status: stage.status,
    statementCount: stage.statements.length,
  }));
  const postcheckFkRows = report.postcheck.fkVerification?.rows ?? [];
  const postcheckTableRows = report.postcheck.tableVerification?.rows ?? [];

  const sections = [];
  sections.push("# Phase 2.7 Retirement Window Artifact");
  sections.push("");
  sections.push("## Metadata");
  sections.push("");
  sections.push(renderMarkdownTable(metadataRows, ["key", "value"]));
  sections.push("");
  sections.push("## Operator Metadata");
  sections.push("");
  sections.push(renderMarkdownTable(operatorRows, ["key", "value"]));
  sections.push("");
  sections.push("## Safeguards");
  sections.push("");
  sections.push(`- ${report.safeguards.destructiveRetirementEnv.name}: ${report.safeguards.destructiveRetirementEnv.value ?? "[unset]"}`);
  sections.push(`- Environment gate enabled: ${report.safeguards.destructiveRetirementEnv.enabled ? "yes" : "no"}`);
  sections.push(`- Execute requested: ${report.safeguards.confirmation.executeRequested ? "yes" : "no"}`);
  sections.push(`- Confirm token provided: ${report.safeguards.confirmation.tokenProvided ? "yes" : "no"}`);
  sections.push("");
  sections.push("## Precheck");
  sections.push("");
  if (report.precheck.rehearsal) {
    sections.push(`- Rehearsal status: ${report.precheck.rehearsal.summary.status}`);
    sections.push(
      `- Rehearsal artifacts: ${
        report.precheck.rehearsal.artifacts
          ? `${report.precheck.rehearsal.artifacts.jsonPath}, ${report.precheck.rehearsal.artifacts.markdownPath}`
          : "[not written]"
      }`
    );
    sections.push(
      `- Rehearsal anomaly codes: ${
        report.precheck.rehearsal.summary.anomalyCodes.length > 0
          ? report.precheck.rehearsal.summary.anomalyCodes.join(", ")
          : "none"
      }`
    );
  }
  sections.push(`- Precheck passed: ${report.precheck.passed ? "yes" : "no"}`);
  if (growthGateRows.length > 0) {
    sections.push("");
    sections.push("### Growth Gate");
    sections.push("");
    sections.push(
      renderMarkdownTable(growthGateRows, [
        "newChatMissingSourceRecord",
        "newScheduleMissingSourceRecord",
        "newInvalidChatLinkage",
      ])
    );
  }
  sections.push("");
  sections.push("### FK Baseline");
  sections.push("");
  if (report.precheck.fkBaseline) {
    sections.push(`- FK gate policy: ${report.precheck.fkBaseline.policy.id}`);
    sections.push(`- FK policy description: ${report.precheck.fkBaseline.policy.description}`);
    sections.push(`- Missing dependencies block execution: ${report.precheck.fkBaseline.policy.blocksOnMissingDependencies ? "yes" : "no"}`);
    sections.push(`- Observed FK state: ${report.precheck.fkBaseline.observedState}`);
    sections.push(
      `- Attached dependencies: ${report.precheck.fkBaseline.attachedDependencyCount}/${report.precheck.fkBaseline.expectedDependencyCount}`
    );
  }
  sections.push("");
  if (fkRows.length > 0) {
    sections.push(renderMarkdownTable(fkRows, ["tableName", "columnName", "referencesTable", "constraintName"]));
  } else {
    sections.push("- No FK rows returned.");
  }
  if (report.precheck.fkBaseline?.missingDependencies?.length > 0) {
    sections.push("");
    sections.push("#### Missing Dependencies (Informational)");
    sections.push("");
    sections.push(
      renderMarkdownTable(report.precheck.fkBaseline.missingDependencies, [
        "tableName",
        "columnName",
        "referencesTable",
        "expectedConstraintName",
      ])
    );
  }
  sections.push("");
  sections.push("### Legacy Table Baseline");
  sections.push("");
  sections.push(renderMarkdownTable(legacyTableRows, ["tableName", "tableExists", "rowCount"]));
  sections.push("");
  sections.push("### Blocking Reasons");
  sections.push("");
  if (report.precheck.blockingReasons.length > 0) {
    for (const reason of report.precheck.blockingReasons) {
      sections.push(`- ${reason}`);
    }
  } else {
    sections.push("- None.");
  }
  sections.push("");
  sections.push("## Execution");
  sections.push("");
  sections.push(`- Destructive SQL executed: ${report.destructiveSqlExecuted ? "yes" : "no"}`);
  sections.push(renderMarkdownTable(stageRows, ["name", "status", "statementCount"]));
  sections.push("");
  sections.push("## Postcheck");
  sections.push("");
  sections.push(`- Postcheck executed: ${report.postcheck.executed ? "yes" : "no"}`);
  sections.push(`- Postcheck passed: ${report.postcheck.passed ? "yes" : "no"}`);
  sections.push("");
  sections.push("### FK Verification");
  sections.push("");
  if (postcheckFkRows.length > 0) {
    sections.push(
      renderMarkdownTable(postcheckFkRows, ["tableName", "columnName", "referencesTable", "constraintName"])
    );
  } else {
    sections.push("- No residual FK rows.");
  }
  sections.push("");
  sections.push("### Table Verification");
  sections.push("");
  if (postcheckTableRows.length > 0) {
    sections.push(renderMarkdownTable(postcheckTableRows, ["tableName", "tableExists", "rowCount"]));
  } else {
    sections.push("- Not run.");
  }
  sections.push("");
  sections.push("## Final Decision");
  sections.push("");
  sections.push(`- ${report.finalDecision}`);
  if (report.failure) {
    sections.push(`- Failure: ${report.failure}`);
  }
  sections.push("");

  return `${sections.join("\n")}\n`;
}

export async function writePhase27RetirementWindowArtifacts(report, options = {}) {
  const outputDirectory = path.resolve(process.cwd(), options.outputDirectory ?? PHASE_27_ARTIFACTS_OUT_DIR);
  const dataset = report.mode === "execute" ? "phase-2.7-retirement-window-execute" : "phase-2.7-retirement-window-precheck";
  const baseName =
    options.baseName ??
    buildArtifactBaseName(report.generatedAtUtc, report.environment, dataset, report.tenantId);

  await mkdir(outputDirectory, { recursive: true });

  const jsonPath = path.join(outputDirectory, `${baseName}.json`);
  const markdownPath = path.join(outputDirectory, `${baseName}.md`);

  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, renderPhase27RetirementWindowMarkdown(report), "utf8");

  return {
    baseName,
    jsonPath,
    markdownPath,
  };
}
