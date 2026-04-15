import { z } from "zod";

const NodeEnv = z.enum(["development", "test", "production"]).default("development");
const LogLevel = z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info");

const SharedSchema = z.object({
  NODE_ENV: NodeEnv,
  LOG_LEVEL: LogLevel,
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  MODEL_PROVIDER: z.enum(["openai", "anthropic", "gemini", "groq"]).default("gemini"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-haiku-4-5-20251001"),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-1.5-flash"),
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default("llama-3.3-70b-versatile"),
});

const ApiSchema = SharedSchema.extend({
  PORT: z.coerce.number().int().positive().default(8080),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  ADMIN_SECRET: z.string().min(16).optional(),
  ACCESS_TOKEN_TTL: z.string().default("4h"),
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
    .default("channels:read,channels:history,groups:history,im:history,mpim:history,chat:write,users:read,users:read.email,im:write"),
  SLACK_SIGNATURE_TOLERANCE_SECONDS: z.coerce.number().int().positive().default(300),
  SLACK_OAUTH_STATE_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),
  GOOGLE_CALENDAR_SCOPES: z.string().default("https://www.googleapis.com/auth/calendar.readonly"),
  GOOGLE_OAUTH_STATE_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  GOOGLE_CALENDAR_WEBHOOK_URL: z.string().url().optional(),
  GOOGLE_AUTH_REDIRECT_URI: z.string().url().optional(),
  OUTLOOK_CLIENT_ID: z.string().optional(),
  OUTLOOK_CLIENT_SECRET: z.string().optional(),
  OUTLOOK_REDIRECT_URI: z.string().url().optional(),
  OUTLOOK_CALENDAR_SCOPES: z.string().default("offline_access openid profile User.Read Calendars.ReadWrite"),
  OUTLOOK_OAUTH_STATE_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  EMAIL_CONNECTOR_PROVIDER: z.string().default("mock"),
  EMAIL_CONNECTOR_PUBLIC_BASE_URL: z.string().url().optional(),
  EMAIL_CONNECTOR_OAUTH_STATE_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  GMAIL_REDIRECT_URI: z.string().url().optional(),
  GMAIL_SCOPES: z.string().default("https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email"),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_NOREPLY: z.string().default("Larry <noreply@larry-pm.com>"),
  RESEND_FROM_LARRY: z.string().default("Larry <larry@larry-pm.com>"),
  RESEND_WEBHOOK_SECRET: z.string().optional(),
  FRONTEND_URL: z.string().url().optional(),
  // Rate-limiting hardening (2026-04-15). Flags default to enabled;
  // flip to "false" in Railway to roll back a phase without redeploying.
  RATE_LIMIT_REDIS_ENABLED: z
    .string()
    .default("true")
    .transform((v) => v !== "false"),
  RATE_LIMIT_BYPASS_SECRET: z.string().optional(),
  EMAIL_QUOTA_ENABLED: z
    .string()
    .default("true")
    .transform((v) => v !== "false"),
  LLM_BUDGET_ENABLED: z
    .string()
    .default("true")
    .transform((v) => v !== "false"),
  LLM_TENANT_DAILY_TOKENS: z.coerce.number().int().positive().default(30_000),
  LLM_GLOBAL_DAILY_TOKENS: z.coerce.number().int().positive().default(80_000),
});

const WorkerSchema = SharedSchema.extend({
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_NOREPLY: z.string().default("Larry <noreply@larry-pm.com>"),
  RESEND_FROM_LARRY: z.string().default("Larry <larry@larry-pm.com>"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALENDAR_WEBHOOK_URL: z.string().url().optional(),
  JWT_ACCESS_SECRET: z.string().min(32).optional(),
  LLM_BUDGET_ENABLED: z
    .string()
    .default("true")
    .transform((v) => v !== "false"),
  LLM_TENANT_DAILY_TOKENS: z.coerce.number().int().positive().default(30_000),
  LLM_GLOBAL_DAILY_TOKENS: z.coerce.number().int().positive().default(80_000),
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
