import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import type { FastifyInstance } from "fastify";
import { futureIsoDate } from "../utils/duration.js";

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateSecureToken(): { raw: string; hash: string } {
  const raw = randomBytes(48).toString("base64url");
  return { raw, hash: hashToken(raw) };
}

export async function issueAccessToken(
  app: FastifyInstance,
  payload: { userId: string; tenantId: string; role: "owner" | "admin" | "pm" | "member" | "executive"; email?: string }
): Promise<string> {
  return app.jwt.sign(
    {
      sub: payload.userId,
      userId: payload.userId,
      tenantId: payload.tenantId,
      role: payload.role,
      email: payload.email,
    },
    {
      expiresIn: app.config.ACCESS_TOKEN_TTL,
    }
  );
}

/**
 * Generates a new refresh token, hashes it, persists to refresh_tokens with expiration,
 * and returns the raw token for the client. Use dbClient when inside a transaction (e.g. refresh rotation).
 */
export async function issueRefreshToken(
  app: FastifyInstance,
  payload: { userId: string; tenantId: string; role: "owner" | "admin" | "pm" | "member" | "executive"; email?: string },
  dbClient?: PoolClient,
  meta?: { ipAddress?: string; userAgent?: string; deviceId?: string }
): Promise<string> {
  const token = randomBytes(48).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = futureIsoDate(app.config.REFRESH_TOKEN_TTL);
  const query = `INSERT INTO refresh_tokens (tenant_id, user_id, token_hash, expires_at, ip_address, user_agent, device_id) VALUES ($1, $2, $3, $4, $5, $6, $7)`;
  const values = [
    payload.tenantId,
    payload.userId,
    tokenHash,
    expiresAt,
    meta?.ipAddress ?? null,
    meta?.userAgent ?? null,
    meta?.deviceId ?? null,
  ];
  if (dbClient) {
    await dbClient.query(query, values);
  } else {
    await app.db.query(query, values);
  }
  return token;
}
