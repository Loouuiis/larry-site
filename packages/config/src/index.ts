import { z } from "zod";

const NodeEnv = z.enum(["development", "test", "production"]).default("development");
const LogLevel = z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info");

const SharedSchema = z.object({
  NODE_ENV: NodeEnv,
  LOG_LEVEL: LogLevel,
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-5-mini"),
});

const ApiSchema = SharedSchema.extend({
  PORT: z.coerce.number().int().positive().default(8080),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL: z.string().default("7d"),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  REQUIRE_TENANT_HEADER: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  SLACK_CLIENT_ID: z.string().optional(),
  SLACK_CLIENT_SECRET: z.string().optional(),
  SLACK_REDIRECT_URI: z.string().url().optional(),
  SLACK_SIGNING_SECRET: z.string().optional(),
  SLACK_BOT_SCOPES: z
    .string()
    .default("channels:read,channels:history,groups:history,im:history,mpim:history,chat:write"),
  SLACK_SIGNATURE_TOLERANCE_SECONDS: z.coerce.number().int().positive().default(300),
  SLACK_OAUTH_STATE_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),
  GOOGLE_CALENDAR_SCOPES: z.string().default("https://www.googleapis.com/auth/calendar.readonly"),
  GOOGLE_OAUTH_STATE_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  GOOGLE_CALENDAR_WEBHOOK_URL: z.string().url().optional(),
  EMAIL_CONNECTOR_PROVIDER: z.string().default("mock"),
  EMAIL_CONNECTOR_PUBLIC_BASE_URL: z.string().url().optional(),
  EMAIL_CONNECTOR_OAUTH_STATE_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
});

const WorkerSchema = SharedSchema.extend({
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
});

export type ApiEnv = z.infer<typeof ApiSchema>;
export type WorkerEnv = z.infer<typeof WorkerSchema>;

let apiCache: ApiEnv | null = null;
let workerCache: WorkerEnv | null = null;

export function getApiEnv(): ApiEnv {
  if (apiCache) return apiCache;
  const parsed = ApiSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid API environment configuration: ${parsed.error.message}`);
  }
  apiCache = parsed.data;
  return parsed.data;
}

export function getWorkerEnv(): WorkerEnv {
  if (workerCache) return workerCache;
  const parsed = WorkerSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid worker environment configuration: ${parsed.error.message}`);
  }
  workerCache = parsed.data;
  return parsed.data;
}

export function resetConfigCacheForTests(): void {
  apiCache = null;
  workerCache = null;
}
