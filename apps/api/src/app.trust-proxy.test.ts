import { describe, expect, it } from "vitest";
import Fastify from "fastify";

// Verifies Fastify's trustProxy semantics independently of the whole app —
// if this test passes, a createApp() that sets `trustProxy: true` will
// correctly report the real client IP behind Railway's proxy.
describe("Fastify trustProxy", () => {
  it("reports X-Forwarded-For as request.ip when trustProxy is true", async () => {
    const app = Fastify({ trustProxy: true });
    app.get("/whoami", async (req) => ({ ip: req.ip }));
    const res = await app.inject({
      method: "GET",
      url: "/whoami",
      headers: { "x-forwarded-for": "203.0.113.7" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ip: "203.0.113.7" });
    await app.close();
  });

  it("ignores X-Forwarded-For when trustProxy is false (default)", async () => {
    const app = Fastify();
    app.get("/whoami", async (req) => ({ ip: req.ip }));
    const res = await app.inject({
      method: "GET",
      url: "/whoami",
      headers: { "x-forwarded-for": "203.0.113.7" },
    });
    expect(res.statusCode).toBe(200);
    // Without trustProxy, the "real" IP is the socket peer, which in inject is "127.0.0.1".
    expect(res.json().ip).not.toBe("203.0.113.7");
    await app.close();
  });
});
