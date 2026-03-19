import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

const MeetingTranscriptSchema = z.object({
  transcript: z.string().min(20).max(30_000),
  projectId: z.string().uuid().optional(),
  trigger: z.string().default("meeting_transcript_upload"),
});

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: z.infer<typeof MeetingTranscriptSchema>;
  try {
    payload = MeetingTranscriptSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid transcript payload." }, { status: 400 });
  }

  const result = await proxyApiRequest(
    session,
    "/v1/agent/runs",
    {
      method: "POST",
      body: JSON.stringify({
        source: "transcript",
        projectId: payload.projectId,
        transcript: payload.transcript,
        trigger: payload.trigger,
      }),
    },
    { timeoutMs: 60_000 }
  );

  if (result.session) {
    await persistSession(result.session);
  }

  return NextResponse.json(result.body, { status: result.status });
}

