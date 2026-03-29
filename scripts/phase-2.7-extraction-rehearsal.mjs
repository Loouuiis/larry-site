#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Client } = pg;

const REQUIRED_COLUMNS = {
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

function parseArgs(argv) {
  const args = {
    tenant: "",
    environment: "",
    dataset: "",
    outDir: "plans/phase-2.7-artifacts",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    if (token === "--tenant") {
      args.tenant = next ?? "";
      index += 1;
      continue;
    }
    if (token === "--environment") {
      args.environment = next ?? "";
      index += 1;
      continue;
    }
    if (token === "--dataset") {
      args.dataset = next ?? "";
      index += 1;
      continue;
    }
    if (token === "--out-dir") {
      args.outDir = next ?? "";
      index += 1;
      continue;
    }
    if (token === "--help" || token === "-h") {
      printUsage();
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  if (!args.tenant) throw new Error("Missing required argument: --tenant <uuid>");
  if (!args.environment) {
    throw new Error("Missing required argument: --environment <name>");
  }
  if (!args.dataset) throw new Error("Missing required argument: --dataset <name>");
  if (!args.outDir) throw new Error("Invalid --out-dir value.");

  return args;
}

function printUsage() {
  console.log(`Usage:
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
  --out-dir       Artifact output directory. Defaults to plans/phase-2.7-artifacts.
`);
}

function sanitizeLabel(label) {
  return label.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
}

function buildArtifactBaseName(timestamp, environment, dataset, tenantId) {
  const tsSafe = timestamp.replace(/[:.]/g, "-");
  return `${tsSafe}__${sanitizeLabel(environment)}__${sanitizeLabel(dataset)}__${tenantId.slice(0, 8)}`;
}

function toNumber(value) {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeRowCounts(rows) {
  return rows.map((row) => ({
    tableName: row.table_name,
    rowCount: toNumber(row.row_count),
  }));
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

function renderKeyValueTable(rows, headers) {
  const headerLine = `| ${headers.join(" | ")} |`;
  const dividerLine = `| ${headers.map(() => "---").join(" | ")} |`;
  const dataLines = rows.map((row) => `| ${headers.map((header) => String(row[header] ?? "")).join(" | ")} |`);
  return [headerLine, dividerLine, ...dataLines].join("\n");
}

function renderMarkdown(report) {
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
  sections.push(renderKeyValueTable(metadataRows, ["key", "value"]));
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
  sections.push(renderKeyValueTable(report.checks.rowCountInventory, ["tableName", "rowCount"]));
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
        renderKeyValueTable(report.checks.linkageCompleteness.missingSourceRecord, [
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
      renderKeyValueTable(report.checks.meetingReconciliation, [
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
        renderKeyValueTable(report.checks.replayIdempotency.duplicateGroups, [
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
      renderKeyValueTable(report.checks.replayIdempotency.sourceCoverage, [
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

async function loadColumns(client, tableName) {
  const result = await client.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
    `,
    [tableName]
  );
  return new Set(result.rows.map((row) => row.column_name));
}

async function run() {
  const args = parseArgs(process.argv.slice(2));

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  const generatedAtUtc = new Date().toISOString();
  const outputDirectory = path.resolve(process.cwd(), args.outDir);

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const requiredTables = Object.keys(REQUIRED_COLUMNS);
    const missingColumns = [];

    for (const table of requiredTables) {
      const columns = await loadColumns(client, table);
      for (const requiredColumn of REQUIRED_COLUMNS[table]) {
        if (!columns.has(requiredColumn)) {
          missingColumns.push({ table, column: requiredColumn });
        }
      }
    }

    const rowCountResult = await client.query(
      `
        SELECT 'larry_events' AS table_name, COUNT(*) AS row_count
        FROM larry_events
        WHERE tenant_id = $1
        UNION ALL
        SELECT 'larry_messages', COUNT(*)
        FROM larry_messages
        WHERE tenant_id = $1
        UNION ALL
        SELECT 'agent_runs', COUNT(*)
        FROM agent_runs
        WHERE tenant_id = $1
        UNION ALL
        SELECT 'extracted_actions', COUNT(*)
        FROM extracted_actions
        WHERE tenant_id = $1
        UNION ALL
        SELECT 'approval_decisions', COUNT(*)
        FROM approval_decisions
        WHERE tenant_id = $1
        UNION ALL
        SELECT 'interventions', COUNT(*)
        FROM interventions
        WHERE tenant_id = $1
      `,
      [args.tenant]
    );

    const report = {
      schemaVersion: "phase-2.7-rehearsal-v1",
      status: "ok",
      generatedAtUtc,
      environment: args.environment,
      dataset: args.dataset,
      tenantId: args.tenant,
      scriptPath: "scripts/phase-2.7-extraction-rehearsal.mjs",
      preflight: {
        passed: missingColumns.length === 0,
        requiredColumns: REQUIRED_COLUMNS,
        missing: missingColumns,
      },
      blockedReason: null,
      checks: {
        rowCountInventory: normalizeRowCounts(rowCountResult.rows),
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
        engineer: null,
        reviewer: null,
        status: "pending",
        notes: null,
      },
    };

    if (!report.preflight.passed) {
      report.status = "blocked";
      report.blockedReason =
        "Canonical preflight failed. Required larry_events/larry_messages columns are missing in this environment.";
      report.anomalies = buildAnomalies(report.checks, missingColumns);
      report.followUpActions = buildFollowUps(report.status, report.anomalies);

      const baseName = buildArtifactBaseName(generatedAtUtc, args.environment, args.dataset, args.tenant);
      await mkdir(outputDirectory, { recursive: true });

      const jsonPath = path.join(outputDirectory, `${baseName}.json`);
      const markdownPath = path.join(outputDirectory, `${baseName}.md`);

      await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
      await writeFile(markdownPath, renderMarkdown(report), "utf8");

      console.log(`status=blocked`);
      console.log(`artifact_json=${jsonPath}`);
      console.log(`artifact_markdown=${markdownPath}`);
      return;
    }

    const missingSourceResult = await client.query(
      `
        SELECT source_kind, COUNT(*) AS missing_source_record
        FROM larry_events
        WHERE tenant_id = $1
          AND source_kind = ANY($2::text[])
          AND source_record_id IS NULL
        GROUP BY source_kind
        ORDER BY source_kind
      `,
      [args.tenant, LINKAGE_SOURCE_KINDS]
    );

    const invalidChatResult = await client.query(
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
      [args.tenant]
    );

    const orphanedMessageResult = await client.query(
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
      [args.tenant]
    );

    const meetingReconciliationResult = await client.query(
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
      [args.tenant]
    );

    const replayDuplicateResult = await client.query(
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
      [args.tenant, REPLAY_SOURCE_KINDS]
    );

    const replayCoverageResult = await client.query(
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
      [args.tenant, REPLAY_SOURCE_KINDS]
    );

    report.checks.linkageCompleteness.missingSourceRecord = normalizeMissingSourceRecords(
      missingSourceResult.rows
    );
    report.checks.linkageCompleteness.invalidChatLinkage = toNumber(
      invalidChatResult.rows[0]?.invalid_chat_linkage
    );
    report.checks.linkageCompleteness.orphanedMessageLinks = toNumber(
      orphanedMessageResult.rows[0]?.orphaned_message_links
    );
    report.checks.meetingReconciliation = normalizeMeetingMismatches(meetingReconciliationResult.rows);
    report.checks.replayIdempotency.duplicateGroups = normalizeReplayDuplicates(replayDuplicateResult.rows);
    report.checks.replayIdempotency.sourceCoverage = normalizeReplayCoverage(replayCoverageResult.rows);

    report.anomalies = buildAnomalies(report.checks, report.preflight.missing);
    report.followUpActions = buildFollowUps(report.status, report.anomalies);

    const baseName = buildArtifactBaseName(generatedAtUtc, args.environment, args.dataset, args.tenant);
    await mkdir(outputDirectory, { recursive: true });

    const jsonPath = path.join(outputDirectory, `${baseName}.json`);
    const markdownPath = path.join(outputDirectory, `${baseName}.md`);

    await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(markdownPath, renderMarkdown(report), "utf8");

    console.log(`status=ok`);
    console.log(`artifact_json=${jsonPath}`);
    console.log(`artifact_markdown=${markdownPath}`);
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error(`[phase-2.7-extraction-rehearsal] ${error.message}`);
  process.exitCode = 1;
});
