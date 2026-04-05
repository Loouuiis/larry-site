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
  const [healthResult, outcomesResult, breakdownResult, historyResult] = await Promise.all([
    proxyApiRequest(session, `/v1/projects/${id}/health`),
    proxyApiRequest(session, `/v1/projects/${id}/outcomes`),
    proxyApiRequest(session, `/v1/projects/${id}/task-breakdown`),
    proxyApiRequest(session, `/v1/projects/${id}/status-history?months=12`),
  ]);

  if (healthResult.session) {
    await persistSession(healthResult.session);
  }

  return NextResponse.json({
    health: healthResult.body,
    outcomes: outcomesResult.body,
    breakdown: breakdownResult.status < 400 ? breakdownResult.body : null,
    history: historyResult.status < 400 ? historyResult.body : null,
  });
}
