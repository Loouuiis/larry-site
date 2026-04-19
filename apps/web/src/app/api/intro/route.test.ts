import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Resend before importing the route
const mockSend = vi.fn().mockResolvedValue({ data: { id: "test-id" }, error: null });
vi.mock("resend", () => ({
  Resend: vi.fn(() => ({ emails: { send: mockSend } })),
}));

import { POST } from "./route";

function makeRequest(body: unknown, ip = "1.2.3.4") {
  return new Request("http://localhost/api/intro", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/intro", () => {
  beforeEach(() => {
    mockSend.mockClear();
    process.env.RESEND_API_KEY = "test-key";
  });

  it("accepts a well-formed intro request and sends email to anna.wigrena@gmail.com", async () => {
    const req = makeRequest(
      {
        firstName: "Fergus",
        lastName: "O'Reilly",
        email: "fergus@larry.dev",
        company: "Larry",
        jobTitle: "Founder",
        comment: "Looking forward to a call.",
        marketingConsent: true,
      },
      // Use a unique IP so it is never rate-limited by prior test runs
      "10.0.0.1",
    );
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(mockSend).toHaveBeenCalledOnce();
    const call = mockSend.mock.calls[0][0];
    expect(call.to).toEqual(["anna.wigrena@gmail.com"]);
    expect(call.subject).toContain("Fergus O'Reilly");
    expect(call.subject).toContain("Larry");
    expect(call.html).toContain("fergus@larry.dev");
    expect(call.html).toContain("Looking forward to a call.");
  });

  it("rejects missing required fields with 400", async () => {
    const req = makeRequest({ firstName: "A", email: "x@y.z" }, "10.0.0.2");
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("rejects invalid email with 400", async () => {
    const req = makeRequest(
      {
        firstName: "A",
        lastName: "B",
        email: "not-an-email",
        company: "C",
        jobTitle: "D",
        marketingConsent: false,
      },
      "10.0.0.3",
    );
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 429 when rate limit is exceeded", async () => {
    // Exhaust the 3-request in-memory limit for a unique IP
    const ip = "10.0.0.42";
    const validBody = {
      firstName: "A",
      lastName: "B",
      email: "a@b.c",
      company: "C",
      jobTitle: "D",
      marketingConsent: false,
    };

    // Three successful requests (limit is 3 per window)
    await POST(makeRequest(validBody, ip));
    await POST(makeRequest(validBody, ip));
    await POST(makeRequest(validBody, ip));

    // Fourth must be rejected
    const res = await POST(makeRequest(validBody, ip));
    expect(res.status).toBe(429);
  });
});
