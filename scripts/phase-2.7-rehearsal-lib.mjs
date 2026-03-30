import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const { Client } = pg;

export const PHASE_27_ARTIFACTS_OUT_DIR = "plans/phase-2.7-artifacts";
export const REQUIRED_COLUMNS = {
  larry_events: [
    "source_kind",
    "source_record_id",
    "conversation_id",
    "request_message_id",
    "response_message_id",
    "requested_by_user_id",
  ],
  larry_messages: ["id", "tenant_id", "conversation_id"],
};

const LINKAGE_SOURCE_KINDS = [
  "chat",
  "meeting",
  "email",
  "slack",
  "calendar",
  "briefing",
  "schedule",
];

const REPLAY_SOURCE_KINDS = ["meeting", "email", "slack", "calendar"];
const INVENTORY_TABLES = [
  "larry_events",
  "larry_messages",
  "agent_runs",
  "extracted_actions",
  "approval_decisions",
  "interventions",
];

export function getPhase27ExtractionRehearsalUsage() {
  return `Usage:
  node scripts/phase-2.7-extraction-rehearsal.mjs \\
    --tenant <uuid> \\
    --environment <name> \\
    --dataset <name> \\
    [--out-dir <path>]

Required:
  --tenant        Tenant UUID to check.
  --environment   Environment label for artifact metadata.
  --dataset       Dataset label for artifact metadata.

Optional:
  --out-dir       Artifact output directory. Defaults to ${PHASE_27_ARTIFACTS_OUT_DIR}.
`;
}

function readFlagValue(token, next) {
  if (!next || next.startsWith("--")) {
    throw new Error(`Missing required value for ${token}`);
  }
  return next;
}

export function parsePhase27ExtractionRehearsalArgs(argv) {
  const args = {
    tenantId: "",
    environment: "",
    dataset: "",
    outDir: PHASE_27_ARTIFACTS_OUT_DIR,
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
    if (token === "--dataset") {
      args.dataset = readFlagValue(token, next);
      index += 1;
      continue;
    }
    if (token === "--out-dir") {
      args.outDir = readFlagValue(token, next);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  if (!args.tenantId) throw new Error("Missing required argument: --tenant <uuid>");
  if (!args.environment) {
    throw new Error("Missing required argument: --environment <name>");
  }
  if (!args.dataset) throw new Error("Missing required argument: --dataset <name>");
  if (!args.outDir) throw new Error("Invalid --out-dir value.");

  return args;
}

export function createPgQueryRunner(databaseUrl) {
  const client = new Client({ connectionString: databaseUrl });

  return {
    async connect() {
      await client.connect();
    },
    async close() {
      await client.end();
    },
    async query(text, values = []) {
      const result = await client.query(text, values);
      return result.rows;
    },
  };
}

export function sanitizeLabel(label) {
  return label.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
}

export function buildArtifactBaseName(timestamp, environment, dataset, tenantId) {
  const tsSafe = timestamp.replace(/[:.]/g, "-");
  return `${tsSafe}__${sanitizeLabel(environment)}__${sanitizeLabel(dataset)}__${tenantId.slice(0, 8)}`;
}

export function toNumber(value) {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeMissingSourceRecords(rows) {
  return rows.map((row) => ({
    sourceKind: row.source_kind,
    missingSourceRecord: toNumber(row.missing_source_record),
  }));
}

function normalizeMeetingMismatches(rows) {
  return rows.map((row) => ({
    meetingNoteId: row.id,
    meetingActionCount: toNumber(row.meeting_action_count),
    ledgerEventCount: toNumber(row.ledger_event_count),
  }));
}

function normalizeReplayDuplicates(rows) {
  return rows.map((row) => ({
    sourceKind: row.source_kind,
    sourceRecordId: row.source_record_id,
    actionType: row.action_type,
    displayTextFingerprint: row.display_text_fingerprint,
    duplicateCount: toNumber(row.duplicate_count),
  }));
}

function normalizeReplayCoverage(rows) {
  return rows.map((row) => ({
    sourceKind: row.source_kind,
    totalEvents: toNumber(row.total_events),
    distinctSourceRecords: toNumber(row.distinct_source_records),
  }));
}

function buildAnomalies(checks, preflightMissing) {
  const anomalies = [];

  if (preflightMissing.length > 0) {
    anomalies.push({
      code: "preflight_missing_columns",
      severity: "blocked",
      summary: "Required canonical schema columns are missing.",
      details: preflightMissing,
    });
    return anomalies;
  }

  const missingSourceRows = checks.linkageCompleteness.missingSourceRecord.filter(
    (row) => row.missingSourceRecord > 0
  );
  if (missingSourceRows.length > 0) {
    anomalies.push({
      code: "missing_source_record_links",
      severity: "high",
      summary: "Canonical source linkage is missing for one or more source kinds.",
      details: missingSourceRows,
    });
  }

  if (checks.linkageCompleteness.invalidChatLinkage > 0) {
    anomalies.push({
      code: "invalid_chat_linkage",
      severity: "high",
      summary: "Chat-origin events are missing required chat linkage fields.",
      details: { invalidChatLinkage: checks.linkageCompleteness.invalidChatLinkage },
    });
  }

  if (checks.linkageCompleteness.orphanedMessageLinks > 0) {
    anomalies.push({
      code: "orphaned_message_links",
      severity: "high",
      summary: "Larry events reference message IDs that do not exist.",
      details: { orphanedMessageLinks: checks.linkageCompleteness.orphanedMessageLinks },
    });
  }

  if (checks.meetingReconciliation.length > 0) {
    anomalies.push({
      code: "meeting_action_count_mismatch",
      severity: "medium",
      summary: "Meeting note action counts differ from canonical ledger counts.",
      details: { mismatchCount: checks.meetingReconciliation.length },
    });
  }

  if (checks.replayIdempotency.duplicateGroups.length > 0) {
    anomalies.push({
      code: "replay_duplicate_groups",
      severity: "medium",
      summary: "Potential duplicate replay groups were detected for signal-driven sources.",
      details: { duplicateGroupCount: checks.replayIdempotency.duplicateGroups.length },
    });
  }

  return anomalies;
}

function buildFollowUps(status, anomalies) {
  if (status === "blocked") {
    return [
      "Apply canonical larry_events schema migrations in the target environment, then rerun rehearsal.",
      "Do not start extraction-table deprecation migrations until preflight passes.",
    ];
  }

  if (anomalies.length === 0) {
    return [
      "No blocking anomalies detected in this rehearsal run.",
      "Proceed to reviewer sign-off and migration-task sequencing.",
    ];
  }

  return [
    "Triage anomaly list with owner assignments before scheduling any destructive schema steps.",
    "Capture remediation status and rerun rehearsal to confirm anomaly closure.",
  ];
}

export function renderMarkdownTable(rows, headers) {
  const headerLine = `| ${headers.join(" | ")} |`;
  const dividerLine = `| ${headers.map(() => "---").join(" | ")} |`;
  const dataLines = rows.map((row) => `| ${headers.map((header) => String(row[header] ?? "")).join(" | ")} |`);
  return [headerLine, dividerLine, ...dataLines].join("\n");
}

export function renderPhase27ExtractionRehearsalMarkdown(report) {
  const metadataRows = [
    { key: "Status", value: report.status },
    { key: "Generated At (UTC)", value: report.generatedAtUtc },
    { key: "Environment", value: report.environment },
    { key: "Dataset", value: report.dataset },
    { key: "Tenant", value: report.tenantId },
  ];

  const preflightMissing =
    report.preflight.missing.length > 0
      ? report.preflight.missing.map((item) => `- \`${item.table}.${item.column}\``).join("\n")
      : "- None";

  const sections = [];
  sections.push("# Phase 2.7 Extraction Rehearsal Artifact");
  sections.push("");
  sections.push("## Metadata");
  sections.push("");
  sections.push(renderMarkdownTable(metadataRows, ["key", "value"]));
  sections.push("");
  sections.push("## Canonical Preflight");
  sections.push("");
  sections.push(`- Passed: ${report.preflight.passed ? "yes" : "no"}`);
  sections.push("- Missing columns:");
  sections.push(preflightMissing);
  sections.push("");

  if (report.status === "blocked") {
    sections.push("## Blocked Reason");
    sections.push("");
    sections.push(`- ${report.blockedReason}`);
    sections.push("");
  }

  sections.push("## Row Count Inventory");
  sections.push("");
  sections.push(renderMarkdownTable(report.checks.rowCountInventory, ["tableName", "tableStatus", "rowCount"]));
  sections.push("");

  sections.push("## Linkage Completeness");
  sections.push("");
  if (report.status === "blocked") {
    sections.push("- Skipped due canonical preflight failure.");
  } else {
    sections.push("### Missing Source Record IDs");
    sections.push("");
    if (report.checks.linkageCompleteness.missingSourceRecord.length > 0) {
      sections.push(
        renderMarkdownTable(report.checks.linkageCompleteness.missingSourceRecord, [
          "sourceKind",
          "missingSourceRecord",
        ])
      );
    } else {
      sections.push("- No rows returned.");
    }
    sections.push("");
    sections.push(`- Invalid chat linkage count: ${report.checks.linkageCompleteness.invalidChatLinkage}`);
    sections.push(`- Orphaned message link count: ${report.checks.linkageCompleteness.orphanedMessageLinks}`);
  }
  sections.push("");

  sections.push("## Meeting Reconciliation");
  sections.push("");
  if (report.status === "blocked") {
    sections.push("- Skipped due canonical preflight failure.");
  } else if (report.checks.meetingReconciliation.length > 0) {
    sections.push(
      renderMarkdownTable(report.checks.meetingReconciliation, [
        "meetingNoteId",
        "meetingActionCount",
        "ledgerEventCount",
      ])
    );
  } else {
    sections.push("- No mismatches.");
  }
  sections.push("");

  sections.push("## Replay / Idempotency");
  sections.push("");
  if (report.status === "blocked") {
    sections.push("- Skipped due canonical preflight failure.");
    sections.push("");
  } else {
    sections.push("### Duplicate Groups");
    sections.push("");
    if (report.checks.replayIdempotency.duplicateGroups.length > 0) {
      sections.push(
        renderMarkdownTable(report.checks.replayIdempotency.duplicateGroups, [
          "sourceKind",
          "sourceRecordId",
          "actionType",
          "displayTextFingerprint",
          "duplicateCount",
        ])
      );
    } else {
      sections.push("- No duplicate groups.");
    }
    sections.push("");
    sections.push("### Source Coverage");
    sections.push("");
    sections.push(
      renderMarkdownTable(report.checks.replayIdempotency.sourceCoverage, [
        "sourceKind",
        "totalEvents",
        "distinctSourceRecords",
      ])
    );
    sections.push("");
  }

  sections.push("## Anomalies");
  sections.push("");
  if (report.anomalies.length > 0) {
    for (const anomaly of report.anomalies) {
      sections.push(`- [${anomaly.severity}] ${anomaly.code}: ${anomaly.summary}`);
    }
  } else {
    sections.push("- None.");
  }
  sections.push("");

  sections.push("## Follow-Up Actions");
  sections.push("");
  for (const action of report.followUpActions) {
    sections.push(`- ${action}`);
  }
  sections.push("");

  sections.push("## Sign-Off");
  sections.push("");
  sections.push(`- Engineer: ${report.signOff.engineer ?? "[pending]"}`);
  sections.push(`- Reviewer: ${report.signOff.reviewer ?? "[pending]"}`);
  sections.push(`- Status: ${report.signOff.status}`);
  sections.push(`- Notes: ${report.signOff.notes ?? ""}`);
  sections.push("");

  return `${sections.join("\n")}\n`;
}

async function loadColumns(queryRunner, tableName) {
  const rows = await queryRunner.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
    `,
    [tableName]
  );
  return new Set(rows.map((row) => row.column_name));
}

async function loadTenantRowCount(queryRunner, tableName, tenantId) {
  const tableExistsRows = await queryRunner.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = $1
      ) AS table_exists
    `,
    [tableName]
  );

  const tableExists = tableExistsRows[0]?.table_exists === true;
  if (!tableExists) {
    return {
      tableName,
      tableStatus: "retired",
      rowCount: null,
    };
  }

  if (!/^[a-z_][a-z0-9_]*$/.test(tableName)) {
    throw new Error(`Unsafe table name in row inventory: ${tableName}`);
  }

  const rowCountRows = await queryRunner.query(
    `
      SELECT COUNT(*) AS row_count
      FROM ${tableName}
      WHERE tenant_id = $1
    `,
    [tenantId]
  );

  return {
    tableName,
    tableStatus: "present",
    rowCount: toNumber(rowCountRows[0]?.row_count),
  };
}

async function loadRowCountInventory(queryRunner, tenantId) {
  const inventoryRows = [];
  for (const tableName of INVENTORY_TABLES) {
    inventoryRows.push(await loadTenantRowCount(queryRunner, tableName, tenantId));
  }
  return inventoryRows;
}

export async function runPhase27ExtractionRehearsal({
  queryRunner,
  tenantId,
  environment,
  dataset,
  generatedAtUtc = new Date().toISOString(),
  signOff = {},
}) {
  const requiredTables = Object.keys(REQUIRED_COLUMNS);
  const missingColumns = [];

  for (const table of requiredTables) {
    const columns = await loadColumns(queryRunner, table);
    for (const requiredColumn of REQUIRED_COLUMNS[table]) {
      if (!columns.has(requiredColumn)) {
        missingColumns.push({ table, column: requiredColumn });
      }
    }
  }

  const rowCountInventory = await loadRowCountInventory(queryRunner, tenantId);

  const report = {
    schemaVersion: "phase-2.7-rehearsal-v2",
    status: "ok",
    generatedAtUtc,
    environment,
    dataset,
    tenantId,
    scriptPath: "scripts/phase-2.7-extraction-rehearsal.mjs",
    preflight: {
      passed: missingColumns.length === 0,
      requiredColumns: REQUIRED_COLUMNS,
      missing: missingColumns,
    },
    blockedReason: null,
    checks: {
      rowCountInventory,
      linkageCompleteness: {
        missingSourceRecord: [],
        invalidChatLinkage: 0,
        orphanedMessageLinks: 0,
      },
      meetingReconciliation: [],
      replayIdempotency: {
        duplicateGroups: [],
        sourceCoverage: [],
      },
    },
    anomalies: [],
    followUpActions: [],
    signOff: {
      engineer: signOff.engineer ?? null,
      reviewer: signOff.reviewer ?? null,
      status: signOff.status ?? "pending",
      notes: signOff.notes ?? null,
    },
  };

  if (!report.preflight.passed) {
    report.status = "blocked";
    report.blockedReason =
      "Canonical preflight failed. Required larry_events/larry_messages columns are missing in this environment.";
    report.anomalies = buildAnomalies(report.checks, missingColumns);
    report.followUpActions = buildFollowUps(report.status, report.anomalies);
    return report;
  }

  const missingSourceRows = await queryRunner.query(
    `
      SELECT source_kind, COUNT(*) AS missing_source_record
      FROM larry_events
      WHERE tenant_id = $1
        AND source_kind = ANY($2::text[])
        AND source_record_id IS NULL
      GROUP BY source_kind
      ORDER BY source_kind
    `,
    [tenantId, LINKAGE_SOURCE_KINDS]
  );

  const invalidChatRows = await queryRunner.query(
    `
      SELECT COUNT(*) AS invalid_chat_linkage
      FROM larry_events
      WHERE tenant_id = $1
        AND source_kind = 'chat'
        AND (
          conversation_id IS NULL
          OR request_message_id IS NULL
          OR response_message_id IS NULL
          OR requested_by_user_id IS NULL
        )
    `,
    [tenantId]
  );

  const orphanedMessageRows = await queryRunner.query(
    `
      SELECT COUNT(*) AS orphaned_message_links
      FROM larry_events e
      LEFT JOIN larry_messages req
        ON req.tenant_id = e.tenant_id
       AND req.id = e.request_message_id
      LEFT JOIN larry_messages res
        ON res.tenant_id = e.tenant_id
       AND res.id = e.response_message_id
      WHERE e.tenant_id = $1
        AND (
          (e.request_message_id IS NOT NULL AND req.id IS NULL)
          OR (e.response_message_id IS NOT NULL AND res.id IS NULL)
        )
    `,
    [tenantId]
  );

  const meetingReconciliationRows = await queryRunner.query(
    `
      WITH meeting_event_counts AS (
        SELECT source_record_id AS meeting_note_id, COUNT(*) AS event_count
        FROM larry_events
        WHERE tenant_id = $1
          AND source_kind = 'meeting'
          AND source_record_id IS NOT NULL
        GROUP BY source_record_id
      )
      SELECT mn.id,
             mn.action_count AS meeting_action_count,
             COALESCE(mec.event_count, 0) AS ledger_event_count
      FROM meeting_notes mn
      LEFT JOIN meeting_event_counts mec
        ON mec.meeting_note_id = mn.id
      WHERE mn.tenant_id = $1
        AND mn.action_count <> COALESCE(mec.event_count, 0)
      ORDER BY mn.created_at DESC
    `,
    [tenantId]
  );

  const replayDuplicateRows = await queryRunner.query(
    `
      SELECT source_kind,
             source_record_id,
             action_type,
             md5(COALESCE(display_text, '')) AS display_text_fingerprint,
             COUNT(*) AS duplicate_count
      FROM larry_events
      WHERE tenant_id = $1
        AND source_kind = ANY($2::text[])
        AND source_record_id IS NOT NULL
      GROUP BY source_kind, source_record_id, action_type, md5(COALESCE(display_text, ''))
      HAVING COUNT(*) > 1
      ORDER BY duplicate_count DESC, source_kind, source_record_id
    `,
    [tenantId, REPLAY_SOURCE_KINDS]
  );

  const replayCoverageRows = await queryRunner.query(
    `
      SELECT source_kind,
             COUNT(*) AS total_events,
             COUNT(DISTINCT source_record_id) AS distinct_source_records
      FROM larry_events
      WHERE tenant_id = $1
        AND source_kind = ANY($2::text[])
      GROUP BY source_kind
      ORDER BY source_kind
    `,
    [tenantId, REPLAY_SOURCE_KINDS]
  );

  report.checks.linkageCompleteness.missingSourceRecord = normalizeMissingSourceRecords(missingSourceRows);
  report.checks.linkageCompleteness.invalidChatLinkage = toNumber(
    invalidChatRows[0]?.invalid_chat_linkage
  );
  report.checks.linkageCompleteness.orphanedMessageLinks = toNumber(
    orphanedMessageRows[0]?.orphaned_message_links
  );
  report.checks.meetingReconciliation = normalizeMeetingMismatches(meetingReconciliationRows);
  report.checks.replayIdempotency.duplicateGroups = normalizeReplayDuplicates(replayDuplicateRows);
  report.checks.replayIdempotency.sourceCoverage = normalizeReplayCoverage(replayCoverageRows);

  report.anomalies = buildAnomalies(report.checks, report.preflight.missing);
  report.followUpActions = buildFollowUps(report.status, report.anomalies);

  return report;
}

export async function writePhase27RehearsalArtifacts(report, options = {}) {
  const outputDirectory = path.resolve(process.cwd(), options.outputDirectory ?? PHASE_27_ARTIFACTS_OUT_DIR);
  const baseName =
    options.baseName ??
    buildArtifactBaseName(report.generatedAtUtc, report.environment, report.dataset, report.tenantId);

  await mkdir(outputDirectory, { recursive: true });

  const jsonPath = path.join(outputDirectory, `${baseName}.json`);
  const markdownPath = path.join(outputDirectory, `${baseName}.md`);

  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, renderPhase27ExtractionRehearsalMarkdown(report), "utf8");

  return {
    baseName,
    jsonPath,
    markdownPath,
  };
}
