import { describe, it, expect, vi, afterEach } from "vitest";
import { refreshSpotifyToken } from "@/lib/auth/refresh";

afterEach(() => vi.unstubAllGlobals());

describe("refreshSpotifyToken", () => {
  it("returns new access token and expiry on success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ access_token: "new", expires_in: 3600 }),
    })));
    const out = await refreshSpotifyToken("refresh-tok", "id", "secret", () => 1_000_000);
    expect(out.accessToken).toBe("new");
    expect(out.expiresAt).toBe(1_000_000 + 3600 * 1000);
    expect(out.error).toBeUndefined();
  });

  it("returns an error marker on failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) })));
    const out = await refreshSpotifyToken("refresh-tok", "id", "secret", () => 0);
    expect(out.error).toBe("RefreshFailed");
  });
});
