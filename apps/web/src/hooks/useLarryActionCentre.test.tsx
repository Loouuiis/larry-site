import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLarryActionCentre, actionCentreQueryKey } from "./useLarryActionCentre";
import { resetOptimisticState } from "@/lib/optimistic";
import type { ReactNode } from "react";
import type {
  WorkspaceLarryEvent,
  WorkspaceProjectActionCentre,
} from "@/app/dashboard/types";

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
        refetchInterval: false,
        // staleTime:Infinity so pre-seeded cache is honoured without
        // triggering a background refetch against the stubbed fetch.
        staleTime: Infinity,
      },
      mutations: { retry: 0 },
    },
  });
}

function wrapper(qc: QueryClient) {
  return function Wrap({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

// Minimal fixture matching WorkspaceLarryEvent's required fields.
function makeEvent(id: string, displayText: string): WorkspaceLarryEvent {
  return {
    id,
    projectId: "p1",
    projectName: "Proj",
    eventType: "suggested",
    actionType: "create_task",
    displayText,
    reasoning: "",
    payload: {},
    executedAt: null,
    triggeredBy: "schedule",
    chatMessage: null,
    createdAt: new Date().toISOString(),
    conversationId: null,
    requestMessageId: null,
    responseMessageId: null,
    requestedByUserId: null,
    requestedByName: null,
    approvedByUserId: null,
    approvedByName: null,
    approvedAt: null,
    dismissedByUserId: null,
    dismissedByName: null,
    dismissedAt: null,
    executedByKind: null,
    executedByUserId: null,
    executedByName: null,
    executionMode: null,
    sourceKind: null,
    sourceRecordId: null,
  };
}

function seed(): WorkspaceProjectActionCentre {
  return {
    suggested: [makeEvent("evt1", "Do thing"), makeEvent("evt2", "Do other")],
    activity: [],
    conversations: [],
  };
}

describe("useLarryActionCentre — mutations", () => {
  let qc: QueryClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetOptimisticState();
    qc = makeClient();
    qc.setQueryData(actionCentreQueryKey("p1"), seed());
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(navigator, "onLine", { value: true, writable: true, configurable: true });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("accept removes the suggestion synchronously and reconciles on success", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          accepted: true,
          event: {
            actionType: "create_task",
            displayText: "Do thing",
            projectName: "Proj",
            projectId: "p1",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const onAccepted = vi.fn();
    const { result } = renderHook(
      () => useLarryActionCentre({ projectId: "p1", onAccepted }),
      { wrapper: wrapper(qc) },
    );

    await waitFor(() => expect(result.current.suggested).toHaveLength(2));

    await act(async () => {
      result.current.accept("evt1");
      // flush microtask where onMutate runs
      await Promise.resolve();
    });

    // Synchronous optimistic removal
    expect(result.current.suggested.map((e) => e.id)).toEqual(["evt2"]);

    await waitFor(() => expect(onAccepted).toHaveBeenCalled());
  });

  it("accept failure rolls back and sets actionError", async () => {
    // Gate the response so we can observe the optimistic state mid-flight.
    let respond!: (r: Response) => void;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((r) => {
          respond = r;
        }),
    );

    const { result } = renderHook(
      () => useLarryActionCentre({ projectId: "p1" }),
      { wrapper: wrapper(qc) },
    );
    await waitFor(() => expect(result.current.suggested).toHaveLength(2));

    act(() => {
      result.current.accept("evt1");
    });

    // Optimistic removal applied once the onMutate microtasks settle.
    await waitFor(() => expect(result.current.suggested).toHaveLength(1));
    expect(result.current.suggested.map((e) => e.id)).toEqual(["evt2"]);

    // Now trigger the 500 — rollback should restore the row and set actionError.
    respond(
      new Response(JSON.stringify({ message: "nope" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      }),
    );

    await waitFor(() => expect(result.current.actionError).not.toBeNull());
    expect(result.current.suggested.map((e) => e.id).sort()).toEqual(["evt1", "evt2"]);
    expect(result.current.actionError?.eventId).toBe("evt1");
  });

  it("rapid double-click on accept does not issue two simultaneous requests (scope serialises)", async () => {
    // Helper: count only /accept calls (ignore reconcile-triggered
    // /action-centre refetches).
    const acceptCalls = () =>
      fetchMock.mock.calls.filter(([url]) => String(url).includes("/accept")).length;

    let resolveFirst!: (v: Response) => void;
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("/accept")) {
        if (!resolveFirst) {
          return new Promise<Response>((r) => {
            resolveFirst = r;
          });
        }
        return Promise.resolve(
          new Response(JSON.stringify({ accepted: true }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }
      // /action-centre refetches from reconcile's invalidateQueries
      return Promise.resolve(
        new Response(JSON.stringify(seed()), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    });

    const { result } = renderHook(
      () => useLarryActionCentre({ projectId: "p1" }),
      { wrapper: wrapper(qc) },
    );
    await waitFor(() => expect(result.current.suggested).toHaveLength(2));

    act(() => {
      result.current.accept("evt1");
    });
    act(() => {
      result.current.accept("evt2");
    });

    // Scope=actionCentre-event queues the second; only one accept in flight.
    await waitFor(() => expect(acceptCalls()).toBe(1));
    expect(acceptCalls()).toBe(1);

    resolveFirst(
      new Response(JSON.stringify({ accepted: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await waitFor(() => expect(acceptCalls()).toBe(2));
  });

  it("larry:refresh-snapshot event invalidates the action centre query", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(seed()), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const { result } = renderHook(
      () => useLarryActionCentre({ projectId: "p1" }),
      { wrapper: wrapper(qc) },
    );
    await waitFor(() => expect(result.current.suggested).toHaveLength(2));

    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    act(() => {
      window.dispatchEvent(new CustomEvent("larry:refresh-snapshot"));
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: actionCentreQueryKey("p1"),
    });
  });
});
