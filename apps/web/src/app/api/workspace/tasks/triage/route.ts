import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

const TriageTaskSchema = z.object({
  taskId: z.string().uuid(),
  projectId: z.string().uuid(),
  title: z.string().min(1).max(300),
  dueDate: z.string().date().optional(),
});

function buildTaskTriageTranscript(input: z.infer<typeof TriageTaskSchema>): string {
  const due = input.dueDate ? ` with due date ${input.dueDate}` : "";
  return `Action: ${input.title}${due}. Confirm owner, confirm deadline, and draft a follow-up update for leadership.`;
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: z.infer<typeof TriageTaskSchema>;
  try {
    payload = TriageTaskSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid triage payload." }, { status: 400 });
  }

  const triageResult = await proxyApiRequest(
    session,
    "/v1/agent/runs",
    {
      method: "POST",
      body: JSON.stringify({
        source: "transcript",
        sourceRefId: `task:${payload.taskId}`,
        projectId: payload.projectId,
        trigger: "task_manual_triage",
        transcript: buildTaskTriageTranscript(payload),
      }),
    },
    { timeoutMs: 60_000 }
  );

  if (triageResult.session) {
    await persistSession(triageResult.session);
  }

  return NextResponse.json(triageResult.body, { status: triageResult.status });
}
