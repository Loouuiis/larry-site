import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

// Start enrolment. Caller is either:
//   (a) a logged-in user toggling MFA on proactively → session cookie drives
//       the upstream Authorization header.
//   (b) a user just sent here by the login page with an mfaEnrolmentToken
//       (admin in mfa-required tenant, not yet enrolled) → forward the
//       token as Authorization so the API treats it as a session.
export async function POST(req: NextRequest) {
  const apiBaseUrl = process.env.LARRY_API_BASE_URL;
  if (!apiBaseUrl) {
    return NextResponse.json({ error: "Service is not configured." }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const session = await getSession();

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (session?.apiAccessToken) {
    headers.Authorization = `Bearer ${session.apiAccessToken}`;
  } else if (body?.mfaEnrolmentToken) {
    headers.Authorization = `Bearer ${body.mfaEnrolmentToken}`;
  } else {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  try {
    const apiResponse = await fetch(`${apiBaseUrl.replace(/\/+$/, "")}/v1/auth/mfa/enrol`, {
      method: "POST",
      headers,
      body: JSON.stringify({ mfaEnrolmentToken: body?.mfaEnrolmentToken }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    const data = await apiResponse.json().catch(() => ({}));
    return NextResponse.json(data, { status: apiResponse.status });
  } catch {
    return NextResponse.json({ error: "Service temporarily unavailable." }, { status: 502 });
  }
}
