import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const apiBaseUrl = process.env.LARRY_API_BASE_URL;
    if (!apiBaseUrl) {
      return NextResponse.json(
        { error: "Service is not configured." },
        { status: 503 }
      );
    }

    let apiResponse: Response;
    try {
      apiResponse = await fetch(
        `${apiBaseUrl.replace(/\/+$/, "")}/v1/auth/confirm-email-change`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
    console.error("[confirm-email-change]", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
