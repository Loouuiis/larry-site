"use client";

// Singleton QueryClient for the workspace shell. Wrapped once in
// WorkspaceShell, every child can use `useQuery` / `useMutation` / `useQueryClient`.
//
// Defaults chosen for Larry's ops profile:
// - staleTime 30s: most views poll-refresh on user action, and 30s is below
//   the median "I changed something elsewhere" gap. Tighter is noisy.
// - refetchOnWindowFocus true: Fergus switches between windows constantly;
//   stale data across tabs is the #9 bug source.
// - retry 1: prod API hits transient 5xx occasionally; one retry masks them,
//   more than one delays genuine error surfacing.
// - mutations do not auto-retry — writes must be explicit.

import { QueryClient } from "@tanstack/react-query";

let _client: QueryClient | null = null;

export function getQueryClient(): QueryClient {
  if (_client) return _client;
  _client = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: true,
        retry: 1,
      },
      mutations: {
        retry: 0,
      },
    },
  });
  return _client;
}
