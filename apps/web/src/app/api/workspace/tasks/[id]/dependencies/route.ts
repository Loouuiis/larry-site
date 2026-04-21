import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

const AddDepSchema = z.object({
  dependsOnTaskId: z.string().uuid(),
  relation: z.string().min(1),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid task id" }, { status: 400 });
  }

  let body: z.infer<typeof AddDepSchema>;
  try {
    body = AddDepSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const result = await proxyApiRequest(session, `/v1/tasks/${id}/dependencies`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (result.session) await persistSession(result.session);
  return NextResponse.json(result.body, { status: result.status });
}
