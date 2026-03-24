import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await proxyApiRequest(session, "/v1/larry/conversations");
  if (result.session) await persistSession(result.session);
  return NextResponse.json(result.body ?? {}, { status: result.status >= 400 ? result.status : 200 });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const result = await proxyApiRequest(session, "/v1/larry/conversations", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (result.session) await persistSession(result.session);
  return NextResponse.json(result.body ?? {}, { status: result.status >= 400 ? result.status : 201 });
}
