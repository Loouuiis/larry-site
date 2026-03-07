import { createClient } from "@libsql/client";

// Turso / libSQL client — works in both local dev (file:) and production (https://)
// TURSO_DATABASE_URL: "libsql://your-db.turso.io" in production, "file:./prisma/dev.db" locally
// TURSO_AUTH_TOKEN:   required in production, omit for local file

export function getDb() {
  const url = process.env.TURSO_DATABASE_URL ?? "file:./prisma/dev.db";
  const authToken = process.env.TURSO_AUTH_TOKEN;

  return createClient({ url, authToken });
}
