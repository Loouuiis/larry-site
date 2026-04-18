import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.LARRY_API_BASE_URL ?? "http://localhost:8080";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const body = await request.text();
  try {
    const upstream = await fetch(
      `${API_BASE}/v1/orgs/invitations/${encodeURIComponent(token)}/accept`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body || "{}",
      },
    );
    const responseBody = await upstream.json().catch(() => ({}));
    return NextResponse.json(responseBody, { status: upstream.status });
  } catch {
    return NextResponse.json({ error: "upstream_unreachable" }, { status: 502 });
  }
}
