import { readFile } from "node:fs/promises";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { Db } from "./client.js";

loadEnv();

const db = new Db();

async function runMigrations(): Promise<void> {
  const sqlPath = path.resolve(process.cwd(), "src/db/schema.sql");
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
