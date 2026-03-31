import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

const GenerateDocumentSchema = z.object({
  projectId: z.string().uuid(),
  templateType: z.enum(["project_status", "task_export", "project_brief"]),
  format: z.enum(["docx", "xlsx", "pptx"]),
});

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: z.infer<typeof GenerateDocumentSchema>;
  try {
    payload = GenerateDocumentSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid generate payload." }, { status: 400 });
  }

  const result = await proxyApiRequest(session, "/v1/documents/generate", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (result.session) {
    await persistSession(result.session);
  }

  return NextResponse.json(result.body, { status: result.status });
}
