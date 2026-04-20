import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const since = request.nextUrl.searchParams.get("since");
  const limit = request.nextUrl.searchParams.get("limit") ?? "50";
  const qs = since
    ? `since=${encodeURIComponent(since)}&limit=${limit}`
    : `limit=${limit}`;

  const result = await proxyApiRequest(session, `/v1/notifications/feed?${qs}`);
  if (result.session) {
    await persistSession(result.session);
  }

  if (result.status >= 400) {
    return NextResponse.json(
      { items: [], unreadCount: 0, serverTime: new Date().toISOString() },
      { status: result.status }
    );
  }

  return NextResponse.json(result.body ?? { items: [], unreadCount: 0, serverTime: new Date().toISOString() });
}
