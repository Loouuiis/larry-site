import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

const UpsertMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["owner", "editor", "viewer"]),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const result = await proxyApiRequest(
    session,
    `/v1/projects/${encodeURIComponent(id)}/members`,
    { method: "GET" }
  );

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

  let payload: z.infer<typeof UpsertMemberSchema>;
  try {
    payload = UpsertMemberSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid collaborator payload." }, { status: 400 });
  }

  const { id } = await context.params;
  const result = await proxyApiRequest(
    session,
    `/v1/projects/${encodeURIComponent(id)}/members`,
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

