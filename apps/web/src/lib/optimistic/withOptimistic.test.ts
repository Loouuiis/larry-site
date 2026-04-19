import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { withOptimisticFor } from "./withOptimistic";
import { OfflineError } from "./errors";
import { resetOptimisticState, resolveId } from "./tempIdRegistry";

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
    await h.onMutate!({ id: "b" });

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

    const ctxA = await h.onMutate!({ id: "a" });
    await h.onMutate!({ id: "b" });

    await h.onError!(new Error("boom"), { id: "a" }, ctxA);

    expect(qc.getQueryData<ListCache>(key)?.items[0].id).toBe("b");
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
    // A follow-up mutation started awaiting BEFORE the rollback
    const pendingResolve = resolveId("temp_y");
    await h.onError!(new Error("parent failed"), { id: "temp_y" }, ctx);

    await expect(pendingResolve).rejects.toThrow("parent failed");
  });
});
