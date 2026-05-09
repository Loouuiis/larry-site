const SESSION_STORAGE_KEYS = [
  "larry:last-project-id",
  "larry:favorite-projects",
  "larry_workspace_recent_projects_v1",
  "larry:cmd-k-recents",
] as const;

const SESSION_STORAGE_PREFIXES = ["larry:gantt:"] as const;

export function clearClientSessionState(): void {
  if (typeof window === "undefined") return;

  for (const key of SESSION_STORAGE_KEYS) {
    window.localStorage.removeItem(key);
  }

  for (const key of Object.keys(window.localStorage)) {
    if (SESSION_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      window.localStorage.removeItem(key);
    }
  }

  window.sessionStorage.clear();
}
