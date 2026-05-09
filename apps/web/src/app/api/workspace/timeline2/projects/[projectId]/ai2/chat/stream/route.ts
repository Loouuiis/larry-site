import { randomUUID } from "crypto";
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
  const incomingReqId = request.headers.get("x-request-id")?.trim();
  const reqId = incomingReqId && incomingReqId.length > 0 ? incomingReqId : randomUUID();
  const proxyRoute = "timeline2.ai2.chat.stream";

  console.info(
    JSON.stringify({
      msg: "timeline2-ai2-proxy-start",
      reqId,
      route: proxyRoute,
      projectId,
    }),
  );

  let activeSession = session;

  if (isTokenExpiredOrExpiringSoon(activeSession.apiAccessToken!)) {
    const refreshed = await refreshApiSession(baseUrl, activeSession);
    if (refreshed) {
      activeSession = refreshed;
      await persistRefreshedSession(refreshed);
    }
  }

  const performRequest = (token: string) =>
    fetch(`${baseUrl}/v1/timeline2/projects/${encodeURIComponent(projectId)}/ai2/chat/stream`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Request-Id": reqId,
      },
      body,
      cache: "no-store",
    });

  let response: Response;
  try {
    response = await performRequest(activeSession.apiAccessToken!);
    if (response.status === 401) {
      const refreshed = await refreshApiSession(baseUrl, activeSession);
      if (refreshed?.apiAccessToken) {
        activeSession = refreshed;
        await persistRefreshedSession(refreshed);
        response = await performRequest(refreshed.apiAccessToken);
      }
    }
  } catch (err) {
    console.warn(
      JSON.stringify({
        msg: "timeline2-ai2-proxy-fetch-error",
        reqId,
        route: proxyRoute,
        projectId,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return NextResponse.json({ error: "Timeline 2 AI 2 request failed." }, { status: 502, headers: { "X-Request-Id": reqId } });
  }

  if (!response.ok || !response.body) {
    console.warn(
      JSON.stringify({
        msg: "timeline2-ai2-proxy-http-error",
        reqId,
        route: proxyRoute,
        projectId,
        status: response.status,
      }),
    );
    let payload: unknown = { error: "Timeline 2 AI 2 request failed." };
    try {
      payload = await response.json();
    } catch {
      // Keep generic payload.
    }
    if (response.status === 401) {
      await clearWebSessionCookies();
    }
    return NextResponse.json(payload, { status: response.status, headers: { "X-Request-Id": reqId } });
  }

  console.info(
    JSON.stringify({
      msg: "timeline2-ai2-proxy-stream-opened",
      reqId,
      route: proxyRoute,
      projectId,
      status: response.status,
    }),
  );

  return new Response(response.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "X-Request-Id": reqId,
    },
  });
}
