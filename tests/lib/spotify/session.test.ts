import { describe, it, expect } from "vitest";
import { tokenFromSession } from "@/lib/spotify/session";

describe("tokenFromSession", () => {
  it("returns the access token when present", () => {
    expect(tokenFromSession({ accessToken: "tok" })).toBe("tok");
  });
  it("throws when the session has a refresh error", () => {
    expect(() => tokenFromSession({ accessToken: "tok", error: "RefreshFailed" })).toThrow(/re-?login/i);
  });
  it("throws when no token", () => {
    expect(() => tokenFromSession({})).toThrow(/not authenticated/i);
  });
});
