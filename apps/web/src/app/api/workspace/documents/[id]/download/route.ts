import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { ensureApiSession, persistSession } from "@/lib/workspace-proxy";

const ParamsSchema = z.object({
  id: z.string().uuid(),
});

function getApiBaseUrl(): string {
  return (process.env.LARRY_API_BASE_URL ?? "http://localhost:8080").replace(/\/+$/, "");
}

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsedParams = ParamsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid document id." }, { status: 400 });
  }

  const apiSession = await ensureApiSession(session);
  if (!apiSession?.apiAccessToken) {
    return NextResponse.json({ error: "Unable to establish API session." }, { status: 401 });
  }
  await persistSession(apiSession);

  let upstream: Response;
  try {
    upstream = await fetch(`${getApiBaseUrl()}/v1/documents/${parsedParams.data.id}/download`, {
      method: "GET",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${apiSession.apiAccessToken}`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upstream request failed." },
      { status: 504 }
    );
  }

  if (!upstream.ok) {
    const text = await upstream.text();
    try {
      return NextResponse.json(JSON.parse(text), { status: upstream.status });
    } catch {
      return NextResponse.json({ error: text || "Download failed." }, { status: upstream.status });
    }
  }

  const bytes = await upstream.arrayBuffer();
  const headers = new Headers();
  const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
  const disposition = upstream.headers.get("content-disposition");

  headers.set("Content-Type", contentType);
  if (disposition) {
    headers.set("Content-Disposition", disposition);
  }

  return new NextResponse(bytes, {
    status: 200,
    headers,
  });
}
