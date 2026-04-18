import { FastifyPluginAsync } from "fastify";
import { z } from "zod";

// user-profile captures the optional work/discovery/tools data the user may
// provide after signup from the workspace-home PollingCard. The 3-step
// signup wizard (#86) dropped these 3 questions from the blocking signup
// flow; this is where they land when the user eventually fills them in.

const CompleteSchema = z.object({
  workTypes: z.array(z.string().max(100)).max(20),
  discovery: z.array(z.string().max(100)).max(10),
  tools: z.array(z.string().max(100)).max(20),
});

type ProfileRow = {
  work_types: string[];
  discovery: string[];
  tools: string[];
  completed_at: string | null;
  dismissed_at: string | null;
};

export const userProfileRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/profile",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const userId = request.user.userId;
      const rows = await fastify.db.query<ProfileRow>(
        `SELECT work_types, discovery, tools, completed_at, dismissed_at
         FROM user_profiles
         WHERE user_id = $1`,
        [userId]
      );
      const row = rows[0];
      if (!row) {
        return {
          workTypes: [],
          discovery: [],
          tools: [],
          completedAt: null,
          dismissedAt: null,
        };
      }
      return {
        workTypes: row.work_types,
        discovery: row.discovery,
        tools: row.tools,
        completedAt: row.completed_at,
        dismissedAt: row.dismissed_at,
      };
    }
  );

  fastify.post(
    "/profile/complete",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const body = CompleteSchema.parse(request.body);
      const userId = request.user.userId;
      await fastify.db.query(
        `INSERT INTO user_profiles (user_id, work_types, discovery, tools, completed_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (user_id) DO UPDATE
           SET work_types = EXCLUDED.work_types,
               discovery = EXCLUDED.discovery,
               tools = EXCLUDED.tools,
               completed_at = NOW(),
               updated_at = NOW()`,
        [userId, body.workTypes, body.discovery, body.tools]
      );
      return { ok: true };
    }
  );

  fastify.post(
    "/profile/dismiss",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const userId = request.user.userId;
      await fastify.db.query(
        `INSERT INTO user_profiles (user_id, dismissed_at)
         VALUES ($1, NOW())
         ON CONFLICT (user_id) DO UPDATE
           SET dismissed_at = NOW(),
               updated_at = NOW()`,
        [userId]
      );
      return { ok: true };
    }
  );
};
