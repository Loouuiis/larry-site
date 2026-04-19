import { describe, it, expect } from "vitest";
import { CreateTaskSchema } from "./tasks.js";

const baseValid = {
  projectId: "550e8400-e29b-41d4-a716-446655440000",
  title: "A task",
};

describe("CreateTaskSchema — description field", () => {
  it("accepts a payload without description", () => {
    const r = CreateTaskSchema.safeParse(baseValid);
    expect(r.success).toBe(true);
  });

  it("accepts a short description", () => {
    const r = CreateTaskSchema.safeParse({ ...baseValid, description: "Short description." });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.description).toBe("Short description.");
  });

  it("accepts a description at the 4000 char limit", () => {
    const r = CreateTaskSchema.safeParse({ ...baseValid, description: "x".repeat(4000) });
    expect(r.success).toBe(true);
  });

  it("rejects a description over 4000 chars", () => {
    const r = CreateTaskSchema.safeParse({ ...baseValid, description: "x".repeat(4001) });
    expect(r.success).toBe(false);
  });

  it("rejects a non-string description", () => {
    const r = CreateTaskSchema.safeParse({ ...baseValid, description: 42 });
    expect(r.success).toBe(false);
  });
});
