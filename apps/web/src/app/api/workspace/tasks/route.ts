import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projectId = request.nextUrl.searchParams.get("projectId");
  const url = projectId ? `/v1/tasks?projectId=${encodeURIComponent(projectId)}` : "/v1/tasks";

  const result = await proxyApiRequest(session, url);
  if (result.session) {
    await persistSession(result.session);
  }
  return NextResponse.json(result.body, { status: result.status });
}

const CreateTaskSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1).max(300),
  description: z.string().max(4000).optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  dueDate: z.string().date().optional(),
  assigneeUserId: z.string().uuid().optional(),
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

  // Return task creation result immediately — do not block on triage
  const activeSession = result.session ?? session;
  const createdTaskId = isRecord(result.body) && typeof result.body.id === "string" ? result.body.id : null;

  if (createdTaskId && shouldAutoAiTriage()) {
    // Fire-and-forget: kick off triage without blocking the response
    void proxyApiRequest(
      activeSession,
      "/v1/agent/runs",
      {
        method: "POST",
        body: JSON.stringify({
          source: "transcript",
          sourceRefId: `task:${createdTaskId}`,
          projectId: payload.projectId,
          trigger: "task_created_auto_triage",
          transcript: buildTaskTriageTranscript(payload),
        }),
      },
      { timeoutMs: 30_000 }
    ).catch(() => { /* triage failure is non-fatal */ });
  }

  return NextResponse.json(result.body, { status: result.status });
}
