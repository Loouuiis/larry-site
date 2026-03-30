import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

const AttachDocumentSchema = z.object({
  documentId: z.string().uuid(),
});

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const result = await proxyApiRequest(
    session,
    `/v1/tasks/${encodeURIComponent(id)}/attachments`
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

  let payload: z.infer<typeof AttachDocumentSchema>;
  try {
    payload = AttachDocumentSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid attachment payload." }, { status: 400 });
  }

  const { id } = await context.params;
  const result = await proxyApiRequest(
    session,
    `/v1/tasks/${encodeURIComponent(id)}/attachments`,
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
