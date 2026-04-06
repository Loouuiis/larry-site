import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  generateSecureToken,
  hashPassword,
  hashToken,
  verifyPassword,
} from "../../lib/auth.js";
import { writeAuditLog } from "../../lib/audit.js";
import {
  sendEmailChangeConfirmation,
  sendEmailChangeNotification,
} from "../../lib/email.js";
import { passwordSchema } from "../../lib/validation.js";

const EMAIL_CHANGE_TTL_MS = 60 * 60 * 1000; // 1 hour

const ChangePasswordSchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: passwordSchema,
});

const ChangeEmailSchema = z.object({
  newEmail: z.string().email().transform((v) => v.trim().toLowerCase()),
  password: z.string().optional(),
});

const ConfirmEmailChangeSchema = z.object({
  token: z.string().min(1, "Token is required"),
});

export const authAccountRoutes: FastifyPluginAsync = async (fastify) => {
  // -----------------------------------------------------------------------
  // POST /change-password  (auth required)
  // -----------------------------------------------------------------------
  fastify.post(
    "/change-password",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const body = ChangePasswordSchema.parse(request.body);
      const userId = request.user.userId;
      const tenantId = request.user.tenantId;

      // Look up the user's current password hash
      const users = await fastify.db.query<{ password_hash: string | null }>(
        `SELECT password_hash FROM users WHERE id = $1 LIMIT 1`,
        [userId]
      );

      const user = users[0];
      if (!user) {
        return reply.unauthorized("User not found.");
      }

      // If user has a password, require currentPassword
      if (user.password_hash) {
        if (!body.currentPassword) {
          return reply.badRequest("Current password is required.");
        }
        const valid = await verifyPassword(
          body.currentPassword,
          user.password_hash
        );
        if (!valid) {
          return reply.badRequest("Current password is incorrect.");
        }
      }
      // If OAuth-only (null password_hash), skip currentPassword check

      // Hash and update
      const newHash = await hashPassword(body.newPassword);
      await fastify.db.query(
        `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
        [newHash, userId]
      );

      // Revoke all refresh tokens EXCEPT the current one
      const currentTokenHash =
        typeof request.headers["x-current-token-hash"] === "string"
          ? request.headers["x-current-token-hash"]
          : null;

      if (currentTokenHash) {
        await fastify.db.query(
          `UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL AND token_hash != $2`,
          [userId, currentTokenHash]
        );
      } else {
        await fastify.db.query(
          `UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
          [userId]
        );
      }

      // Audit log
      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId: userId,
        actionType: "auth.password_changed",
        objectType: "user",
        objectId: userId,
      });

      return reply.send({ message: "Password changed successfully." });
    }
  );

  // -----------------------------------------------------------------------
  // POST /change-email  (auth required, requires verified email)
  // -----------------------------------------------------------------------
  fastify.post(
    "/change-email",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const body = ChangeEmailSchema.parse(request.body);
      const userId = request.user.userId;
      const tenantId = request.user.tenantId;

      // Check user's current status
      const users = await fastify.db.query<{
        email: string;
        password_hash: string | null;
        email_verified_at: string | null;
      }>(
        `SELECT email, password_hash, email_verified_at FROM users WHERE id = $1 LIMIT 1`,
        [userId]
      );

      const user = users[0];
      if (!user) {
        return reply.unauthorized("User not found.");
      }

      // Require verified email
      if (!user.email_verified_at) {
        return reply.badRequest(
          "You must verify your current email before changing it."
        );
      }

      // If user has password, verify it
      if (user.password_hash) {
        if (!body.password) {
          return reply.badRequest("Password is required to change email.");
        }
        const valid = await verifyPassword(body.password, user.password_hash);
        if (!valid) {
          return reply.badRequest("Password is incorrect.");
        }
      }

      // Check new email not in use
      const existing = await fastify.db.query<{ id: string }>(
        `SELECT id FROM users WHERE email = $1 LIMIT 1`,
        [body.newEmail]
      );
      if (existing.length > 0) {
        return reply.code(409).send({
          error: "An account with this email already exists.",
        });
      }

      // Invalidate existing change requests for this user
      await fastify.db.query(
        `UPDATE email_change_requests SET confirmed_at = NOW() WHERE user_id = $1 AND confirmed_at IS NULL`,
        [userId]
      );

      // Create email_change_requests row
      const { raw, hash } = generateSecureToken();
      const expiresAt = new Date(
        Date.now() + EMAIL_CHANGE_TTL_MS
      ).toISOString();

      await fastify.db.query(
        `INSERT INTO email_change_requests (user_id, new_email, token_hash, expires_at) VALUES ($1, $2, $3, $4)`,
        [userId, body.newEmail, hash, expiresAt]
      );

      // Build confirmation URL
      const frontendUrl = (
        fastify.config.FRONTEND_URL ??
        fastify.config.CORS_ORIGINS.split(",")[0].trim()
      ).replace(/\/+$/, "");
      const confirmUrl = `${frontendUrl}/confirm-email-change?token=${encodeURIComponent(raw)}`;

      // Send confirmation to NEW email
      try {
        await sendEmailChangeConfirmation(body.newEmail, confirmUrl);
      } catch (err) {
        request.log.error(
          { err, userId },
          "Failed to send email change confirmation"
        );
      }

      // Send notification to OLD email (best-effort)
      try {
        await sendEmailChangeNotification(user.email);
      } catch (err) {
        request.log.error(
          { err, userId },
          "Failed to send email change notification"
        );
      }

      return reply.send({
        message:
          "Check your new email for a confirmation link. The link expires in 1 hour.",
      });
    }
  );

  // -----------------------------------------------------------------------
  // POST /confirm-email-change  (no auth, rate limited)
  // -----------------------------------------------------------------------
  fastify.post(
    "/confirm-email-change",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "15 minutes",
          keyGenerator: (req: import("fastify").FastifyRequest) => req.ip,
        },
      },
    },
    async (request, reply) => {
      const body = ConfirmEmailChangeSchema.parse(request.body);
      const tokenHash = hashToken(body.token);

      // Find the token
      const tokens = await fastify.db.query<{
        id: string;
        user_id: string;
        new_email: string;
        expires_at: string;
        confirmed_at: string | null;
      }>(
        `SELECT id, user_id, new_email, expires_at, confirmed_at FROM email_change_requests WHERE token_hash = $1 LIMIT 1`,
        [tokenHash]
      );

      const tokenRow = tokens[0];
      if (!tokenRow) {
        return reply.badRequest("Invalid or expired email change link.");
      }

      if (tokenRow.confirmed_at) {
        return reply.badRequest(
          "This email change link has already been used."
        );
      }

      if (new Date(tokenRow.expires_at) < new Date()) {
        return reply.badRequest(
          "This email change link has expired. Please request a new one."
        );
      }

      // Check new email still not taken
      const existing = await fastify.db.query<{ id: string }>(
        `SELECT id FROM users WHERE email = $1 AND id != $2 LIMIT 1`,
        [tokenRow.new_email, tokenRow.user_id]
      );
      if (existing.length > 0) {
        return reply.code(409).send({
          error:
            "This email address is now in use by another account. Please request a new change.",
        });
      }

      // Update email and mark confirmed — in a transaction
      await fastify.db.tx(async (client) => {
        await client.query(
          `UPDATE users SET email = $1, email_verified_at = NOW(), updated_at = NOW() WHERE id = $2`,
          [tokenRow.new_email, tokenRow.user_id]
        );

        await client.query(
          `UPDATE email_change_requests SET confirmed_at = NOW() WHERE id = $1`,
          [tokenRow.id]
        );
      });

      // Audit log
      const memberships = await fastify.db.query<{ tenant_id: string }>(
        `SELECT tenant_id FROM memberships WHERE user_id = $1 LIMIT 1`,
        [tokenRow.user_id]
      );
      const tenantId = memberships[0]?.tenant_id;
      if (tenantId) {
        await writeAuditLog(fastify.db, {
          tenantId,
          actorUserId: tokenRow.user_id,
          actionType: "auth.email_changed",
          objectType: "user",
          objectId: tokenRow.user_id,
          details: { newEmail: tokenRow.new_email },
        });
      }

      return reply.send({ message: "Email changed successfully." });
    }
  );

  // -----------------------------------------------------------------------
  // GET /sessions  (auth required)
  // -----------------------------------------------------------------------
  fastify.get(
    "/sessions",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const userId = request.user.userId;
      const tenantId = request.user.tenantId;

      const sessions = await fastify.db.query<{
        id: string;
        created_at: string;
        ip_address: string | null;
        user_agent: string | null;
      }>(
        `SELECT id, created_at, ip_address, user_agent
         FROM refresh_tokens
         WHERE user_id = $1
           AND tenant_id = $2
           AND revoked_at IS NULL
           AND expires_at > NOW()
         ORDER BY created_at DESC`,
        [userId, tenantId]
      );

      return {
        sessions: sessions.map((s) => ({
          id: s.id,
          createdAt: s.created_at,
          ipAddress: s.ip_address,
          userAgent: s.user_agent,
          isCurrent: false,
        })),
      };
    }
  );

  // -----------------------------------------------------------------------
  // DELETE /sessions/:id  (auth required — revoke specific session)
  // -----------------------------------------------------------------------
  fastify.delete(
    "/sessions/:id",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const userId = request.user.userId;
      const tenantId = request.user.tenantId;

      const result = await fastify.db.query(
        `UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1 AND user_id = $2 AND tenant_id = $3 AND revoked_at IS NULL`,
        [id, userId, tenantId]
      );

      if (Array.isArray(result) && result.length === 0) {
        // The query returns affected rows as an array; for UPDATE, pg returns empty array
        // We don't fail — idempotent delete is fine
      }

      return reply.send({ success: true });
    }
  );

  // -----------------------------------------------------------------------
  // DELETE /sessions  (auth required — revoke all except current)
  // -----------------------------------------------------------------------
  fastify.delete(
    "/sessions",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const userId = request.user.userId;
      const tenantId = request.user.tenantId;

      const currentTokenHash =
        typeof request.headers["x-current-token-hash"] === "string"
          ? request.headers["x-current-token-hash"]
          : null;

      if (currentTokenHash) {
        await fastify.db.query(
          `UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND tenant_id = $2 AND revoked_at IS NULL AND token_hash != $3`,
          [userId, tenantId, currentTokenHash]
        );
      } else {
        await fastify.db.query(
          `UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND tenant_id = $2 AND revoked_at IS NULL`,
          [userId, tenantId]
        );
      }

      return reply.send({ success: true });
    }
  );
};
