import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const sourceKind = request.nextUrl.searchParams.get("sourceKind");
  const limit = request.nextUrl.searchParams.get("limit");

  const query = new URLSearchParams({ projectId: id });
  if (sourceKind?.trim()) query.set("sourceKind", sourceKind.trim());
  if (limit?.trim()) query.set("limit", limit.trim());

  const result = await proxyApiRequest(
    session,
    `/v1/larry/memory?${query.toString()}`,
    { method: "GET" }
  );

  if (result.session) {
    await persistSession(result.session);
  }

  return NextResponse.json(result.body, { status: result.status });
}
