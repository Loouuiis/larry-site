import { describe, expect, it } from "vitest";
import { isLikelyFakeEmail } from "../src/fake-email-guard.js";

describe("isLikelyFakeEmail — worker escalation recipient guard", () => {
  it("returns true for .local TLDs (seed data)", () => {
    expect(isLikelyFakeEmail("sarah@larry.local")).toBe(true);
    expect(isLikelyFakeEmail("marcus@larry.local")).toBe(true);
    expect(isLikelyFakeEmail("dev@test.local")).toBe(true);
  });

  it("returns true for reserved test TLDs (RFC 2606)", () => {
    expect(isLikelyFakeEmail("user@foo.test")).toBe(true);
    expect(isLikelyFakeEmail("user@foo.invalid")).toBe(true);
    expect(isLikelyFakeEmail("user@foo.example")).toBe(true);
  });

  it("returns true for example.com / example.org / example.net", () => {
    expect(isLikelyFakeEmail("user@example.com")).toBe(true);
    expect(isLikelyFakeEmail("user@example.org")).toBe(true);
    expect(isLikelyFakeEmail("user@example.net")).toBe(true);
  });

  it("returns true for malformed or missing @", () => {
    expect(isLikelyFakeEmail("")).toBe(true);
    expect(isLikelyFakeEmail("no-at-sign")).toBe(true);
    expect(isLikelyFakeEmail("trailing@")).toBe(true);
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(isLikelyFakeEmail("USER@LARRY.LOCAL")).toBe(true);
    expect(isLikelyFakeEmail("  user@foo.TEST  ")).toBe(true);
  });

  it("returns false for real email addresses", () => {
    expect(isLikelyFakeEmail("louis@larry-pm.com")).toBe(false);
    expect(isLikelyFakeEmail("fergus@gmail.com")).toBe(false);
    expect(isLikelyFakeEmail("oreillfe@tcd.ie")).toBe(false);
    expect(isLikelyFakeEmail("user@company.co.uk")).toBe(false);
    expect(isLikelyFakeEmail("user@subdomain.example.io")).toBe(false);
  });

  it("does not match partial TLDs — e.g. .localhost should not match .local", () => {
    // .localhost isn't a real routable TLD either, but our guard is deliberately narrow
    // to the specific TLDs from RFC 2606 + the seed-data .local. Keeping this strict
    // so we don't accidentally block a real address that happens to contain a substring.
    expect(isLikelyFakeEmail("user@mylocal.com")).toBe(false);
    expect(isLikelyFakeEmail("user@example-fake.com")).toBe(false);
  });
});
