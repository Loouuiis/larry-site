import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { Db } from "./client.js";

const envCandidates = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../../apps/api/.env"),
  path.resolve(process.cwd(), "../../apps/worker/.env"),
];

for (const candidate of envCandidates) {
  if (existsSync(candidate)) {
    loadEnv({ path: candidate, override: false });
  }
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run migrations.");
}

const db = new Db(databaseUrl);

async function runMigrations(): Promise<void> {
  const sqlPath = path.resolve(process.cwd(), "src/schema.sql");
  const sql = await readFile(sqlPath, "utf-8");
  await db.query(sql);
  console.log("Schema migration completed.");
}

runMigrations()
  .catch((error) => {
    console.error("Migration failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.close();
  });
