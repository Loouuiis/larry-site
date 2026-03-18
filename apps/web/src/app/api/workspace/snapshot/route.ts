import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

type ListPayload<T> = { items: T[] };

function extractItems<T>(value: unknown): T[] {
  if (!value || typeof value !== "object" || !("items" in value)) return [];
  const maybe = (value as ListPayload<T>).items;
  return Array.isArray(maybe) ? maybe : [];
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ connected: false, error: "Unauthorized" }, { status: 401 });
  }

  const projectsResult = await proxyApiRequest(session, "/v1/projects");
  if (projectsResult.session) {
    await persistSession(projectsResult.session);
  }
  if (projectsResult.status >= 400) {
    return NextResponse.json(
      {
        connected: false,
        projects: [],
        tasks: [],
        pendingActions: [],
        error: "Failed to load workspace projects.",
        details: projectsResult.body,
      },
      { status: projectsResult.status }
    );
  }

  const activeSession = projectsResult.session ?? session;
  const [tasksResult, actionsResult] = await Promise.all([
    proxyApiRequest(activeSession, "/v1/tasks"),
    proxyApiRequest(activeSession, "/v1/agent/actions?state=pending"),
  ]);

  const updatedSession = tasksResult.session ?? actionsResult.session ?? activeSession;
  if (updatedSession) {
    await persistSession(updatedSession);
  }

  return NextResponse.json({
    connected: true,
    projects: extractItems(projectsResult.body),
    tasks: extractItems(tasksResult.body),
    pendingActions: extractItems(actionsResult.body),
  });
}
