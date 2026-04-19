// Module-level singleton registry for optimistic UI updates.
// Two jobs: (a) track temp → real id swaps with a Promise per temp id so
// follow-up mutations await the swap; (b) stamp an opId on every affected
// query key so stale successes/rollbacks can be detected and skipped.

type Pending = {
  promise: Promise<string>;
  resolve: (id: string) => void;
  reject: (err: Error) => void;
  realId?: string;
};

const TEMP_PREFIXES = new Set<string>(["temp", "draft"]);

let tempCounter = 0;
const registry = new Map<string, Pending>();

let opCounter = 0;
const keyOpIds = new Map<string, number>();

function randomSuffix(): string {
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
  if (!entry) return Promise.resolve(id);
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
  const current = keyOpIds.get(keyToString(key));
  if (current === opId) keyOpIds.delete(keyToString(key));
}

// ---- test helpers ---------------------------------------------------

export function resetOptimisticState(): void {
  registry.clear();
  keyOpIds.clear();
  tempCounter = 0;
  opCounter = 0;
  TEMP_PREFIXES.clear();
  TEMP_PREFIXES.add("temp");
  TEMP_PREFIXES.add("draft");
}
