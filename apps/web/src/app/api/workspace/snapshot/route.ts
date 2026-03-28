import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

type ListPayload<T> = { items: T[] };

function extractItems<T>(value: unknown): T[] {
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

export async function GET(request: NextRequest) {
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
  const projects = extractItems<{ id: string }>(projectsResult.body);
  const queryProjectId = request.nextUrl.searchParams.get("projectId");
  const includeProjectContext = request.nextUrl.searchParams.get("includeProjectContext") !== "false";

  const selectedProjectId = !includeProjectContext
    ? null
    : queryProjectId || (projects.length > 0 && typeof projects[0].id === "string" ? projects[0].id : null);

  const [tasksResult] = await Promise.all([
    proxyApiRequest(activeSession, "/v1/tasks"),
  ]);
  const [
    timelineResult,
    healthResult,
    outcomesResult,
    slackStatusResult,
    calendarStatusResult,
    emailStatusResult,
    activityResult,
    emailDraftsResult,
  ] = await Promise.all(
    selectedProjectId
      ? [
          proxyApiRequest(activeSession, `/v1/projects/${selectedProjectId}/timeline`),
          proxyApiRequest(activeSession, `/v1/projects/${selectedProjectId}/health`),
          proxyApiRequest(activeSession, `/v1/projects/${selectedProjectId}/outcomes`),
          proxyApiRequest(activeSession, "/v1/connectors/slack/status"),
          proxyApiRequest(activeSession, "/v1/connectors/google-calendar/status"),
          proxyApiRequest(activeSession, "/v1/connectors/email/status"),
          proxyApiRequest(activeSession, "/v1/activity?limit=20"),
          proxyApiRequest(activeSession, "/v1/connectors/email/drafts?state=draft&limit=10"),
        ]
      : [
          Promise.resolve({ status: 200, body: null, session: activeSession }),
          Promise.resolve({ status: 200, body: null, session: activeSession }),
          Promise.resolve({ status: 200, body: null, session: activeSession }),
          proxyApiRequest(activeSession, "/v1/connectors/slack/status"),
          proxyApiRequest(activeSession, "/v1/connectors/google-calendar/status"),
          proxyApiRequest(activeSession, "/v1/connectors/email/status"),
          proxyApiRequest(activeSession, "/v1/activity?limit=20"),
          proxyApiRequest(activeSession, "/v1/connectors/email/drafts?state=draft&limit=10"),
        ]
  );

  const updatedSession =
    tasksResult.session ??
    timelineResult.session ??
    healthResult.session ??
    outcomesResult.session ??
    slackStatusResult.session ??
    calendarStatusResult.session ??
    emailStatusResult.session ??
    activityResult.session ??
    emailDraftsResult.session ??
    activeSession;
  if (updatedSession) {
    await persistSession(updatedSession);
  }

  // Only surface errors for the tasks call — everything else degrades silently
  // so a broken connector or missing project-level endpoint never kills the whole page.
  const error = tasksResult.status >= 500
    ? (extractError(tasksResult.body) ?? "Failed to load tasks.")
    : undefined;

  const connectors = {
    slack:
      slackStatusResult.body && typeof slackStatusResult.body === "object"
        ? slackStatusResult.body
        : { connected: false },
    calendar:
      calendarStatusResult.body && typeof calendarStatusResult.body === "object"
        ? calendarStatusResult.body
        : { connected: false },
    email:
      emailStatusResult.body && typeof emailStatusResult.body === "object"
        ? emailStatusResult.body
        : { connected: false },
  };

  return NextResponse.json({
    connected: true,
    boardMeta: {
      workspaceName: "Larry Workspace",
      generatedAt: new Date().toISOString(),
    },
    selectedProjectId,
    projects,
    tasks: extractItems(tasksResult.body),
    timeline: timelineResult.body,
    health: healthResult.body,
    outcomes: outcomesResult.body,
    connectors,
    activity: extractItems(activityResult.body),
    emailDrafts: extractItems(emailDraftsResult.body),
    error,
  });
}
