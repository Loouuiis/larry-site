import { NextResponse } from "next/server";
import type { WorkspaceProject, WorkspaceTask } from "@/app/dashboard/types";
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

  const [projectsResult, tasksResult] = await Promise.all([
    proxyApiRequest(session, "/v1/projects?status=active"),
    proxyApiRequest(session, "/v1/tasks?projectStatus=active"),
  ]);

  const updatedSession = projectsResult.session ?? tasksResult.session ?? session;
  if (updatedSession) {
    await persistSession(updatedSession);
  }

  if (projectsResult.status >= 400) {
    return NextResponse.json(
      {
        viewerUserId: session.userId ?? null,
        projects: [],
        tasks: [],
        error: extractError(projectsResult.body) ?? "Failed to load workspace projects.",
      },
      { status: projectsResult.status },
    );
  }

  return NextResponse.json({
    viewerUserId: session.userId ?? null,
    projects: extractItems<WorkspaceProject>(projectsResult.body),
    tasks: extractItems<WorkspaceTask>(tasksResult.body),
    error: tasksResult.status >= 500 ? extractError(tasksResult.body) ?? "Failed to load workspace tasks." : undefined,
  });
}
