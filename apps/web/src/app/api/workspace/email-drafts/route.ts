import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projectId = request.nextUrl.searchParams.get("projectId");
  const state = request.nextUrl.searchParams.get("state");
  const limit = request.nextUrl.searchParams.get("limit");
  const params = new URLSearchParams();

  if (projectId?.trim()) params.set("projectId", projectId.trim());
  if (state?.trim()) params.set("state", state.trim());
  if (limit?.trim()) params.set("limit", limit.trim());

  const query = params.toString();
  const result = await proxyApiRequest(
    session,
    `/v1/email-drafts${query ? `?${query}` : ""}`
  );

  if (result.session) {
    await persistSession(result.session);
  }

  return NextResponse.json(result.body, { status: result.status });
}
