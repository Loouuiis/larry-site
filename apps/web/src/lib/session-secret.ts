// Shared JWT secret resolution — imported by both middleware.ts (Edge Runtime)
// and auth.ts (Node.js). Keep this file free of bcryptjs / next/headers imports
// so it remains edge-compatible.

export function getSessionSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET env var must be set and at least 32 characters. " +
      "Generate one with: node -e \"console.log(require('crypto').randomBytes(16).toString('hex'))\""
    );
  }
  return new TextEncoder().encode(secret);
}
