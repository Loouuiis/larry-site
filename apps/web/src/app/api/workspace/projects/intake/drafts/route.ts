import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

const UpsertDraftSchema = z.object({
  draftId: z.string().uuid().optional(),
  mode: z.enum(["manual", "chat", "meeting"]),
  project: z
    .object({
      name: z.string().min(1).max(200).optional().nullable(),
      description: z.string().max(4000).optional().nullable(),
      startDate: z.string().date().optional().nullable(),
      targetDate: z.string().date().optional().nullable(),
      attachToProjectId: z.string().uuid().optional().nullable(),
    })
    .optional(),
  chat: z
    .object({
      answers: z.array(z.string().max(1000)).max(20).optional(),
    })
    .optional(),
  meeting: z
    .object({
      meetingTitle: z.string().max(300).optional().nullable(),
      transcript: z.string().max(500_000).optional().nullable(),
    })
    .optional(),
});

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: z.infer<typeof UpsertDraftSchema>;
  try {
    const body = await request.json();
    payload = UpsertDraftSchema.parse(body);
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
        : "Could not parse request body.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const result = await proxyApiRequest(
    session,
    "/v1/projects/intake/drafts",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    { timeoutMs: 60_000 }
  );

  if (result.session) {
    await persistSession(result.session);
  }

  return NextResponse.json(result.body, { status: result.status });
}
