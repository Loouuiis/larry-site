import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const state = request.nextUrl.searchParams.get("state");
  const limit = request.nextUrl.searchParams.get("limit");
  const params = new URLSearchParams();
  if (state) params.set("state", state);
  if (limit) params.set("limit", limit);
  const query = params.toString();

  const result = await proxyApiRequest(
    session,
    `/v1/connectors/email/drafts${query ? `?${query}` : ""}`
  );

  if (result.session) {
    await persistSession(result.session);
  }

  return NextResponse.json(result.body, { status: result.status });
}

