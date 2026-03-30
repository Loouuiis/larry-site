import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

const CreateDocumentSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().trim().min(1).max(300),
  content: z.string().trim().min(1).max(50_000),
  docType: z.string().trim().min(1).max(80),
  sourceKind: z.string().trim().min(1).max(64).optional(),
  sourceRecordId: z.string().trim().min(1).max(200).optional(),
  version: z.number().int().min(1).max(10_000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  attachTaskId: z.string().uuid().optional(),
});

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projectId = request.nextUrl.searchParams.get("projectId");
  const docType = request.nextUrl.searchParams.get("docType");
  const limit = request.nextUrl.searchParams.get("limit");
  const params = new URLSearchParams();

  if (projectId?.trim()) params.set("projectId", projectId.trim());
  if (docType?.trim()) params.set("docType", docType.trim());
  if (limit?.trim()) params.set("limit", limit.trim());

  const query = params.toString();
  const result = await proxyApiRequest(
    session,
    `/v1/documents${query ? `?${query}` : ""}`
  );

  if (result.session) {
    await persistSession(result.session);
  }

  return NextResponse.json(result.body, { status: result.status });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: z.infer<typeof CreateDocumentSchema>;
  try {
    payload = CreateDocumentSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid document payload." }, { status: 400 });
  }

  const result = await proxyApiRequest(session, "/v1/documents", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (result.session) {
    await persistSession(result.session);
  }

  return NextResponse.json(result.body, { status: result.status });
}
