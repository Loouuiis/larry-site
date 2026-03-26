import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLlmProvider } from "@larry/ai";
import { getWorkerEnv } from "@larry/config";
import { Db } from "@larry/db";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);

// Cascading .env loader: tries apps/worker/.env first, falls back to apps/api/.env.
// Both must point to the same DATABASE_URL. If they differ, the worker and API
// write to different databases and extracted actions will not appear in the UI.
const envCandidates = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../api/.env"),
  path.resolve(process.cwd(), "../../apps/api/.env"),
  path.resolve(process.cwd(), "apps/worker/.env"),
  path.resolve(process.cwd(), "apps/api/.env"),
  path.resolve(currentDir, "../.env"),
  path.resolve(currentDir, "../../api/.env"),
  path.resolve(currentDir, "../../../apps/api/.env"),
];

for (const candidate of envCandidates) {
  if (existsSync(candidate)) {
    loadEnv({ path: candidate, override: false });
    if (process.env.DATABASE_URL && process.env.REDIS_URL) {
      break;
    }
  }
}

export const env = getWorkerEnv();

const providerKeyMap: Record<string, string | undefined> = {
  openai: env.OPENAI_API_KEY,
  anthropic: env.ANTHROPIC_API_KEY,
  gemini: env.GEMINI_API_KEY,
};

if (!providerKeyMap[env.MODEL_PROVIDER]) {
  console.error(`[worker] FATAL: No API key set for MODEL_PROVIDER="${env.MODEL_PROVIDER}". Set the corresponding key or change MODEL_PROVIDER.`);
  process.exit(1);
}

export const db = new Db(env.DATABASE_URL);
export const llmProvider = createLlmProvider({
  provider: env.MODEL_PROVIDER,
  openAiApiKey: env.OPENAI_API_KEY,
  openAiModel: env.OPENAI_MODEL,
  anthropicApiKey: env.ANTHROPIC_API_KEY,
  anthropicModel: env.ANTHROPIC_MODEL,
  geminiApiKey: env.GEMINI_API_KEY,
  geminiModel: env.GEMINI_MODEL,
});

console.log(`[worker] Database: ${new URL(env.DATABASE_URL).host}`);
