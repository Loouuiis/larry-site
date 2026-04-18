import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { AuthUser } from "@larry/shared";
import {
  createInvitation,
  findPendingInvitationByToken,
  isInvitationConsumable,
  listInvitations,
  markInvitationAccepted,
  revokeInvitation,
} from "../../lib/invitations.js";
import { canInviteMembers, canInviteRoleAs, INVITABLE_TENANT_ROLES } from "../../lib/permissions.js";
import { emailSchema, passwordSchema } from "../../lib/validation.js";
import { sendMemberInviteEmail } from "../../lib/email.js";
import { writeAuditLog } from "../../lib/audit.js";
import { hashPassword, issueAccessToken, issueRefreshToken } from "../../lib/auth.js";
import { assertSeatAvailable, SeatCapReachedError } from "../../lib/seat-cap.js";
import { assertMfaIfRequired, MfaEnrollmentRequiredError } from "../../lib/mfa-gate.js";
import { getProjectMembershipAccess, upsertProjectMembership } from "../../lib/project-memberships.js";

const ProjectRoleEnum = z.enum(["owner", "editor", "viewer"]);

const CreateBody = z
  .object({
    email: emailSchema,
    role: z.enum(INVITABLE_TENANT_ROLES).default("member"),
    displayName: z.string().max(200).optional(),
    projectId: z.string().uuid().optional(),
    projectRole: ProjectRoleEnum.optional(),
  })
  .refine(
    (v) => (v.projectId === undefined) === (v.projectRole === undefined),
    { message: "projectId and projectRole must be supplied together.", path: ["projectRole"] },
  );

const AcceptBody = z.object({
  password: passwordSchema.optional(),
  displayName: z.string().max(200).optional(),
});

function resolveFrontendUrl(): string {
  const explicit = process.env.FRONTEND_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  const cors = process.env.CORS_ORIGINS;
  if (cors) return cors.split(",")[0].trim().replace(/\/+$/, "");
  return "http://localhost:3000";
}

export const invitationsRoutes: FastifyPluginAsync = async (fastify) => {
  // ── POST / — create a pending invitation (admin+) ─────────────────
  fastify.post("/", { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const user = request.user;
    if (!canInviteMembers(user.role)) {
      throw fastify.httpErrors.forbidden("Only admins can invite members.");
    }
    try {
      await assertMfaIfRequired(fastify.db, user.tenantId, user.userId, user.role);
    } catch (e) {
      if (e instanceof MfaEnrollmentRequiredError) throw fastify.httpErrors.forbidden(e.message);
      throw e;
    }
    const body = CreateBody.parse(request.body);
    if (!canInviteRoleAs(user.role, body.role)) {
      throw fastify.httpErrors.badRequest("Cannot invite a member with that role.");
    }

    // Already a tenant member?
    const existing = await fastify.db.queryTenant<{ id: string }>(
      user.tenantId,
      `SELECT u.id FROM users u JOIN memberships m ON m.user_id = u.id
        WHERE lower(u.email) = lower($1) AND m.tenant_id = $2 LIMIT 1`,
      [body.email, user.tenantId],
    );

    // Project-scoped invite to an existing tenant member → skip the invitation
    // email flow entirely and add them straight to the project. Without this
    // short-circuit admins see a confusing "already in workspace" 409 when
    // trying to grant project access to a teammate who's already in the org
    // but not yet on this specific project.
    if (existing.length > 0 && body.projectId && body.projectRole) {
      const access = await getProjectMembershipAccess({
        db: fastify.db,
        tenantId: user.tenantId,
        projectId: body.projectId,
        userId: user.userId,
        tenantRole: user.role,
      });
      if (!access.projectExists) {
        throw fastify.httpErrors.notFound("Project not found.");
      }
      if (!access.canManage) {
        throw fastify.httpErrors.forbidden(
          "Project collaborator management requires owner or editor access.",
        );
      }
      const targetUserId = existing[0].id;
      await upsertProjectMembership(
        fastify.db,
        user.tenantId,
        body.projectId,
        targetUserId,
        body.projectRole,
      );
      await writeAuditLog(fastify.db, {
        tenantId: user.tenantId,
        actorUserId: user.userId,
        actionType: "project.member.added_via_invite",
        objectType: "project_membership",
        objectId: `${body.projectId}:${targetUserId}`,
        details: {
          projectId: body.projectId,
          userId: targetUserId,
          role: body.projectRole,
          invitedEmail: body.email,
        },
      });
      return reply.code(200).send({
        added: true,
        userId: targetUserId,
        projectId: body.projectId,
        projectRole: body.projectRole,
      });
    }

    if (existing.length > 0) {
      throw fastify.httpErrors.conflict("This email is already a member of this workspace.");
    }

    // Existing pending invite for this email?
    const dup = await fastify.db.queryTenant<{ id: string }>(
      user.tenantId,
      `SELECT id FROM invitations
        WHERE tenant_id = $1 AND lower(email) = lower($2) AND status = 'pending' LIMIT 1`,
      [user.tenantId, body.email],
    );
    if (dup.length > 0) {
      throw fastify.httpErrors.conflict("A pending invite already exists for this email.");
    }

    // Seat cap check (counts memberships + pending invitations).
    try {
      await assertSeatAvailable(fastify.db, user.tenantId);
    } catch (e) {
      if (e instanceof SeatCapReachedError) throw fastify.httpErrors.conflict(e.message);
      throw e;
    }

    // If the invite is scoped to a project, the inviter must be able to
    // manage that project (owner/editor, or tenant admin/owner).
    if (body.projectId && body.projectRole) {
      const access = await getProjectMembershipAccess({
        db: fastify.db,
        tenantId: user.tenantId,
        projectId: body.projectId,
        userId: user.userId,
        tenantRole: user.role,
      });
      if (!access.projectExists) {
        throw fastify.httpErrors.notFound("Project not found.");
      }
      if (!access.canManage) {
        throw fastify.httpErrors.forbidden(
          "Project collaborator management requires owner or editor access.",
        );
      }
    }

    const { invitation, rawToken } = await createInvitation(fastify.db, {
      tenantId: user.tenantId,
      email: body.email,
      role: body.role,
      invitedByUserId: user.userId,
      projectId: body.projectId ?? null,
      projectRole: body.projectRole ?? null,
    });

    // Org + inviter context for the email body.
    const [tenantRows, inviterRows] = await Promise.all([
      fastify.db.query<{ name: string }>(
        `SELECT name FROM tenants WHERE id = $1 LIMIT 1`,
        [user.tenantId],
      ),
      fastify.db.query<{ display_name: string | null }>(
        `SELECT display_name FROM users WHERE id = $1 LIMIT 1`,
        [user.userId],
      ),
    ]);

    try {
      await sendMemberInviteEmail(
        body.email,
        body.displayName ?? body.email.split("@")[0],
        {
          tenantId: user.tenantId,
          rawToken,
          orgName: tenantRows[0]?.name ?? "your team",
          inviterName: inviterRows[0]?.display_name ?? undefined,
        },
      );
    } catch (e) {
      fastify.log.error({ err: e }, "[invite] email send failed");
    }

    await writeAuditLog(fastify.db, {
      tenantId: user.tenantId,
      actorUserId: user.userId,
      actionType: "invitation.created",
      objectType: "invitation",
      objectId: invitation.id,
      details: { email: body.email, role: body.role },
    });

    const inviteUrl = `${resolveFrontendUrl()}/invite/accept?token=${encodeURIComponent(rawToken)}`;
    return reply.code(201).send({ invitation, inviteUrl });
  });

  // ── GET / — list invitations (admin+) ─────────────────────────────
  fastify.get("/", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canInviteMembers(request.user.role)) {
      throw fastify.httpErrors.forbidden("Only admins can list invitations.");
    }
    const q = z
      .object({
        status: z.enum(["pending", "accepted", "revoked", "expired"]).optional(),
      })
      .parse(request.query);
    const items = await listInvitations(fastify.db, request.user.tenantId, q.status);
    return { invitations: items };
  });

  // ── GET /:token — public preview ──────────────────────────────────
  fastify.get("/:token", async (request, reply) => {
    const { token } = z.object({ token: z.string().min(10) }).parse(request.params);
    const inv = await findPendingInvitationByToken(fastify.db, token);
    if (!inv) throw fastify.httpErrors.notFound("Invitation not found.");
    if (!isInvitationConsumable(inv)) {
      const expired = new Date(inv.expiresAt).getTime() <= Date.now();
      const code =
        inv.status === "accepted"
          ? "invite_accepted"
          : inv.status === "revoked"
            ? "invite_revoked"
            : expired
              ? "invite_expired"
              : "invite_unavailable";
      return reply.code(410).send({ code });
    }
    const tenant = await fastify.db.query<{ name: string; slug: string }>(
      `SELECT name, slug FROM tenants WHERE id = $1 LIMIT 1`,
      [inv.tenantId],
    );
    let projectName: string | null = null;
    if (inv.projectId) {
      const projectRows = await fastify.db.queryTenant<{ name: string }>(
        inv.tenantId,
        `SELECT name FROM projects WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
        [inv.tenantId, inv.projectId],
      );
      projectName = projectRows[0]?.name ?? null;
    }
    return {
      email: inv.email,
      role: inv.role,
      expiresAt: inv.expiresAt,
      tenantName: tenant[0]?.name ?? null,
      tenantSlug: tenant[0]?.slug ?? null,
      projectId: inv.projectId,
      projectRole: inv.projectRole,
      projectName,
    };
  });

  // ── POST /:token/accept ───────────────────────────────────────────
  fastify.post("/:token/accept", async (request, reply) => {
    const { token } = z.object({ token: z.string().min(10) }).parse(request.params);
    const body = AcceptBody.parse(request.body ?? {});
    const inv = await findPendingInvitationByToken(fastify.db, token);
    if (!inv || !isInvitationConsumable(inv)) {
      throw fastify.httpErrors.gone("Invitation cannot be accepted.");
    }

    // Optional auth — if present, require email match.
    let authedUser: AuthUser | null = null;
    try {
      await request.jwtVerify();
      authedUser = request.user as AuthUser;
    } catch {
      authedUser = null;
    }
    if (
      authedUser &&
      (authedUser.email ?? "").toLowerCase() !== inv.email.toLowerCase()
    ) {
      throw fastify.httpErrors.forbidden("This invitation is for a different email.");
    }

    const result = await fastify.db.tx(async (client) => {
      const userRows = await client.query<{ id: string }>(
        `SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1`,
        [inv.email],
      );

      let userId: string;
      if (userRows.rows[0]) {
        userId = userRows.rows[0].id;
      } else {
        if (!body.password) {
          throw fastify.httpErrors.badRequest(
            "Password is required to create an account for this invitation.",
          );
        }
        const passwordHash = await hashPassword(body.password);
        const displayName = body.displayName?.trim() || inv.email.split("@")[0];
        const ins = await client.query<{ id: string }>(
          `INSERT INTO users (email, password_hash, display_name, email_verified_at)
           VALUES ($1, $2, $3, NOW())
           RETURNING id`,
          [inv.email, passwordHash, displayName],
        );
        userId = ins.rows[0].id;
      }

      await client.query(
        `INSERT INTO memberships (tenant_id, user_id, role)
         VALUES ($1, $2, $3::role_type)
         ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
        [inv.tenantId, userId, inv.role],
      );

      // Project-scoped invite: atomically land the invitee in the project.
      // project_memberships is RLS-protected, so set app.tenant_id first.
      if (inv.projectId && inv.projectRole) {
        await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [inv.tenantId]);
        await client.query(
          `INSERT INTO project_memberships (tenant_id, project_id, user_id, role)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (tenant_id, project_id, user_id)
           DO UPDATE SET role = EXCLUDED.role, updated_at = NOW()`,
          [inv.tenantId, inv.projectId, userId, inv.projectRole],
        );
      }

      const marked = await markInvitationAccepted(client, inv.id, userId);
      if (!marked) {
        throw fastify.httpErrors.gone("Invitation has already been used.");
      }
      return { userId };
    });

    await writeAuditLog(fastify.db, {
      tenantId: inv.tenantId,
      actorUserId: result.userId,
      actionType: "invitation.accepted",
      objectType: "invitation",
      objectId: inv.id,
    });

    const accessToken = await issueAccessToken(fastify, {
      userId: result.userId,
      tenantId: inv.tenantId,
      role: inv.role as "admin" | "pm" | "member" | "owner" | "executive",
      email: inv.email,
    });
    const refreshToken = await issueRefreshToken(fastify, {
      userId: result.userId,
      tenantId: inv.tenantId,
      role: inv.role as "admin" | "pm" | "member" | "owner" | "executive",
      email: inv.email,
    });
    const displayNameRows = await fastify.db.query<{ display_name: string | null }>(
      `SELECT display_name FROM users WHERE id = $1 LIMIT 1`,
      [result.userId],
    );
    return reply.code(200).send({
      userId: result.userId,
      tenantId: inv.tenantId,
      role: inv.role,
      email: inv.email,
      displayName: displayNameRows[0]?.display_name ?? null,
      accessToken,
      refreshToken,
    });
  });

  // ── POST /:id/revoke — admin+ ─────────────────────────────────────
  fastify.post("/:id/revoke", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canInviteMembers(request.user.role)) {
      throw fastify.httpErrors.forbidden("Only admins can revoke invitations.");
    }
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const ok = await revokeInvitation(
      fastify.db,
      request.user.tenantId,
      id,
      request.user.userId,
    );
    if (!ok) throw fastify.httpErrors.notFound("Invitation not found or already consumed.");
    await writeAuditLog(fastify.db, {
      tenantId: request.user.tenantId,
      actorUserId: request.user.userId,
      actionType: "invitation.revoked",
      objectType: "invitation",
      objectId: id,
    });
    return { revoked: true };
  });

  // ── POST /:id/resend — admin+ ─────────────────────────────────────
  fastify.post("/:id/resend", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canInviteMembers(request.user.role)) {
      throw fastify.httpErrors.forbidden();
    }
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const rows = await fastify.db.queryTenant<{ email: string }>(
      request.user.tenantId,
      `SELECT email FROM invitations
        WHERE tenant_id = $1 AND id = $2 AND status = 'pending' LIMIT 1`,
      [request.user.tenantId, id],
    );
    if (rows.length === 0) throw fastify.httpErrors.notFound();
    // Extend expiry to a fresh 7d window (original token remains valid).
    await fastify.db.queryTenant(
      request.user.tenantId,
      `UPDATE invitations
          SET expires_at = GREATEST(expires_at, NOW() + INTERVAL '7 days'),
              updated_at = NOW()
        WHERE tenant_id = $1 AND id = $2`,
      [request.user.tenantId, id],
    );
    await writeAuditLog(fastify.db, {
      tenantId: request.user.tenantId,
      actorUserId: request.user.userId,
      actionType: "invitation.resent",
      objectType: "invitation",
      objectId: id,
    });
    return { resent: true };
  });
};
