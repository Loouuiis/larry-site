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

  const [projectsResult, archivedProjectsResult, tasksResult, slackResult, calendarResult, emailResult] = await Promise.all([
    proxyApiRequest(session, "/v1/projects?status=active"),
    proxyApiRequest(session, "/v1/projects?status=archived"),
    proxyApiRequest(session, "/v1/tasks?projectStatus=active"),
    proxyApiRequest(session, "/v1/connectors/slack/status"),
    proxyApiRequest(session, "/v1/connectors/google-calendar/status"),
    proxyApiRequest(session, "/v1/connectors/email/status"),
  ]);

  const updatedSession =
    projectsResult.session ??
    archivedProjectsResult.session ??
    tasksResult.session ??
    slackResult.session ??
    calendarResult.session ??
    emailResult.session ??
    session;

  if (updatedSession) {
    await persistSession(updatedSession);
  }

  if (projectsResult.status >= 400) {
    return NextResponse.json(
      {
        projects: [],
        archivedProjects: [],
        tasks: [],
        connectors: {
          slack: { connected: false },
          calendar: { connected: false },
          email: { connected: false },
        },
        error: extractError(projectsResult.body) ?? "Failed to load workspace projects.",
      },
      { status: projectsResult.status },
    );
  }

  const error = tasksResult.status >= 500
    ? extractError(tasksResult.body) ?? "Failed to load workspace tasks."
    : undefined;

  return NextResponse.json({
    projects: extractItems<WorkspaceProject>(projectsResult.body),
    archivedProjects: extractItems<WorkspaceProject>(archivedProjectsResult.body),
    tasks: extractItems<WorkspaceTask>(tasksResult.body),
    connectors: {
      slack: slackResult.body && typeof slackResult.body === "object" ? slackResult.body : { connected: false },
      calendar: calendarResult.body && typeof calendarResult.body === "object" ? calendarResult.body : { connected: false },
      email: emailResult.body && typeof emailResult.body === "object" ? emailResult.body : { connected: false },
    },
    error,
  });
}
