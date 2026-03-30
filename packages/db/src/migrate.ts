import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { Db } from "./client.js";
import {
  buildSafeMigrationSql,
  PHASE_27_DESTRUCTIVE_RETIREMENT_ENV,
  resolveAllowPhase27DestructiveRetirement,
} from "./migration-safety.js";

export {
  buildSafeMigrationSql,
  PHASE_27_DESTRUCTIVE_RETIREMENT_ENV,
  resolveAllowPhase27DestructiveRetirement,
};

const envCandidates = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../../apps/api/.env"),
  path.resolve(process.cwd(), "../../apps/worker/.env"),
];

function loadRuntimeEnv(): void {
  for (const candidate of envCandidates) {
    if (existsSync(candidate)) {
      loadEnv({ path: candidate, override: false });
    }
  }
}

async function runMigrations(): Promise<void> {
  loadRuntimeEnv();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to run migrations.");
  }

  const db = new Db(databaseUrl);
  const sqlPath = path.resolve(process.cwd(), "src/schema.sql");
  const rawSql = await readFile(sqlPath, "utf-8");
  const allowPhase27DestructiveRetirement = resolveAllowPhase27DestructiveRetirement();
  const migrationSql = buildSafeMigrationSql(rawSql, {
    allowPhase27DestructiveRetirement,
  });

  if (allowPhase27DestructiveRetirement) {
    console.log(
      `[migrate] ${PHASE_27_DESTRUCTIVE_RETIREMENT_ENV}=true; Phase 2.7 D/E retirement drops are enabled.`
    );
  } else if (migrationSql.removedDropTables.length > 0) {
    console.log(
      `[migrate] ${PHASE_27_DESTRUCTIVE_RETIREMENT_ENV} not set; skipped Phase 2.7 D/E drop statements for tables: ${migrationSql.removedDropTables.join(
        ", "
      )}.`
    );
  } else {
    console.log(
      `[migrate] ${PHASE_27_DESTRUCTIVE_RETIREMENT_ENV} not set; no Phase 2.7 D/E drop statements were found to skip.`
    );
  }

  try {
    await db.query(migrationSql.sql);
    console.log("Schema migration completed.");
  } finally {
    await db.close();
  }
}

function isDirectExecution(): boolean {
  const entryScriptPath = process.argv[1];
  if (!entryScriptPath) return false;
  return path.resolve(entryScriptPath) === fileURLToPath(import.meta.url);
}

if (isDirectExecution()) {
  runMigrations().catch((error) => {
    console.error("Migration failed", error);
    process.exitCode = 1;
  });
}
