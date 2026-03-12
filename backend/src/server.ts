import { config as loadEnv } from "dotenv";
import { createApp } from "./app.js";
import { getEnv } from "./config/env.js";

loadEnv();

const env = getEnv();
const app = await createApp();

try {
  await app.listen({
    host: "0.0.0.0",
    port: env.PORT,
  });

  app.log.info(`API server listening on port ${env.PORT}`);
} catch (error) {
  app.log.error(error, "Failed to start API server");
  process.exit(1);
}
