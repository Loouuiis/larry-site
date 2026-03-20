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
  const result = await proxyApiRequest(session, `/v1/tasks/${id}/comments`);
  if (result.session) {
    await persistSession(result.session);
  }

  const items = Array.isArray((result.body as { items?: unknown })?.items)
    ? (result.body as { items: unknown[] }).items
    : [];

  return NextResponse.json({ comments: items });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const result = await proxyApiRequest(session, `/v1/tasks/${id}/comments`, {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (result.session) {
    await persistSession(result.session);
  }

  return NextResponse.json(result.body ?? {}, { status: result.status >= 400 ? result.status : 201 });
}
