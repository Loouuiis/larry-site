// Shared JWT secret resolution — imported by both middleware.ts (Edge Runtime)
// and auth.ts (Node.js). Keep this file free of bcryptjs / next/headers imports
// so it remains edge-compatible.

const DEV_SESSION_SECRET = "larry-dev-session-secret-change-me-before-production-32+";

export function getSessionSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) {
    return new TextEncoder().encode(secret);
  }

  if (process.env.NODE_ENV !== "production") {
    return new TextEncoder().encode(DEV_SESSION_SECRET);
  }

  throw new Error(
    "SESSION_SECRET env var must be set and at least 32 characters in production."
  );
}
