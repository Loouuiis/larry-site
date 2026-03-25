import { getDb } from "./db";

const MAX_ATTEMPTS = 5;
const WINDOW_SECS = 15 * 60; // 15 minutes

function hasTursoConfig(): boolean {
  return Boolean(process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN);
}

export async function checkRateLimit(
  ip: string
): Promise<{ limited: boolean }> {
  if (!hasTursoConfig()) return { limited: false };

  const db = getDb();
  const windowStart = new Date(Date.now() - WINDOW_SECS * 1000).toISOString();

  const result = await db.execute({
    sql: "SELECT COUNT(*) as cnt FROM login_attempts WHERE ip = ? AND attempted_at > ?",
    args: [ip, windowStart],
  });

  const count = Number(result.rows[0]?.cnt ?? 0);
  return { limited: count >= MAX_ATTEMPTS };
}

export async function recordLoginAttempt(ip: string): Promise<void> {
  if (!hasTursoConfig()) return;

  const db = getDb();
  await db.execute({
    sql: "INSERT INTO login_attempts (ip, attempted_at) VALUES (?, ?)",
    args: [ip, new Date().toISOString()],
  });

  // Prune stale rows so the table stays small
  const cutoff = new Date(Date.now() - WINDOW_SECS * 1000).toISOString();
  await db.execute({
    sql: "DELETE FROM login_attempts WHERE attempted_at < ?",
    args: [cutoff],
  });
}
