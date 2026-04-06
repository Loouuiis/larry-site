import { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const AUTONOMY_LEVEL_MAP: Record<
  number,
  { autoExecuteLowImpact: boolean; low: number; medium: number }
> = {
  1: { autoExecuteLowImpact: false, low: 1.0, medium: 1.0 },
  2: { autoExecuteLowImpact: true, low: 0.95, medium: 1.0 },
  3: { autoExecuteLowImpact: true, low: 0.75, medium: 0.80 },
  4: { autoExecuteLowImpact: true, low: 0.50, medium: 0.60 },
  5: { autoExecuteLowImpact: true, low: 0.0, medium: 0.0 },
};

const PatchPolicySchema = z.object({
  autonomyLevel: z.number().int().min(1).max(5).optional(),
  autoExecuteLowImpact: z.boolean().optional(),
  lowImpactMinConfidence: z.number().min(0).max(1).optional(),
  mediumImpactMinConfidence: z.number().min(0).max(1).optional(),
});

const CreateRuleSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  ruleType: z.string().min(1).max(50).default("behavioral"),
});

const PatchRuleSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(2000).optional(),
  isActive: z.boolean().optional(),
});

type RuleRow = {
  id: string;
  tenant_id: string;
  title: string;
  description: string;
  rule_type: string;
  is_active: boolean;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

type PolicyRow = {
  tenant_id: string;
  low_impact_min_confidence: number;
  medium_impact_min_confidence: number;
  auto_execute_low_impact: boolean;
  autonomy_level: number;
  updated_at: string;
};

export const settingsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/policy",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const tenantId = request.user.tenantId;

      const rows = await fastify.db.queryTenant<PolicyRow>(
        tenantId,
        `SELECT tenant_id, low_impact_min_confidence, medium_impact_min_confidence,
                auto_execute_low_impact, autonomy_level, updated_at
         FROM tenant_policy_settings
         WHERE tenant_id = $1`,
        [tenantId]
      );

      if (rows.length === 0) {
        return {
          autonomyLevel: 3,
          autoExecuteLowImpact: true,
          lowImpactMinConfidence: 0.75,
          mediumImpactMinConfidence: 0.80,
        };
      }

      const row = rows[0];
      return {
        autonomyLevel: Number(row.autonomy_level),
        autoExecuteLowImpact: row.auto_execute_low_impact,
        lowImpactMinConfidence: Number(row.low_impact_min_confidence),
        mediumImpactMinConfidence: Number(row.medium_impact_min_confidence),
      };
    }
  );

  fastify.patch(
    "/policy",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin"])] },
    async (request, reply) => {
      const body = PatchPolicySchema.parse(request.body);
      const tenantId = request.user.tenantId;

      // When autonomyLevel is provided, derive the other fields from the level map
      let resolvedAutoExecute = body.autoExecuteLowImpact;
      let resolvedLow = body.lowImpactMinConfidence;
      let resolvedMedium = body.mediumImpactMinConfidence;
      let resolvedLevel = body.autonomyLevel;

      if (body.autonomyLevel !== undefined) {
        const mapped = AUTONOMY_LEVEL_MAP[body.autonomyLevel];
        resolvedAutoExecute = mapped.autoExecuteLowImpact;
        resolvedLow = mapped.low;
        resolvedMedium = mapped.medium;
        resolvedLevel = body.autonomyLevel;
      }

      const setClauses: string[] = [];
      const values: unknown[] = [tenantId];
      let paramIndex = 2;

      if (resolvedLevel !== undefined) {
        setClauses.push(`autonomy_level = $${paramIndex}`);
        values.push(resolvedLevel);
        paramIndex++;
      }
      if (resolvedAutoExecute !== undefined) {
        setClauses.push(`auto_execute_low_impact = $${paramIndex}`);
        values.push(resolvedAutoExecute);
        paramIndex++;
      }
      if (resolvedLow !== undefined) {
        setClauses.push(`low_impact_min_confidence = $${paramIndex}`);
        values.push(resolvedLow);
        paramIndex++;
      }
      if (resolvedMedium !== undefined) {
        setClauses.push(`medium_impact_min_confidence = $${paramIndex}`);
        values.push(resolvedMedium);
        paramIndex++;
      }

      if (setClauses.length === 0) {
        return reply.status(400).send({ error: "No fields to update" });
      }

      setClauses.push("updated_at = NOW()");

      const rows = await fastify.db.queryTenant<PolicyRow>(
        tenantId,
        `INSERT INTO tenant_policy_settings (
          tenant_id,
          low_impact_min_confidence,
          medium_impact_min_confidence,
          auto_execute_low_impact,
          autonomy_level
        )
        VALUES ($1, 0.75, 0.80, true, 3)
         ON CONFLICT (tenant_id) DO UPDATE
         SET ${setClauses.join(", ")}
         RETURNING tenant_id, low_impact_min_confidence, medium_impact_min_confidence,
                   auto_execute_low_impact, autonomy_level, updated_at`,
        values
      );

      const row = rows[0];
      return {
        autonomyLevel: Number(row.autonomy_level),
        autoExecuteLowImpact: row.auto_execute_low_impact,
        lowImpactMinConfidence: Number(row.low_impact_min_confidence),
        mediumImpactMinConfidence: Number(row.medium_impact_min_confidence),
      };
    }
  );

  fastify.get(
    "/rules",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const tenantId = request.user.tenantId;

      const rows = await fastify.db.queryTenant<RuleRow>(
        tenantId,
        `SELECT id,
                tenant_id,
                title,
                description,
                rule_type,
                is_active,
                created_by_user_id,
                created_at,
                updated_at
         FROM larry_rules
         WHERE tenant_id = $1
         ORDER BY created_at DESC`,
        [tenantId]
      );

      return {
        items: rows.map((row) => ({
          id: row.id,
          title: row.title,
          description: row.description,
          ruleType: row.rule_type,
          isActive: row.is_active,
          createdByUserId: row.created_by_user_id,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        })),
      };
    }
  );

  fastify.post(
    "/rules",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm"])] },
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const body = CreateRuleSchema.parse(request.body ?? {});

      const rows = await fastify.db.queryTenant<RuleRow>(
        tenantId,
        `INSERT INTO larry_rules
           (tenant_id, title, description, rule_type, created_by_user_id)
         VALUES
           ($1, $2, $3, $4, $5)
         RETURNING id,
                   tenant_id,
                   title,
                   description,
                   rule_type,
                   is_active,
                   created_by_user_id,
                   created_at,
                   updated_at`,
        [tenantId, body.title.trim(), body.description.trim(), body.ruleType.trim(), request.user.userId]
      );

      const row = rows[0];
      return reply.code(201).send({
        id: row.id,
        title: row.title,
        description: row.description,
        ruleType: row.rule_type,
        isActive: row.is_active,
        createdByUserId: row.created_by_user_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      });
    }
  );

  fastify.patch(
    "/rules/:id",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm"])] },
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const params = z.object({ id: z.string().uuid() }).parse(request.params ?? {});
      const body = PatchRuleSchema.parse(request.body ?? {});

      const setClauses: string[] = [];
      const values: unknown[] = [tenantId, params.id];
      let paramIndex = 3;

      if (body.title !== undefined) {
        setClauses.push(`title = $${paramIndex}`);
        values.push(body.title.trim());
        paramIndex++;
      }
      if (body.description !== undefined) {
        setClauses.push(`description = $${paramIndex}`);
        values.push(body.description.trim());
        paramIndex++;
      }
      if (body.isActive !== undefined) {
        setClauses.push(`is_active = $${paramIndex}`);
        values.push(body.isActive);
        paramIndex++;
      }

      if (setClauses.length === 0) {
        return reply.status(400).send({ error: "No fields to update" });
      }

      setClauses.push("updated_at = NOW()");

      const rows = await fastify.db.queryTenant<RuleRow>(
        tenantId,
        `UPDATE larry_rules
         SET ${setClauses.join(", ")}
         WHERE tenant_id = $1
           AND id = $2
         RETURNING id,
                   tenant_id,
                   title,
                   description,
                   rule_type,
                   is_active,
                   created_by_user_id,
                   created_at,
                   updated_at`,
        values
      );

      if (!rows[0]) {
        throw fastify.httpErrors.notFound("Rule not found");
      }

      const row = rows[0];
      return {
        id: row.id,
        title: row.title,
        description: row.description,
        ruleType: row.rule_type,
        isActive: row.is_active,
        createdByUserId: row.created_by_user_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    }
  );

  fastify.delete(
    "/rules/:id",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm"])] },
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const params = z.object({ id: z.string().uuid() }).parse(request.params ?? {});

      const rows = await fastify.db.queryTenant<RuleRow>(
        tenantId,
        `UPDATE larry_rules
         SET is_active = false,
             updated_at = NOW()
         WHERE tenant_id = $1
           AND id = $2
         RETURNING id,
                   tenant_id,
                   title,
                   description,
                   rule_type,
                   is_active,
                   created_by_user_id,
                   created_at,
                   updated_at`,
        [tenantId, params.id]
      );

      if (!rows[0]) {
        throw fastify.httpErrors.notFound("Rule not found");
      }

      return reply.code(204).send();
    }
  );
};
