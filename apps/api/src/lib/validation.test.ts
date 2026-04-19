import { describe, expect, it } from "vitest";
import { emailSchema, passwordSchema } from "./validation.js";

describe("passwordSchema", () => {
  it("accepts a 12-char password with upper, digit, symbol", () => {
    expect(() => passwordSchema.parse("StrongPass1!")).not.toThrow();
  });

  it("rejects passwords under 12 characters", () => {
    // 11 chars — used to pass the old min-8 policy.
    expect(() => passwordSchema.parse("StrongPas1!")).toThrow(
      /12 characters/,
    );
  });

  it("rejects passwords missing an uppercase letter", () => {
    expect(() => passwordSchema.parse("lowercase123!")).toThrow(/uppercase/);
  });

  it("rejects passwords missing a digit", () => {
    expect(() => passwordSchema.parse("NoDigitsHere!")).toThrow(/number/);
  });

  it("rejects passwords missing a symbol", () => {
    expect(() => passwordSchema.parse("NoSymbols1234")).toThrow(/special/);
  });
});

describe("emailSchema", () => {
  it("lowercases the input", () => {
    expect(emailSchema.parse("Hello@Example.COM")).toBe("hello@example.com");
  });

  it("rejects invalid emails", () => {
    expect(() => emailSchema.parse("not-an-email")).toThrow();
  });

  it("trims leading/trailing whitespace before the email check", () => {
    expect(emailSchema.parse("  hello@example.com  ")).toBe("hello@example.com");
    expect(emailSchema.parse("\thello@example.com\n")).toBe("hello@example.com");
  });

  it("still rejects junk after trim", () => {
    expect(() => emailSchema.parse("  not-an-email  ")).toThrow();
  });
});
