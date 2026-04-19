// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PortfolioTimelineResponse } from "@larry/shared";
import {
  useTimelineSnapshot,
  useCategoriesFromTimeline,
  useProjectsFromTimeline,
  QK_TIMELINE_ORG,
} from "./useTimelineSnapshot";

const payload: PortfolioTimelineResponse = {
  categories: [
    {
      id: "c1",
      name: "X",
      colour: "#123456",
      sortOrder: 0,
      parentCategoryId: null,
      projectId: null,
      projects: [
        {
          id: "p1",
          name: "P",
          status: "active",
          startDate: null,
          targetDate: null,
          tasks: [],
        },
      ],
    },
  ],
  dependencies: [],
};

function makeWrapper(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe("useTimelineSnapshot", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("fetches and caches the timeline payload", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(payload), { status: 200 }),
    );
    const { result } = renderHook(() => useTimelineSnapshot(), {
      wrapper: makeWrapper(qc),
    });
    await waitFor(() => expect(result.current.data).toEqual(payload));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(qc.getQueryData(QK_TIMELINE_ORG)).toEqual(payload);
  });

  it("does not refetch when the cache is already warm within staleTime", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    qc.setQueryData(QK_TIMELINE_ORG, payload);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { result } = renderHook(() => useCategoriesFromTimeline(), {
      wrapper: makeWrapper(qc),
    });
    await waitFor(() =>
      expect(result.current.data?.categories).toHaveLength(1),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("useProjectsFromTimeline derives items with categoryId stitched", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    qc.setQueryData(QK_TIMELINE_ORG, payload);
    const { result } = renderHook(() => useProjectsFromTimeline(), {
      wrapper: makeWrapper(qc),
    });
    await waitFor(() =>
      expect(result.current.data?.items).toEqual([
        { id: "p1", categoryId: "c1" },
      ]),
    );
  });
});
