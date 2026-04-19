import { NextRequest, NextResponse } from "next/server";
import {
  DEVICE_COOKIE,
  createSessionToken,
  csrfCookieOptions,
  deviceCookieOptions,
  sessionCookieOptions,
} from "@/lib/auth";

// Second-step verify: exchange { mfaPendingToken, code } for a full session.
// The API returns access+refresh tokens the same shape as /login; we mint
// the session cookie exactly like the normal login proxy.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.mfaPendingToken || !body?.code) {
      return NextResponse.json({ error: "All fields are required." }, { status: 400 });
    }

    const apiBaseUrl = process.env.LARRY_API_BASE_URL;
    if (!apiBaseUrl) {
      return NextResponse.json({ error: "Service is not configured." }, { status: 503 });
    }

    const incomingDeviceId = req.cookies.get(DEVICE_COOKIE)?.value;
    const upstreamHeaders: Record<string, string> = { "Content-Type": "application/json" };
    if (incomingDeviceId) upstreamHeaders["X-Device-Id"] = incomingDeviceId;

    let apiResponse: Response;
    try {
      apiResponse = await fetch(`${apiBaseUrl.replace(/\/+$/, "")}/v1/auth/mfa/verify`, {
        method: "POST",
        headers: upstreamHeaders,
        body: JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
      });
    } catch {
      return NextResponse.json({ error: "Service temporarily unavailable." }, { status: 502 });
    }

    const payload = await apiResponse.json().catch(() => ({}));
    if (!apiResponse.ok) {
      return NextResponse.json(
        { error: (payload as { error?: string }).error ?? "Invalid code." },
        { status: apiResponse.status },
      );
    }

    const data = payload as {
      accessToken?: string;
      refreshToken?: string;
      deviceId?: string;
      user?: { id: string; email: string; tenantId: string; role: string; displayName?: string | null };
    };
    if (!data.accessToken || !data.user?.id) {
      return NextResponse.json({ error: "Invalid response from auth service." }, { status: 502 });
    }

    const { token, csrfToken } = await createSessionToken({
      userId: data.user.id,
      email: data.user.email,
      tenantId: data.user.tenantId,
      role: data.user.role,
      displayName: data.user.displayName ?? null,
      apiAccessToken: data.accessToken,
      apiRefreshToken: data.refreshToken,
      authMode: "api",
    });
    const res = NextResponse.json({ success: true });
    res.cookies.set(sessionCookieOptions(token));
    res.cookies.set(csrfCookieOptions(csrfToken));
    if (data.deviceId) {
      res.cookies.set(deviceCookieOptions(data.deviceId));
    }
    return res;
  } catch (err) {
    console.error("[mfa-verify]", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
