import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { AuthUser } from "@larry/shared";
import {
  assessInviteLink,
  createInviteLink,
  findInviteLinkByToken,
  listInviteLinks,
  reserveInviteLinkUse,
  revokeInviteLink,
} from "../../lib/invite-links.js";
import { canInviteMembers, INVITABLE_TENANT_ROLES } from "../../lib/permissions.js";
import { getProjectMembershipAccess } from "../../lib/project-memberships.js";
import { emailSchema, passwordSchema } from "../../lib/validation.js";
import { writeAuditLog } from "../../lib/audit.js";
import { hashPassword, issueAccessToken, issueRefreshToken, verifyPassword } from "../../lib/auth.js";
import { assertSeatAvailable, SeatCapReachedError } from "../../lib/seat-cap.js";

const ProjectRoleEnum = z.enum(["owner", "editor", "viewer"]);

const CreateBody = z
  .object({
    defaultRole: z.enum(INVITABLE_TENANT_ROLES).default("member"),
    defaultProjectId: z.string().uuid().optional(),
    defaultProjectRole: ProjectRoleEnum.optional(),
    maxUses: z.number().int().positive().max(10_000).optional(),
    expiresInDays: z.number().int().positive().max(365).optional(),
  })
  .refine(
    (v) =>
      (v.defaultProjectId === undefined) === (v.defaultProjectRole === undefined),
    {
      message: "defaultProjectId and defaultProjectRole must be supplied together.",
      path: ["defaultProjectRole"],
    },
  );

const RedeemBody = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().max(200).optional(),
});

function resolveFrontendUrl(): string {
  const explicit = process.env.FRONTEND_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  const cors = process.env.CORS_ORIGINS;
  if (cors) return cors.split(",")[0].trim().replace(/\/+$/, "");
  return "http://localhost:3000";
}

export const inviteLinksRoutes: FastifyPluginAsync = async (fastify) => {
  // ── POST / — create a shareable link (admin+) ─────────────────────
  fastify.post("/", { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const user = request.user;
    if (!canInviteMembers(user.role)) {
      throw fastify.httpErrors.forbidden("Only admins can create invite links.");
    }
    const body = CreateBody.parse(request.body);

    // Seat cap check — defensive; a link with max_uses could still overflow the
    // tenant, so each redemption will re-check, but block obviously-full tenants here.
    try {
      await assertSeatAvailable(fastify.db, user.tenantId);
    } catch (e) {
      if (e instanceof SeatCapReachedError) throw fastify.httpErrors.conflict(e.message);
      throw e;
    }

    // If link is pre-scoped to a project, the creator must manage it.
    if (body.defaultProjectId && body.defaultProjectRole) {
      const access = await getProjectMembershipAccess({
        db: fastify.db,
        tenantId: user.tenantId,
        projectId: body.defaultProjectId,
        userId: user.userId,
        tenantRole: user.role,
      });
      if (!access.projectExists) throw fastify.httpErrors.notFound("Project not found.");
      if (!access.canManage) {
        throw fastify.httpErrors.forbidden(
          "Project collaborator management requires owner or editor access.",
        );
      }
    }

    const { link, rawToken } = await createInviteLink(fastify.db, {
      tenantId: user.tenantId,
      createdByUserId: user.userId,
      defaultRole: body.defaultRole,
      defaultProjectId: body.defaultProjectId ?? null,
      defaultProjectRole: body.defaultProjectRole ?? null,
      maxUses: body.maxUses ?? null,
      expiresInDays: body.expiresInDays ?? null,
    });

    await writeAuditLog(fastify.db, {
      tenantId: user.tenantId,
      actorUserId: user.userId,
      actionType: "invite_link.created",
      objectType: "invite_link",
      objectId: link.id,
      details: {
        defaultRole: body.defaultRole,
        defaultProjectId: body.defaultProjectId ?? null,
        defaultProjectRole: body.defaultProjectRole ?? null,
        maxUses: body.maxUses ?? null,
        expiresInDays: body.expiresInDays ?? null,
      },
    });

    const url = `${resolveFrontendUrl()}/invite/link/${encodeURIComponent(rawToken)}`;
    return reply.code(201).send({ link, url });
  });

  // ── GET / — list admin-visible links ──────────────────────────────
  fastify.get("/", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canInviteMembers(request.user.role)) {
      throw fastify.httpErrors.forbidden("Only admins can list invite links.");
    }
    const links = await listInviteLinks(fastify.db, request.user.tenantId);
    return { links };
  });

  // ── POST /:id/revoke — revoke a link (admin+) ─────────────────────
  fastify.post("/:id/revoke", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canInviteMembers(request.user.role)) {
      throw fastify.httpErrors.forbidden("Only admins can revoke invite links.");
    }
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const ok = await revokeInviteLink(
      fastify.db,
      request.user.tenantId,
      id,
      request.user.userId,
    );
    if (!ok) throw fastify.httpErrors.notFound("Invite link not found or already revoked.");
    await writeAuditLog(fastify.db, {
      tenantId: request.user.tenantId,
      actorUserId: request.user.userId,
      actionType: "invite_link.revoked",
      objectType: "invite_link",
      objectId: id,
    });
    return { revoked: true };
  });

  // ── GET /by-token/:token — public preview ─────────────────────────
  fastify.get("/by-token/:token", async (request, reply) => {
    const { token } = z.object({ token: z.string().min(10) }).parse(request.params);
    const link = await findInviteLinkByToken(fastify.db, token);
    if (!link) throw fastify.httpErrors.notFound("Invite link not found.");
    const status = assessInviteLink(link);
    if (!status.ok) {
      return reply.code(410).send({ code: `invite_link_${status.code}` });
    }
    const tenantRows = await fastify.db.query<{ name: string; slug: string }>(
      `SELECT name, slug FROM tenants WHERE id = $1 LIMIT 1`,
      [link.tenantId],
    );
    let projectName: string | null = null;
    if (link.defaultProjectId) {
      const rows = await fastify.db.queryTenant<{ name: string }>(
        link.tenantId,
        `SELECT name FROM projects WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
        [link.tenantId, link.defaultProjectId],
      );
      projectName = rows[0]?.name ?? null;
    }
    return {
      tenantName: tenantRows[0]?.name ?? null,
      tenantSlug: tenantRows[0]?.slug ?? null,
      defaultRole: link.defaultRole,
      defaultProjectId: link.defaultProjectId,
      defaultProjectRole: link.defaultProjectRole,
      projectName,
      expiresAt: link.expiresAt,
      usesRemaining:
        link.maxUses === null ? null : Math.max(link.maxUses - link.usesCount, 0),
    };
  });

  // ── POST /by-token/:token/redeem ──────────────────────────────────
  // Creates-or-logs-in a user by email+password, then upserts tenant and
  // (optional) project memberships atomically and increments uses_count.
  fastify.post("/by-token/:token/redeem", async (request, reply) => {
    const { token } = z.object({ token: z.string().min(10) }).parse(request.params);
    const body = RedeemBody.parse(request.body ?? {});

    // Optional auth — if present we ignore body email mismatch guard; the
    // redeem still creates tenant+project memberships under the token's tenant.
    let authedUser: AuthUser | null = null;
    try {
      await request.jwtVerify();
      authedUser = request.user as AuthUser;
    } catch {
      authedUser = null;
    }

    const result = await fastify.db.tx(async (client) => {
      // Atomic reservation — fails closed if revoked / expired / exhausted.
      const link = await reserveInviteLinkUse(client, token);
      if (!link) {
        throw fastify.httpErrors.gone("Invite link is no longer usable.");
      }

      // Seat cap re-check at redemption time.
      try {
        await assertSeatAvailable(fastify.db, link.tenantId);
      } catch (e) {
        if (e instanceof SeatCapReachedError) {
          throw fastify.httpErrors.conflict(e.message);
        }
        throw e;
      }

      // Find or create the user.
      const existing = await client.query<{ id: string; password_hash: string }>(
        `SELECT id, password_hash FROM users WHERE lower(email) = lower($1) LIMIT 1`,
        [body.email],
      );
      let userId: string;
      if (existing.rows[0]) {
        const ok = await verifyPassword(body.password, existing.rows[0].password_hash);
        if (!ok) {
          throw fastify.httpErrors.unauthorized("Incorrect password for this email.");
        }
        userId = existing.rows[0].id;
      } else {
        const passwordHash = await hashPassword(body.password);
        const displayName = body.displayName?.trim() || body.email.split("@")[0];
        const ins = await client.query<{ id: string }>(
          `INSERT INTO users (email, password_hash, display_name, email_verified_at)
           VALUES ($1, $2, $3, NOW())
           RETURNING id`,
          [body.email, passwordHash, displayName],
        );
        userId = ins.rows[0].id;
      }

      await client.query(
        `INSERT INTO memberships (tenant_id, user_id, role)
         VALUES ($1, $2, $3::role_type)
         ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
        [link.tenantId, userId, link.defaultRole],
      );

      if (link.defaultProjectId && link.defaultProjectRole) {
        await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [link.tenantId]);
        await client.query(
          `INSERT INTO project_memberships (tenant_id, project_id, user_id, role)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (tenant_id, project_id, user_id)
           DO UPDATE SET role = EXCLUDED.role, updated_at = NOW()`,
          [link.tenantId, link.defaultProjectId, userId, link.defaultProjectRole],
        );
      }

      return { userId, link };
    });

    await writeAuditLog(fastify.db, {
      tenantId: result.link.tenantId,
      actorUserId: result.userId,
      actionType: "invite_link.redeemed",
      objectType: "invite_link",
      objectId: result.link.id,
      details: {
        projectId: result.link.defaultProjectId,
        projectRole: result.link.defaultProjectRole,
        preAuthedUserId: authedUser?.userId ?? null,
      },
    });

    const accessToken = await issueAccessToken(fastify, {
      userId: result.userId,
      tenantId: result.link.tenantId,
      role: result.link.defaultRole,
      email: body.email,
    });
    const refreshToken = await issueRefreshToken(fastify, {
      userId: result.userId,
      tenantId: result.link.tenantId,
      role: result.link.defaultRole,
      email: body.email,
    });
    return reply.code(200).send({
      userId: result.userId,
      tenantId: result.link.tenantId,
      accessToken,
      refreshToken,
    });
  });
};
