import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { generateSecureToken, hashPassword, hashToken, issueAccessToken, issueRefreshToken, verifyPassword } from "../../lib/auth.js";
import { writeAuditLog } from "../../lib/audit.js";
import { emailSchema, passwordSchema } from "../../lib/validation.js";
import { sendVerificationEmail } from "../../lib/email.js";
import { authPasswordResetRoutes } from "./auth-password-reset.js";
import { authVerificationRoutes } from "./auth-verification.js";

const LoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(8),
  tenantId: z.string().uuid().optional(),
});

const RefreshSchema = z.object({
  refreshToken: z.string().min(1),
  tenantId: z.string().uuid().optional(),
});

const SignupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullName: z.string().max(200).optional(),
  tenantId: z.string().uuid(),
});

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(authPasswordResetRoutes);
  await fastify.register(authVerificationRoutes);

  // -----------------------------------------------------------------------
  // POST /signup
  // -----------------------------------------------------------------------
  fastify.post("/signup", {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: "1 hour",
        keyGenerator: (req: import("fastify").FastifyRequest) => req.ip,
      },
    },
  }, async (request, reply) => {
    const body = SignupSchema.parse(request.body);

    // Check for existing user with same email in this tenant
    const existing = await fastify.db.query<{ id: string }>(
      `SELECT u.id FROM users u
       JOIN memberships m ON m.user_id = u.id
       WHERE u.email = $1 AND m.tenant_id = $2
       LIMIT 1`,
      [body.email, body.tenantId],
    );

    if (existing.length > 0) {
      return reply.code(409).send({ error: "An account with this email already exists." });
    }

    // Check tenant exists
    const tenants = await fastify.db.query<{ id: string }>(
      `SELECT id FROM tenants WHERE id = $1 LIMIT 1`,
      [body.tenantId],
    );

    if (tenants.length === 0) {
      return reply.badRequest("Invalid tenant.");
    }

    const passwordHash = await hashPassword(body.password);

    // Create user + membership in a transaction
    const newUser = await fastify.db.tx(async (client) => {
      const result = await client.query(
        `INSERT INTO users (email, password_hash, display_name, verification_grace_deadline, email_verified_at)
         VALUES ($1, $2, $3, NOW() + INTERVAL '7 days', NULL)
         RETURNING id, email`,
        [body.email, passwordHash, body.fullName ?? null],
      );

      const user = result.rows[0] as { id: string; email: string };

      await client.query(
        `INSERT INTO memberships (user_id, tenant_id, role) VALUES ($1, $2, 'member')`,
        [user.id, body.tenantId],
      );

      return user;
    });

    // Issue tokens
    const accessToken = await issueAccessToken(fastify, {
      userId: newUser.id,
      tenantId: body.tenantId,
      role: "member",
      email: newUser.email,
    });

    const refreshToken = await issueRefreshToken(fastify, {
      userId: newUser.id,
      tenantId: body.tenantId,
      role: "member",
      email: newUser.email,
    });

    // Send verification email (best-effort, don't block signup)
    try {
      const { raw, hash } = generateSecureToken();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      await fastify.db.query(
        `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
        [newUser.id, hash, expiresAt],
      );

      const frontendUrl = (
        fastify.config.FRONTEND_URL ??
        fastify.config.CORS_ORIGINS.split(",")[0].trim()
      ).replace(/\/+$/, "");
      const verifyUrl = `${frontendUrl}/verify-email?token=${encodeURIComponent(raw)}`;

      await sendVerificationEmail(newUser.email, verifyUrl);
    } catch (err) {
      request.log.error({ err, userId: newUser.id }, "Failed to send verification email on signup");
    }

    // Audit log
    await writeAuditLog(fastify.db, {
      tenantId: body.tenantId,
      actorUserId: newUser.id,
      actionType: "auth.signup",
      objectType: "user",
      objectId: newUser.id,
      details: { email: newUser.email },
    });

    return reply.code(201).send({
      accessToken,
      refreshToken,
      user: {
        id: newUser.id,
        email: newUser.email,
        role: "member",
        tenantId: body.tenantId,
      },
    });
  });

  // -----------------------------------------------------------------------
  // POST /login
  // -----------------------------------------------------------------------
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
        email_verified_at: string | null;
        verification_grace_deadline: string | null;
      }>(
        `SELECT display_name, is_active, email_verified_at, verification_grace_deadline
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
          emailVerifiedAt: rows[0]?.email_verified_at ?? null,
          verificationGraceDeadline: rows[0]?.verification_grace_deadline ?? null,
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
