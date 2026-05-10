import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

async function proxyTimeline2(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { path } = await context.params;
  const suffix = path.map(encodeURIComponent).join("/");
  const search = request.nextUrl.search;
  const method = request.method.toUpperCase();
  const init: RequestInit = { method };

  if (method !== "GET" && method !== "HEAD") {
    const text = await request.text();
    if (text) init.body = text;
  }

  const result = await proxyApiRequest(
    session,
    `/v1/timeline2/${suffix}${search}`,
    init,
    { timeoutMs: 30_000 },
  );

  if (result.session) {
    await persistSession(result.session);
  }

  return NextResponse.json(result.body, { status: result.status });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyTimeline2(request, context);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyTimeline2(request, context);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyTimeline2(request, context);
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyTimeline2(request, context);
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyTimeline2(request, context);
}
