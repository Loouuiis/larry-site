import { NextResponse } from "next/server";

const API_BASE = process.env.LARRY_API_BASE_URL ?? "http://localhost:8080";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  try {
    const upstream = await fetch(
      `${API_BASE}/v1/orgs/invite-links/by-token/${encodeURIComponent(token)}`,
      { method: "GET", cache: "no-store" },
    );
    const body = await upstream.json().catch(() => ({}));
    return NextResponse.json(body, { status: upstream.status });
  } catch {
    return NextResponse.json({ error: "upstream_unreachable" }, { status: 502 });
  }
}
