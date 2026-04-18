import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

// PATCH /api/workspace/projects/:id — forwards to Fastify for project edits
// (used by the Gantt v3 right-click "Move project to category…" action).
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const result = await proxyApiRequest(
    session,
    `/v1/projects/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify(body) },
  );

  if (result.session) await persistSession(result.session);
  return NextResponse.json(result.body ?? {}, { status: result.status });
}
