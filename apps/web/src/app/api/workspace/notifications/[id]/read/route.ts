import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const result = await proxyApiRequest(session, `/v1/notifications/${id}/read`, { method: "POST" });
  if (result.session) {
    await persistSession(result.session);
  }

  return NextResponse.json(result.body ?? {}, { status: result.status >= 400 ? result.status : 200 });
}
