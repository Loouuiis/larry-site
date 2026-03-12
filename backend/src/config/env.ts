import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8080),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL: z.string().default("7d"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-5-mini"),
  AWS_REGION: z.string().default("eu-west-1"),
  SQS_EVENTS_QUEUE_URL: z.string().optional(),
  SQS_DLQ_URL: z.string().optional(),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  REQUIRE_TENANT_HEADER: z
    .string()
    .optional()
    .transform((value) => value === "true"),
});

export type AppEnv = z.infer<typeof EnvSchema>;

let cachedEnv: AppEnv | null = null;

export function getEnv(): AppEnv {
  if (cachedEnv) return cachedEnv;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
  }

  cachedEnv = parsed.data;
  return parsed.data;
}

export function resetEnvForTests(): void {
  cachedEnv = null;
}
