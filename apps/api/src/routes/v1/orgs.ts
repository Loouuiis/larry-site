import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { FastifyInstance, FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { hashPassword } from "../../lib/auth.js";

const OrgRequestSchema = z.object({
  companyName: z.string().min(2).max(200).transform((value) => value.trim()),
  requesterName: z.string().min(2).max(120).transform((value) => value.trim()),
  requesterEmail: z.string().email().transform((value) => value.trim().toLowerCase()),
  teamSize: z.string().min(1).max(40).optional(),
  launchContext: z.string().max(2_000).optional(),
});

const ListRequestsQuerySchema = z.object({
  status: z.enum(["requested", "approved", "all"]).default("requested"),
});

const ApproveRequestParamsSchema = z.object({
  id: z.string().uuid(),
});

const ApproveRequestBodySchema = z.object({
  tenantName: z.string().min(2).max(200).optional(),
  tempPassword: z.string().min(12).max(120).optional(),
});

function readAdminSecret(request: FastifyRequest): string | null {
  const headerSecret = request.headers["x-admin-secret"];
  if (typeof headerSecret === "string" && headerSecret.length > 0) {
    return headerSecret;
  }

  const authHeader = request.headers.authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length).trim();
    return token.length > 0 ? token : null;
  }

  return null;
}

function ensureAdminSecret(fastify: FastifyInstance, request: FastifyRequest): void {
  const expectedSecret = fastify.config.ADMIN_SECRET;
  if (!expectedSecret) {
    throw fastify.httpErrors.serviceUnavailable("ADMIN_SECRET is not configured.");
  }

  const providedSecret = readAdminSecret(request);
  if (!providedSecret || providedSecret !== expectedSecret) {
    throw fastify.httpErrors.unauthorized("Admin approval requires a valid admin secret.");
  }
}

function slugify(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "larry-team";
}

async function buildUniqueTenantSlug(
  client: PoolClient,
  baseName: string
): Promise<string> {
  const seed = slugify(baseName);
  let candidate = seed;
  let suffix = 2;

  while (true) {
    const result = await client.query<{ id: string }>(
      "SELECT id FROM tenants WHERE slug = $1 LIMIT 1",
      [candidate]
    );
    if (!result.rows[0]) {
      return candidate;
    }
    candidate = `${seed}-${suffix}`;
    suffix += 1;
  }
}

function generateTempPassword(): string {
  return randomBytes(10).toString("base64url");
}

export const orgRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/orgs/request",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "1 hour",
          keyGenerator: (request: FastifyRequest) => request.ip,
        },
      },
    },
    async (request, reply) => {
      const body = OrgRequestSchema.parse(request.body);

      const existing = await fastify.db.query<{
        id: string;
        status: string;
      }>(
        `SELECT id, status
         FROM org_invites
         WHERE requester_email = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [body.requesterEmail]
      );

      const latestRequest = existing[0];
      if (latestRequest?.status === "approved") {
        throw fastify.httpErrors.conflict(
          "An organisation has already been approved for this email address."
        );
      }

      if (latestRequest?.status === "requested") {
        return reply.code(202).send({
          id: latestRequest.id,
          status: "requested",
          duplicate: true,
        });
      }

      const rows = await fastify.db.query<{ id: string }>(
        `INSERT INTO org_invites (
           company_name,
           slug_candidate,
           requester_name,
           requester_email,
           team_size,
           launch_context
         ) VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          body.companyName,
          slugify(body.companyName),
          body.requesterName,
          body.requesterEmail,
          body.teamSize ?? null,
          body.launchContext?.trim() || null,
        ]
      );

      return reply.code(201).send({
        id: rows[0].id,
        status: "requested",
      });
    }
  );

  fastify.get("/admin/orgs/requests", async (request) => {
    ensureAdminSecret(fastify, request);

    const query = ListRequestsQuerySchema.parse(request.query);
    const values: unknown[] = [];
    let sql = `SELECT id,
                      company_name as "companyName",
                      slug_candidate as "slugCandidate",
                      requester_name as "requesterName",
                      requester_email as "requesterEmail",
                      team_size as "teamSize",
                      launch_context as "launchContext",
                      status,
                      tenant_id as "tenantId",
                      user_id as "userId",
                      tenant_slug as "tenantSlug",
                      approved_at as "approvedAt",
                      approved_by as "approvedBy",
                      created_at as "createdAt",
                      updated_at as "updatedAt"
               FROM org_invites`;

    if (query.status !== "all") {
      values.push(query.status);
      sql += ` WHERE status = $${values.length}`;
    }

    sql += " ORDER BY created_at DESC";

    const rows = await fastify.db.query(sql, values);
    return { items: rows };
  });

  fastify.post("/admin/orgs/:id/approve", async (request, reply) => {
    ensureAdminSecret(fastify, request);

    const params = ApproveRequestParamsSchema.parse(request.params);
    const body = ApproveRequestBodySchema.parse(request.body ?? {});
    const tempPassword = body.tempPassword ?? generateTempPassword();
    const passwordHash = await hashPassword(tempPassword);

    const result = await fastify.db.tx(async (client) => {
      const requestResult = await client.query<{
        id: string;
        company_name: string;
        requester_name: string;
        requester_email: string;
        status: string;
      }>(
        `SELECT id, company_name, requester_name, requester_email, status
         FROM org_invites
         WHERE id = $1
         LIMIT 1
         FOR UPDATE`,
        [params.id]
      );

      const inviteRequest = requestResult.rows[0];
      if (!inviteRequest) {
        throw fastify.httpErrors.notFound("Organisation request not found.");
      }

      if (inviteRequest.status === "approved") {
        throw fastify.httpErrors.conflict("Organisation request has already been approved.");
      }

      const userConflict = await client.query<{ id: string }>(
        "SELECT id FROM users WHERE email = $1 LIMIT 1",
        [inviteRequest.requester_email]
      );
      if (userConflict.rows[0]) {
        throw fastify.httpErrors.conflict(
          "A user with this email already exists. Approval needs a manual handoff."
        );
      }

      const tenantName = body.tenantName?.trim() || inviteRequest.company_name;
      const tenantSlug = await buildUniqueTenantSlug(client, tenantName);

      const tenantResult = await client.query<{ id: string }>(
        `INSERT INTO tenants (name, slug)
         VALUES ($1, $2)
         RETURNING id`,
        [tenantName, tenantSlug]
      );
      const tenantId = tenantResult.rows[0].id;

      const userResult = await client.query<{ id: string }>(
        `INSERT INTO users (email, password_hash, display_name)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [
          inviteRequest.requester_email,
          passwordHash,
          inviteRequest.requester_name,
        ]
      );
      const userId = userResult.rows[0].id;

      await client.query(
        `INSERT INTO memberships (tenant_id, user_id, role)
         VALUES ($1, $2, 'admin')`,
        [tenantId, userId]
      );

      await client.query(
        `UPDATE org_invites
         SET status = 'approved',
             tenant_id = $2,
             user_id = $3,
             tenant_slug = $4,
             approved_at = NOW(),
             approved_by = 'admin-secret',
             updated_at = NOW()
         WHERE id = $1`,
        [params.id, tenantId, userId, tenantSlug]
      );

      return {
        tenantId,
        tenantSlug,
        userId,
        email: inviteRequest.requester_email,
      };
    });

    return reply.code(201).send({
      requestId: params.id,
      ...result,
      tempPassword,
      status: "approved",
    });
  });
};
