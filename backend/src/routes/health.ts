import { FastifyPluginAsync } from "fastify";

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/health", async () => ({ ok: true, service: "larry-api", ts: new Date().toISOString() }));

  fastify.get("/ready", async () => {
    await fastify.db.query("SELECT 1");
    return { ok: true, db: "up" };
  });
};
