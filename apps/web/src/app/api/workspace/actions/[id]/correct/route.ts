import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

const CorrectBodySchema = z.object({
  correctionType: z.enum([
    "false_positive",
    "false_negative",
    "bad_reasoning",
    "payload_edit",
    "manual_override",
  ]),
  note: z.string().max(1000).optional(),
  correctionPayload: z.record(z.string(), z.unknown()).default({}),
  tunePolicy: z.boolean().default(true),
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
  let payload: z.infer<typeof CorrectBodySchema>;
  try {
    payload = CorrectBodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid correction payload." }, { status: 400 });
  }

  const result = await proxyApiRequest(session, `/v1/agent/actions/${id}/correct`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (result.session) {
    await persistSession(result.session);
  }

  return NextResponse.json(result.body, { status: result.status });
}
