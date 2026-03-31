import { NextResponse } from "next/server";
import type { WorkspaceMeeting, WorkspaceProject } from "@/app/dashboard/types";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

type ListPayload<T> = { items?: T[] };

function extractItems<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (!value || typeof value !== "object" || !("items" in value)) return [];
  const maybe = (value as ListPayload<T>).items;
  return Array.isArray(maybe) ? maybe : [];
}

function extractError(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  if ("error" in value && typeof value.error === "string") return value.error;
  if ("message" in value && typeof value.message === "string") return value.message;
  return null;
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [meetingsResult, projectsResult] = await Promise.all([
    proxyApiRequest(session, "/v1/meetings?limit=50&projectStatus=active"),
    proxyApiRequest(session, "/v1/projects?status=active"),
  ]);

  const updatedSession = meetingsResult.session ?? projectsResult.session ?? session;
  if (updatedSession) {
    await persistSession(updatedSession);
  }

  if (meetingsResult.status >= 400) {
    return NextResponse.json(
      {
        projects: extractItems<WorkspaceProject>(projectsResult.body),
        meetings: [],
        error: extractError(meetingsResult.body) ?? "Failed to load meetings.",
      },
      { status: meetingsResult.status },
    );
  }

  return NextResponse.json({
    projects: extractItems<WorkspaceProject>(projectsResult.body),
    meetings: extractItems<WorkspaceMeeting>(meetingsResult.body),
    error: projectsResult.status >= 500 ? extractError(projectsResult.body) ?? "Failed to load projects." : undefined,
  });
}
