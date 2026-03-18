interface ApiLoginResponse {
  accessToken: string;
}

interface ApiListResponse<T> {
  items: T[];
}

export interface WorkspaceProject {
  id: string;
  name: string;
  status: string;
  riskLevel: string | null;
  targetDate: string | null;
  updatedAt: string;
}

export interface WorkspaceTask {
  id: string;
  projectId: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  updatedAt: string;
}

export interface WorkspaceAction {
  id: string;
  impact: string;
  confidence: string | number;
  reason: string;
  createdAt: string;
}

export interface WorkspaceSnapshot {
  connected: boolean;
  projects: WorkspaceProject[];
  tasks: WorkspaceTask[];
  pendingActions: WorkspaceAction[];
  error?: string;
}

function getWorkspaceEnv(): {
  baseUrl: string;
  tenantId?: string;
  email?: string;
  password?: string;
} {
  return {
    baseUrl: (process.env.LARRY_API_BASE_URL ?? "http://localhost:8080").replace(/\/+$/, ""),
    tenantId: process.env.LARRY_API_TENANT_ID,
    email: process.env.LARRY_API_EMAIL,
    password: process.env.LARRY_API_PASSWORD,
  };
}

async function apiLogin(baseUrl: string, tenantId: string, email: string, password: string): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenantId, email, password }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Login failed (${response.status}): ${body}`);
  }

  const payload = (await response.json()) as ApiLoginResponse;
  if (!payload.accessToken) {
    throw new Error("Login response did not include an accessToken.");
  }
  return payload.accessToken;
}

async function apiGetList<T>(baseUrl: string, path: string, accessToken: string): Promise<T[]> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GET ${path} failed (${response.status}): ${body}`);
  }

  const payload = (await response.json()) as ApiListResponse<T>;
  return Array.isArray(payload.items) ? payload.items : [];
}

export async function getWorkspaceSnapshot(): Promise<WorkspaceSnapshot> {
  const env = getWorkspaceEnv();

  if (!env.tenantId || !env.email || !env.password) {
    return {
      connected: false,
      projects: [],
      tasks: [],
      pendingActions: [],
      error:
        "Workspace API credentials are missing. Set LARRY_API_TENANT_ID, LARRY_API_EMAIL, and LARRY_API_PASSWORD in apps/web/.env.local.",
    };
  }

  try {
    const accessToken = await apiLogin(env.baseUrl, env.tenantId, env.email, env.password);

    const [projects, tasks, pendingActions] = await Promise.all([
      apiGetList<WorkspaceProject>(env.baseUrl, "/v1/projects", accessToken),
      apiGetList<WorkspaceTask>(env.baseUrl, "/v1/tasks", accessToken),
      apiGetList<WorkspaceAction>(env.baseUrl, "/v1/agent/actions?state=pending", accessToken),
    ]);

    return {
      connected: true,
      projects,
      tasks,
      pendingActions,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown workspace API error.";
    return {
      connected: false,
      projects: [],
      tasks: [],
      pendingActions: [],
      error: message,
    };
  }
}
