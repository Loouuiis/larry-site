import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createSessionToken,
  csrfCookieOptions,
  getSession,
  sessionCookieOptions,
} from "@/lib/auth";
import { proxyApiRequest } from "@/lib/workspace-proxy";

const BodySchema = z.object({ tenantId: z.string().uuid() });

interface ApiSwitchResponse {
  accessToken: string;
  refreshToken?: string;
  user: {
    id: string;
    email: string;
    role: string;
    tenantId: string;
    displayName?: string | null;
  };
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let payload: z.infer<typeof BodySchema>;
  try {
    payload = BodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const result = await proxyApiRequest(session, "/v1/auth/switch-tenant", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!(result.status >= 200 && result.status < 300)) {
    return NextResponse.json(result.body, { status: result.status });
  }

  const data = result.body as ApiSwitchResponse | null;
  if (!data?.accessToken || !data.user) {
    return NextResponse.json(
      { error: "Invalid response from switch-tenant." },
      { status: 502 },
    );
  }

  // Re-mint the iron-session cookie so the next request proxies against the
  // new tenant. Mirrors /api/auth/login.
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
  const res = NextResponse.json({
    ok: true,
    tenantId: data.user.tenantId,
    role: data.user.role,
  });
  res.cookies.set(sessionCookieOptions(token));
  res.cookies.set(csrfCookieOptions(csrfToken));
  return res;
}
