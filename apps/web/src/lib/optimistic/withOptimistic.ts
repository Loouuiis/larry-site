import type { QueryClient, QueryKey } from "@tanstack/react-query";
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

// Explicit handler interface — narrower than TanStack's UseMutationOptions handler
// signatures. When spread into useMutation({...}), TS allows our narrower-arg
// callbacks to satisfy TanStack's wider-arg ones (extra args are dropped).
export interface WithOptimisticHandlers<TVars, TData> {
  onMutate: (vars: TVars) => Promise<WithOptimisticCtx>;
  onError: (err: unknown, vars: TVars, ctx: WithOptimisticCtx | undefined) => void;
  onSuccess: (data: TData, vars: TVars, ctx: WithOptimisticCtx) => void;
  onSettled: (
    data: TData | undefined,
    err: unknown,
    vars: TVars,
    ctx: WithOptimisticCtx | undefined,
  ) => void;
}

// Factory variant: binds QueryClient explicitly — used by unit tests and by
// callers driving a mutation outside React.
export function withOptimisticFor(qc: QueryClient) {
  return function bound<TVars, TData>(
    opts: WithOptimisticOptions<TVars, TData>
  ): WithOptimisticHandlers<TVars, TData> {
    return buildHandlers(qc, opts);
  };
}

// Primary variant: caller provides qc (typically via `useQueryClient()`).
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
      // Restore snapshots; Slice 3 adds the opId-stale guard.
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
