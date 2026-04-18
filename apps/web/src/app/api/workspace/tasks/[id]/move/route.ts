import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

// v4 Slice 4 — forwards task-DnD commit requests to the Fastify
// /v1/tasks/:id/move endpoint. Accepts { projectId?, parentTaskId? }; empty
// body is a no-op on the server (returns current row).
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const body = await request.json();
  const result = await proxyApiRequest(session, `/v1/tasks/${encodeURIComponent(id)}/move`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (result.session) await persistSession(result.session);
  return NextResponse.json(result.body, { status: result.status });
}
