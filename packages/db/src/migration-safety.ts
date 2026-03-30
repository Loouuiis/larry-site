export const PHASE_27_DESTRUCTIVE_RETIREMENT_ENV = "LARRY_ALLOW_PHASE27_DESTRUCTIVE_RETIREMENT";
const PHASE_27_RETIREMENT_TABLES = [
  "approval_decisions",
  "interventions",
  "agent_run_transitions",
  "extracted_actions",
  "agent_runs",
] as const;

const TRUE_ENV_VALUES = new Set(["1", "true", "yes", "on"]);

function normalizeSqlLine(line: string): string {
  return line.trim().replace(/\s+/g, " ").toLowerCase();
}

function parseBooleanEnv(value: string | undefined): boolean {
  if (!value) return false;
  return TRUE_ENV_VALUES.has(value.trim().toLowerCase());
}

export function resolveAllowPhase27DestructiveRetirement(
  envValue = process.env[PHASE_27_DESTRUCTIVE_RETIREMENT_ENV]
): boolean {
  return parseBooleanEnv(envValue);
}

export function buildSafeMigrationSql(
  rawSql: string,
  options?: { allowPhase27DestructiveRetirement?: boolean }
): { sql: string; removedDropTables: string[] } {
  const allowDrops = options?.allowPhase27DestructiveRetirement ?? false;
  if (allowDrops) {
    return { sql: rawSql, removedDropTables: [] };
  }

  const removedDropTables = new Set<string>();
  const lines = rawSql.split(/\r?\n/);
  const filteredLines = lines.filter((line) => {
    const normalizedLine = normalizeSqlLine(line);

    for (const tableName of PHASE_27_RETIREMENT_TABLES) {
      if (normalizedLine === `drop table if exists ${tableName};`) {
        removedDropTables.add(tableName);
        return false;
      }
    }

    return true;
  });

  return {
    sql: `${filteredLines.join("\n")}\n`,
    removedDropTables: Array.from(removedDropTables),
  };
}
