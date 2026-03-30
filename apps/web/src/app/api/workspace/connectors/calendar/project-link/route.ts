import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

const ProjectLinkQuerySchema = z.object({
  calendarId: z.string().min(1).default("primary"),
});

const ProjectLinkBodySchema = z.object({
  calendarId: z.string().min(1).default("primary"),
  projectId: z.string().uuid().nullable().optional().default(null),
});

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parseResult = ProjectLinkQuerySchema.safeParse({
    calendarId: request.nextUrl.searchParams.get("calendarId") ?? undefined,
  });
  if (!parseResult.success) {
    return NextResponse.json({ error: "Invalid query params." }, { status: 400 });
  }

  const path = `/v1/connectors/google-calendar/project-link?calendarId=${encodeURIComponent(
    parseResult.data.calendarId
  )}`;
  const result = await proxyApiRequest(session, path, { method: "GET" });
  if (result.session) {
    await persistSession(result.session);
  }
  return NextResponse.json(result.body, { status: result.status });
}

export async function PUT(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parseResult = ProjectLinkBodySchema.safeParse(await request.json().catch(() => null));
  if (!parseResult.success) {
    return NextResponse.json({ error: "Invalid calendar project-link payload." }, { status: 400 });
  }

  const result = await proxyApiRequest(session, "/v1/connectors/google-calendar/project-link", {
    method: "PUT",
    body: JSON.stringify(parseResult.data),
  });
  if (result.session) {
    await persistSession(result.session);
  }

  return NextResponse.json(result.body, { status: result.status });
}

