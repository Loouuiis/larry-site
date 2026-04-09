import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.apiAccessToken) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const apiBaseUrl = process.env.LARRY_API_BASE_URL;
    if (!apiBaseUrl) {
      return NextResponse.json({ error: "Service is not configured." }, { status: 503 });
    }

    let apiResponse: Response;
    try {
      apiResponse = await fetch(
        `${apiBaseUrl.replace(/\/+$/, "")}/v1/auth/me`,
        {
          headers: { Authorization: `Bearer ${session.apiAccessToken}` },
          cache: "no-store",
          signal: AbortSignal.timeout(8_000),
        }
      );
    } catch {
      return NextResponse.json(
        { error: "Service is temporarily unavailable." },
        { status: 502 }
      );
    }

    const data = await apiResponse.json();
    return NextResponse.json(data, { status: apiResponse.status });
  } catch (err) {
    console.error("[auth/profile]", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
