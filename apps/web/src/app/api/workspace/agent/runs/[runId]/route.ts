import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ runId: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { runId } = await context.params;
  const result = await proxyApiRequest(session, `/v1/agent/runs/${runId}`);
  if (result.session) {
    await persistSession(result.session);
  }

  return NextResponse.json(result.body ?? {}, { status: result.status >= 400 ? result.status : 200 });
}
