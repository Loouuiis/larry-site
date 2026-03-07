import { createClient } from "@libsql/client/http";

// Use the HTTP client explicitly — Vercel serverless functions do not support
// persistent WebSocket connections (libsql://). The HTTP client works on all
// platforms including edge/serverless. Local dev uses file: via the same API.

export function getDb() {
  const raw = process.env.TURSO_DATABASE_URL ?? "file:./prisma/dev.db";
  // Convert libsql:// → https:// so HTTP transport is used in production
  const url = raw.startsWith("libsql://") ? raw.replace("libsql://", "https://") : raw;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  return createClient({ url, authToken });
}
