import { createClient } from "@libsql/client";

export function getDb() {
  const raw = process.env.TURSO_DATABASE_URL ?? "file:./prisma/dev.db";
  // Convert libsql:// → https:// so HTTP transport is used on Vercel serverless
  const url = raw.startsWith("libsql://") ? raw.replace("libsql://", "https://") : raw;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  return createClient({ url, authToken });
}
