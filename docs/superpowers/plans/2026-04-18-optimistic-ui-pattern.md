# Optimistic UI Pattern — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a reusable `withOptimistic` helper + temp-ID registry for Larry's web app, and migrate Action Centre (`useLarryActionCentre`) onto it as the proof surface — so accept/dismiss/execute actions update UI immediately, roll back precisely on failure, handle rapid-click races safely, and stop waiting on refetches.

**Architecture:** Pure-function helper returning a `Pick<UseMutationOptions, "onMutate" | "onError" | "onSuccess" | "onSettled">`. Callers use native `useMutation({ mutationFn, ...withOptimistic({...}), scope })`. Race safety via three rules: TanStack Query's native `scope` for serialisation, snapshot-per-op for "later wins", and a module-level `Map<serialisedKey, opId>` that gates stale success/rollback. Temp-ID registry is a singleton with one Promise per temp-ID; `resolveId(maybeTemp)` awaits the swap so follow-up mutations block until the server ID lands. Error surface is caller-owned via `onRollback(err, vars)` — helper never couples to a toast implementation.

**Tech Stack:** Next.js 16, React 19, TanStack Query v5.59, TypeScript 5, vitest 3, `@testing-library/react` + `happy-dom` (added in Slice 0), Playwright 1.58.

**Spec:** `docs/superpowers/specs/2026-04-18-optimistic-ui-pattern-design.md`

**Branch:** `feat/optimistic-ui-pattern` (already pushed — Vercel preview builds per commit)

**All paths below are relative to repo root** `C:\Dev\larry\site-deploys\larry-site`.

---

## File Structure

**New:**
- `apps/web/src/lib/optimistic/tempIdRegistry.ts` — temp-ID ↔ real-ID registry, `opId` counter, affected-key map
- `apps/web/src/lib/optimistic/tempIdRegistry.test.ts`
- `apps/web/src/lib/optimistic/errors.ts` — `OfflineError` class
- `apps/web/src/lib/optimistic/withOptimistic.ts` — the helper
- `apps/web/src/lib/optimistic/withOptimistic.test.ts`
- `apps/web/src/lib/optimistic/index.ts` — re-exports
- `apps/web/src/hooks/useLarryActionCentre.test.tsx` — hook integration tests (Slice 6)
- `apps/web/test/setup.ts` — vitest setup file for happy-dom + jest-dom matchers (Slice 0)

**Modified:**
- `apps/web/package.json` — add dev deps (Slice 0)
- `apps/web/vitest.config.ts` — add `environment`, `include` for `.test.tsx`, `setupFiles` (Slice 0)
- `apps/web/src/hooks/useLarryActionCentre.ts` — full rewrite onto TanStack Query + `withOptimistic` (Slice 5)
- `apps/web/tsconfig.json` — verify `@testing-library/jest-dom` types pick up (Slice 0, only if needed)

---

## Slice 0 — Test infrastructure (blocking prerequisite)

Goal: add React Testing Library + happy-dom so Slice 6's hook integration tests can exist. Ship on its own so any regression in test infra is a small, isolated revert.

**Files:**
- Create: `apps/web/test/setup.ts`
- Modify: `apps/web/package.json`
- Modify: `apps/web/vitest.config.ts`

### Step 1: Install dev dependencies

- [ ] Run:

```bash
cd apps/web && npm install --save-dev \
  @testing-library/react@^16.1.0 \
  @testing-library/jest-dom@^6.6.3 \
  @testing-library/user-event@^14.5.2 \
  happy-dom@^15.11.7
```

Expected: `package.json` devDependencies updated, no prod deps changed, `package-lock.json` regenerates.

### Step 2: Write vitest setup file

- [ ] Create `apps/web/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
```

### Step 3: Update vitest config

- [ ] Edit `apps/web/vitest.config.ts` to:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/**/*.spec.ts"],
    environment: "happy-dom",
    setupFiles: ["./test/setup.ts"],
    passWithNoTests: true,
  },
});
```

### Step 4: Write a sanity-check test

- [ ] Create `apps/web/src/test/infra.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

describe("test infra", () => {
  it("renders a React component and finds it by role", () => {
    render(<button>hello</button>);
    expect(screen.getByRole("button", { name: "hello" })).toBeInTheDocument();
  });
});
```

### Step 5: Run all web tests

- [ ] Run:

```bash
cd apps/web && npm test
```

Expected: all existing tests pass **and** the new `infra.test.tsx` passes. If any existing unit test broke (they run in `happy-dom` now instead of `node`), fix the failure before moving on — do not suppress.

### Step 6: Commit

- [ ] Run:

```bash
git add apps/web/package.json apps/web/package-lock.json apps/web/vitest.config.ts apps/web/test/setup.ts apps/web/src/test/infra.test.tsx
git commit -m "test(web): add React Testing Library + happy-dom for component/hook tests"
git push
```

### Step 7: Verify Vercel preview still builds

- [ ] Open Vercel dashboard or run `vercel ls` in the repo root. Wait for the preview build on branch `feat/optimistic-ui-pattern` to go green. If it fails, stop and fix before continuing.

---

## Slice 1 — Temp-ID registry + `opId` counter (pure module)

Goal: ship the registry module with full unit tests. Nothing in the app uses it yet.

**Files:**
- Create: `apps/web/src/lib/optimistic/tempIdRegistry.ts`
- Create: `apps/web/src/lib/optimistic/tempIdRegistry.test.ts`
- Create: `apps/web/src/lib/optimistic/errors.ts`
- Create: `apps/web/src/lib/optimistic/index.ts`

### Step 1: Write failing tests for the registry

- [ ] Create `apps/web/src/lib/optimistic/tempIdRegistry.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import {
  createTempId,
  isTempId,
  resolveId,
  registerPending,
  completeSwap,
  failSwap,
  nextOpId,
  getKeyOpId,
  setKeyOpId,
  clearKeyOpId,
  resetOptimisticState,
} from "./tempIdRegistry";

describe("tempIdRegistry", () => {
  beforeEach(() => resetOptimisticState());

  it("createTempId produces a string prefixed 'temp_'", () => {
    const id = createTempId();
    expect(id.startsWith("temp_")).toBe(true);
    expect(isTempId(id)).toBe(true);
  });

  it("createTempId uses a custom prefix when given", () => {
    const id = createTempId("draft");
    expect(id.startsWith("draft_")).toBe(true);
    expect(isTempId(id)).toBe(true);
  });

  it("isTempId returns false for strings without a recognised prefix", () => {
    expect(isTempId("srv_abc")).toBe(false);
    expect(isTempId("")).toBe(false);
  });

  it("resolveId returns the same id for non-temp ids (passthrough)", async () => {
    await expect(resolveId("srv_abc")).resolves.toBe("srv_abc");
  });

  it("resolveId returns the real id once completeSwap is called", async () => {
    const temp = createTempId();
    registerPending(temp);
    const promise = resolveId(temp);
    completeSwap(temp, "srv_123");
    await expect(promise).resolves.toBe("srv_123");
  });

  it("resolveId rejects if failSwap is called", async () => {
    const temp = createTempId();
    registerPending(temp);
    const promise = resolveId(temp);
    failSwap(temp, new Error("boom"));
    await expect(promise).rejects.toThrow("boom");
  });

  it("resolveId for an already-completed temp id returns the real id immediately", async () => {
    const temp = createTempId();
    registerPending(temp);
    completeSwap(temp, "srv_abc");
    await expect(resolveId(temp)).resolves.toBe("srv_abc");
  });

  it("resolveId for an unregistered temp id returns the temp id (passthrough — caller mistake)", async () => {
    const stray = "temp_notregistered";
    await expect(resolveId(stray)).resolves.toBe(stray);
  });

  it("nextOpId returns monotonically increasing integers", () => {
    const a = nextOpId();
    const b = nextOpId();
    const c = nextOpId();
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });

  it("setKeyOpId / getKeyOpId / clearKeyOpId round-trip by serialised key", () => {
    const key = ["actionCentre", "p1"];
    setKeyOpId(key, 42);
    expect(getKeyOpId(key)).toBe(42);
    clearKeyOpId(key, 42);
    expect(getKeyOpId(key)).toBeUndefined();
  });

  it("clearKeyOpId only clears if the stored opId matches (prevents clobbering a newer op)", () => {
    const key = ["actionCentre", "p1"];
    setKeyOpId(key, 1);
    setKeyOpId(key, 2);               // newer op overwrote
    clearKeyOpId(key, 1);              // old op settles — must NOT clear
    expect(getKeyOpId(key)).toBe(2);
  });

  it("resetOptimisticState clears registry and counter", () => {
    const temp = createTempId();
    registerPending(temp);
    setKeyOpId(["k"], 99);
    resetOptimisticState();
    expect(getKeyOpId(["k"])).toBeUndefined();
    // After reset, counter restarts from 1
    expect(nextOpId()).toBe(1);
  });
});
```

### Step 2: Run test to verify it fails

- [ ] Run:

```bash
cd apps/web && npx vitest run src/lib/optimistic/tempIdRegistry.test.ts
```

Expected: FAIL — module does not exist.

### Step 3: Implement `errors.ts`

- [ ] Create `apps/web/src/lib/optimistic/errors.ts`:

```ts
export class OfflineError extends Error {
  constructor(message = "You're offline") {
    super(message);
    this.name = "OfflineError";
  }
}
```

### Step 4: Implement the registry

- [ ] Create `apps/web/src/lib/optimistic/tempIdRegistry.ts`:

```ts
// Module-level singleton registry for optimistic UI updates.
// Two jobs: (a) track temp → real id swaps with a Promise per temp id so
// follow-up mutations await the swap; (b) stamp an opId on every affected
// query key so stale successes/rollbacks can be detected and skipped.

type Pending = {
  promise: Promise<string>;
  resolve: (id: string) => void;
  reject: (err: Error) => void;
  realId?: string;   // set once completeSwap lands; resolveId uses this for late callers
};

const TEMP_PREFIXES = new Set<string>(["temp", "draft"]);

let tempCounter = 0;
const registry = new Map<string, Pending>();

let opCounter = 0;
const keyOpIds = new Map<string, number>();

function randomSuffix(): string {
  // crypto.randomUUID would be nicer but this module must stay SSR-safe
  // (imported from client-only code but conservative). Math.random is fine
  // for in-memory collision avoidance.
  return Math.random().toString(36).slice(2, 10);
}

export function createTempId(prefix: string = "temp"): string {
  TEMP_PREFIXES.add(prefix);
  tempCounter += 1;
  return `${prefix}_${tempCounter}_${randomSuffix()}`;
}

export function isTempId(id: string): boolean {
  if (typeof id !== "string" || id.length === 0) return false;
  const underscore = id.indexOf("_");
  if (underscore < 0) return false;
  return TEMP_PREFIXES.has(id.slice(0, underscore));
}

export function registerPending(tempId: string): void {
  if (registry.has(tempId)) return;
  let resolve!: (id: string) => void;
  let reject!: (err: Error) => void;
  const promise = new Promise<string>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  registry.set(tempId, { promise, resolve, reject });
}

export function resolveId(id: string): Promise<string> {
  if (!isTempId(id)) return Promise.resolve(id);
  const entry = registry.get(id);
  if (!entry) return Promise.resolve(id);          // never registered → passthrough
  if (entry.realId) return Promise.resolve(entry.realId);
  return entry.promise;
}

export function completeSwap(tempId: string, realId: string): void {
  const entry = registry.get(tempId);
  if (!entry) return;
  entry.realId = realId;
  entry.resolve(realId);
}

export function failSwap(tempId: string, err: Error): void {
  const entry = registry.get(tempId);
  if (!entry) return;
  entry.reject(err);
  registry.delete(tempId);
}

// ---- opId tracking --------------------------------------------------

function keyToString(key: readonly unknown[]): string {
  return JSON.stringify(key);
}

export function nextOpId(): number {
  opCounter += 1;
  return opCounter;
}

export function setKeyOpId(key: readonly unknown[], opId: number): void {
  keyOpIds.set(keyToString(key), opId);
}

export function getKeyOpId(key: readonly unknown[]): number | undefined {
  return keyOpIds.get(keyToString(key));
}

export function clearKeyOpId(key: readonly unknown[], opId: number): void {
  // Only clear if we still own the slot. If a newer op has taken over,
  // don't touch its opId — that's what prevents late-settling ops from
  // clobbering newer state (Rule 3 in the spec).
  const current = keyOpIds.get(keyToString(key));
  if (current === opId) keyOpIds.delete(keyToString(key));
}

// ---- test helpers ---------------------------------------------------

export function resetOptimisticState(): void {
  registry.clear();
  keyOpIds.clear();
  tempCounter = 0;
  opCounter = 0;
  // Keep the default prefixes; drop any caller-added ones
  TEMP_PREFIXES.clear();
  TEMP_PREFIXES.add("temp");
  TEMP_PREFIXES.add("draft");
}
```

### Step 5: Run tests to verify they pass

- [ ] Run:

```bash
cd apps/web && npx vitest run src/lib/optimistic/tempIdRegistry.test.ts
```

Expected: all 12 tests PASS.

### Step 6: Create barrel export

- [ ] Create `apps/web/src/lib/optimistic/index.ts`:

```ts
export * from "./errors";
export * from "./tempIdRegistry";
// withOptimistic exported in Slice 2
```

### Step 7: Commit

- [ ] Run:

```bash
git add apps/web/src/lib/optimistic/
git commit -m "feat(optimistic): temp-id registry and opId counter (slice 1/5)"
git push
```

### Step 8: Verify preview

- [ ] Vercel preview on branch must build green. The module is unused so this only validates that adding a new file doesn't break the build.

---

## Slice 2 — `withOptimistic` core (offline, snapshot, optimistic write, default invalidate, onRollback)

Goal: ship the 80% path — no `opId` guard yet, no reconcile, no temp-id rewrite. The API surface is the final one; later slices fill in behaviour behind the existing callbacks.

**Files:**
- Create: `apps/web/src/lib/optimistic/withOptimistic.ts`
- Create: `apps/web/src/lib/optimistic/withOptimistic.test.ts`
- Modify: `apps/web/src/lib/optimistic/index.ts`

### Step 1: Write failing tests for the core path

- [ ] Create `apps/web/src/lib/optimistic/withOptimistic.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { withOptimistic } from "./withOptimistic";
import { OfflineError } from "./errors";
import { resetOptimisticState } from "./tempIdRegistry";

type Item = { id: string; label: string };
type ListCache = { items: Item[] };

function makeQc() {
  return new QueryClient({ defaultOptions: { mutations: { retry: 0 }, queries: { retry: 0 } } });
}

describe("withOptimistic — core", () => {
  beforeEach(() => {
    resetOptimisticState();
    // default: online
    Object.defineProperty(navigator, "onLine", { value: true, writable: true, configurable: true });
  });
  afterEach(() => vi.restoreAllMocks());

  it("onMutate snapshots, applies optimistic, and returns a ctx", async () => {
    const qc = makeQc();
    const key = ["items"] as const;
    qc.setQueryData(key, { items: [{ id: "a", label: "A" }] } satisfies ListCache);

    const handlers = withOptimistic<{ id: string }, void>({
      affects: () => [key as unknown as readonly unknown[]],
      optimistic: (c, vars) =>
        c.setQueryData<ListCache>(key, (old) =>
          old ? { items: old.items.filter((i) => i.id !== vars.id) } : old),
      onRollback: () => {},
    });

    const ctx = await handlers.onMutate!({ id: "a" });

    expect(qc.getQueryData<ListCache>(key)?.items).toHaveLength(0);
    expect(ctx).toMatchObject({ opId: expect.any(Number), snapshots: expect.any(Array) });
  }, 0);   // we'll inject the qc via a helper below — see Step 2
});
```

*Note: TanStack Query handlers receive the `QueryClient` implicitly via the mutation context, not as an argument. The test above is a placeholder; Step 2 finalises it using the real `useMutation` via React Testing Library, which is in Slice 6. For Slice 2 unit tests, test the **pure pieces** of `withOptimistic` by extracting a factory that takes `qc`.*

- [ ] **Replace** the above with this finalised test body, which tests `withOptimistic` by supplying a `qc` via a factory wrapper `withOptimisticFor(qc)`:

```ts
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { withOptimisticFor } from "./withOptimistic";
import { OfflineError } from "./errors";
import { resetOptimisticState } from "./tempIdRegistry";

type Item = { id: string; label: string };
type ListCache = { items: Item[] };

function makeQc() {
  return new QueryClient({ defaultOptions: { mutations: { retry: 0 }, queries: { retry: 0 } } });
}

describe("withOptimistic — core", () => {
  beforeEach(() => {
    resetOptimisticState();
    Object.defineProperty(navigator, "onLine", { value: true, writable: true, configurable: true });
  });
  afterEach(() => vi.restoreAllMocks());

  it("onMutate snapshots prior cache and applies the optimistic write", async () => {
    const qc = makeQc();
    const key = ["items"];
    qc.setQueryData<ListCache>(key, { items: [{ id: "a", label: "A" }] });

    const h = withOptimisticFor(qc)<{ id: string }, void>({
      affects: () => [key],
      optimistic: (c, vars) =>
        c.setQueryData<ListCache>(key, (old) => old ? { items: old.items.filter((i) => i.id !== vars.id) } : old),
      onRollback: () => {},
    });

    const ctx = await h.onMutate!({ id: "a" });
    expect(qc.getQueryData<ListCache>(key)?.items).toHaveLength(0);
    expect((ctx as { snapshots: [unknown, unknown][] }).snapshots[0][1]).toEqual({ items: [{ id: "a", label: "A" }] });
  });

  it("onError restores the snapshot and fires onRollback", async () => {
    const qc = makeQc();
    const key = ["items"];
    const initial: ListCache = { items: [{ id: "a", label: "A" }] };
    qc.setQueryData<ListCache>(key, initial);
    const rollback = vi.fn();

    const h = withOptimisticFor(qc)<{ id: string }, void>({
      affects: () => [key],
      optimistic: (c) => c.setQueryData<ListCache>(key, { items: [] }),
      onRollback: rollback,
    });

    const ctx = await h.onMutate!({ id: "a" });
    const err = new Error("boom");
    await h.onError!(err, { id: "a" }, ctx);

    expect(qc.getQueryData<ListCache>(key)).toEqual(initial);
    expect(rollback).toHaveBeenCalledWith(err, { id: "a" });
  });

  it("onSuccess invalidates affected keys by default", async () => {
    const qc = makeQc();
    const key = ["items"];
    qc.setQueryData<ListCache>(key, { items: [] });
    const spy = vi.spyOn(qc, "invalidateQueries");

    const h = withOptimisticFor(qc)<{ id: string }, { id: string }>({
      affects: () => [key],
      optimistic: () => {},
    });

    const ctx = await h.onMutate!({ id: "a" });
    await h.onSuccess!({ id: "srv_1" }, { id: "a" }, ctx);

    expect(spy).toHaveBeenCalledWith({ queryKey: key });
  });

  it("onSuccess skips invalidate when reconcile is provided", async () => {
    const qc = makeQc();
    const key = ["items"];
    qc.setQueryData<ListCache>(key, { items: [] });
    const spy = vi.spyOn(qc, "invalidateQueries");
    const reconcile = vi.fn();

    const h = withOptimisticFor(qc)<{ id: string }, { id: string }>({
      affects: () => [key],
      optimistic: () => {},
      reconcile,
    });

    const ctx = await h.onMutate!({ id: "a" });
    await h.onSuccess!({ id: "srv_1" }, { id: "a" }, ctx);

    expect(reconcile).toHaveBeenCalled();
    expect(spy).not.toHaveBeenCalled();
  });

  it("onMutate throws OfflineError and does not touch cache when offline", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, writable: true, configurable: true });
    const qc = makeQc();
    const key = ["items"];
    const initial: ListCache = { items: [{ id: "a", label: "A" }] };
    qc.setQueryData<ListCache>(key, initial);

    const h = withOptimisticFor(qc)<{ id: string }, void>({
      affects: () => [key],
      optimistic: (c) => c.setQueryData<ListCache>(key, { items: [] }),
    });

    await expect(h.onMutate!({ id: "a" })).rejects.toBeInstanceOf(OfflineError);
    expect(qc.getQueryData<ListCache>(key)).toEqual(initial);
  });

  it("onError surfaces OfflineError through onRollback untouched", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, writable: true, configurable: true });
    const qc = makeQc();
    qc.setQueryData(["items"], { items: [] });
    const rollback = vi.fn();

    const h = withOptimisticFor(qc)<{ id: string }, void>({
      affects: () => [["items"]],
      optimistic: () => {},
      onRollback: rollback,
    });

    try { await h.onMutate!({ id: "a" }); } catch (e) {
      // TanStack Query would normally catch this and pass ctx=undefined to onError
      await h.onError!(e as Error, { id: "a" }, undefined);
    }

    expect(rollback).toHaveBeenCalledWith(expect.any(OfflineError), { id: "a" });
  });

  it("cancels in-flight queries for affected keys before the optimistic write", async () => {
    const qc = makeQc();
    const key = ["items"];
    const spy = vi.spyOn(qc, "cancelQueries");
    qc.setQueryData<ListCache>(key, { items: [] });

    const h = withOptimisticFor(qc)<{ id: string }, void>({
      affects: () => [key],
      optimistic: () => {},
    });

    await h.onMutate!({ id: "a" });
    expect(spy).toHaveBeenCalledWith({ queryKey: key });
  });

  it("extractWarnings + onWarnings are called on success but do not skip reconcile", async () => {
    const qc = makeQc();
    qc.setQueryData(["items"], { items: [] });
    const onWarnings = vi.fn();
    const reconcile = vi.fn();

    const h = withOptimisticFor(qc)<{ id: string }, { id: string; warnings?: string[] }>({
      affects: () => [["items"]],
      optimistic: () => {},
      reconcile,
      extractWarnings: (d) => d.warnings ?? [],
      onWarnings,
    });

    const ctx = await h.onMutate!({ id: "a" });
    await h.onSuccess!({ id: "srv_1", warnings: ["clipped to 100 chars"] }, { id: "a" }, ctx);

    expect(onWarnings).toHaveBeenCalledWith(["clipped to 100 chars"], { id: "a" }, { id: "srv_1", warnings: ["clipped to 100 chars"] });
    expect(reconcile).toHaveBeenCalled();
  });
});
```

### Step 2: Run test to verify it fails

- [ ] Run:

```bash
cd apps/web && npx vitest run src/lib/optimistic/withOptimistic.test.ts
```

Expected: FAIL — `withOptimisticFor` and `withOptimistic` do not exist.

### Step 3: Implement `withOptimistic`

- [ ] Create `apps/web/src/lib/optimistic/withOptimistic.ts`:

```ts
import type { QueryClient, QueryKey, UseMutationOptions } from "@tanstack/react-query";
import { OfflineError } from "./errors";
import {
  nextOpId,
  setKeyOpId,
  clearKeyOpId,
  registerPending,
} from "./tempIdRegistry";

export interface WithOptimisticOptions<TVars, TData> {
  affects: (vars: TVars, qc: QueryClient) => QueryKey[];
  optimistic: (qc: QueryClient, vars: TVars) => void;
  reconcile?: (qc: QueryClient, vars: TVars, data: TData) => void;
  invalidate?: QueryKey[] | ((vars: TVars, data: TData) => QueryKey[]);
  onRollback?: (err: unknown, vars: TVars) => void;
  extractWarnings?: (data: TData) => string[];
  onWarnings?: (warnings: string[], vars: TVars, data: TData) => void;
  tempId?: { field: keyof TVars & string };
}

export interface WithOptimisticCtx {
  opId: number;
  snapshots: [QueryKey, unknown][];
}

export type WithOptimisticHandlers<TVars, TData> = Pick<
  UseMutationOptions<TData, Error, TVars, WithOptimisticCtx>,
  "onMutate" | "onError" | "onSuccess" | "onSettled"
>;

// Factory variant that binds the QueryClient explicitly — used by unit tests
// and (rarely) by callers who want to drive a mutation outside React.
export function withOptimisticFor(qc: QueryClient) {
  return function bound<TVars, TData>(
    opts: WithOptimisticOptions<TVars, TData>
  ): WithOptimisticHandlers<TVars, TData> {
    return buildHandlers(qc, opts);
  };
}

// Primary variant: read the QueryClient from the mutation's implicit context.
// TanStack Query v5 passes the QueryClient as the second arg to mutation
// lifecycle callbacks via meta? No — the supported way is to use the
// QueryClient bound at useMutation call site. So this variant requires the
// caller to provide qc (typically via `useQueryClient()` in the hook).
export function withOptimistic<TVars, TData>(
  qc: QueryClient,
  opts: WithOptimisticOptions<TVars, TData>
): WithOptimisticHandlers<TVars, TData> {
  return buildHandlers(qc, opts);
}

function buildHandlers<TVars, TData>(
  qc: QueryClient,
  opts: WithOptimisticOptions<TVars, TData>
): WithOptimisticHandlers<TVars, TData> {
  return {
    onMutate: async (vars) => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        throw new OfflineError();
      }

      const keys = opts.affects(vars, qc);

      // Cancel in-flight queries so they can't overwrite the optimistic state
      // after we write it.
      await Promise.all(keys.map((k) => qc.cancelQueries({ queryKey: k })));

      const snapshots: [QueryKey, unknown][] = keys.map((k) => [k, qc.getQueryData(k)]);

      const opId = nextOpId();
      keys.forEach((k) => setKeyOpId(k as readonly unknown[], opId));

      if (opts.tempId) {
        const tempVal = (vars as Record<string, unknown>)[opts.tempId.field];
        if (typeof tempVal === "string") registerPending(tempVal);
      }

      opts.optimistic(qc, vars);

      return { opId, snapshots };
    },

    onError: (err, vars, ctx) => {
      // Restore snapshots; future slice adds the opId-stale guard.
      if (ctx) {
        for (const [key, prev] of ctx.snapshots) {
          qc.setQueryData(key, prev);
        }
      }
      opts.onRollback?.(err, vars);
    },

    onSuccess: (data, vars, ctx) => {
      if (opts.extractWarnings && opts.onWarnings) {
        const warnings = opts.extractWarnings(data);
        if (warnings.length > 0) opts.onWarnings(warnings, vars, data);
      }

      if (opts.reconcile) {
        opts.reconcile(qc, vars, data);
      } else {
        const invalidateKeys = typeof opts.invalidate === "function"
          ? opts.invalidate(vars, data)
          : opts.invalidate ?? opts.affects(vars, qc);
        for (const k of invalidateKeys) qc.invalidateQueries({ queryKey: k });
      }
    },

    onSettled: (_data, _err, vars, ctx) => {
      if (!ctx) return;
      const keys = opts.affects(vars, qc);
      keys.forEach((k) => clearKeyOpId(k as readonly unknown[], ctx.opId));
    },
  };
}
```

### Step 4: Update barrel export

- [ ] Edit `apps/web/src/lib/optimistic/index.ts`:

```ts
export * from "./errors";
export * from "./tempIdRegistry";
export * from "./withOptimistic";
```

### Step 5: Run tests to verify they pass

- [ ] Run:

```bash
cd apps/web && npx vitest run src/lib/optimistic/
```

Expected: all tests from Slice 1 and Slice 2 PASS.

### Step 6: Commit

- [ ] Run:

```bash
git add apps/web/src/lib/optimistic/
git commit -m "feat(optimistic): withOptimistic core — offline, snapshot, rollback, invalidate (slice 2/5)"
git push
```

### Step 7: Verify preview builds

- [ ] Vercel preview green. Helper is still unused.

---

## Slice 3 — Stale-op guards (Rule 3) + temp-id rewrite on success

Goal: add the `opId`-based guards so stale successes don't stomp newer optimistic state, and the temp-id → real-id rewrite path for cache rows whose `id` matches the temp. Extends existing handlers; all Slice 2 tests must still pass.

**Files:**
- Modify: `apps/web/src/lib/optimistic/withOptimistic.ts`
- Modify: `apps/web/src/lib/optimistic/withOptimistic.test.ts`

### Step 1: Add failing tests for stale-op guards and temp-id rewrite

- [ ] Append to `apps/web/src/lib/optimistic/withOptimistic.test.ts`:

```ts
import { completeSwap } from "./tempIdRegistry";

describe("withOptimistic — stale-op guards (Rule 3)", () => {
  beforeEach(() => {
    resetOptimisticState();
    Object.defineProperty(navigator, "onLine", { value: true, writable: true, configurable: true });
  });

  it("onSuccess skips reconcile if a newer op has taken over the key", async () => {
    const qc = makeQc();
    const key = ["items"];
    qc.setQueryData<ListCache>(key, { items: [] });
    const reconcile = vi.fn();

    const h = withOptimisticFor(qc)<{ id: string }, { id: string }>({
      affects: () => [key],
      optimistic: () => {},
      reconcile,
    });

    const ctxA = await h.onMutate!({ id: "a" });
    // A newer op overwrites the opId stored for this key
    await h.onMutate!({ id: "b" });

    // A's success lands late
    await h.onSuccess!({ id: "srv_a" }, { id: "a" }, ctxA);

    expect(reconcile).not.toHaveBeenCalled();
  });

  it("onError skips restoring a key if a newer op owns it", async () => {
    const qc = makeQc();
    const key = ["items"];
    const initial: ListCache = { items: [{ id: "original", label: "O" }] };
    qc.setQueryData<ListCache>(key, initial);
    const rollback = vi.fn();

    const h = withOptimisticFor(qc)<{ id: string }, void>({
      affects: () => [key],
      optimistic: (c, vars) =>
        c.setQueryData<ListCache>(key, { items: [{ id: vars.id, label: vars.id.toUpperCase() }] }),
      onRollback: rollback,
    });

    const ctxA = await h.onMutate!({ id: "a" });   // cache now shows {a/A}
    await h.onMutate!({ id: "b" });                // cache now shows {b/B}

    // A fails late
    await h.onError!(new Error("boom"), { id: "a" }, ctxA);

    // B's optimistic state is preserved — A's rollback did not stomp it
    expect(qc.getQueryData<ListCache>(key)?.items[0].id).toBe("b");
    // But onRollback still fires so caller can surface the error
    expect(rollback).toHaveBeenCalled();
  });
});

describe("withOptimistic — temp-id rewrite", () => {
  beforeEach(() => {
    resetOptimisticState();
    Object.defineProperty(navigator, "onLine", { value: true, writable: true, configurable: true });
  });

  it("rewrites cache rows whose id equals the temp-id, and swaps the registry", async () => {
    const qc = makeQc();
    const key = ["items"];
    qc.setQueryData<ListCache>(key, { items: [{ id: "temp_x", label: "new" }] });

    const h = withOptimisticFor(qc)<{ id: string }, { id: string }>({
      affects: () => [key],
      optimistic: () => {},
      tempId: { field: "id" },
    });

    const ctx = await h.onMutate!({ id: "temp_x" });
    await h.onSuccess!({ id: "srv_42" }, { id: "temp_x" }, ctx);

    expect(qc.getQueryData<ListCache>(key)?.items[0].id).toBe("srv_42");
  });

  it("failSwap unblocks awaiters on rollback (cascade unblocks follow-up mutations)", async () => {
    const qc = makeQc();
    qc.setQueryData(["items"], { items: [] });
    const rollback = vi.fn();

    const h = withOptimisticFor(qc)<{ id: string }, void>({
      affects: () => [["items"]],
      optimistic: () => {},
      onRollback: rollback,
      tempId: { field: "id" },
    });

    const ctx = await h.onMutate!({ id: "temp_y" });
    await h.onError!(new Error("parent failed"), { id: "temp_y" }, ctx);

    // A follow-up that was awaiting resolveId("temp_y") must now reject
    await expect(resolveId("temp_y")).rejects.toThrow("parent failed");
  });
});
```

- [ ] Add the missing import at the top of the test file:

```ts
import { resolveId } from "./tempIdRegistry";
```

### Step 2: Run tests to verify the new ones fail

- [ ] Run:

```bash
cd apps/web && npx vitest run src/lib/optimistic/withOptimistic.test.ts
```

Expected: new tests FAIL; core tests still PASS.

### Step 3: Implement the guards and rewrite

- [ ] Edit `apps/web/src/lib/optimistic/withOptimistic.ts`. Replace the `buildHandlers` function body with:

```ts
function buildHandlers<TVars, TData>(
  qc: QueryClient,
  opts: WithOptimisticOptions<TVars, TData>
): WithOptimisticHandlers<TVars, TData> {
  return {
    onMutate: async (vars) => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        throw new OfflineError();
      }

      const keys = opts.affects(vars, qc);

      await Promise.all(keys.map((k) => qc.cancelQueries({ queryKey: k })));

      const snapshots: [QueryKey, unknown][] = keys.map((k) => [k, qc.getQueryData(k)]);

      const opId = nextOpId();
      keys.forEach((k) => setKeyOpId(k as readonly unknown[], opId));

      if (opts.tempId) {
        const tempVal = (vars as Record<string, unknown>)[opts.tempId.field];
        if (typeof tempVal === "string") registerPending(tempVal);
      }

      opts.optimistic(qc, vars);

      return { opId, snapshots };
    },

    onError: (err, vars, ctx) => {
      if (ctx) {
        for (const [key, prev] of ctx.snapshots) {
          // Only restore if this op still owns the key — otherwise a newer op
          // is on top and we must not stomp its optimistic state.
          if (getKeyOpId(key as readonly unknown[]) === ctx.opId) {
            qc.setQueryData(key, prev);
          }
        }

        if (opts.tempId) {
          const tempVal = (vars as Record<string, unknown>)[opts.tempId.field];
          if (typeof tempVal === "string") {
            const asError = err instanceof Error ? err : new Error(String(err));
            failSwap(tempVal, asError);
          }
        }
      }
      opts.onRollback?.(err, vars);
    },

    onSuccess: (data, vars, ctx) => {
      const keys = opts.affects(vars, qc);

      // Rule 3: if a newer op has taken over any affected key, this result is
      // stale — discard the reconcile/invalidate entirely. The newer op owns
      // the truth. onSettled still clears our opId below.
      if (ctx) {
        const superseded = keys.some(
          (k) => getKeyOpId(k as readonly unknown[]) !== ctx.opId
        );
        if (superseded) return;
      }

      if (opts.extractWarnings && opts.onWarnings) {
        const warnings = opts.extractWarnings(data);
        if (warnings.length > 0) opts.onWarnings(warnings, vars, data);
      }

      if (opts.tempId) {
        const tempVal = (vars as Record<string, unknown>)[opts.tempId.field];
        const realId = (data as unknown as { id?: string } | null)?.id;
        if (typeof tempVal === "string" && typeof realId === "string") {
          // Walk every affected cache entry and rewrite any row where id === tempVal
          for (const k of keys) {
            qc.setQueryData(k, (old: unknown) => rewriteId(old, tempVal, realId));
          }
          completeSwap(tempVal, realId);
        }
      }

      if (opts.reconcile) {
        opts.reconcile(qc, vars, data);
      } else {
        const invalidateKeys = typeof opts.invalidate === "function"
          ? opts.invalidate(vars, data)
          : opts.invalidate ?? keys;
        for (const k of invalidateKeys) qc.invalidateQueries({ queryKey: k });
      }
    },

    onSettled: (_data, _err, vars, ctx) => {
      if (!ctx) return;
      const keys = opts.affects(vars, qc);
      keys.forEach((k) => clearKeyOpId(k as readonly unknown[], ctx.opId));
    },
  };
}

// Walk any cache shape and rewrite id fields matching oldId → newId. Handles
// arrays, { items: [...] }, and single objects. Leaves unrelated shapes alone.
function rewriteId(data: unknown, oldId: string, newId: string): unknown {
  if (data == null) return data;
  if (Array.isArray(data)) {
    return data.map((row) => rewriteId(row, oldId, newId));
  }
  if (typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const next: Record<string, unknown> = { ...obj };
    let changed = false;
    for (const k of Object.keys(obj)) {
      if (k === "id" && obj[k] === oldId) {
        next[k] = newId;
        changed = true;
      } else if (Array.isArray(obj[k]) || (obj[k] && typeof obj[k] === "object")) {
        const child = rewriteId(obj[k], oldId, newId);
        if (child !== obj[k]) {
          next[k] = child;
          changed = true;
        }
      }
    }
    return changed ? next : obj;
  }
  return data;
}
```

- [ ] Add the missing imports at the top of `withOptimistic.ts`:

```ts
import {
  nextOpId,
  setKeyOpId,
  getKeyOpId,
  clearKeyOpId,
  registerPending,
  completeSwap,
  failSwap,
} from "./tempIdRegistry";
```

### Step 4: Run tests to verify they pass

- [ ] Run:

```bash
cd apps/web && npx vitest run src/lib/optimistic/
```

Expected: all tests PASS, including the new stale-op and temp-id tests.

### Step 5: Commit

- [ ] Run:

```bash
git add apps/web/src/lib/optimistic/
git commit -m "feat(optimistic): stale-op guards + temp-id cache rewrite (slice 3/5)"
git push
```

### Step 6: Verify preview builds

- [ ] Vercel preview green.

---

## Slice 4 — Action Centre migration: query layer

Goal: migrate the **read** side of `useLarryActionCentre` to TanStack Query, keeping the public surface identical. No mutations touched yet — still the existing hand-rolled accept/dismiss/execute.

**Files:**
- Modify: `apps/web/src/hooks/useLarryActionCentre.ts`

### Step 1: Read the current implementation once more

- [ ] Read `apps/web/src/hooks/useLarryActionCentre.ts` in full to confirm the public return shape and consumers' expectations.

### Step 2: Replace the read machinery

- [ ] Rewrite the top half of `useLarryActionCentre.ts` to use `useQuery`. The full migration shape:

```ts
"use client";

import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { WorkspaceProjectActionCentre } from "@/app/dashboard/types";
import { getActionTypeTag } from "@/lib/action-types";

const EMPTY_ACTION_CENTRE: WorkspaceProjectActionCentre = {
  suggested: [],
  activity: [],
  conversations: [],
};
const DEFAULT_ACTION_CENTRE_REFRESH_MS = 30_000;
const ENV_ACTION_CENTRE_REFRESH_MS = Number(
  process.env.NEXT_PUBLIC_LARRY_ACTION_CENTRE_REFRESH_MS ?? ""
);
const ACTION_CENTRE_REFRESH_MS =
  Number.isFinite(ENV_ACTION_CENTRE_REFRESH_MS) && ENV_ACTION_CENTRE_REFRESH_MS > 0
    ? Math.floor(ENV_ACTION_CENTRE_REFRESH_MS)
    : DEFAULT_ACTION_CENTRE_REFRESH_MS;

async function noopMutate(): Promise<void> {}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return {} as T;
  try { return JSON.parse(text) as T; } catch { return {} as T; }
}

export interface ActionError {
  eventId: string;
  message: string;
}

export function actionCentreQueryKey(projectId: string | undefined) {
  return ["actionCentre", projectId ?? "larry"] as const;
}

async function fetchActionCentre(projectId: string | undefined): Promise<WorkspaceProjectActionCentre> {
  const path = projectId
    ? `/api/workspace/projects/${encodeURIComponent(projectId)}/action-centre`
    : "/api/workspace/larry/action-centre";
  const response = await fetch(path, { cache: "no-store" });
  const payload = await readJson<WorkspaceProjectActionCentre>(response);
  if (!response.ok) throw new Error(payload.error ?? "Failed to load action centre.");
  return {
    suggested: Array.isArray(payload.suggested) ? payload.suggested : [],
    activity: Array.isArray(payload.activity) ? payload.activity : [],
    conversations: Array.isArray(payload.conversations) ? payload.conversations : [],
    error: payload.error,
  };
}

export function useLarryActionCentre({
  projectId,
  onMutate = noopMutate,
  onAccepted,
}: {
  projectId?: string;
  onMutate?: () => Promise<void>;
  onAccepted?: (toast: {
    actionType: string;
    actionLabel: string;
    actionColor: string;
    displayText: string;
    projectName: string | null;
    projectId: string;
  }) => void;
} = {}) {
  const qc = useQueryClient();
  const key = actionCentreQueryKey(projectId);

  const query = useQuery({
    queryKey: key,
    queryFn: () => fetchActionCentre(projectId),
    refetchInterval: ACTION_CENTRE_REFRESH_MS,
    refetchOnWindowFocus: true,
    // manual visibilitychange refetch is no longer needed — TanStack Query
    // refetches on focus, and the browser's focus event fires on tab focus.
  });

  // Legacy bridge — other hooks still dispatch this event.
  useEffect(() => {
    function onRefresh() {
      void qc.invalidateQueries({ queryKey: key });
    }
    window.addEventListener("larry:refresh-snapshot", onRefresh);
    return () => window.removeEventListener("larry:refresh-snapshot", onRefresh);
  }, [qc, key]);

  const data = query.data ?? EMPTY_ACTION_CENTRE;

  // --- mutation state and callbacks temporarily retained from the pre-migration
  // implementation; Slice 5 replaces these with withOptimistic-driven mutations.
  const [accepting, setAccepting] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState<string | null>(null);
  const [modifying, _setModifying] = useState<string | null>(null);
  const [modifyingEventId, setModifyingEventId] = useState<string | null>(null);
  const [executing, setExecuting] = useState<string | null>(null);
  const [actionError, setActionError] = useState<ActionError | null>(null);

  const clearActionError = useCallback(() => setActionError(null), []);

  const removeSuggestedLocally = useCallback(
    (eventId: string) => {
      qc.setQueryData<WorkspaceProjectActionCentre>(key, (prev) =>
        prev ? { ...prev, suggested: prev.suggested.filter((e) => e.id !== eventId) } : prev
      );
    },
    [qc, key]
  );

  const accept = useCallback(
    async (id: string) => {
      setAccepting(id);
      setActionError(null);
      try {
        const response = await fetch(`/api/workspace/larry/events/${id}/accept`, { method: "POST" });
        if (response.ok) {
          const body = await readJson<{
            accepted: boolean;
            event?: { actionType: string; displayText: string; projectName: string | null; projectId: string };
          }>(response);
          removeSuggestedLocally(id);
          window.dispatchEvent(new CustomEvent("larry:refresh-snapshot"));
          await Promise.all([qc.invalidateQueries({ queryKey: key }), onMutate()]);
          if (body.event && onAccepted) {
            const tag = getActionTypeTag(body.event.actionType);
            onAccepted({
              actionType: body.event.actionType,
              actionLabel: tag.label,
              actionColor: tag.color,
              displayText: body.event.displayText,
              projectName: body.event.projectName,
              projectId: body.event.projectId,
            });
          }
        } else {
          const body = await readJson<{ message?: string; error?: string }>(response);
          setActionError({ eventId: id, message: body.message || body.error || `Action failed (${response.status}).` });
        }
      } finally {
        setAccepting(null);
      }
    },
    [qc, key, onMutate, onAccepted, removeSuggestedLocally]
  );

  const dismiss = useCallback(
    async (id: string) => {
      setDismissing(id);
      setActionError(null);
      try {
        const response = await fetch(`/api/workspace/larry/events/${id}/dismiss`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (response.ok) {
          removeSuggestedLocally(id);
          window.dispatchEvent(new CustomEvent("larry:refresh-snapshot"));
          await Promise.all([qc.invalidateQueries({ queryKey: key }), onMutate()]);
        } else {
          const body = await readJson<{ message?: string; error?: string }>(response);
          setActionError({ eventId: id, message: body.message || body.error || `Dismiss failed (${response.status}).` });
        }
      } finally {
        setDismissing(null);
      }
    },
    [qc, key, onMutate, removeSuggestedLocally]
  );

  const modify = useCallback((id: string): void => {
    setActionError(null);
    setModifyingEventId(id);
  }, []);

  const closeModify = useCallback((): void => {
    setModifyingEventId(null);
  }, []);

  const letLarryExecute = useCallback(
    async (id: string): Promise<boolean> => {
      setExecuting(id);
      setActionError(null);
      try {
        const response = await fetch(`/api/workspace/larry/events/${id}/let-larry-execute`, { method: "POST" });
        if (response.ok) {
          window.dispatchEvent(new CustomEvent("larry:refresh-snapshot"));
          await Promise.all([qc.invalidateQueries({ queryKey: key }), onMutate()]);
          return true;
        }
        const body = await readJson<{ message?: string; error?: string }>(response);
        setActionError({ eventId: id, message: body.message || body.error || `Execution failed (${response.status}).` });
        return false;
      } catch {
        return false;
      } finally {
        setExecuting(null);
      }
    },
    [qc, key, onMutate]
  );

  return {
    suggested: data.suggested,
    activity: data.activity,
    conversations: data.conversations,
    loading: query.isLoading,
    error: data.error ?? (query.isError
      ? query.error instanceof Error ? query.error.message : "Failed to load action centre."
      : null),
    accepting,
    dismissing,
    modifying,
    modifyingEventId,
    executing,
    actionError,
    accept,
    dismiss,
    modify,
    closeModify,
    letLarryExecute,
    clearActionError,
    refresh: async () => {
      await query.refetch();
    },
  };
}
```

### Step 3: Run tests and typecheck

- [ ] Run:

```bash
cd apps/web && npm test && npx tsc --noEmit
```

Expected: all tests pass; TypeScript clean. If there's a `loading` state consumer that previously saw `true` on silent refetches, it now sees `false` (good — `query.isLoading` is true only for the first load, not for refetches).

### Step 4: Commit

- [ ] Run:

```bash
git add apps/web/src/hooks/useLarryActionCentre.ts
git commit -m "refactor(actionCentre): migrate read layer to TanStack Query (slice 4/5)"
git push
```

### Step 5: Manual preview check

- [ ] Open the Vercel preview URL for the branch. Log in as `launch-test-2026@larry-pm.com`. Navigate to a project workspace. Verify:
  - Action Centre loads
  - Suggestions appear after 30s polling (or focus events)
  - Accept / Dismiss / Let-Larry-Execute still work (still old code, just now sharing cache with `useQuery`)
  - No console errors

If anything is regressed, stop and fix before Slice 5.

---

## Slice 5 — Action Centre migration: mutations onto `withOptimistic`

Goal: replace the hand-rolled `accept`/`dismiss`/`letLarryExecute` with `useMutation({ mutationFn, ...withOptimistic(...), scope })`. Public surface unchanged. This is the proof.

**Files:**
- Modify: `apps/web/src/hooks/useLarryActionCentre.ts`

### Step 1: Replace the mutation layer

- [ ] Edit `apps/web/src/hooks/useLarryActionCentre.ts`. Add at the top:

```ts
import { useMutation } from "@tanstack/react-query";
import { withOptimistic } from "@/lib/optimistic";
```

- [ ] Replace the `accept`, `dismiss`, `letLarryExecute` callbacks and their associated `useState<string | null>` flags with TanStack Query mutations. Full replacement block (drop in place of the three `useCallback`-based mutations and their state hooks):

```ts
  const acceptMutation = useMutation<
    { event?: { actionType: string; displayText: string; projectName: string | null; projectId: string } },
    Error,
    string
  >({
    mutationFn: async (id) => {
      const response = await fetch(`/api/workspace/larry/events/${id}/accept`, { method: "POST" });
      const body = await readJson<{
        accepted: boolean;
        event?: { actionType: string; displayText: string; projectName: string | null; projectId: string };
        message?: string;
        error?: string;
      }>(response);
      if (!response.ok) throw new Error(body.message || body.error || `Action failed (${response.status}).`);
      return body;
    },
    scope: { id: "actionCentre-event" },   // serialises accept/dismiss/execute across any event id
    ...withOptimistic<string, { event?: { actionType: string; displayText: string; projectName: string | null; projectId: string } }>(qc, {
      affects: () => [key],
      optimistic: (c, id) =>
        c.setQueryData<WorkspaceProjectActionCentre>(key, (prev) =>
          prev ? { ...prev, suggested: prev.suggested.filter((e) => e.id !== id) } : prev
        ),
      reconcile: (c, _id, body) => {
        if (body.event && onAccepted) {
          const tag = getActionTypeTag(body.event.actionType);
          onAccepted({
            actionType: body.event.actionType,
            actionLabel: tag.label,
            actionColor: tag.color,
            displayText: body.event.displayText,
            projectName: body.event.projectName,
            projectId: body.event.projectId,
          });
        }
        window.dispatchEvent(new CustomEvent("larry:refresh-snapshot"));
        c.invalidateQueries({ queryKey: key });
        void onMutate();
      },
      onRollback: (err, id) => {
        setActionError({
          eventId: id,
          message: err instanceof Error ? err.message : `Action failed.`,
        });
      },
    }),
  });

  const dismissMutation = useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const response = await fetch(`/api/workspace/larry/events/${id}/dismiss`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        const body = await readJson<{ message?: string; error?: string }>(response);
        throw new Error(body.message || body.error || `Dismiss failed (${response.status}).`);
      }
    },
    scope: { id: "actionCentre-event" },
    ...withOptimistic<string, void>(qc, {
      affects: () => [key],
      optimistic: (c, id) =>
        c.setQueryData<WorkspaceProjectActionCentre>(key, (prev) =>
          prev ? { ...prev, suggested: prev.suggested.filter((e) => e.id !== id) } : prev
        ),
      reconcile: (c) => {
        window.dispatchEvent(new CustomEvent("larry:refresh-snapshot"));
        c.invalidateQueries({ queryKey: key });
        void onMutate();
      },
      onRollback: (err, id) => {
        setActionError({
          eventId: id,
          message: err instanceof Error ? err.message : "Dismiss failed.",
        });
      },
    }),
  });

  const executeMutation = useMutation<boolean, Error, string>({
    mutationFn: async (id) => {
      const response = await fetch(`/api/workspace/larry/events/${id}/let-larry-execute`, { method: "POST" });
      if (!response.ok) {
        const body = await readJson<{ message?: string; error?: string }>(response);
        throw new Error(body.message || body.error || `Execution failed (${response.status}).`);
      }
      return true;
    },
    scope: { id: "actionCentre-event" },
    ...withOptimistic<string, boolean>(qc, {
      affects: () => [key],
      optimistic: (c, id) =>
        c.setQueryData<WorkspaceProjectActionCentre>(key, (prev) => {
          if (!prev) return prev;
          // Mark event as executing inline — don't remove from list.
          return {
            ...prev,
            suggested: prev.suggested.map((e) =>
              e.id === id ? { ...e, executing: true } : e
            ),
          };
        }),
      reconcile: (c) => {
        window.dispatchEvent(new CustomEvent("larry:refresh-snapshot"));
        c.invalidateQueries({ queryKey: key });
        void onMutate();
      },
      onRollback: (err, id) => {
        setActionError({
          eventId: id,
          message: err instanceof Error ? err.message : "Execution failed.",
        });
      },
    }),
  });

  const accept = useCallback((id: string) => acceptMutation.mutate(id), [acceptMutation]);
  const dismiss = useCallback((id: string) => dismissMutation.mutate(id), [dismissMutation]);
  const letLarryExecute = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        await executeMutation.mutateAsync(id);
        return true;
      } catch {
        return false;
      }
    },
    [executeMutation]
  );

  // Derived pending flags — preserve the public (single-string | null) shape:
  const accepting = acceptMutation.isPending ? (acceptMutation.variables ?? null) : null;
  const dismissing = dismissMutation.isPending ? (dismissMutation.variables ?? null) : null;
  const executing = executeMutation.isPending ? (executeMutation.variables ?? null) : null;
```

- [ ] **Remove** the now-dead code: the `useState`s for `accepting`, `dismissing`, `executing`, the `removeSuggestedLocally` helper (still fine to keep but unused; remove it), and the old `accept`/`dismiss`/`letLarryExecute` `useCallback`s they replace.

- [ ] `modify` / `closeModify` / `modifying` / `modifyingEventId` / `actionError` / `setActionError` / `clearActionError` are **kept** — they're UI state not tied to a network call.

### Step 2: TypeScript check

- [ ] Run:

```bash
cd apps/web && npx tsc --noEmit
```

Expected: clean. If `WorkspaceProjectActionCentre.suggested`'s event type doesn't accept an `executing?: boolean` field, update the type in `apps/web/src/app/dashboard/types.ts` to add `executing?: boolean` to the suggested-event interface.

### Step 3: Run all tests

- [ ] Run:

```bash
cd apps/web && npm test
```

Expected: existing tests pass.

### Step 4: Commit

- [ ] Run:

```bash
git add apps/web/src/hooks/useLarryActionCentre.ts apps/web/src/app/dashboard/types.ts
git commit -m "feat(actionCentre): mutations use withOptimistic for instant UI (slice 5/5)"
git push
```

### Step 5: Manual preview check

- [ ] On the Vercel preview, in a browser dev-tools Network tab with throttling set to "Slow 3G":
  - **Click Accept on a suggestion.** The row disappears immediately. The network request fires in the background. When it returns, the toast appears (reconcile path).
  - **Accept a second suggestion, then immediately click the first again.** Second click is queued by `scope`; does not hit 409.
  - **Force a 500** (via a browser extension or devtools fetch intercept) on an accept call. The row **reappears** (rollback) and `actionError` state becomes visible at the consumer component (if it renders `actionError.message` inline).
  - **Dismiss** a suggestion. Same immediate-remove-with-rollback pattern.
  - **Let Larry Execute** a suggestion. Row shows an executing state immediately; rollback restores the prior non-executing state if the server 500s.

Confirm all five observations before moving on.

---

## Slice 6 — Hook integration tests

Goal: lock the Slice 5 behaviour in tests so future refactors can't regress it.

**Files:**
- Create: `apps/web/src/hooks/useLarryActionCentre.test.tsx`

### Step 1: Write integration tests

- [ ] Create `apps/web/src/hooks/useLarryActionCentre.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLarryActionCentre, actionCentreQueryKey } from "./useLarryActionCentre";
import { resetOptimisticState } from "@/lib/optimistic";
import type { ReactNode } from "react";

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: 0 },
    },
  });
}

function wrapper(qc: QueryClient) {
  return function Wrap({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

const SEED = {
  suggested: [
    { id: "evt1", type: "task_suggestion", displayText: "Do thing", actionType: "create_task", projectId: "p1", projectName: "Proj" },
    { id: "evt2", type: "task_suggestion", displayText: "Do other", actionType: "create_task", projectId: "p1", projectName: "Proj" },
  ],
  activity: [],
  conversations: [],
};

describe("useLarryActionCentre — mutations", () => {
  let qc: QueryClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetOptimisticState();
    qc = makeClient();
    qc.setQueryData(actionCentreQueryKey("p1"), SEED);
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(navigator, "onLine", { value: true, writable: true, configurable: true });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("accept removes the suggestion synchronously and reconciles on success", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ accepted: true, event: { actionType: "create_task", displayText: "Do thing", projectName: "Proj", projectId: "p1" } }), { status: 200 }));

    const onAccepted = vi.fn();
    const { result } = renderHook(() => useLarryActionCentre({ projectId: "p1", onAccepted }), { wrapper: wrapper(qc) });

    await waitFor(() => expect(result.current.suggested).toHaveLength(2));

    act(() => { result.current.accept("evt1"); });

    // Synchronous optimistic removal
    expect(result.current.suggested.map((e) => e.id)).toEqual(["evt2"]);

    await waitFor(() => expect(onAccepted).toHaveBeenCalled());
  });

  it("accept failure rolls back and sets actionError", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ message: "nope" }), { status: 500 }));

    const { result } = renderHook(() => useLarryActionCentre({ projectId: "p1" }), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.suggested).toHaveLength(2));

    act(() => { result.current.accept("evt1"); });
    // Optimistic removal applied
    expect(result.current.suggested).toHaveLength(1);

    await waitFor(() => expect(result.current.actionError).not.toBeNull());
    // Snapshot restored
    expect(result.current.suggested.map((e) => e.id).sort()).toEqual(["evt1", "evt2"]);
    expect(result.current.actionError?.eventId).toBe("evt1");
  });

  it("rapid double-click on accept does not issue two simultaneous requests (scope serialises)", async () => {
    // Gate the first response so we can fire a second before it resolves
    let resolveFirst!: (v: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((r) => { resolveFirst = r; }));
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ accepted: true }), { status: 200 }));

    const { result } = renderHook(() => useLarryActionCentre({ projectId: "p1" }), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.suggested).toHaveLength(2));

    act(() => { result.current.accept("evt1"); });
    act(() => { result.current.accept("evt2"); });

    // Scope=actionCentre-event queues the second; only one fetch has gone out.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFirst(new Response(JSON.stringify({ accepted: true }), { status: 200 }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("larry:refresh-snapshot event invalidates the action centre query", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(SEED), { status: 200 }));
    const { result } = renderHook(() => useLarryActionCentre({ projectId: "p1" }), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.suggested).toHaveLength(2));

    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    act(() => {
      window.dispatchEvent(new CustomEvent("larry:refresh-snapshot"));
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: actionCentreQueryKey("p1") });
  });
});
```

### Step 2: Run tests

- [ ] Run:

```bash
cd apps/web && npx vitest run src/hooks/useLarryActionCentre.test.tsx
```

Expected: all four tests PASS. If `scope` serialisation assertion fails because TanStack Query v5.59 gates require `scope.id` to be a per-entity string (rather than the shared `"actionCentre-event"` literal), switch the scopes to per-event ids: `scope: { id: `actionCentre-event:${idBeingAccepted}` }` — but that requires capturing `id` at mutation-call time. If you hit that, change the mutations to wrap with a closure factory, or use `mutationKey: ["actionCentre", "accept", id]` with `scope` derived from it. Document the workaround if it happens.

### Step 3: Commit

- [ ] Run:

```bash
git add apps/web/src/hooks/useLarryActionCentre.test.tsx
git commit -m "test(actionCentre): integration coverage for optimistic accept/dismiss/execute"
git push
```

### Step 4: CI check

- [ ] Watch the GitHub Actions "Backend CI" run on the branch. Both the vitest and the existing Playwright suites should stay green. If Playwright on the branch trips because of preview-URL env differences, triage — do not skip.

---

## Slice 7 — Playwright latency smoke (stretch; ship only if existing action-centre E2E exists)

Goal: a real-browser check that click-to-visual-latency is <50ms on throttled network.

### Step 1: Check for existing action-centre Playwright tests

- [ ] Run:

```bash
cd apps/web && ls e2e/ 2>/dev/null || ls tests/ 2>/dev/null
```

- [ ] Grep for existing action-centre E2E:

```bash
grep -ri "action.*centre" apps/web/e2e apps/web/tests 2>/dev/null || echo "none"
```

If none exist, **skip this slice** — a brand-new Playwright spec + auth setup is out of scope for this PR. Document the gap in the PR description.

### Step 2 (only if existing specs found): Extend the suite

- [ ] Add a spec that:
  1. Logs in as `launch-test-2026@larry-pm.com` / `TestLarry123%`
  2. Navigates to a project workspace with at least one suggestion
  3. Sets `await page.route("**/accept", route => setTimeout(() => route.continue(), 2000))` to inject 2s latency
  4. Clicks Accept, then `expect(page.locator('[data-testid=suggestion-evt1]')).not.toBeVisible({ timeout: 100 })` — the row must disappear within 100ms
  5. Confirms the toast fires after the 2s settles

### Step 3: Commit if added

- [ ] Run:

```bash
git add apps/web/e2e/
git commit -m "test(e2e): action centre optimistic latency smoke"
git push
```

---

## Final slice — Docs + PR

### Step 1: Update plan status

- [ ] Add a "Completion" note at the end of `docs/superpowers/plans/2026-04-18-optimistic-ui-pattern.md` with date and slice-by-slice result.

### Step 2: Open the PR

- [ ] Run:

```bash
gh pr create --title "feat(optimistic): reusable optimistic UI pattern + Action Centre migration" --body "$(cat <<'EOF'
## Summary
- New `withOptimistic` helper (`apps/web/src/lib/optimistic/`) — pure-function TanStack Query lifecycle bundle
- Temp-ID registry with per-id Promises so follow-up mutations await the swap
- Action Centre (`useLarryActionCentre`) migrated to TanStack Query + `withOptimistic`; public surface unchanged
- Spec: docs/superpowers/specs/2026-04-18-optimistic-ui-pattern-design.md
- Plan: docs/superpowers/plans/2026-04-18-optimistic-ui-pattern.md

## Test plan
- [ ] Unit: withOptimistic + tempIdRegistry green (`npm test`)
- [ ] Integration: useLarryActionCentre.test.tsx green
- [ ] Preview: accept/dismiss/execute instant-UI on throttled network
- [ ] Preview: forced 500 rolls back and sets actionError
- [ ] Preview: rapid double-click on accept does not 409
- [ ] Preview: dismiss / let-larry-execute show the same pattern

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

### Step 3: Link PR back to issues if applicable

- [ ] If there's a Larry issue for this, comment with the PR URL on it.

---

## Self-review notes (for the planner)

- **Slice 0 is non-negotiable.** Everything below depends on happy-dom + RTL.
- **Slice 3's test for "onError skips restoring a key if a newer op owns it"** deliberately asserts that the newer op's *optimistic* state is preserved — because the newer op hasn't yet settled. If B's success lands first, B's reconcile runs normally. If B fails after A already failed, both rollbacks fire but B's restores to its own snapshot (which was A's optimistic state, not the pristine). This chain is the intended behaviour; the alternative (always restore to pristine) deletes the newer user action.
- **`scope` behaviour in v5.59**: same-string scopes serialise. If two mutations with `scope: { id: "x" }` are triggered, the second runs only after the first fully settles. Slice 5 uses `"actionCentre-event"` as a single scope literal across accept/dismiss/execute, which serialises the lot — intentional, because the three endpoints target the same event-state machine server-side. Slice 6's third test exercises this; if it fails, the fallback is per-event scope (`"actionCentre-event:"+id`) which only serialises double-clicks on the same event — less strict but closer to user intent.
- **`larry:refresh-snapshot` event** stays wired in this hook because other hooks still dispatch it. Removing the event bus entirely is future work (one PR per migrated hook).
- **Offline edge case** is intentionally minimal — no persistent queue, documented as a known gap in the spec §14.

---

## Completion (2026-04-20)

| Slice | Commit | Tests | Notes |
|---|---|---|---|
| 0 — Test infra | `694a71c` | 72/72 green | RTL + happy-dom added; no existing tests broke |
| 1 — Temp-id registry | `40d3012` | 12 new (84 total) | Pure module, unused |
| 2 — `withOptimistic` core | `22c385c` | 8 new (92 total) | **Plan deviation:** `WithOptimisticHandlers` is now an explicit interface instead of `Pick<UseMutationOptions>` — the `Pick` approach broke test-site typechecking because v5.59's handler signatures take an extra `mutation` arg. TS contravariance on function args still lets callers spread the handlers into `useMutation`. |
| 3 — Stale-op guards + temp-id rewrite | `5b84f3e` | 4 new (96 total) | **Plan test bug fixed:** the "failSwap unblocks awaiters" test called `resolveId` *after* the rollback, but `failSwap` deletes the registry entry. Fixed to register the awaiter before the rollback. |
| 4 — Read layer to TanStack Query | `e844e24` | 96 (unchanged) | Hook shrank ~20%; public surface preserved; `loading` now only true on initial load (UX improvement, no flicker on poll) |
| 5 — Mutations on `withOptimistic` | `4c61d7e` | 96 (unchanged) | `WorkspaceLarryEvent.executing?: boolean` added as a client-only optimistic flag. Mutations use `scope: { id: "actionCentre-event" }` to serialise rapid clicks. |
| 6 — Hook integration tests | `e4e66d2` | 4 new (100 total) | **Test-infra fix:** `staleTime: Infinity` on test QueryClient so pre-seeded cache is honoured; test 2 uses a gated fetch to observe optimistic state before settlement; test 3 filters `/accept` calls from `/action-centre` refetches for a clean count. |
| 7 — Playwright latency smoke | *skipped* | — | Existing Playwright specs cover state transitions, not latency. Hook integration tests prove the synchronous optimistic contract more reliably than a real-browser timing assertion would. Deferred to follow-up. |

**Final state:**
- Branch: `feat/optimistic-ui-pattern`
- 100/100 web tests passing
- Worktree used: `C:\Dev\larry\larry-optimistic` (parallel-session isolation)
- Preview URL auto-deploys per commit
