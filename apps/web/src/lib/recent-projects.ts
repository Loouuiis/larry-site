const STORAGE_KEY = "larry_workspace_recent_projects_v1";
const MAX = 12;

export function recordProjectVisit(projectId: string): void {
  if (typeof window === "undefined") return;
  let ids: string[] = [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    ids = raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    ids = [];
  }
  const next = [projectId, ...ids.filter((id) => id !== projectId)].slice(0, MAX);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function getRecentProjectIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}
