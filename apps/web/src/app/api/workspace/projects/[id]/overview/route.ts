import { NextResponse } from "next/server";
import type {
  WorkspaceHealth,
  WorkspaceMeeting,
  WorkspaceOutcomes,
  WorkspaceProject,
  WorkspaceTask,
  WorkspaceTimeline,
} from "@/app/dashboard/types";
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

function extractObject<T>(value: unknown): T | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as T;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const [projectsResult, tasksResult, timelineResult, healthResult, outcomesResult, meetingsResult] = await Promise.all([
    proxyApiRequest(session, "/v1/projects?status=all"),
    proxyApiRequest(session, `/v1/tasks?projectId=${encodeURIComponent(id)}`),
    proxyApiRequest(session, `/v1/projects/${id}/timeline`),
    proxyApiRequest(session, `/v1/projects/${id}/health`),
    proxyApiRequest(session, `/v1/projects/${id}/outcomes`),
    proxyApiRequest(session, `/v1/meetings?projectId=${encodeURIComponent(id)}&limit=20`),
  ]);

  const updatedSession =
    projectsResult.session ??
    tasksResult.session ??
    timelineResult.session ??
    healthResult.session ??
    outcomesResult.session ??
    meetingsResult.session ??
    session;

  if (updatedSession) {
    await persistSession(updatedSession);
  }

  if (projectsResult.status >= 400) {
    return NextResponse.json(
      {
        project: null,
        tasks: [],
        timeline: null,
        health: null,
        outcomes: null,
        meetings: [],
        error: extractError(projectsResult.body) ?? "Failed to load project.",
      },
      { status: projectsResult.status },
    );
  }

  const project = extractItems<WorkspaceProject>(projectsResult.body).find((item) => item.id === id) ?? null;
  if (!project) {
    return NextResponse.json(
      {
        project: null,
        tasks: [],
        timeline: null,
        health: null,
        outcomes: null,
        meetings: [],
        error: "Project not found.",
      },
      { status: 404 },
    );
  }

  // Sub-request failures (tasks, timeline, health, outcomes, meetings) degrade
  // silently so the project page still renders. Previously a 500 from tasks
  // (or any endpoint that raised an unhandled error) would set a blocking
  // `error` field, crashing the whole workspace — including Task Center on
  // projects where tasks themselves were fine. Fatal errors (project not
  // found / unauthorized) are handled above and still short-circuit.
  return NextResponse.json({
    project,
    tasks: tasksResult.status < 400 ? extractItems<WorkspaceTask>(tasksResult.body) : [],
    timeline: timelineResult.status < 400 ? extractObject<WorkspaceTimeline>(timelineResult.body) : null,
    health: healthResult.status < 400 ? extractObject<WorkspaceHealth>(healthResult.body) : null,
    outcomes: outcomesResult.status < 400 ? extractObject<WorkspaceOutcomes>(outcomesResult.body) : null,
    meetings: meetingsResult.status < 400 ? extractItems<WorkspaceMeeting>(meetingsResult.body) : [],
    error: undefined,
  });
}
