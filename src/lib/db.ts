import Database from "better-sqlite3";
import path from "path";

// Single shared connection — better-sqlite3 is synchronous and handles
// concurrent requests safely without a connection pool.
const dbPath = path.join(process.cwd(), "prisma", "dev.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(dbPath);
    _db.pragma("journal_mode = WAL"); // better concurrent read performance
  }
  return _db;
}
