import { FastifyPluginAsync } from "fastify";
import { authRoutes } from "./auth.js";
import { projectRoutes } from "./projects.js";
import { taskRoutes } from "./tasks.js";
import { ingestRoutes } from "./ingest.js";
import { agentRoutes } from "./agent.js";
import { actionRoutes } from "./actions.js";
import { reportingRoutes } from "./reporting.js";
import { slackConnectorRoutes } from "./connectors-slack.js";
import { googleCalendarConnectorRoutes } from "./connectors-google-calendar.js";

export const v1Routes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(authRoutes, { prefix: "/auth" });
  await fastify.register(projectRoutes, { prefix: "/projects" });
  await fastify.register(taskRoutes, { prefix: "/tasks" });
  await fastify.register(ingestRoutes, { prefix: "/ingest" });
  await fastify.register(slackConnectorRoutes, { prefix: "/connectors/slack" });
  await fastify.register(googleCalendarConnectorRoutes, { prefix: "/connectors/google-calendar" });
  await fastify.register(agentRoutes, { prefix: "/agent" });
  await fastify.register(actionRoutes, { prefix: "/actions" });
  await fastify.register(reportingRoutes);
};
