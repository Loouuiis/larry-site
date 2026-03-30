import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projectId = request.nextUrl.searchParams.get("projectId");
  const limit = request.nextUrl.searchParams.get("limit") ?? "50";
  const query = projectId ? `?projectId=${projectId}&limit=${limit}` : `?limit=${limit}`;

  const result = await proxyApiRequest(session, `/v1/documents${query}`);
  if (result.session) {
    await persistSession(result.session);
  }

  if (result.status >= 400) {
    return NextResponse.json({ documents: [] });
  }

  const items = Array.isArray((result.body as { items?: unknown })?.items)
    ? (result.body as { items: unknown[] }).items
    : Array.isArray(result.body) ? result.body : [];

  return NextResponse.json({ documents: items });
}
