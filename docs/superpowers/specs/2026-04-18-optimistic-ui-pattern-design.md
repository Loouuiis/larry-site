# Optimistic UI Update Pattern — Design

**Date:** 2026-04-18
**Status:** Approved for implementation
**Proof surface:** Action Centre (`useLarryActionCentre`)
**Next surface:** Portfolio Gantt (exercises the temp-ID path)

---

## 1. Goal

Every mutating action in Larry's web app should update the UI immediately, send the network call in the background, reconcile against the server response on success, and precisely roll back on failure — without one-off logic per mutation. The pattern must handle rapid successive actions without races and must support temporary client-side IDs that swap for server IDs on success.

## 2. Scope

**In:** Action Centre (`useLarryActionCentre`) converted to TanStack Query + new `withOptimistic` helper applied to accept / dismiss / let-larry-execute mutations. Temp-ID registry designed and shipped but not exercised until migration #2.

**Out (deliberately):** Persistent offline queue. Retries beyond TanStack Query's native `retry` option. Migration of the Gantt, Project Notes, Calendar, Email Drafts, Memory, or Modify Panel hooks (each gets its own migration PR, using the shape proven here).

**Not changed:** Existing `QueryClient` singleton, `ToastContext`, API contracts, proxy behaviour.

## 3. Stack

Confirmed from `apps/web/package.json`:

- Next.js 16 App Router, React 19
- TanStack Query v5 (already installed, singleton at `apps/web/src/lib/query-client.ts`)
- Zod 4, TypeScript 5
- Existing toast system at `apps/web/src/components/toast/ToastContext.tsx`
- Backend: Fastify v5 REST API on Railway, reached via `/api/workspace/...` proxy

## 4. Approach chosen

**Pure-function helper (`withOptimistic`)** that returns a pre-baked set of TanStack Query lifecycle handlers. Callers use plain `useMutation` and spread the handlers in. Chosen for safety: smallest blast radius, smallest surface area, visible seam, trivially reversible (delete helper, inline callbacks), and composes with every native TanStack Query feature (`scope`, `mutationKey`, `retry`, `meta`, custom `onSettled`).

Two alternative approaches considered:

- A higher-order `useOptimisticMutation` hook wrapping `useMutation`. Rejected: adds a named dependency every caller must trust; hides the lifecycle; can accidentally block access to native `useMutation` features if the wrapper is incomplete.
- An entity-centric `defineResource<Task>()` framework. Rejected: premature. We do not yet have enough mutations on a single entity to justify a framework, and cross-entity mutations (one call touching tasks + project overview) fight the abstraction.

## 5. File layout

```
apps/web/src/lib/optimistic/
  withOptimistic.ts       # the helper (pure function)
  tempIdRegistry.ts       # module-level temp-ID ↔ real-ID resolver + opId counter
  index.ts                # re-exports
  withOptimistic.test.ts
  tempIdRegistry.test.ts
```

No new dependencies.

## 6. Public API

```ts
function withOptimistic<TVars, TData>(opts: {
  affects: (vars: TVars, qc: QueryClient) => QueryKey[];
  optimistic: (qc: QueryClient, vars: TVars) => void;
  reconcile?: (qc: QueryClient, vars: TVars, data: TData) => void;
  invalidate?: QueryKey[] | ((vars: TVars, data: TData) => QueryKey[]);
  onRollback?: (err: unknown, vars: TVars) => void;              // caller-owned error surface
  extractWarnings?: (data: TData) => string[];
  onWarnings?: (warnings: string[], vars: TVars, data: TData) => void;
  tempId?: { field: keyof TVars & string };
}): Pick<
  UseMutationOptions<TData, Error, TVars>,
  "onMutate" | "onError" | "onSuccess" | "onSettled"
>;
```

Canonical call site:

```ts
const accept = useMutation({
  mutationFn: (id: string) =>
    fetch(`/api/workspace/larry/events/${id}/accept`, { method: "POST" })
      .then(readJsonOrThrow),
  ...withOptimistic<string, AcceptResponse>({
    affects: () => [["actionCentre", projectId ?? "larry"]],
    optimistic: (qc, id) =>
      qc.setQueryData(["actionCentre", projectId ?? "larry"], (old?: ActionCentreData) =>
        old ? { ...old, suggested: old.suggested.filter((e) => e.id !== id) } : old),
    onRollback: (err) => {
      setActionError({
        eventId: eventIdBeingAccepted,
        message: `Couldn't accept: ${err instanceof Error ? err.message : "please try again"}`,
      });
    },
  }),
  scope: { id: `event:${eventIdBeingAccepted}` },
});
```

## 7. Lifecycle (what `withOptimistic` does)

### `onMutate(vars)` — before the network call

1. If `navigator.onLine === false`, throw `OfflineError` synchronously. Short-circuits the entire mutation before any cache mutation.
2. `await qc.cancelQueries({ queryKey })` for every key in `affects(vars, qc)`.
3. For each affected key, read and store `[key, qc.getQueryData(key)]` as a snapshot.
4. Stamp a monotonic `opId` (counter from `tempIdRegistry.ts`).
5. Record `opId` against every affected key in the module-level `Map<serialisedKey, opId>` (see Rule 3 in §8).
6. If `tempId` configured, register the pending temp-ID in the registry.
7. Run `opts.optimistic(qc, vars)` — caller mutates the cache directly via `setQueryData`.
8. Return `{ snapshots, opId }` as TanStack Query's mutation context.

### `onError(err, vars, ctx)`

1. For each snapshot, **only if** the registry's `opId` for that key still equals `ctx.opId`, restore the snapshot via `setQueryData`. If a newer op has taken over, leave the newer optimistic state alone (Rule 2, §8).
2. If `tempId` configured, call `failSwap(tempId, err)` — unblocks awaiting follow-up mutations with a rejection.
3. If `onRollback` provided, call `opts.onRollback(err, vars)`. The helper does **not** couple to any specific error-surface implementation — the caller decides whether to `setLocalError`, push a toast, log, or all three. Rationale: Larry's existing `ToastContext` is purpose-built for accepted-action toasts (`actionType`/`actionLabel`/`actionColor`/`displayText`/`projectName`/`projectId`), not generic error strings. Keeping the helper decoupled avoids a forced ToastContext generalisation in this PR and is strictly safer.

### `onSuccess(data, vars, ctx)`

1. Check the registry: if the current `opId` for any affected key ≠ `ctx.opId`, a newer op has taken over. Skip `reconcile` and skip invalidate. Return. (Rule 3, §8.)
2. If `extractWarnings` provided, read the warnings from `data`. If `onWarnings` is also provided, call `opts.onWarnings(warnings, vars, data)` so the caller surfaces them however it likes. If no `onWarnings`, warnings are ignored (the helper never silently pushes anywhere on its own).
3. If `reconcile` provided, run it. The caller is expected to `setQueryData` with the server's canonical payload.
4. If `tempId` configured, call `completeSwap(tempId, data.id)` to unblock awaiting follow-ups, then walk each affected cache entry and rewrite any row where `row.id === tempId` to `row.id === data.id`.
5. If no `reconcile`, invalidate `invalidate ?? affects(vars, qc)`.

### `onSettled` (always runs)

Clear this mutation's `opId` from the registry map for every key it was recorded against.

### Composition with caller-supplied handlers

`withOptimistic` returns only the four lifecycle handlers as a `Pick<>`. Object-spread order is authoritative: if a caller spreads `withOptimistic(...)` and then their own `onSuccess`, theirs wins and the helper's logic is silently lost. To add side-effects without losing the helper, callers pass their extras via TanStack Query's **per-call** handlers on `mutation.mutate(vars, { onSuccess, onError })`, which run *after* the mutation-level ones and are additive rather than replacing. This is the documented escape hatch; the helper intentionally does not accept optional wrapper callbacks to keep its surface minimal.

## 8. Race-safety model

**Rule 1 — Serialise when asked.** Callers pass `scope: { id: "<entityType>:<id>" }` to `useMutation` (native TanStack Query v5 feature, no custom code). Mutations sharing a scope run strictly in-order. Handles "user clicks Accept twice in 200ms": the second click queues until the first settles, then sees post-mutation cache as its starting point.

**Rule 2 — Later wins on concurrent ops.** For mutations against the same key but different entities (not serialised), each `onMutate` snapshots *before* its own write. If op B's `onMutate` runs while op A is still in flight, B snapshots A's optimistic state (not the pre-A state). On rollback, the last-failed op restores its own snapshot, which preserves whichever later ops already landed in cache.

**Rule 3 — Don't stomp with a stale success.** Every optimistic write records its `opId` against every key it touches, in a module-level `Map<serialisedKey, opId>`. On `onSuccess` or `onError`, compare: if the current `opId` for a key ≠ our `opId`, a newer op has taken over. `onSuccess` skips reconcile/invalidate; `onError` skips the restore for that key.

The parallel-map choice (3b, over storing `opId` on the cache entry itself) was chosen for zero-invasion to existing consumer data shapes. Eviction is irrelevant: an evicted entry refetches, so `opId` comparison becomes moot.

## 9. Temp-ID registry

Module-level singleton in `tempIdRegistry.ts`:

```ts
createTempId(prefix?: string): string        // "temp_<cuid>"
isTempId(id: string): boolean
resolveId(id: string): Promise<string>       // real-ID if registered;
                                             // same ID if never registered (passthrough);
                                             // awaits Promise if pending
registerPending(tempId: string): void
completeSwap(tempId: string, realId: string): void
failSwap(tempId: string, err: Error): void
resetOptimisticState(): void                 // test-only; also resets opId counter
```

### Flow for optimistic create + immediate follow-up

1. Component: `const tempId = createTempId(); mutate({ id: tempId, title, ... })`.
2. `onMutate` calls `registerPending(tempId)` and writes the task into list cache with `id: tempId`.
3. User immediately drags the just-created task. That mutation's `mutationFn` starts with `const realId = await resolveId(tempId)` — it awaits automatically.
4. Parent `onSuccess` receives `{ id: "srv_abc123", ... }`. Walks affected cache entries rewriting temp-ID → real-ID, then calls `completeSwap(tempId, "srv_abc123")`.
5. Awaiting follow-up mutation unblocks, fires with the real ID.
6. If parent fails, `failSwap(tempId, err)` rejects awaiters; the follow-up's own `onError` rolls back its own optimistic write.

No queue, no tick-based flushing, one Promise per temp-ID.

Exercised in migration #2 (Gantt "add task"), not in this PR.

## 10. Edge cases

| Case | Behaviour |
|------|-----------|
| **Offline** (`navigator.onLine === false`) | `onMutate` throws `OfflineError`. Snapshot captured, no optimistic write, `mutationFn` never fires. `onRollback` fires with the `OfflineError`; the caller surfaces it (suggested phrasing: `"You're offline — <action> wasn't saved"`). Persistent offline queue is out of scope for v1. |
| **Slow network** | No special handling. Optimistic state holds until settlement. User can navigate away; TanStack Query preserves the mutation. |
| **Partial success** (2xx with `warnings: string[]`) | Success path (no rollback, `reconcile` runs). Each warning is pushed to toast at `info` level via `extractWarnings`. Opt-in per mutation. |
| **Validation-corrected** (2xx with server-modified data) | `reconcile` callback overrides the optimistic guess with server canonical data. No toast. No flicker through refetch. |
| **HTTP 4xx** | Always triggers rollback. If a server wants accept-with-correction, it must return 2xx + corrected data. |
| **Session expired mid-flight** (401 from proxy) | Rollback; `onRollback` receives the `SessionExpiredError` the proxy throws; caller surfaces `"Session expired — please sign in again"`. No retry. |

## 11. Action Centre migration shape

### Query layer

```ts
const query = useQuery({
  queryKey: ["actionCentre", projectId ?? "larry"],
  queryFn: fetchActionCentre,
  refetchInterval: ACTION_CENTRE_REFRESH_MS,
  refetchOnWindowFocus: true,
});
```

Deletes:
- The manual `setInterval` loop
- The `focus` and `visibilitychange` listeners
- `loadInFlightRef` in-flight dedupe (TanStack Query provides this)
- Manual error-state branching in `load()`

Kept temporarily:
- `larry:refresh-snapshot` listener — now calls `qc.invalidateQueries({ queryKey: ["actionCentre", projectId ?? "larry"] })`. Other hooks still dispatch this event; the bridge is removed as each of those hooks migrates.

### Mutations

Four, each via `withOptimistic`:

1. **`accept(eventId)`** — `POST /events/:id/accept`
   - `optimistic`: remove from `suggested[]`
   - `reconcile`: fire `onAccepted` toast with server event payload; invalidate action centre + project overview
   - `scope: { id: "event:" + eventId }` — serialises the double-click case natively
   - Replaces the hand-rolled `removeSuggestedLocally` + QA-2026-04-12 §3a comment

2. **`dismiss(eventId)`** — `POST /events/:id/dismiss`
   - `optimistic`: remove from `suggested[]`
   - `reconcile`: invalidate action centre only
   - `scope: { id: "event:" + eventId }`

3. **`letLarryExecute(eventId)`** — `POST /events/:id/let-larry-execute`
   - `optimistic`: mark event `executing: true` inline (not removed)
   - `reconcile`: invalidate action centre + project overview
   - `scope: { id: "event:" + eventId }`

4. **`modify(eventId)`** — stays a pure UI toggle (the Modify panel's submit is its own mutation inside `useModifyPanel`, to be migrated in its own PR).

### Public surface

The hook returns `{ suggested, activity, conversations, loading, error, accepting, dismissing, modifying, modifyingEventId, executing, actionError, accept, dismiss, modify, closeModify, letLarryExecute, clearActionError, refresh }` — unchanged. Consumers compile and work without modification. `accepting` / `dismissing` / `executing` are derived from `mutation.isPending` filtered by `mutation.variables`.

Net LOC: ~276 → ~160 lines.

## 12. Testing strategy

**Unit** (`withOptimistic.test.ts`, `tempIdRegistry.test.ts`) — vitest, no DOM:
- Snapshot/restore correctness (one key, multi key)
- Rule 3 stomp protection: op A in flight, op B lands, op A success is discarded
- `scope`-based serialisation using a real `QueryClient`
- Temp-ID resolve: pending, completed, failed, never-registered (passthrough)
- Offline short-circuit fires `OfflineError`, skips `mutationFn`, calls `onRollback`
- `extractWarnings` → `onWarnings` is called without rolling back

**Hook integration** (`useLarryActionCentre.test.tsx`) — React Testing Library + `QueryClientProvider`. Requires test-infra setup (Slice 0) to add `@testing-library/react`, `@testing-library/jest-dom`, `happy-dom`, and extend vitest `include` to cover `*.test.tsx` with `environment: 'happy-dom'`:
- Accept flow: click → `suggested` shrinks synchronously → mock API resolves → no refetch churn
- Accept failure: `suggested` restored + `onRollback` fires exactly once
- Double-click accept: second mutation queues via `scope`, mock API sees no 409
- `larry:refresh-snapshot` bridge still invalidates the query

**Playwright smoke** (extends existing action-centre specs if present; otherwise new `e2e/action-centre-optimistic.spec.ts`): real browser, network throttled, verify click-to-visual-latency < 50ms (today 300–800ms waiting on refetch). The user-facing proof.

Mocking: `vi.stubGlobal("fetch", vi.fn())` at the top of each test file. MSW is **not** introduced in this PR — scope discipline.

## 13. Branching & rollout

- Feature branch: `feat/optimistic-ui-pattern`
- Vercel will build a preview URL per push
- Merge criteria: all three test layers green, manual QA on preview confirms double-click doesn't 409, `actionError` state appears on forced 500, no refetch flicker on accept
- Follow-up migrations (one PR each): Gantt, Project Notes, Email Drafts, Calendar, Memory, Modify Panel. Each removes more of the `larry:refresh-snapshot` bridge.

## 14. Known gaps / future work

- No persistent offline queue (documented, out of scope)
- No automatic retry beyond TanStack Query's native `retry` (deliberate — mutations must be explicit)
- No batching of invalidations across rapid mutations (fine at current volumes; revisit if toast spam or refetch storms appear)
- Temp-ID registry is ambient module state; if the app ever mounts multiple `QueryClient`s, this needs to become context-scoped. Not currently a concern.
