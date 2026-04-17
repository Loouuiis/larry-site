import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const [taskResult, commentsResult] = await Promise.all([
    proxyApiRequest(session, `/v1/tasks/${id}`),
    proxyApiRequest(session, `/v1/tasks/${id}/comments`),
  ]);

  if (taskResult.session) {
    await persistSession(taskResult.session);
  }

  if (taskResult.status >= 400) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  return NextResponse.json({
    task: taskResult.body,
    comments: Array.isArray((commentsResult.body as { items?: unknown })?.items)
      ? (commentsResult.body as { items: unknown[] }).items
      : [],
  });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const result = await proxyApiRequest(session, `/v1/tasks/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

  if (result.session) {
    await persistSession(result.session);
  }

  return NextResponse.json(result.body ?? {}, { status: result.status >= 400 ? result.status : 200 });
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const result = await proxyApiRequest(session, `/v1/tasks/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });

  if (result.session) await persistSession(result.session);
  return new NextResponse(null, { status: result.status });
}
