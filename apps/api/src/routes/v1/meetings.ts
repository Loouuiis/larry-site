import { FastifyPluginAsync } from "fastify";
import { z } from "zod";

export const meetingRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/meetings",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const query = z.object({
        projectId: z.string().uuid().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      }).parse(request.query);
      const tenantId = request.user.tenantId;

      const values: unknown[] = [tenantId, query.limit];
      let sql = `SELECT id, title, summary, action_count, meeting_date, created_at,
                        project_id, agent_run_id
                 FROM meeting_notes
                 WHERE tenant_id = $1`;
      if (query.projectId) {
        values.push(query.projectId);
        sql += ` AND project_id = $${values.length}`;
      }
      sql += " ORDER BY created_at DESC LIMIT $2";

      const rows = await fastify.db.queryTenant<{
        id: string;
        title: string | null;
        summary: string | null;
        action_count: number;
        meeting_date: string | null;
        created_at: string;
        project_id: string | null;
        agent_run_id: string | null;
      }>(tenantId, sql, values);

      // Attach agent run state if available
      const runIds = rows.map((r) => r.agent_run_id).filter(Boolean) as string[];
      const runStates: Record<string, string> = {};
      if (runIds.length > 0) {
        const runRows = await fastify.db.queryTenant<{ id: string; state: string }>(
          tenantId,
          `SELECT id, state FROM agent_runs WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
          [tenantId, runIds]
        );
        for (const r of runRows) runStates[r.id] = r.state;
      }

      return {
        items: rows.map((r) => ({
          id: r.id,
          title: r.title,
          summary: r.summary,
          actionCount: r.action_count,
          meetingDate: r.meeting_date,
          createdAt: r.created_at,
          projectId: r.project_id,
          agentRunId: r.agent_run_id,
          agentRunState: r.agent_run_id ? (runStates[r.agent_run_id] ?? null) : null,
        })),
      };
    }
  );

  fastify.get(
    "/meetings/:id",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const tenantId = request.user.tenantId;

      const rows = await fastify.db.queryTenant<{
        id: string;
        title: string | null;
        transcript: string;
        summary: string | null;
        action_count: number;
        meeting_date: string | null;
        created_at: string;
        project_id: string | null;
        agent_run_id: string | null;
        agent_run_state: string | null;
      }>(
        tenantId,
        `SELECT mn.id, mn.title, mn.transcript, mn.summary, mn.action_count,
                mn.meeting_date, mn.created_at, mn.project_id, mn.agent_run_id,
                ar.state AS agent_run_state
         FROM meeting_notes mn
         LEFT JOIN agent_runs ar ON ar.id = mn.agent_run_id
         WHERE mn.tenant_id = $1 AND mn.id = $2 LIMIT 1`,
        [tenantId, params.id]
      );

      if (!rows[0]) throw fastify.httpErrors.notFound("Meeting not found.");

      const r = rows[0];
      return {
        id: r.id,
        title: r.title,
        transcript: r.transcript,
        summary: r.summary,
        actionCount: r.action_count,
        meetingDate: r.meeting_date,
        createdAt: r.created_at,
        projectId: r.project_id,
        agentRunId: r.agent_run_id,
        agentRunState: r.agent_run_state ?? null,
      };
    }
  );
};
