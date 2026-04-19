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
    setKeyOpId(key, 2);
    clearKeyOpId(key, 1);
    expect(getKeyOpId(key)).toBe(2);
  });

  it("resetOptimisticState clears registry and counter", () => {
    const temp = createTempId();
    registerPending(temp);
    setKeyOpId(["k"], 99);
    resetOptimisticState();
    expect(getKeyOpId(["k"])).toBeUndefined();
    expect(nextOpId()).toBe(1);
  });
});
