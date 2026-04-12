import { NextRequest } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import {
  getApiBaseUrl,
  isTokenExpiredOrExpiringSoon,
  refreshApiSession,
  persistRefreshedSession,
} from "@/lib/api-session";

const ChatStreamSchema = z.object({
  projectId: z.string().uuid().optional(),
  message: z.string().min(1).max(8000),
  conversationId: z.string().uuid().optional(),
});

function sseError(message: string, status = 200): Response {
  return new Response(
    `data: ${JSON.stringify({ type: "error", message })}\n\n`,
    {
      status,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
    }
  );
}

export async function POST(request: NextRequest): Promise<Response> {
  const session = await getSession();
  if (!session?.apiAccessToken || !session.tenantId) {
    return sseError("Unauthorized. Please log in again.", 401);
  }

  let payload: z.infer<typeof ChatStreamSchema>;
  try {
    payload = ChatStreamSchema.parse(await request.json());
  } catch {
    return sseError("Invalid request body.", 400);
  }

  const baseUrl = getApiBaseUrl();
  let activeSession = session;

  // Proactive token refresh
  if (isTokenExpiredOrExpiringSoon(activeSession.apiAccessToken!)) {
    const refreshed = await refreshApiSession(baseUrl, activeSession);
    if (refreshed) {
      activeSession = refreshed;
      await persistRefreshedSession(refreshed);
    }
  }

  const performRequest = (token: string) =>
    fetch(`${baseUrl}/v1/larry/chat/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      // No timeout — SSE streams until Fastify closes the connection
    });

  let upstream = await performRequest(activeSession.apiAccessToken!);

  // Reactive refresh on 401
  if (upstream.status === 401) {
    const refreshed = await refreshApiSession(baseUrl, activeSession);
    if (refreshed?.apiAccessToken) {
      activeSession = refreshed;
      await persistRefreshedSession(refreshed);
      upstream = await performRequest(refreshed.apiAccessToken);
    }
    if (upstream.status === 401) {
      return sseError("Your session has expired. Please log in again.", 401);
    }
  }

  // Non-streaming error from Fastify (4xx/5xx before the stream starts)
  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    let message = "Request failed.";
    try {
      message = (JSON.parse(text) as { message?: string }).message ?? message;
    } catch { /* ignore */ }
    return sseError(message, upstream.status);
  }

  // Pass the SSE stream body directly to the browser
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
