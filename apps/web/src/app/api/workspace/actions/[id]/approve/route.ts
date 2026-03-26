import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

const NoteSchema = z.object({
  note: z.string().max(1000).optional(),
  overridePayload: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  let payload: z.infer<typeof NoteSchema>;
  try {
    payload = NoteSchema.parse(await request.json().catch(() => ({})));
  } catch {
    return NextResponse.json({ error: "Invalid approve payload." }, { status: 400 });
  }

  const result = await proxyApiRequest(session, `/v1/actions/${id}/approve`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (result.session) {
    await persistSession(result.session);
  }

  return NextResponse.json(result.body, { status: result.status });
}
