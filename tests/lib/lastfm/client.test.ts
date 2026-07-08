import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { lastfmSimilar } from "@/lib/lastfm/client";

beforeEach(() => { delete process.env.LASTFM_API_KEY; });
afterEach(() => { vi.unstubAllGlobals(); delete process.env.LASTFM_API_KEY; });

describe("lastfmSimilar", () => {
  it("returns [] with no API key (no fetch)", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect(await lastfmSimilar("Radiohead")).toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });
  it("returns similar artist names when key is set", async () => {
    process.env.LASTFM_API_KEY = "k";
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ similarartists: { artist: [{ name: "Thom Yorke" }, { name: "Atoms for Peace" }] } }) })));
    expect(await lastfmSimilar("Radiohead")).toEqual(["Thom Yorke", "Atoms for Peace"]);
  });
  it("returns [] on error / malformed", async () => {
    process.env.LASTFM_API_KEY = "k";
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) })));
    expect(await lastfmSimilar("X")).toEqual([]);
  });
  it("returns [] when similarartists is missing (ok:true)", async () => {
    process.env.LASTFM_API_KEY = "k";
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })));
    expect(await lastfmSimilar("X")).toEqual([]);
  });
  it("returns [] when res.json() throws", async () => {
    process.env.LASTFM_API_KEY = "k";
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => { throw new Error("bad json"); } })));
    expect(await lastfmSimilar("X")).toEqual([]);
  });
});
