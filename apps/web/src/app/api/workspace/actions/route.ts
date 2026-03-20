import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const state = request.nextUrl.searchParams.get("state") ?? "pending";
  const result = await proxyApiRequest(session, `/v1/agent/actions?state=${state}`);
  if (result.session) {
    await persistSession(result.session);
  }

  const items = Array.isArray((result.body as { items?: unknown })?.items)
    ? (result.body as { items: unknown[] }).items
    : [];

  return NextResponse.json({ actions: items }, { status: result.status >= 400 ? result.status : 200 });
}
