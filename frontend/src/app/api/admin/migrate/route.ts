import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// Run once after deployment to create auth tables.
// Requires the ADMIN_SECRET header to match the ADMIN_SECRET env var.
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-admin-secret");
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();

  await db.execute({
    sql: `CREATE TABLE IF NOT EXISTS users (
      id           TEXT PRIMARY KEY,
      email        TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    args: [],
  });

  await db.execute({
    sql: `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`,
    args: [],
  });

  await db.execute({
    sql: `CREATE TABLE IF NOT EXISTS login_attempts (
      ip           TEXT NOT NULL,
      attempted_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    args: [],
  });

  await db.execute({
    sql: `CREATE INDEX IF NOT EXISTS idx_login_attempts ON login_attempts(ip, attempted_at)`,
    args: [],
  });

  return NextResponse.json({ success: true, message: "Auth tables ready." });
}
