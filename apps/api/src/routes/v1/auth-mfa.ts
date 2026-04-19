import { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  generateEnrolmentSecret,
  verifyTotpCode,
  generateScratchCodes,
  hashScratchCode,
  consumeScratchCode,
} from "../../lib/mfa.js";
import { issueAccessToken, issueRefreshToken } from "../../lib/auth.js";
import { writeAuditLog } from "../../lib/audit.js";

// Short-lived token a user needs to finish logging in when MFA is required
// (either to complete the second step with `verify` or to enrol with
// `enrol`/`enrol/confirm`). 5 min matches the typical banking / SaaS
// second-factor window.
const MFA_PENDING_TTL_SECONDS = 5 * 60;

type MfaPendingScope = "mfa_verify" | "mfa_enrol";

interface MfaPendingPayload {
  userId: string;
  tenantId: string;
  role: "owner" | "admin" | "pm" | "member" | "executive";
  email: string;
  scope: MfaPendingScope;
}

export async function issueMfaPendingToken(
  app: import("fastify").FastifyInstance,
  payload: MfaPendingPayload,
): Promise<string> {
  return app.jwt.sign(
    {
      sub: payload.userId,
      userId: payload.userId,
      tenantId: payload.tenantId,
      role: payload.role,
      email: payload.email,
      scope: payload.scope,
    },
    { expiresIn: MFA_PENDING_TTL_SECONDS },
  );
}

interface VerifiedMfaPending {
  userId: string;
  tenantId: string;
  role: MfaPendingPayload["role"];
  email: string;
  scope: MfaPendingScope;
}

async function verifyMfaPendingToken(
  app: import("fastify").FastifyInstance,
  token: string,
  expectedScope: MfaPendingScope,
): Promise<VerifiedMfaPending | null> {
  try {
    const decoded = await app.jwt.verify<{
      userId: string;
      tenantId: string;
      role: MfaPendingPayload["role"];
      email: string;
      scope: MfaPendingScope;
    }>(token);
    if (decoded.scope !== expectedScope) return null;
    return {
      userId: decoded.userId,
      tenantId: decoded.tenantId,
      role: decoded.role,
      email: decoded.email,
      scope: decoded.scope,
    };
  } catch {
    return null;
  }
}

const EnrolBodySchema = z.object({
  mfaEnrolmentToken: z.string().min(1).optional(),
});

const EnrolConfirmBodySchema = z.object({
  code: z.string().min(1),
  mfaEnrolmentToken: z.string().min(1).optional(),
});

const VerifyBodySchema = z.object({
  mfaPendingToken: z.string().min(1),
  code: z.string().min(1),
  useScratchCode: z.boolean().optional(),
});

type MfaRouteAuth =
  | { kind: "session"; userId: string; tenantId: string; role: MfaPendingPayload["role"]; email: string }
  | { kind: "enrolment_token"; userId: string; tenantId: string; role: MfaPendingPayload["role"]; email: string };

/**
 * Resolve the caller of an enrolment endpoint. Accepts either a live session
 * (normal "I want to turn on MFA" flow) or an mfa_enrolment_token issued at
 * login when the tenant forced enrolment before a session could exist.
 */
async function resolveEnrolmentCaller(
  app: import("fastify").FastifyInstance,
  request: FastifyRequest,
  bodyToken: string | undefined,
): Promise<MfaRouteAuth | null> {
  // Path A: a real session.
  try {
    await request.jwtVerify();
    const u = request.user as {
      userId: string;
      tenantId: string;
      role: MfaPendingPayload["role"];
      email?: string;
      scope?: string;
    };
    // Refuse if this is one of our pending tokens being replayed — those
    // must go in the body field.
    if (!u.scope) {
      return {
        kind: "session",
        userId: u.userId,
        tenantId: u.tenantId,
        role: u.role,
        email: u.email ?? "",
      };
    }
  } catch {
    // fall through to token path
  }
  // Path B: enrolment token in the body.
  if (bodyToken) {
    const decoded = await verifyMfaPendingToken(app, bodyToken, "mfa_enrol");
    if (decoded) {
      return {
        kind: "enrolment_token",
        userId: decoded.userId,
        tenantId: decoded.tenantId,
        role: decoded.role,
        email: decoded.email,
      };
    }
  }
  return null;
}

export const authMfaRoutes: FastifyPluginAsync = async (fastify) => {
  // ---------------------------------------------------------------------
  // POST /auth/mfa/enrol  (session OR mfa_enrolment_token)
  //   Generates a fresh secret, stores it unconfirmed, returns the
  //   otpauth:// URL (for QR rendering) and base32 secret (for manual entry).
  // ---------------------------------------------------------------------
  fastify.post("/mfa/enrol", {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: "15 minutes",
        keyGenerator: (req: FastifyRequest) => req.ip,
      },
    },
  }, async (request, reply) => {
    const body = EnrolBodySchema.parse(request.body ?? {});
    const caller = await resolveEnrolmentCaller(fastify, request, body.mfaEnrolmentToken);
    if (!caller) return reply.unauthorized("Authentication required to enrol MFA.");

    const label = caller.email || caller.userId;
    const { secret, otpauthUrl } = generateEnrolmentSecret(label);

    // UPSERT so re-running enrol (user lost their phone mid-setup) just
    // overwrites the pending secret. Once confirmed_at is set, re-enrolling
    // invalidates the confirmation — that's deliberate: if you scan a new
    // QR, your old authenticator stops working.
    await fastify.db.query(
      `INSERT INTO user_mfa_secrets (user_id, secret, confirmed_at, updated_at)
         VALUES ($1, $2, NULL, NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET secret = EXCLUDED.secret,
                     confirmed_at = NULL,
                     updated_at = NOW()`,
      [caller.userId, secret],
    );

    return reply.send({
      secret,
      otpauthUrl,
    });
  });

  // ---------------------------------------------------------------------
  // POST /auth/mfa/enrol/confirm
  //   { code }. Verifies the TOTP against the pending secret, flips
  //   users.mfa_enrolled_at, issues 10 scratch codes (hashed at rest).
  //   If the caller used an mfa_enrolment_token, also mints access+refresh
  //   tokens so they can continue into the app.
  // ---------------------------------------------------------------------
  fastify.post("/mfa/enrol/confirm", {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: "15 minutes",
        keyGenerator: (req: FastifyRequest) => req.ip,
      },
    },
  }, async (request, reply) => {
    const body = EnrolConfirmBodySchema.parse(request.body);
    const caller = await resolveEnrolmentCaller(fastify, request, body.mfaEnrolmentToken);
    if (!caller) return reply.unauthorized("Authentication required to enrol MFA.");

    const rows = await fastify.db.query<{ secret: string; confirmed_at: string | null }>(
      `SELECT secret, confirmed_at FROM user_mfa_secrets WHERE user_id = $1`,
      [caller.userId],
    );
    const row = rows[0];
    if (!row) return reply.badRequest("No MFA enrolment in progress. Start with /mfa/enrol.");

    if (!verifyTotpCode(row.secret, body.code)) {
      return reply.unauthorized("Invalid code. Please try again.");
    }

    const scratchCodes = generateScratchCodes();

    // Use a transaction: flip the user, mark the secret confirmed, rotate
    // scratch codes (delete old, insert new). We don't have a pg transaction
    // helper exported from @larry/db on the surface, but the three statements
    // are idempotent enough that a mid-flight crash just leaves the user
    // with partial scratch codes — acceptable failure mode.
    await fastify.db.query(
      `UPDATE user_mfa_secrets
          SET confirmed_at = NOW(), updated_at = NOW()
        WHERE user_id = $1`,
      [caller.userId],
    );
    await fastify.db.query(
      `UPDATE users SET mfa_enrolled_at = NOW() WHERE id = $1`,
      [caller.userId],
    );
    // Scratch codes live across enrolments — wipe old unused codes whenever
    // we confirm so the set the user sees matches what's valid.
    await fastify.db.query(
      `DELETE FROM user_mfa_scratch_codes WHERE user_id = $1`,
      [caller.userId],
    );
    for (const code of scratchCodes) {
      await fastify.db.query(
        `INSERT INTO user_mfa_scratch_codes (user_id, code_hash) VALUES ($1, $2)`,
        [caller.userId, hashScratchCode(code)],
      );
    }

    await writeAuditLog(fastify.db, {
      tenantId: caller.tenantId,
      actorUserId: caller.userId,
      actionType: "auth.mfa_enrolled",
      objectType: "user",
      objectId: caller.userId,
      details: { viaEnrolmentToken: caller.kind === "enrolment_token" },
    });

    // If the caller came in with an enrolment token, the login flow is
    // blocked waiting for us — issue real tokens so they can continue.
    if (caller.kind === "enrolment_token") {
      const accessToken = await issueAccessToken(fastify, {
        userId: caller.userId,
        tenantId: caller.tenantId,
        role: caller.role,
        email: caller.email,
      });
      const refreshToken = await issueRefreshToken(fastify, {
        userId: caller.userId,
        tenantId: caller.tenantId,
        role: caller.role,
        email: caller.email,
      }, undefined, {
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? undefined,
      });
      return reply.send({
        scratchCodes,
        accessToken,
        refreshToken,
        user: {
          id: caller.userId,
          email: caller.email,
          tenantId: caller.tenantId,
          role: caller.role,
        },
      });
    }

    return reply.send({ scratchCodes });
  });

  // ---------------------------------------------------------------------
  // POST /auth/mfa/verify
  //   { mfaPendingToken, code } — exchanges the second-step code for
  //   real access + refresh tokens. Accepts a live TOTP OR an unused
  //   scratch code.
  // ---------------------------------------------------------------------
  fastify.post("/mfa/verify", {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: "15 minutes",
        keyGenerator: (req: FastifyRequest) => {
          // key by user_id where possible so a shared-IP office can't lock
          // each other out — fall back to IP if the token is unparseable.
          const body = req.body as { mfaPendingToken?: string } | undefined;
          const raw = body?.mfaPendingToken;
          if (!raw) return req.ip;
          try {
            const parts = raw.split(".");
            if (parts.length < 2) return req.ip;
            const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
            return typeof payload?.userId === "string" ? `user:${payload.userId}` : req.ip;
          } catch {
            return req.ip;
          }
        },
      },
    },
  }, async (request, reply) => {
    const body = VerifyBodySchema.parse(request.body);

    const decoded = await verifyMfaPendingToken(fastify, body.mfaPendingToken, "mfa_verify");
    if (!decoded) return reply.unauthorized("Invalid or expired second-step token.");

    const rows = await fastify.db.query<{ secret: string; confirmed_at: string | null }>(
      `SELECT secret, confirmed_at FROM user_mfa_secrets WHERE user_id = $1`,
      [decoded.userId],
    );
    const row = rows[0];
    if (!row || !row.confirmed_at) {
      return reply.unauthorized("MFA is not enrolled for this account.");
    }

    let ok = false;
    if (body.useScratchCode) {
      ok = await consumeScratchCode(fastify.db, decoded.userId, body.code);
    } else {
      ok = verifyTotpCode(row.secret, body.code);
      // Fallback: if the user's authenticator app rejects (or they typed
      // a scratch code into the "code" box by mistake), try as scratch.
      if (!ok && /[A-Za-z]/.test(body.code)) {
        ok = await consumeScratchCode(fastify.db, decoded.userId, body.code);
      }
    }

    if (!ok) {
      await writeAuditLog(fastify.db, {
        tenantId: decoded.tenantId,
        actorUserId: decoded.userId,
        actionType: "auth.mfa_verify_failure",
        objectType: "user",
        objectId: decoded.userId,
        details: { scratchCode: body.useScratchCode === true },
      });
      return reply.unauthorized("Invalid code. Please try again.");
    }

    await fastify.db.query(
      `UPDATE user_mfa_secrets SET last_verified_at = NOW() WHERE user_id = $1`,
      [decoded.userId],
    );

    // Session rotation on re-login (P2-5): nuke old refresh tokens.
    await fastify.db.query(
      `UPDATE refresh_tokens SET revoked_at = NOW()
        WHERE user_id = $1 AND tenant_id = $2 AND revoked_at IS NULL`,
      [decoded.userId, decoded.tenantId],
    );

    const accessToken = await issueAccessToken(fastify, {
      userId: decoded.userId,
      tenantId: decoded.tenantId,
      role: decoded.role,
      email: decoded.email,
    });
    const refreshToken = await issueRefreshToken(fastify, {
      userId: decoded.userId,
      tenantId: decoded.tenantId,
      role: decoded.role,
      email: decoded.email,
    }, undefined, {
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"] ?? undefined,
    });

    await writeAuditLog(fastify.db, {
      tenantId: decoded.tenantId,
      actorUserId: decoded.userId,
      actionType: "auth.mfa_verify_success",
      objectType: "user",
      objectId: decoded.userId,
      details: { scratchCode: body.useScratchCode === true },
    });

    return reply.send({
      accessToken,
      refreshToken,
      user: {
        id: decoded.userId,
        email: decoded.email,
        tenantId: decoded.tenantId,
        role: decoded.role,
      },
    });
  });

  // ---------------------------------------------------------------------
  // DELETE /auth/mfa  (session required)
  //   Disables MFA on the caller's account. If the tenant requires MFA
  //   for admins and the caller is one, they'll have to re-enrol to log
  //   in again. Useful for "lost my phone" self-service.
  // ---------------------------------------------------------------------
  fastify.delete("/mfa", { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; tenantId: string };
    await fastify.db.query(
      `DELETE FROM user_mfa_secrets WHERE user_id = $1`,
      [user.userId],
    );
    await fastify.db.query(
      `DELETE FROM user_mfa_scratch_codes WHERE user_id = $1`,
      [user.userId],
    );
    await fastify.db.query(
      `UPDATE users SET mfa_enrolled_at = NULL WHERE id = $1`,
      [user.userId],
    );
    await writeAuditLog(fastify.db, {
      tenantId: user.tenantId,
      actorUserId: user.userId,
      actionType: "auth.mfa_disabled",
      objectType: "user",
      objectId: user.userId,
    });
    return reply.send({ success: true });
  });

  // ---------------------------------------------------------------------
  // GET /auth/mfa/status  (session required)
  //   Returns whether MFA is enrolled and whether the tenant requires it.
  // ---------------------------------------------------------------------
  fastify.get("/mfa/status", { preHandler: [fastify.authenticate] }, async (request) => {
    const user = request.user as { userId: string; tenantId: string };
    const rows = await fastify.db.query<{
      mfa_enrolled_at: string | null;
      mfa_required_for_admins: boolean;
    }>(
      `SELECT u.mfa_enrolled_at, t.mfa_required_for_admins
         FROM users u, tenants t
        WHERE u.id = $1 AND t.id = $2`,
      [user.userId, user.tenantId],
    );
    const row = rows[0];
    return {
      enrolled: Boolean(row?.mfa_enrolled_at),
      enrolledAt: row?.mfa_enrolled_at ?? null,
      tenantRequiresForAdmins: Boolean(row?.mfa_required_for_admins),
    };
  });
};
