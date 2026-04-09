import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.apiAccessToken) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const body = await req.json();

    const apiBaseUrl = process.env.LARRY_API_BASE_URL;
    if (!apiBaseUrl) {
      return NextResponse.json({ error: "Service is not configured." }, { status: 503 });
    }

    let apiResponse: Response;
    try {
      apiResponse = await fetch(
        `${apiBaseUrl.replace(/\/+$/, "")}/v1/auth/update-profile`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.apiAccessToken}`,
          },
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
    console.error("[update-profile]", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
