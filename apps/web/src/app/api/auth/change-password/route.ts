import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.apiAccessToken) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const body = await req.json();

    const apiBaseUrl = process.env.LARRY_API_BASE_URL;
    if (!apiBaseUrl) {
      return NextResponse.json(
        { error: "Service is not configured." },
        { status: 503 }
      );
    }

    // Hash the refresh token from the session to pass as x-current-token-hash
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.apiAccessToken}`,
    };

    if (session.apiRefreshToken) {
      headers["x-current-token-hash"] = createHash("sha256")
        .update(session.apiRefreshToken)
        .digest("hex");
    }

    let apiResponse: Response;
    try {
      apiResponse = await fetch(
        `${apiBaseUrl.replace(/\/+$/, "")}/v1/auth/change-password`,
        {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          cache: "no-store",
          signal: AbortSignal.timeout(12_000),
        }
      );
    } catch {
      return NextResponse.json(
        { error: "Service is temporarily unavailable. Please try again." },
        { status: 502 }
      );
    }

    const data = await apiResponse.json();
    return NextResponse.json(data, { status: apiResponse.status });
  } catch (err) {
    console.error("[change-password]", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
