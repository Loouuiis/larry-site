import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const unread = request.nextUrl.searchParams.get("unread") ?? "true";
  const limit = request.nextUrl.searchParams.get("limit") ?? "20";

  const result = await proxyApiRequest(session, `/v1/notifications?unread=${unread}&limit=${limit}`);
  if (result.session) {
    await persistSession(result.session);
  }

  if (result.status >= 400) {
    return NextResponse.json({ notifications: [], unreadCount: 0 });
  }

  return NextResponse.json(result.body ?? { notifications: [], unreadCount: 0 });
}
