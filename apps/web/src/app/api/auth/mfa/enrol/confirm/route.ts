import { NextRequest, NextResponse } from "next/server";
import {
  createSessionToken,
  csrfCookieOptions,
  sessionCookieOptions,
} from "@/lib/auth";
import { getSession } from "@/lib/auth";

// Confirm enrolment with a live TOTP code.
// If the user arrived via an mfaEnrolmentToken (admin forced to enrol at
// login), the API also returns accessToken+refreshToken — we mint the
// full session cookie so the user lands directly in the app.
export async function POST(req: NextRequest) {
  const apiBaseUrl = process.env.LARRY_API_BASE_URL;
  if (!apiBaseUrl) {
    return NextResponse.json({ error: "Service is not configured." }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const session = await getSession();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const viaToken = Boolean(body?.mfaEnrolmentToken);
  if (session?.apiAccessToken) {
    headers.Authorization = `Bearer ${session.apiAccessToken}`;
  } else if (viaToken) {
    headers.Authorization = `Bearer ${body.mfaEnrolmentToken}`;
  } else {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  try {
    const apiResponse = await fetch(
      `${apiBaseUrl.replace(/\/+$/, "")}/v1/auth/mfa/enrol/confirm`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          code: body?.code,
          mfaEnrolmentToken: body?.mfaEnrolmentToken,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
      },
    );
    const data = (await apiResponse.json().catch(() => ({}))) as {
      scratchCodes?: string[];
      accessToken?: string;
      refreshToken?: string;
      user?: { id: string; email: string; tenantId: string; role: string };
      error?: string;
    };

    if (!apiResponse.ok) {
      return NextResponse.json(data, { status: apiResponse.status });
    }

    // If the API minted tokens (enrolment-token path), seal the session.
    if (viaToken && data.accessToken && data.user?.id) {
      const { token, csrfToken } = await createSessionToken({
        userId: data.user.id,
        email: data.user.email,
        tenantId: data.user.tenantId,
        role: data.user.role,
        apiAccessToken: data.accessToken,
        apiRefreshToken: data.refreshToken,
        authMode: "api",
      });
      const res = NextResponse.json({
        success: true,
        scratchCodes: data.scratchCodes ?? [],
        signedIn: true,
      });
      res.cookies.set(sessionCookieOptions(token));
      res.cookies.set(csrfCookieOptions(csrfToken));
      return res;
    }

    return NextResponse.json({
      success: true,
      scratchCodes: data.scratchCodes ?? [],
      signedIn: false,
    });
  } catch {
    return NextResponse.json({ error: "Service temporarily unavailable." }, { status: 502 });
  }
}
