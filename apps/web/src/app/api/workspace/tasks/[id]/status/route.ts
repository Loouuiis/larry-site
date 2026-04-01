import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

const TaskStatusSchema = z.object({
  status: z.enum(["not_started", "on_track", "at_risk", "overdue", "completed"]),
  progressPercent: z.number().int().min(0).max(100).optional(),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Task id is required." }, { status: 400 });
  }

  let payload: z.infer<typeof TaskStatusSchema>;
  try {
    payload = TaskStatusSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid task status payload." }, { status: 400 });
  }

  const result = await proxyApiRequest(session, `/v1/tasks/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

  if (result.session) {
    await persistSession(result.session);
  }

  return NextResponse.json(result.body, { status: result.status });
}

