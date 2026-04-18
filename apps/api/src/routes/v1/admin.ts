import { FastifyPluginAsync } from "fastify";

// QA-2026-04-12 I-6: tiny endpoints so a tester can verify scheduler health
// without Railway log access. Tokenless: the information surfaced is a
// timestamp and counts, not tenant data — equivalent to a public /health.
export const adminRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/scan/last-run", async (_request, reply) => {
    try {
      const rows = await fastify.db.query<{
        job_name: string;
        last_run_started_at: string;
        last_run_finished_at: string | null;
        last_run_duration_ms: number | null;
        last_run_processed: number;
        last_run_failed: number;
        last_run_error: string | null;
      }>(
        `SELECT job_name,
                last_run_started_at::text AS last_run_started_at,
                last_run_finished_at::text AS last_run_finished_at,
                last_run_duration_ms,
                last_run_processed,
                last_run_failed,
                last_run_error
           FROM system_job_runs
          WHERE job_name = 'larry.scan'
          LIMIT 1`
      );
      const row = rows[0];
      if (!row) {
        return reply.code(200).send({
          jobName: "larry.scan",
          alive: false,
          reason: "no runs recorded yet — worker may still be starting up",
        });
      }

      const startedMs = new Date(row.last_run_started_at).getTime();
      const ageMinutes = Math.floor((Date.now() - startedMs) / 60_000);
      // The scan runs every 30 min. Anything under 60 min old is healthy.
      const alive = ageMinutes < 60;

      const isProd = process.env.NODE_ENV === "production";
      return reply.code(200).send({
        jobName: row.job_name,
        alive,
        lastRunStartedAt: row.last_run_started_at,
        lastRunFinishedAt: row.last_run_finished_at,
        lastRunDurationMs: row.last_run_duration_ms,
        lastRunProcessed: row.last_run_processed,
        lastRunFailed: row.last_run_failed,
        ...(isProd
          ? { hadError: row.last_run_error !== null }
          : { lastRunError: row.last_run_error }),
        ageMinutes,
      });
    } catch (err) {
      // Table may not exist yet if the migration hasn't run — don't 500.
      return reply.code(200).send({
        jobName: "larry.scan",
        alive: false,
        reason: "status table unavailable — migration may be pending",
      });
    }
  });
};
