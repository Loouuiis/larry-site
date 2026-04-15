import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { generateSecureToken, hashPassword, hashToken } from "../../lib/auth.js";
import { writeAuditLog } from "../../lib/audit.js";
import { sendPasswordResetEmail } from "../../lib/email.js";
import { emailSchema, passwordSchema } from "../../lib/validation.js";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

const ForgotPasswordSchema = z.object({
  email: emailSchema,
});

const ResetPasswordSchema = z.object({
  token: z.string().min(1, "Token is required"),
  newPassword: passwordSchema,
});

export const authPasswordResetRoutes: FastifyPluginAsync = async (fastify) => {
  // -----------------------------------------------------------------------
  // POST /forgot-password
  // -----------------------------------------------------------------------
  fastify.post("/forgot-password", {
    config: {
      rateLimit: {
        max: 3,
        timeWindow: "1 hour",
        keyGenerator: (req: import("fastify").FastifyRequest) => {
          try {
            const body = req.body as { email?: string } | undefined;
            return `forgot:${body?.email?.toLowerCase().trim() ?? req.ip}`;
          } catch {
            return `forgot:${req.ip}`;
          }
        },
      },
    },
  }, async (request, reply) => {
    // Always return 200 to prevent email enumeration
    const successResponse = { message: "If that email exists, we've sent a reset link." };

    let body: z.infer<typeof ForgotPasswordSchema>;
    try {
      body = ForgotPasswordSchema.parse(request.body);
    } catch {
      return reply.send(successResponse);
    }

    // Look up user by email — password reset is global (no tenant scope)
    const users = await fastify.db.query<{ id: string; email: string }>(
      `SELECT id, email FROM users WHERE email = $1 LIMIT 1`,
      [body.email],
    );

    const user = users[0];
    if (!user) {
      return reply.send(successResponse);
    }

    // Invalidate any existing unused tokens for this user
    await fastify.db.query(
      `UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL`,
      [user.id],
    );

    // Generate token, store hash
    const { raw, hash } = generateSecureToken();
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();

    await fastify.db.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [user.id, hash, expiresAt],
    );

    // Build reset URL
    const frontendUrl = (
      fastify.config.FRONTEND_URL ??
      fastify.config.CORS_ORIGINS.split(",")[0].trim()
    ).replace(/\/+$/, "");
    const resetUrl = `${frontendUrl}/reset-password?token=${encodeURIComponent(raw)}`;

    // Send email (best-effort — don't fail the request). EmailQuotaError /
    // EmailSuppressedError are caught here too so forgot-password always
    // returns the generic success response (enumeration-safe).
    try {
      await sendPasswordResetEmail(user.email, resetUrl, { userId: user.id });
    } catch (err) {
      request.log.error({ err, userId: user.id }, "Failed to send password reset email");
    }

    // Audit log — find any tenant for this user
    const memberships = await fastify.db.query<{ tenant_id: string }>(
      `SELECT tenant_id FROM memberships WHERE user_id = $1 LIMIT 1`,
      [user.id],
    );
    const tenantId = memberships[0]?.tenant_id;
    if (tenantId) {
      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId: user.id,
        actionType: "auth.password_reset_requested",
        objectType: "user",
        objectId: user.id,
        details: { email: user.email },
      });
    }

    return reply.send(successResponse);
  });

  // -----------------------------------------------------------------------
  // POST /reset-password
  // -----------------------------------------------------------------------
  fastify.post("/reset-password", {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: "15 minutes",
        keyGenerator: (req: import("fastify").FastifyRequest) => req.ip,
      },
    },
  }, async (request, reply) => {
    const body = ResetPasswordSchema.parse(request.body);

    const tokenHash = hashToken(body.token);

    // Find the token
    const tokens = await fastify.db.query<{
      id: string;
      user_id: string;
      expires_at: string;
      used_at: string | null;
    }>(
      `SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = $1 LIMIT 1`,
      [tokenHash],
    );

    const tokenRow = tokens[0];
    if (!tokenRow) {
      return reply.badRequest("Invalid or expired reset link. Please request a new one.");
    }

    if (tokenRow.used_at) {
      return reply.badRequest("This reset link has already been used. Please request a new one.");
    }

    if (new Date(tokenRow.expires_at) < new Date()) {
      return reply.badRequest("This reset link has expired. Please request a new one.");
    }

    // Hash the new password
    const passwordHash = await hashPassword(body.newPassword);

    // Update password, mark token used, revoke all refresh tokens — in a transaction
    await fastify.db.tx(async (client) => {
      await client.query(
        `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
        [passwordHash, tokenRow.user_id],
      );

      await client.query(
        `UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1`,
        [tokenRow.id],
      );

      // Revoke all refresh tokens for this user across all tenants
      await client.query(
        `UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
        [tokenRow.user_id],
      );
    });

    // Audit log
    const memberships = await fastify.db.query<{ tenant_id: string }>(
      `SELECT tenant_id FROM memberships WHERE user_id = $1 LIMIT 1`,
      [tokenRow.user_id],
    );
    const tenantId = memberships[0]?.tenant_id;
    if (tenantId) {
      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId: tokenRow.user_id,
        actionType: "auth.password_reset_completed",
        objectType: "user",
        objectId: tokenRow.user_id,
      });
    }

    return reply.send({ message: "Password has been reset successfully." });
  });
};
