const FOLLOW_UP_REFRESH_DELAYS_MS = [1500, 5000, 12000];

export function triggerBoundedWorkspaceRefresh(): void {
  if (typeof window === "undefined") return;

  window.dispatchEvent(new CustomEvent("larry:refresh-snapshot"));
  for (const delay of FOLLOW_UP_REFRESH_DELAYS_MS) {
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("larry:refresh-snapshot"));
    }, delay);
  }
}
