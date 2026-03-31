import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

function appendIfPresent(params: URLSearchParams, key: string, value: string | null) {
  if (value && value.trim().length > 0) {
    params.set(key, value);
  }
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = new URLSearchParams();
  appendIfPresent(params, "status", request.nextUrl.searchParams.get("status"));
  appendIfPresent(params, "source", request.nextUrl.searchParams.get("source"));
  appendIfPresent(params, "limit", request.nextUrl.searchParams.get("limit"));
  const query = params.toString();
  const path = query.length > 0
    ? `/v1/larry/runtime/canonical-events?${query}`
    : "/v1/larry/runtime/canonical-events";

  const result = await proxyApiRequest(session, path, { method: "GET" });
  if (result.session) {
    await persistSession(result.session);
  }

  return NextResponse.json(result.body, { status: result.status });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const result = await proxyApiRequest(
    session,
    "/v1/larry/runtime/canonical-events/retry-bulk",
    { method: "POST", body: JSON.stringify(body) }
  );

  if (result.session) {
    await persistSession(result.session);
  }

  return NextResponse.json(result.body, { status: result.status });
}
