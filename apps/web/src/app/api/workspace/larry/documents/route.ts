import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const params = new URLSearchParams();

  const projectId = searchParams.get("projectId");
  if (projectId) params.set("projectId", projectId);

  const docType = searchParams.get("docType");
  if (docType) params.set("docType", docType);

  const limit = searchParams.get("limit");
  if (limit) params.set("limit", limit);

  const qs = params.toString();
  const path = qs ? `/v1/larry/documents?${qs}` : "/v1/larry/documents";

  const result = await proxyApiRequest(session, path, { method: "GET" });
  if (result.session) {
    await persistSession(result.session);
  }

  return NextResponse.json(result.body, { status: result.status });
}
