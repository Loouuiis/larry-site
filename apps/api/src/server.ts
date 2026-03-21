import { config as loadEnv } from "dotenv";
import { getApiEnv } from "@larry/config";
import { createApp } from "./app.js";

loadEnv();

const env = getApiEnv();
const app = await createApp();

try {
  await app.listen({
    host: "0.0.0.0",
    port: env.PORT,
  });

  app.log.info(`API server listening on port ${env.PORT}`);
  app.log.info(`Database: ${new URL(env.DATABASE_URL).host}`);
} catch (error) {
  app.log.error(error, "Failed to start API server");
  process.exit(1);
}
