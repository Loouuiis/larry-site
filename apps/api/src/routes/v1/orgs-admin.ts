import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getApiEnv } from "@larry/config";
import { canChangeOrgSettings, canTransferOrgOwnership } from "../../lib/permissions.js";
import { writeAuditLog } from "../../lib/audit.js";

const TransferBody = z.object({ newOwnerUserId: z.string().uuid() });

const UpdateOrgBody = z.object({
  name: z.string().min(2).max(200).optional(),
  seatCap: z.number().int().positive().max(100_000).nullable().optional(),
  mfaRequiredForAdmins: z.boolean().optional(),
});

export const orgsAdminRoutes: FastifyPluginAsync = async (fastify) => {
  // Skip registering any routes when the feature flag is off.
  if (!getApiEnv().RBAC_V2_ENABLED) return;

  // ── POST /orgs/transfer-ownership (owner only) ────────────────────
  fastify.post(
    "/transfer-ownership",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const user = request.user;
      if (!canTransferOrgOwnership(user.role)) {
        throw fastify.httpErrors.forbidden("Only the org owner can transfer ownership.");
      }
      const { newOwnerUserId } = TransferBody.parse(request.body);
      if (newOwnerUserId === user.userId) {
        throw fastify.httpErrors.badRequest("New owner must be a different user.");
      }

      await fastify.db.tx(async (client) => {
        const targetRows = await client.query<{ role: string }>(
          `SELECT role FROM memberships
            WHERE tenant_id = $1 AND user_id = $2
            FOR UPDATE`,
          [user.tenantId, newOwnerUserId],
        );
        const target = targetRows.rows[0];
        if (!target) {
          throw fastify.httpErrors.notFound("Target user is not a member of this organisation.");
        }
        if (target.role !== "admin" && target.role !== "owner") {
          throw fastify.httpErrors.badRequest(
            "Target must already be an admin before becoming the owner.",
          );
        }
        // Demote current owner → admin, promote target → owner.
        await client.query(
          `UPDATE memberships
              SET role = 'admin', updated_at = NOW()
            WHERE tenant_id = $1 AND user_id = $2 AND role = 'owner'`,
          [user.tenantId, user.userId],
        );
        await client.query(
          `UPDATE memberships
              SET role = 'owner', updated_at = NOW()
            WHERE tenant_id = $1 AND user_id = $2`,
          [user.tenantId, newOwnerUserId],
        );
      });

      await writeAuditLog(fastify.db, {
        tenantId: user.tenantId,
        actorUserId: user.userId,
        actionType: "org.ownership_transferred",
        objectType: "user",
        objectId: newOwnerUserId,
      });

      return reply.code(200).send({ newOwnerUserId });
    },
  );

  // ── PATCH /orgs (admin+) ─────────────────────────────────────────
  fastify.patch(
    "/",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      if (!canChangeOrgSettings(request.user.role)) {
        throw fastify.httpErrors.forbidden("Only admins can change org settings.");
      }
      const body = UpdateOrgBody.parse(request.body ?? {});

      const fields: string[] = [];
      const params: unknown[] = [request.user.tenantId];
      if (body.name !== undefined) {
        params.push(body.name);
        fields.push(`name = $${params.length}`);
      }
      if (body.seatCap !== undefined) {
        params.push(body.seatCap);
        fields.push(`seat_cap = $${params.length}`);
      }
      if (body.mfaRequiredForAdmins !== undefined) {
        params.push(body.mfaRequiredForAdmins);
        fields.push(`mfa_required_for_admins = $${params.length}`);
      }
      if (fields.length === 0) return { updated: false };

      const rows = await fastify.db.query<{
        id: string;
        name: string;
        seat_cap: number | null;
        mfa_required_for_admins: boolean;
      }>(
        `UPDATE tenants
            SET ${fields.join(", ")}, updated_at = NOW()
          WHERE id = $1
        RETURNING id, name, seat_cap, mfa_required_for_admins`,
        params,
      );

      await writeAuditLog(fastify.db, {
        tenantId: request.user.tenantId,
        actorUserId: request.user.userId,
        actionType: "org.settings_updated",
        objectType: "tenant",
        objectId: request.user.tenantId,
        details: body as Record<string, unknown>,
      });

      return {
        updated: true,
        tenant: rows[0]
          ? {
              id: rows[0].id,
              name: rows[0].name,
              seatCap: rows[0].seat_cap,
              mfaRequiredForAdmins: rows[0].mfa_required_for_admins,
            }
          : null,
      };
    },
  );
};
