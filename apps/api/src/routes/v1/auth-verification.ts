import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { generateSecureToken, hashToken } from "../../lib/auth.js";
import { writeAuditLog } from "../../lib/audit.js";
import { sendVerificationEmail } from "../../lib/email.js";

const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const VerifyEmailSchema = z.object({
  token: z.string().min(1, "Token is required"),
});

export const authVerificationRoutes: FastifyPluginAsync = async (fastify) => {
  // -----------------------------------------------------------------------
  // POST /send-verification  (requires auth)
  // -----------------------------------------------------------------------
  fastify.post("/send-verification", {
    preHandler: [fastify.authenticate],
    config: {
      rateLimit: {
        max: 3,
        timeWindow: "1 hour",
        keyGenerator: (req: import("fastify").FastifyRequest) => `verify:${req.user?.userId ?? req.ip}`,
      },
    },
  }, async (request, reply) => {
    const userId = request.user.userId;
    const email = request.user.email;

    // Check if already verified
    const users = await fastify.db.query<{ email_verified_at: string | null }>(
      `SELECT email_verified_at FROM users WHERE id = $1 LIMIT 1`,
      [userId],
    );

    if (users[0]?.email_verified_at) {
      return reply.send({ message: "Email is already verified." });
    }

    // Invalidate existing unused tokens
    await fastify.db.query(
      `UPDATE email_verification_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL`,
      [userId],
    );

    // Generate token, store hash
    const { raw, hash } = generateSecureToken();
    const expiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS).toISOString();

    await fastify.db.query(
      `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [userId, hash, expiresAt],
    );

    // Build verification URL
    const frontendUrl = (
      fastify.config.FRONTEND_URL ??
      fastify.config.CORS_ORIGINS.split(",")[0].trim()
    ).replace(/\/+$/, "");
    const verifyUrl = `${frontendUrl}/verify-email?token=${encodeURIComponent(raw)}`;

    // Send email (best-effort)
    try {
      await sendVerificationEmail(email!, verifyUrl, { userId });
    } catch (err) {
      request.log.error({ err, userId }, "Failed to send verification email");
    }

    return reply.send({ message: "Verification email sent." });
  });

  // -----------------------------------------------------------------------
  // POST /verify-email  (NO auth required — user clicks link from email)
  // -----------------------------------------------------------------------
  fastify.post("/verify-email", {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: "15 minutes",
        keyGenerator: (req: import("fastify").FastifyRequest) => req.ip,
      },
    },
  }, async (request, reply) => {
    const body = VerifyEmailSchema.parse(request.body);
    const tokenHash = hashToken(body.token);

    // Find the token
    const tokens = await fastify.db.query<{
      id: string;
      user_id: string;
      expires_at: string;
      used_at: string | null;
    }>(
      `SELECT id, user_id, expires_at, used_at FROM email_verification_tokens WHERE token_hash = $1 LIMIT 1`,
      [tokenHash],
    );

    const tokenRow = tokens[0];
    if (!tokenRow) {
      return reply.badRequest("Invalid or expired verification link.");
    }

    if (tokenRow.used_at) {
      return reply.badRequest("This verification link has already been used.");
    }

    if (new Date(tokenRow.expires_at) < new Date()) {
      return reply.badRequest("This verification link has expired. Please request a new one.");
    }

    // Set email_verified_at and mark token as used — in a transaction
    await fastify.db.tx(async (client) => {
      await client.query(
        `UPDATE users SET email_verified_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [tokenRow.user_id],
      );

      await client.query(
        `UPDATE email_verification_tokens SET used_at = NOW() WHERE id = $1`,
        [tokenRow.id],
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
        actionType: "auth.email_verified",
        objectType: "user",
        objectId: tokenRow.user_id,
      });
    }

    return reply.send({ message: "Email verified successfully." });
  });
};
