import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

const CreateTaskSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1).max(300),
  description: z.string().max(4000).optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  dueDate: z.string().date().optional(),
});

function shouldAutoAiTriage(): boolean {
  return process.env.LARRY_AUTO_AI_TRIAGE_ON_TASK_CREATE !== "false";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function buildTaskTriageTranscript(payload: z.infer<typeof CreateTaskSchema>): string {
  const due = payload.dueDate ? ` with due date ${payload.dueDate}` : "";
  return `Action: ${payload.title}${due}. Confirm owner, confirm deadline, and draft a follow-up update for leadership.`;
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: z.infer<typeof CreateTaskSchema>;
  try {
    payload = CreateTaskSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid task payload." }, { status: 400 });
  }

  const result = await proxyApiRequest(session, "/v1/tasks", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (result.session) {
    await persistSession(result.session);
  }

  if (result.status >= 400 || !shouldAutoAiTriage()) {
    return NextResponse.json(result.body, { status: result.status });
  }

  const createdTaskId = isRecord(result.body) && typeof result.body.id === "string" ? result.body.id : null;
  if (!createdTaskId) {
    return NextResponse.json(result.body, { status: result.status });
  }

  const activeSession = result.session ?? session;
  const triageResult = await proxyApiRequest(activeSession, "/v1/agent/runs", {
      method: "POST",
      body: JSON.stringify({
        source: "transcript",
        sourceRefId: `task:${createdTaskId}`,
        projectId: payload.projectId,
        trigger: "task_created_auto_triage",
        transcript: buildTaskTriageTranscript(payload),
      }),
    },
    { timeoutMs: 60_000 }
  );

  if (triageResult.session) {
    await persistSession(triageResult.session);
  }

  if (isRecord(result.body)) {
    return NextResponse.json(
      {
        ...result.body,
        aiTriage: {
          requested: true,
          success: triageResult.status < 400,
          status: triageResult.status,
          details: triageResult.body,
        },
      },
      { status: result.status }
    );
  }

  return NextResponse.json(result.body, { status: result.status });
}
