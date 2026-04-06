import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { hashToken, issueAccessToken, issueRefreshToken, verifyPassword } from "../../lib/auth.js";
import { writeAuditLog } from "../../lib/audit.js";
import { emailSchema } from "../../lib/validation.js";
import { authPasswordResetRoutes } from "./auth-password-reset.js";

const LoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(8),
  tenantId: z.string().uuid().optional(),
});

const RefreshSchema = z.object({
  refreshToken: z.string().min(1),
  tenantId: z.string().uuid().optional(),
});

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(authPasswordResetRoutes);

  fastify.post("/login", {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: "15 minutes",
        keyGenerator: (req: import("fastify").FastifyRequest) => req.ip,
      },
    },
  }, async (request, reply) => {
    const body = LoginSchema.parse(request.body);
    const tenantFromHeader =
      typeof request.headers["x-tenant-id"] === "string" ? request.headers["x-tenant-id"] : undefined;
    const tenantId = body.tenantId ?? tenantFromHeader;

    if (!tenantId) {
      return reply.badRequest("tenantId is required in body or x-tenant-id header.");
    }

    const rows = await fastify.db.query<{
      id: string;
      email: string;
      password_hash: string;
      role: "admin" | "pm" | "member" | "executive";
      tenant_id: string;
    }>(
      `SELECT u.id, u.email, u.password_hash, m.role, m.tenant_id
       FROM users u
       JOIN memberships m ON m.user_id = u.id
       WHERE u.email = $1 AND m.tenant_id = $2
       LIMIT 1`,
      [body.email, tenantId]
    );

    const user = rows[0];
    if (!user) {
      return reply.unauthorized("Invalid credentials.");
    }

    const valid = await verifyPassword(body.password, user.password_hash);
    if (!valid) {
      return reply.unauthorized("Invalid credentials.");
    }

    const accessToken = await issueAccessToken(fastify, {
      userId: user.id,
      tenantId: user.tenant_id,
      role: user.role,
      email: user.email,
    });

    const refreshToken = await issueRefreshToken(fastify, {
      userId: user.id,
      tenantId: user.tenant_id,
      role: user.role,
      email: user.email,
    });

    await writeAuditLog(fastify.db, {
      tenantId: user.tenant_id,
      actorUserId: user.id,
      actionType: "auth.login",
      objectType: "session",
      objectId: user.id,
      details: { method: "password" },
    });

    return reply.send({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenant_id,
      },
    });
  });

  fastify.post("/refresh", {
    config: {
      rateLimit: {
        max: 30,
        timeWindow: "1 hour",
        keyGenerator: (req: import("fastify").FastifyRequest) => req.ip,
      },
    },
  }, async (request, reply) => {
    const body = RefreshSchema.parse(request.body);
    const tokenHash = hashToken(body.refreshToken);
    const tenantFromHeader =
      typeof request.headers["x-tenant-id"] === "string" ? request.headers["x-tenant-id"] : undefined;
    const tenantId = body.tenantId ?? tenantFromHeader;

    if (!tenantId) {
      return reply.badRequest("tenantId is required in body or x-tenant-id header.");
    }

    const rows = await fastify.db.query<{
      id: string;
      tenant_id: string;
      user_id: string;
      role: "admin" | "pm" | "member" | "executive";
      email: string;
      expires_at: string;
      revoked_at: string | null;
    }>(
      `SELECT rt.id, rt.tenant_id, rt.user_id, rt.expires_at, rt.revoked_at, m.role, u.email
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       JOIN memberships m ON m.user_id = rt.user_id AND m.tenant_id = rt.tenant_id
       WHERE rt.tenant_id = $1 AND rt.token_hash = $2
       LIMIT 1`,
      [tenantId, tokenHash]
    );

    const tokenRow = rows[0];
    if (!tokenRow || tokenRow.revoked_at || new Date(tokenRow.expires_at) < new Date()) {
      return reply.unauthorized("Invalid refresh token.");
    }

    const accessToken = await issueAccessToken(fastify, {
      userId: tokenRow.user_id,
      tenantId: tokenRow.tenant_id,
      role: tokenRow.role,
      email: tokenRow.email,
    });

    const refreshToken = await fastify.db.tx(async (client) => {
      await client.query("UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1", [tokenRow.id]);
      return issueRefreshToken(
        fastify,
        {
          userId: tokenRow.user_id,
          tenantId: tokenRow.tenant_id,
          role: tokenRow.role,
          email: tokenRow.email,
        },
        client
      );
    });

    return reply.send({ accessToken, refreshToken });
  });

  fastify.get(
    "/me",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const user = request.user;
      const rows = await fastify.db.query<{
        display_name: string | null;
        is_active: boolean;
      }>(
        `SELECT display_name, is_active
         FROM users
         WHERE id = $1
         LIMIT 1`,
        [user.userId]
      );

      return {
        user: {
          id: user.userId,
          tenantId: user.tenantId,
          role: user.role,
          email: user.email,
          displayName: rows[0]?.display_name ?? null,
          isActive: rows[0]?.is_active ?? true,
        },
      };
    }
  );

  fastify.get(
    "/members",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const tenantId = request.user.tenantId;
      const rows = await fastify.db.queryTenant<{
        id: string;
        name: string;
        email: string;
        role: string;
      }>(
        tenantId,
        `SELECT u.id,
                COALESCE(NULLIF(u.display_name, ''), split_part(u.email, '@', 1)) AS name,
                u.email,
                m.role
         FROM users u
         JOIN memberships m ON m.user_id = u.id
         WHERE m.tenant_id = $1
         ORDER BY name`,
        [tenantId]
      );
      return { members: rows };
    }
  );

  fastify.post(
    "/logout",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) return { success: true };

      await fastify.db.query(
        "UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND tenant_id = $2 AND revoked_at IS NULL",
        [request.user.userId, request.user.tenantId]
      );

      await writeAuditLog(fastify.db, {
        tenantId: request.user.tenantId,
        actorUserId: request.user.userId,
        actionType: "auth.logout",
        objectType: "session",
        objectId: request.user.userId,
      });

      return { success: true };
    }
  );
};
