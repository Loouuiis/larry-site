import { randomBytes } from "node:crypto";
import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { generateSecureToken, hashPassword, hashToken, issueAccessToken, issueRefreshToken, verifyPassword } from "../../lib/auth.js";
import { writeAuditLog } from "../../lib/audit.js";
import { emailSchema, passwordSchema } from "../../lib/validation.js";
import { sendVerificationEmail, sendMemberInviteEmail } from "../../lib/email.js";
import { INVITABLE_TENANT_ROLES, canInviteMembers, canManageMembers } from "../../lib/permissions.js";
import { assertTenantHasRemainingAdmin, LastAdminRequiredError } from "../../lib/last-admin-guard.js";
import { authPasswordResetRoutes } from "./auth-password-reset.js";
import { authVerificationRoutes } from "./auth-verification.js";
import { authGoogleRoutes } from "./auth-google.js";
import { authAccountRoutes } from "./auth-account.js";

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
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  fullName: z.string().max(200).optional(),
  orgName: z.string().max(200).optional(),
  tenantId: z.string().uuid().optional(),
});

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(authPasswordResetRoutes);
  await fastify.register(authVerificationRoutes);
  await fastify.register(authGoogleRoutes);
  await fastify.register(authAccountRoutes);

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

    // Check for existing user with same email
    const existing = await fastify.db.query<{ id: string }>(
      `SELECT id FROM users WHERE email = $1 LIMIT 1`,
      [body.email],
    );

    if (existing.length > 0) {
      return reply.code(409).send({ error: "An account with this email already exists." });
    }

    const passwordHash = await hashPassword(body.password);

    // Combine first/last name into display_name; fall back to legacy fullName field
    const displayName = [body.firstName?.trim(), body.lastName?.trim()].filter(Boolean).join(" ") || body.fullName?.trim() || null;

    // Create tenant + user + membership in a transaction.
    // Each new signup gets their own organization — they're the admin.
    const { newUser, tenantId } = await fastify.db.tx(async (client) => {
      // Create a new tenant for this user
      const orgName = body.orgName?.trim() || displayName || body.email.split("@")[0];
      const slugBase = orgName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "my-org";
      let slug = slugBase;
      let suffix = 2;
      while (true) {
        const dup = await client.query("SELECT id FROM tenants WHERE slug = $1 LIMIT 1", [slug]);
        if (!dup.rows[0]) break;
        slug = `${slugBase}-${suffix++}`;
      }

      const tenantResult = await client.query(
        `INSERT INTO tenants (name, slug) VALUES ($1, $2) RETURNING id`,
        [orgName, slug],
      );
      const tId = (tenantResult.rows[0] as { id: string }).id;

      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, display_name, verification_grace_deadline, email_verified_at)
         VALUES ($1, $2, $3, NOW() + INTERVAL '7 days', NULL)
         RETURNING id, email`,
        [body.email, passwordHash, displayName],
      );

      const user = userResult.rows[0] as { id: string; email: string };

      await client.query(
        `INSERT INTO memberships (user_id, tenant_id, role) VALUES ($1, $2, 'admin')`,
        [user.id, tId],
      );

      return { newUser: user, tenantId: tId };
    });

    // Issue tokens
    const accessToken = await issueAccessToken(fastify, {
      userId: newUser.id,
      tenantId,
      role: "admin",
      email: newUser.email,
    });

    const refreshToken = await issueRefreshToken(fastify, {
      userId: newUser.id,
      tenantId,
      role: "admin",
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

      await sendVerificationEmail(newUser.email, verifyUrl, {
        userId: newUser.id,
        tenantId,
      });
    } catch (err) {
      request.log.error({ err, userId: newUser.id }, "Failed to send verification email on signup");
    }

    // Audit log
    await writeAuditLog(fastify.db, {
      tenantId,
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
        role: "admin",
        tenantId,
        // U-2: include displayName derived at signup (first + last name
        // or fallback) so the web layer can seed the session cookie.
        displayName: displayName ?? null,
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

    // Resolve membership by email. If a tenantId is supplied, scope to it;
    // otherwise pick the user's oldest membership (deterministic default for
    // users who belong to exactly one tenant, which is the signup case).
    const rows = tenantId
      ? await fastify.db.query<{
          id: string;
          email: string;
          password_hash: string;
          role: "admin" | "pm" | "member" | "executive";
          tenant_id: string;
          display_name: string | null;
        }>(
          `SELECT u.id, u.email, u.password_hash, u.display_name, m.role, m.tenant_id
           FROM users u
           JOIN memberships m ON m.user_id = u.id
           WHERE u.email = $1 AND m.tenant_id = $2
           LIMIT 1`,
          [body.email, tenantId]
        )
      : await fastify.db.query<{
          id: string;
          email: string;
          password_hash: string;
          role: "admin" | "pm" | "member" | "executive";
          tenant_id: string;
          display_name: string | null;
        }>(
          `SELECT u.id, u.email, u.password_hash, u.display_name, m.role, m.tenant_id
           FROM users u
           JOIN memberships m ON m.user_id = u.id
           WHERE u.email = $1
           ORDER BY m.created_at ASC
           LIMIT 1`,
          [body.email]
        );

    const user = rows[0];
    if (!user) {
      return reply.unauthorized("Invalid credentials.");
    }

    // OAuth-only users have NULL password_hash — reject password login early
    if (!user.password_hash) {
      return reply.unauthorized("Invalid credentials.");
    }

    // --- Lockout check (before password verification) ---
    const lockout = await fastify.db.query<{ attempt_count: number; locked_until: string | null }>(
      "SELECT attempt_count, locked_until FROM login_attempts WHERE user_id = $1",
      [user.id]
    );
    if (lockout[0]?.locked_until && new Date(lockout[0].locked_until) > new Date()) {
      const minutesLeft = Math.ceil((new Date(lockout[0].locked_until).getTime() - Date.now()) / 60000);
      return reply.status(423).send({
        error: `Account temporarily locked. Try again in ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}, or reset your password.`,
      });
    }

    const valid = await verifyPassword(body.password, user.password_hash);
    if (!valid) {
      // Record failed attempt and potentially lock the account
      const result = await fastify.db.query<{ attempt_count: number; locked_until: string | null }>(
        `INSERT INTO login_attempts (user_id, attempt_count, last_attempt_at)
         VALUES ($1, 1, NOW())
         ON CONFLICT (user_id)
         DO UPDATE SET
           attempt_count = login_attempts.attempt_count + 1,
           last_attempt_at = NOW(),
           locked_until = CASE
             WHEN login_attempts.attempt_count + 1 >= 10
             THEN NOW() + INTERVAL '30 minutes'
             ELSE login_attempts.locked_until
           END
         RETURNING attempt_count, locked_until`,
        [user.id]
      );

      // Audit log if account was just locked
      if (result[0]?.locked_until && result[0].attempt_count >= 10) {
        await writeAuditLog(fastify.db, {
          tenantId: user.tenant_id,
          actorUserId: user.id,
          actionType: "auth.account_locked",
          objectType: "user",
          objectId: user.id,
          details: { attemptCount: result[0].attempt_count, lockedUntil: result[0].locked_until },
        });
      }

      return reply.unauthorized("Invalid credentials.");
    }

    // --- Successful login: reset lockout counter ---
    await fastify.db.query("DELETE FROM login_attempts WHERE user_id = $1", [user.id]);

    // --- New-device detection (best-effort, don't block login) ---
    // Must run BEFORE issueRefreshToken so the just-created token doesn't match itself.
    try {
      const recentSessions = await fastify.db.query<{ ip_address: string | null; user_agent: string | null }>(
        `SELECT ip_address, user_agent FROM refresh_tokens
         WHERE user_id = $1 AND tenant_id = $2 AND created_at > NOW() - INTERVAL '30 days'
         ORDER BY created_at DESC LIMIT 50`,
        [user.id, user.tenant_id]
      );
      const isKnownDevice = recentSessions.some(
        (s) => s.ip_address === request.ip && s.user_agent === (request.headers["user-agent"] ?? "unknown")
      );
      if (!isKnownDevice && recentSessions.length > 0) {
        const ua = request.headers["user-agent"] ?? "Unknown device";
        const uaShort = ua.length > 100 ? ua.substring(0, 100) + "..." : ua;
        const { sendNewDeviceAlert } = await import("../../lib/email.js");
        await sendNewDeviceAlert(
          user.email,
          { browser: uaShort, ip: request.ip },
          { userId: user.id, tenantId: user.tenant_id },
        ).catch(() => {});
      }
    } catch { /* non-fatal */ }

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
    }, undefined, {
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"] ?? undefined,
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
        // U-2: include displayName so the web layer can stash it in the
        // session cookie and not race on /v1/auth/me for sidebar initials.
        displayName: user.display_name ?? null,
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
        avatar_url: string | null;
      }>(
        `SELECT display_name, is_active, email_verified_at, verification_grace_deadline, avatar_url
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
          avatarUrl: rows[0]?.avatar_url ?? null,
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

  // ── Invite a new member by email ──────────────────────────────────
  const InviteSchema = z.object({
    email: emailSchema,
    role: z.enum(INVITABLE_TENANT_ROLES).default("member"),
    displayName: z.string().max(200).optional(),
  });

  fastify.post(
    "/members/invite",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const body = InviteSchema.parse(request.body);

      // Check caller is admin/owner.
      if (!canInviteMembers(request.user.role)) {
        throw fastify.httpErrors.forbidden("Only admins can invite members.");
      }

      // Check if user already exists in this tenant
      const existing = await fastify.db.queryTenant<{ id: string }>(
        tenantId,
        `SELECT u.id FROM users u
         JOIN memberships m ON m.user_id = u.id
         WHERE u.email = $1 AND m.tenant_id = $2
         LIMIT 1`,
        [body.email, tenantId]
      );

      if (existing.length > 0) {
        throw fastify.httpErrors.conflict("This email is already a member of this workspace.");
      }

      // Check if user exists globally (add them to tenant)
      const existingUser = await fastify.db.query<{ id: string; display_name: string | null }>(
        "SELECT id, display_name FROM users WHERE email = $1 LIMIT 1",
        [body.email]
      );

      let userId: string;

      if (existingUser.length > 0) {
        userId = existingUser[0].id;
        // Add membership
        await fastify.db.query(
          `INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, $3)
           ON CONFLICT (tenant_id, user_id) DO NOTHING`,
          [tenantId, userId, body.role]
        );
      } else {
        // Create new user with temp password
        const tempPassword = randomBytes(10).toString("base64url");
        const passwordHash = await hashPassword(tempPassword);
        const displayName = body.displayName?.trim() || body.email.split("@")[0];

        const userRows = await fastify.db.query<{ id: string }>(
          `INSERT INTO users (email, password_hash, display_name, verification_grace_deadline)
           VALUES ($1, $2, $3, NOW() + INTERVAL '7 days') RETURNING id`,
          [body.email, passwordHash, displayName]
        );
        userId = userRows[0].id;

        await fastify.db.query(
          `INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, $3)`,
          [tenantId, userId, body.role]
        );

        // Send invite email (graceful — don't fail the invite if email fails).
        // tenantId drives the per-tenant invite cap (20/hour) and the daily
        // 200/tenant global cap.
        try {
          await sendMemberInviteEmail(body.email, displayName, { tenantId });
        } catch (emailErr) {
          console.error("[invite] Failed to send invite email:", emailErr);
        }
      }

      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId: request.user.userId,
        actionType: "member.invited",
        objectType: "user",
        objectId: userId,
        details: { email: body.email, role: body.role },
      });

      // Return updated member list
      const rows = await fastify.db.queryTenant<{ id: string; name: string; email: string; role: string }>(
        tenantId,
        `SELECT u.id, COALESCE(NULLIF(u.display_name, ''), split_part(u.email, '@', 1)) AS name, u.email, m.role
         FROM users u JOIN memberships m ON m.user_id = u.id WHERE m.tenant_id = $1 ORDER BY name`,
        [tenantId]
      );
      return reply.code(201).send({ members: rows });
    }
  );

  // ── Update member role ────────────────────────────────────────────
  const UpdateMemberSchema = z.object({
    role: z.enum(INVITABLE_TENANT_ROLES),
  });

  fastify.patch(
    "/members/:userId",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const tenantId = request.user.tenantId;
      const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params);
      const body = UpdateMemberSchema.parse(request.body);

      if (!canManageMembers(request.user.role)) {
        throw fastify.httpErrors.forbidden("Only admins can update member roles.");
      }

      if (userId === request.user.userId) {
        throw fastify.httpErrors.badRequest("You cannot change your own role.");
      }

      // If the target is currently an admin/owner and we're demoting them,
      // ensure the org still has at least one admin/owner afterwards.
      if (body.role !== "admin") {
        const targetRows = await fastify.db.queryTenant<{ role: string }>(
          tenantId,
          `SELECT role FROM memberships WHERE tenant_id = $1 AND user_id = $2 LIMIT 1`,
          [tenantId, userId]
        );
        const targetRole = targetRows[0]?.role;
        if (targetRole === "admin" || targetRole === "owner") {
          try {
            await assertTenantHasRemainingAdmin(fastify.db, tenantId, userId);
          } catch (e) {
            if (e instanceof LastAdminRequiredError) {
              throw fastify.httpErrors.conflict(e.message);
            }
            throw e;
          }
        }
      }

      await fastify.db.query(
        `UPDATE memberships SET role = $1, updated_at = NOW() WHERE tenant_id = $2 AND user_id = $3`,
        [body.role, tenantId, userId]
      );

      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId: request.user.userId,
        actionType: "member.role_updated",
        objectType: "user",
        objectId: userId,
        details: { newRole: body.role },
      });

      const rows = await fastify.db.queryTenant<{ id: string; name: string; email: string; role: string }>(
        tenantId,
        `SELECT u.id, COALESCE(NULLIF(u.display_name, ''), split_part(u.email, '@', 1)) AS name, u.email, m.role
         FROM users u JOIN memberships m ON m.user_id = u.id WHERE m.tenant_id = $1 ORDER BY name`,
        [tenantId]
      );
      return { members: rows };
    }
  );

  // ── Remove member ─────────────────────────────────────────────────
  fastify.delete(
    "/members/:userId",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const tenantId = request.user.tenantId;
      const { userId } = z.object({ userId: z.string().uuid() }).parse(request.params);

      if (!canManageMembers(request.user.role)) {
        throw fastify.httpErrors.forbidden("Only admins can remove members.");
      }

      if (userId === request.user.userId) {
        throw fastify.httpErrors.badRequest("You cannot remove yourself.");
      }

      // Guard: never allow the org to be left without an admin/owner.
      try {
        await assertTenantHasRemainingAdmin(fastify.db, tenantId, userId);
      } catch (e) {
        if (e instanceof LastAdminRequiredError) {
          throw fastify.httpErrors.conflict(e.message);
        }
        throw e;
      }

      await fastify.db.tx(async (client) => {
        await client.query(
          `DELETE FROM project_memberships WHERE tenant_id = $1 AND user_id = $2`,
          [tenantId, userId]
        );
        await client.query(
          `DELETE FROM memberships WHERE tenant_id = $1 AND user_id = $2`,
          [tenantId, userId]
        );
      });

      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId: request.user.userId,
        actionType: "member.removed",
        objectType: "user",
        objectId: userId,
      });

      const rows = await fastify.db.queryTenant<{ id: string; name: string; email: string; role: string }>(
        tenantId,
        `SELECT u.id, COALESCE(NULLIF(u.display_name, ''), split_part(u.email, '@', 1)) AS name, u.email, m.role
         FROM users u JOIN memberships m ON m.user_id = u.id WHERE m.tenant_id = $1 ORDER BY name`,
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
