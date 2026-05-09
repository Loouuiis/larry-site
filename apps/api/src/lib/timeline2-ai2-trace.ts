import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FastifyBaseLogger } from "fastify";
import type { Timeline2Ai2ErrorCategory } from "@larry/shared";

export const TIMELINE2_AI2_STREAM_ROUTE = "timeline2.ai2.chat.stream";
export const TIMELINE2_AI2_HEALTH_ROUTE = "timeline2.ai2.health";

export interface Ai2DebugTraceCollector {
  reqId: string;
  conversationId: string | null;
  projectId: string;
  route: string;
  createdAt: string;
  userMessage: string;
  answer?: string;
  provider: string | null;
  model: string | null;
  openaiBaseUrlSanitized: string | null;
  fullConversationHistory: Array<{ role: string; content: string }>;
  sseEvents: Record<string, unknown>[];
  plannerSteps: unknown[];
  toolCalls: Array<{ toolName: string; trace: string; phase: "start" | "done"; summary?: string }>;
  fallbackUsed: boolean;
  fallbackReason: string | null;
  stagedOperationsCount: number;
  branchId: string | null;
  errorCategory: Timeline2Ai2ErrorCategory | null;
  errorMessage: string | null;
  durationMs: number | null;
}

export function createAi2DebugTraceCollector(input: {
  reqId: string;
  projectId: string;
  userMessage: string;
  answer?: string;
  provider: string | null;
  model: string | null;
  openaiBaseUrlSanitized: string | null;
}): Ai2DebugTraceCollector {
  return {
    reqId: input.reqId,
    conversationId: null,
    projectId: input.projectId,
    route: TIMELINE2_AI2_STREAM_ROUTE,
    createdAt: new Date().toISOString(),
    userMessage: input.userMessage,
    answer: input.answer,
    provider: input.provider,
    model: input.model,
    openaiBaseUrlSanitized: input.openaiBaseUrlSanitized,
    fullConversationHistory: [],
    sseEvents: [],
    plannerSteps: [],
    toolCalls: [],
    fallbackUsed: false,
    fallbackReason: null,
    stagedOperationsCount: 0,
    branchId: null,
    errorCategory: null,
    errorMessage: null,
    durationMs: null,
  };
}

/**
 * AI 2 debug JSON traces under `.ai2-debug/` (see `writeAi2DebugTraceFile`).
 * - Explicit `TIMELINE2_AI2_DEBUG_TRACE=true|1|yes` → on; `false|0|no` → off.
 * - When unset: **on** for local/dev (not `production` or `test`), **off** in production and
 *   during Vitest (`NODE_ENV=test`) so suites do not flood disk.
 */
export function isAi2DebugTraceEnabled(): boolean {
  const raw = process.env.TIMELINE2_AI2_DEBUG_TRACE;
  if (raw !== undefined && raw !== "") {
    const v = raw.trim().toLowerCase();
    if (v === "0" || v === "false" || v === "no") return false;
    if (v === "1" || v === "true" || v === "yes") return true;
  }
  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv === "production" || nodeEnv === "test") return false;
  return true;
}

export async function writeAi2DebugTraceFile(
  trace: Ai2DebugTraceCollector,
  log: FastifyBaseLogger,
): Promise<void> {
  if (!isAi2DebugTraceEnabled()) return;
  const dir = path.resolve(process.cwd(), ".ai2-debug");
  const safeConv = (trace.conversationId ?? "no-conv").replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeReq = trace.reqId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const file = path.join(dir, `timeline2-ai2-${safeConv}-${safeReq}.json`);
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(file, `${JSON.stringify(trace, null, 2)}\n`, "utf8");
  } catch (err) {
    log.warn({ err, reqId: trace.reqId, msg: "ai2-debug-trace-write-failed", file }, "Failed to write AI 2 debug trace");
  }
}
