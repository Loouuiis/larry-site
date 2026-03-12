import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { FastifyInstance } from "fastify";

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

export async function issueAccessToken(
  app: FastifyInstance,
  payload: { userId: string; tenantId: string; role: "admin" | "pm" | "member" | "executive"; email?: string }
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

export async function issueRefreshToken(
  _app: FastifyInstance,
  _payload: { userId: string; tenantId: string; role: "admin" | "pm" | "member" | "executive"; email?: string }
): Promise<string> {
  return randomBytes(48).toString("base64url");
}
