import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

type BuildSafeMigrationSql = (
  rawSql: string,
  options?: { allowPhase27DestructiveRetirement?: boolean }
) => { sql: string; removedDropTables: string[] };

let buildSafeMigrationSql: BuildSafeMigrationSql;
let resolveAllowPhase27DestructiveRetirement: (value?: string) => boolean;
let PHASE_27_DESTRUCTIVE_RETIREMENT_ENV: string;

const schemaPath = resolve(process.cwd(), "..", "..", "packages", "db", "src", "schema.sql");
const schema = readFileSync(schemaPath, "utf8");
const phase27RetirementDrops = [
  "DROP TABLE IF EXISTS approval_decisions;",
  "DROP TABLE IF EXISTS interventions;",
  "DROP TABLE IF EXISTS agent_run_transitions;",
  "DROP TABLE IF EXISTS extracted_actions;",
  "DROP TABLE IF EXISTS agent_runs;",
];

beforeAll(async () => {
  const modulePath = resolve(process.cwd(), "..", "..", "packages", "db", "src", "migrate.ts");
  const migrationModule = (await import(pathToFileURL(modulePath).href)) as {
    buildSafeMigrationSql: BuildSafeMigrationSql;
    resolveAllowPhase27DestructiveRetirement: (value?: string) => boolean;
    PHASE_27_DESTRUCTIVE_RETIREMENT_ENV: string;
  };

  buildSafeMigrationSql = migrationModule.buildSafeMigrationSql;
  resolveAllowPhase27DestructiveRetirement = migrationModule.resolveAllowPhase27DestructiveRetirement;
  PHASE_27_DESTRUCTIVE_RETIREMENT_ENV = migrationModule.PHASE_27_DESTRUCTIVE_RETIREMENT_ENV;
});

describe("phase 2.7 migration safety gate", () => {
  it("skips phase 2.7 D/E retirement drops by default", () => {
    for (const statement of phase27RetirementDrops) {
      expect(schema).toContain(statement);
    }

    const result = buildSafeMigrationSql(schema);

    expect(result.removedDropTables.sort()).toEqual(
      ["agent_run_transitions", "agent_runs", "approval_decisions", "extracted_actions", "interventions"].sort()
    );

    for (const statement of phase27RetirementDrops) {
      expect(result.sql).not.toContain(statement);
    }

    expect(result.sql).toContain("CREATE TABLE IF NOT EXISTS larry_events (");
    expect(result.sql).toContain("CREATE TABLE IF NOT EXISTS meeting_notes (");
  });

  it("keeps phase 2.7 D/E retirement drops when explicitly enabled", () => {
    const result = buildSafeMigrationSql(schema, {
      allowPhase27DestructiveRetirement: true,
    });

    expect(result.removedDropTables).toEqual([]);
    for (const statement of phase27RetirementDrops) {
      expect(result.sql).toContain(statement);
    }
  });

  it("does not strip unrelated drop statements", () => {
    const input = [
      "DROP TABLE IF EXISTS unrelated_table;",
      "DROP TABLE IF EXISTS approval_decisions;",
      "CREATE TABLE IF NOT EXISTS tenants (id UUID PRIMARY KEY);",
    ].join("\n");

    const result = buildSafeMigrationSql(input);

    expect(result.sql).toContain("DROP TABLE IF EXISTS unrelated_table;");
    expect(result.sql).not.toContain("DROP TABLE IF EXISTS approval_decisions;");
  });

  it("parses destructive-retirement env values", () => {
    expect(PHASE_27_DESTRUCTIVE_RETIREMENT_ENV).toBe("LARRY_ALLOW_PHASE27_DESTRUCTIVE_RETIREMENT");
    expect(resolveAllowPhase27DestructiveRetirement("true")).toBe(true);
    expect(resolveAllowPhase27DestructiveRetirement("TRUE")).toBe(true);
    expect(resolveAllowPhase27DestructiveRetirement("1")).toBe(true);
    expect(resolveAllowPhase27DestructiveRetirement("yes")).toBe(true);
    expect(resolveAllowPhase27DestructiveRetirement("on")).toBe(true);

    expect(resolveAllowPhase27DestructiveRetirement("false")).toBe(false);
    expect(resolveAllowPhase27DestructiveRetirement("0")).toBe(false);
    expect(resolveAllowPhase27DestructiveRetirement("off")).toBe(false);
    expect(resolveAllowPhase27DestructiveRetirement(undefined)).toBe(false);
  });
});
