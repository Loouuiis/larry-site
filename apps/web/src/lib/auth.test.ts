import { beforeEach, describe, expect, it } from "vitest";
import { jwtVerify } from "jose";
import {
  apiTokensCookieOptions,
  createSessionToken,
} from "./auth";
import { getSessionSecret } from "./session-secret";

describe("web auth cookies", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = "a".repeat(48);
  });

  it("keeps API bearer tokens out of the signed session JWT", async () => {
    const { token } = await createSessionToken({
      userId: "user-1",
      tenantId: "tenant-1",
      apiAccessToken: "api-access-token",
      apiRefreshToken: "api-refresh-token",
      authMode: "api",
    });

    const { payload } = await jwtVerify(token, getSessionSecret());

    expect(payload.apiAccessToken).toBeUndefined();
    expect(payload.apiRefreshToken).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain("api-refresh-token");
  });

  it("stores API bearer tokens in a separate encrypted cookie value", async () => {
    const cookie = await apiTokensCookieOptions({
      userId: "user-1",
      tenantId: "tenant-1",
      apiAccessToken: "api-access-token",
      apiRefreshToken: "api-refresh-token",
      authMode: "api",
    });

    expect(cookie.name).toBe("larry_api_tokens");
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.value).not.toContain("api-access-token");
    expect(cookie.value).not.toContain("api-refresh-token");
    expect(cookie.value.split(".")).toHaveLength(5);
  });
});
