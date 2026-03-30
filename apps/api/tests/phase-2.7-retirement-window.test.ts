import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

type RetirementOptions = {
  execute: boolean;
  outDir: string;
  reviewer: string;
  confirmToken: string | null;
};
type Stage = { name: string; label: string; statements: string[] };
type QueryRunner = { query: (text: string, values?: unknown[]) => Promise<unknown[]> };
type RetirementReport = any;

let REQUIRED_COLUMNS: {
  larry_events: string[];
  larry_messages: string[];
};
let PHASE_27_DESTRUCTIVE_RETIREMENT_ENV: string;
let PHASE_27_RETIREMENT_CONFIRM_TOKEN: string;
let PHASE_27_RETIREMENT_REVIEWER_DEFAULT: string;
let PHASE_27_RETIREMENT_STAGES: Stage[];
let STAGE_STATEMENTS: string[];
let parsePhase27RetirementWindowArgs: (argv: string[]) => RetirementOptions;
let runPhase27RetirementWindow: (input: {
  queryRunner: QueryRunner;
  options: RetirementOptions;
  env?: Record<string, string | undefined>;
  generatedAtUtc?: string;
}) => Promise<RetirementReport>;
let writePhase27RetirementWindowArtifacts: (
  report: RetirementReport,
  options?: { outputDirectory?: string }
) => Promise<{ jsonPath: string; markdownPath: string }>;

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const BASELINE_TIMESTAMP = "2026-03-29T22:25:35.771Z";
const EXPECTED_FK_ROWS = [
  {
    table_name: "correction_feedback",
    column_name: "action_id",
    references_table: "extracted_actions",
    constraint_name: "correction_feedback_action_id_fkey",
  },
  {
    table_name: "email_outbound_drafts",
    column_name: "action_id",
    references_table: "extracted_actions",
    constraint_name: "email_outbound_drafts_action_id_fkey",
  },
  {
    table_name: "meeting_notes",
    column_name: "agent_run_id",
    references_table: "agent_runs",
    constraint_name: "meeting_notes_agent_run_id_fkey",
  },
];
const EXPECTED_LEGACY_TABLES = {
  approval_decisions: { tableExists: true, rowCount: 13 },
  interventions: { tableExists: true, rowCount: 55 },
  agent_run_transitions: { tableExists: true, rowCount: 360 },
  extracted_actions: { tableExists: true, rowCount: 14 },
  agent_runs: { tableExists: true, rowCount: 19 },
};

beforeAll(async () => {
  const rehearsalPath = resolve(process.cwd(), "..", "..", "scripts", "phase-2.7-rehearsal-lib.mjs");
  const retirementPath = resolve(process.cwd(), "..", "..", "scripts", "phase-2.7-retirement-window-lib.mjs");

  const rehearsalModule = (await import(pathToFileURL(rehearsalPath).href)) as {
    REQUIRED_COLUMNS: {
      larry_events: string[];
      larry_messages: string[];
    };
  };
  const retirementModule = (await import(pathToFileURL(retirementPath).href)) as {
    PHASE_27_DESTRUCTIVE_RETIREMENT_ENV: string;
    PHASE_27_RETIREMENT_CONFIRM_TOKEN: string;
    PHASE_27_RETIREMENT_REVIEWER_DEFAULT: string;
    PHASE_27_RETIREMENT_STAGES: Stage[];
    parsePhase27RetirementWindowArgs: (argv: string[]) => RetirementOptions;
    runPhase27RetirementWindow: (input: {
      queryRunner: QueryRunner;
      options: RetirementOptions;
      env?: Record<string, string | undefined>;
      generatedAtUtc?: string;
    }) => Promise<RetirementReport>;
    writePhase27RetirementWindowArtifacts: (
      report: RetirementReport,
      options?: { outputDirectory?: string }
    ) => Promise<{ jsonPath: string; markdownPath: string }>;
  };

  REQUIRED_COLUMNS = rehearsalModule.REQUIRED_COLUMNS;
  PHASE_27_DESTRUCTIVE_RETIREMENT_ENV = retirementModule.PHASE_27_DESTRUCTIVE_RETIREMENT_ENV;
  PHASE_27_RETIREMENT_CONFIRM_TOKEN = retirementModule.PHASE_27_RETIREMENT_CONFIRM_TOKEN;
  PHASE_27_RETIREMENT_REVIEWER_DEFAULT = retirementModule.PHASE_27_RETIREMENT_REVIEWER_DEFAULT;
  PHASE_27_RETIREMENT_STAGES = retirementModule.PHASE_27_RETIREMENT_STAGES;
  STAGE_STATEMENTS = PHASE_27_RETIREMENT_STAGES.flatMap((stage: Stage) => stage.statements);
  parsePhase27RetirementWindowArgs = retirementModule.parsePhase27RetirementWindowArgs;
  runPhase27RetirementWindow = retirementModule.runPhase27RetirementWindow;
  writePhase27RetirementWindowArtifacts = retirementModule.writePhase27RetirementWindowArtifacts;
});

function normalizeSql(sql: string): string {
  return sql.trim().replace(/\s+/g, " ");
}

function buildArgs(extra: string[] = []) {
  return parsePhase27RetirementWindowArgs([
    "--tenant",
    TENANT_ID,
    "--environment",
    "railway-prod",
    "--baseline-timestamp",
    BASELINE_TIMESTAMP,
    ...extra,
  ]);
}

function cloneLegacyTables(
  source: Record<string, { tableExists: boolean; rowCount: number }>
): Record<string, { tableExists: boolean; rowCount: number | null }> {
  return Object.fromEntries(
    Object.entries(source).map(([tableName, tableState]) => [
      tableName,
      {
        tableExists: tableState.tableExists,
        rowCount: tableState.rowCount,
      },
    ])
  );
}

function createStubQueryRunner(overrides: {
  larryEventsColumns?: string[];
  larryMessagesColumns?: string[];
  growthGate?: {
    newChatMissingSourceRecord: number;
    newScheduleMissingSourceRecord: number;
    newInvalidChatLinkage: number;
  };
  fkRows?: Array<{
    table_name: string;
    column_name: string;
    references_table: string;
    constraint_name: string;
  }>;
  legacyTables?: Record<string, { tableExists: boolean; rowCount: number }>;
} = {}) {
  const tenantInventory = {
    larry_events: 160,
    larry_messages: 320,
    agent_runs: 19,
    extracted_actions: 14,
    approval_decisions: 13,
    interventions: 55,
  };
  const columns = {
    larry_events: overrides.larryEventsColumns ?? [...REQUIRED_COLUMNS.larry_events],
    larry_messages: overrides.larryMessagesColumns ?? [...REQUIRED_COLUMNS.larry_messages],
  };
  const growthGate = overrides.growthGate ?? {
    newChatMissingSourceRecord: 0,
    newScheduleMissingSourceRecord: 0,
    newInvalidChatLinkage: 0,
  };
  let fkRows = (overrides.fkRows ?? EXPECTED_FK_ROWS).map((row) => ({ ...row }));
  const legacyTables = cloneLegacyTables(overrides.legacyTables ?? EXPECTED_LEGACY_TABLES);
  const stageStatementLog: string[] = [];

  function removeFk(tableName: string, columnName: string, referencesTable: string) {
    fkRows = fkRows.filter(
      (row) =>
        !(
          row.table_name === tableName &&
          row.column_name === columnName &&
          row.references_table === referencesTable
        )
    );
  }

  function retireTable(tableName: string) {
    if (legacyTables[tableName]) {
      legacyTables[tableName] = {
        tableExists: false,
        rowCount: null,
      };
    }
  }

  return {
    stageStatementLog,
    async query(text: string, values: unknown[] = []) {
      const normalized = normalizeSql(text);

      if (STAGE_STATEMENTS.includes(text)) {
        stageStatementLog.push(text);
        if (text.includes("meeting_notes")) {
          removeFk("meeting_notes", "agent_run_id", "agent_runs");
        } else if (text.includes("email_outbound_drafts")) {
          removeFk("email_outbound_drafts", "action_id", "extracted_actions");
        } else if (text.includes("correction_feedback")) {
          removeFk("correction_feedback", "action_id", "extracted_actions");
        } else if (text.includes("approval_decisions")) {
          retireTable("approval_decisions");
        } else if (text.includes("interventions")) {
          retireTable("interventions");
        } else if (text.includes("agent_run_transitions")) {
          retireTable("agent_run_transitions");
        } else if (text.includes("extracted_actions")) {
          retireTable("extracted_actions");
        } else if (text.includes("agent_runs")) {
          retireTable("agent_runs");
        }
        return [];
      }

      if (normalized.includes("FROM information_schema.columns")) {
        const tableName = String(values[0]);
        return (columns[tableName as keyof typeof columns] ?? []).map((column) => ({
          column_name: column,
        }));
      }

      if (normalized.includes("FROM information_schema.tables")) {
        const tableName = String(values[0]);
        return [{ table_exists: tableName in tenantInventory }];
      }

      if (
        normalized.startsWith("SELECT COUNT(*) AS row_count FROM") &&
        normalized.includes("WHERE tenant_id = $1")
      ) {
        const match = normalized.match(/FROM ([a-z_]+)/i);
        const tableName = match?.[1] ?? "";
        return [{ row_count: String(tenantInventory[tableName as keyof typeof tenantInventory] ?? 0) }];
      }

      if (normalized.includes("GROUP BY source_kind ORDER BY source_kind")) {
        return [];
      }

      if (normalized.includes("SELECT COUNT(*) AS invalid_chat_linkage")) {
        return [{ invalid_chat_linkage: "0" }];
      }

      if (normalized.includes("SELECT COUNT(*) AS orphaned_message_links")) {
        return [{ orphaned_message_links: "0" }];
      }

      if (normalized.includes("WITH meeting_event_counts AS")) {
        return [];
      }

      if (normalized.includes("md5(COALESCE(display_text")) {
        return [];
      }

      if (normalized.includes("COUNT(DISTINCT source_record_id)")) {
        return [];
      }

      if (normalized.includes("new_chat_missing_source_record")) {
        return [
          {
            new_chat_missing_source_record: String(growthGate.newChatMissingSourceRecord),
            new_schedule_missing_source_record: String(growthGate.newScheduleMissingSourceRecord),
            new_invalid_chat_linkage: String(growthGate.newInvalidChatLinkage),
          },
        ];
      }

      if (normalized.includes("FROM information_schema.table_constraints tc")) {
        return fkRows.map((row) => ({ ...row }));
      }

      if (normalized.includes("SELECT to_regclass($1) IS NOT NULL AS table_exists")) {
        const tableName = String(values[0]).replace(/^public\./, "");
        return [{ table_exists: legacyTables[tableName]?.tableExists === true }];
      }

      if (normalized.startsWith("SELECT COUNT(*) AS row_count FROM ")) {
        const match = normalized.match(/FROM ([a-z_]+)/i);
        const tableName = match?.[1] ?? "";
        return [{ row_count: String(legacyTables[tableName]?.rowCount ?? 0) }];
      }

      throw new Error(`Unexpected query in test stub: ${normalized}`);
    },
  };
}

describe("phase 2.7 retirement window runner", () => {
  it("parses safe defaults for precheck mode", () => {
    const args = buildArgs();

    expect(args.execute).toBe(false);
    expect(args.outDir).toBe("plans/phase-2.7-artifacts");
    expect(args.reviewer).toBe(PHASE_27_RETIREMENT_REVIEWER_DEFAULT);
  });

  it("requires the exact confirmation token for destructive execution", () => {
    expect(() =>
      buildArgs(["--execute"])
    ).toThrow(`--execute requires --confirm ${PHASE_27_RETIREMENT_CONFIRM_TOKEN}`);

    const args = buildArgs([
      "--execute",
      "--confirm",
      PHASE_27_RETIREMENT_CONFIRM_TOKEN,
    ]);

    expect(args.execute).toBe(true);
    expect(args.confirmToken).toBe(PHASE_27_RETIREMENT_CONFIRM_TOKEN);
  });

  it("blocks execute mode when the rehearsal preflight is not ok", async () => {
    const queryRunner = createStubQueryRunner({
      larryEventsColumns: REQUIRED_COLUMNS.larry_events.filter(
        (column: string) => column !== "source_record_id"
      ),
    });

    const report = await runPhase27RetirementWindow({
      queryRunner,
      options: buildArgs([
        "--execute",
        "--confirm",
        PHASE_27_RETIREMENT_CONFIRM_TOKEN,
      ]),
      env: {},
      generatedAtUtc: "2026-03-30T12:00:00.000Z",
    });

    expect(report.finalDecision).toBe("blocked");
    expect(report.precheck.rehearsal?.summary.status).toBe("blocked");
    expect(report.precheck.blockingReasons).toContain("rehearsal status is not ok");
    expect(report.destructiveSqlExecuted).toBe(false);
  });

  it("blocks execute mode when growth-gate counts are non-zero", async () => {
    const queryRunner = createStubQueryRunner({
      growthGate: {
        newChatMissingSourceRecord: 1,
        newScheduleMissingSourceRecord: 0,
        newInvalidChatLinkage: 0,
      },
    });

    const report = await runPhase27RetirementWindow({
      queryRunner,
      options: buildArgs([
        "--execute",
        "--confirm",
        PHASE_27_RETIREMENT_CONFIRM_TOKEN,
      ]),
      env: {},
      generatedAtUtc: "2026-03-30T12:00:00.000Z",
    });

    expect(report.finalDecision).toBe("blocked");
    expect(report.precheck.growthGate?.passed).toBe(false);
    expect(report.precheck.blockingReasons).toContain("growth-gate counts are non-zero");
    expect(report.destructiveSqlExecuted).toBe(false);
  });

  it("does not block execute mode when FK dependencies are already detached", async () => {
    const queryRunner = createStubQueryRunner({
      fkRows: [],
    });

    const report = await runPhase27RetirementWindow({
      queryRunner,
      options: buildArgs([
        "--execute",
        "--confirm",
        PHASE_27_RETIREMENT_CONFIRM_TOKEN,
      ]),
      env: {},
      generatedAtUtc: "2026-03-30T12:00:00.000Z",
    });

    expect(report.finalDecision).toBe("executed");
    expect(report.precheck.fkBaseline?.passed).toBe(true);
    expect(report.precheck.fkBaseline?.observedState).toBe("fully_detached");
    expect(report.precheck.fkBaseline?.missingDependencies).toHaveLength(3);
    expect(report.precheck.blockingReasons).not.toContainEqual(
      expect.stringContaining("required FK dependencies")
    );
    expect(report.destructiveSqlExecuted).toBe(true);
  });

  it("blocks execute mode when required legacy tables are missing", async () => {
    const queryRunner = createStubQueryRunner({
      fkRows: [],
      legacyTables: {
        ...EXPECTED_LEGACY_TABLES,
        agent_runs: { tableExists: false, rowCount: 0 },
      },
    });

    const report = await runPhase27RetirementWindow({
      queryRunner,
      options: buildArgs([
        "--execute",
        "--confirm",
        PHASE_27_RETIREMENT_CONFIRM_TOKEN,
      ]),
      env: {},
      generatedAtUtc: "2026-03-30T12:00:00.000Z",
    });

    expect(report.finalDecision).toBe("blocked");
    expect(report.precheck.fkBaseline?.passed).toBe(true);
    expect(report.precheck.legacyTableBaseline?.passed).toBe(false);
    expect(report.precheck.blockingReasons).not.toContainEqual(
      expect.stringContaining("required FK dependencies")
    );
    expect(report.precheck.blockingReasons).toContain("required legacy tables are missing: agent_runs");
  });

  it("blocks execute mode when the destructive-retirement env flag is enabled", async () => {
    const queryRunner = createStubQueryRunner();

    const report = await runPhase27RetirementWindow({
      queryRunner,
      options: buildArgs([
        "--execute",
        "--confirm",
        PHASE_27_RETIREMENT_CONFIRM_TOKEN,
      ]),
      env: {
        [PHASE_27_DESTRUCTIVE_RETIREMENT_ENV]: "true",
      },
      generatedAtUtc: "2026-03-30T12:00:00.000Z",
    });

    expect(report.finalDecision).toBe("blocked");
    expect(report.precheck.blockingReasons).toContain(
      `${PHASE_27_DESTRUCTIVE_RETIREMENT_ENV} must be unset or false before destructive execution`
    );
    expect(report.destructiveSqlExecuted).toBe(false);
  });

  it("executes only the documented destructive stages in order", async () => {
    const queryRunner = createStubQueryRunner();

    const report = await runPhase27RetirementWindow({
      queryRunner,
      options: buildArgs([
        "--execute",
        "--confirm",
        PHASE_27_RETIREMENT_CONFIRM_TOKEN,
      ]),
      env: {},
      generatedAtUtc: "2026-03-30T12:00:00.000Z",
    });

    expect(report.finalDecision).toBe("executed");
    expect(report.destructiveSqlExecuted).toBe(true);
    expect(report.execution.executed).toBe(true);
    expect(report.execution.stages.map((stage: { status: string }) => stage.status)).toEqual([
      "completed",
      "completed",
      "completed",
    ]);
    expect(queryRunner.stageStatementLog).toEqual(STAGE_STATEMENTS);
    expect(report.postcheck.passed).toBe(true);
  });

  it("writes artifact summaries with operator metadata and destructive status", async () => {
    const queryRunner = createStubQueryRunner();
    const report = await runPhase27RetirementWindow({
      queryRunner,
      options: buildArgs([
        "--engineer",
        "Alice",
        "--rollback-owner",
        "Bob",
      ]),
      env: {},
      generatedAtUtc: "2026-03-30T12:00:00.000Z",
    });

    const tempDir = await mkdtemp(join(tmpdir(), "phase27-runner-"));
    try {
      const artifacts = await writePhase27RetirementWindowArtifacts(report, {
        outputDirectory: tempDir,
      });
      const jsonText = await readFile(artifacts.jsonPath, "utf8");
      const markdownText = await readFile(artifacts.markdownPath, "utf8");

      expect(jsonText).toContain('"finalDecision": "precheck_passed"');
      expect(jsonText).toContain('"destructiveSqlExecuted": false');
      expect(jsonText).toContain('"engineer": "Alice"');
      expect(markdownText).toContain("Destructive SQL Executed");
      expect(markdownText).toContain("Alice");
      expect(markdownText).toContain("Fergus (temporary)");
      expect(markdownText).toContain("precheck_passed");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
