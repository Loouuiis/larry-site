import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

const CreateProjectNoteSchema = z.object({
  visibility: z.enum(["shared", "personal"]),
  content: z.string().trim().min(1).max(4_000),
  recipientUserId: z.string().uuid().optional(),
});

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const visibility = request.nextUrl.searchParams.get("visibility");
  const limit = request.nextUrl.searchParams.get("limit");
  const query = new URLSearchParams();

  if (visibility?.trim()) query.set("visibility", visibility.trim());
  if (limit?.trim()) query.set("limit", limit.trim());

  const path = `/v1/projects/${encodeURIComponent(id)}/notes${query.toString() ? `?${query.toString()}` : ""}`;
  const result = await proxyApiRequest(session, path, { method: "GET" });

  if (result.session) {
    await persistSession(result.session);
  }

  return NextResponse.json(result.body, { status: result.status });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: z.infer<typeof CreateProjectNoteSchema>;
  try {
    payload = CreateProjectNoteSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid note payload." }, { status: 400 });
  }

  const { id } = await context.params;
  const result = await proxyApiRequest(
    session,
    `/v1/projects/${encodeURIComponent(id)}/notes`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );

  if (result.session) {
    await persistSession(result.session);
  }

  return NextResponse.json(result.body, { status: result.status });
}
