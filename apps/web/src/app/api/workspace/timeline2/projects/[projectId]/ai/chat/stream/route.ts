import { NextRequest, NextResponse } from "next/server";
import { clearWebSessionCookies, getSession } from "@/lib/auth";
import {
  getApiBaseUrl,
  isTokenExpiredOrExpiringSoon,
  persistRefreshedSession,
  refreshApiSession,
} from "@/lib/api-session";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  const session = await getSession();
  if (!session?.apiAccessToken || !session.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = await context.params;
  const body = await request.text();
  const baseUrl = getApiBaseUrl();
  let activeSession = session;

  if (isTokenExpiredOrExpiringSoon(activeSession.apiAccessToken!)) {
    const refreshed = await refreshApiSession(baseUrl, activeSession);
    if (refreshed) {
      activeSession = refreshed;
      await persistRefreshedSession(refreshed);
    }
  }

  const performRequest = (token: string) =>
    fetch(`${baseUrl}/v1/timeline2/projects/${encodeURIComponent(projectId)}/ai/chat/stream`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body,
      cache: "no-store",
    });

  let response = await performRequest(activeSession.apiAccessToken!);
  if (response.status === 401) {
    const refreshed = await refreshApiSession(baseUrl, activeSession);
    if (refreshed?.apiAccessToken) {
      activeSession = refreshed;
      await persistRefreshedSession(refreshed);
      response = await performRequest(refreshed.apiAccessToken);
    }
  }

  if (!response.ok || !response.body) {
    let payload: unknown = { error: "Timeline 2 AI request failed." };
    try {
      payload = await response.json();
    } catch {
      // Keep generic payload.
    }
    if (response.status === 401) {
      await clearWebSessionCookies();
    }
    return NextResponse.json(payload, { status: response.status });
  }

  return new Response(response.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
