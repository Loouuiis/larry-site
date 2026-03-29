import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projectId = request.nextUrl.searchParams.get("projectId");
  const path = projectId
    ? `/v1/larry/conversations?projectId=${encodeURIComponent(projectId)}`
    : "/v1/larry/conversations";

  const result = await proxyApiRequest(session, path, { method: "GET" });
  if (result.session) await persistSession(result.session);
  return NextResponse.json(result.body, { status: result.status });
}

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json(
    {
      error:
        "Legacy workspace conversation creation has been retired. Use /api/workspace/larry/chat for canonical chat persistence.",
    },
    { status: 410 }
  );
}
