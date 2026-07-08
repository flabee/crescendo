import { describe, it, expect, vi, afterEach } from "vitest";
import { deezerResolveArtistId, deezerRelatedNames } from "@/lib/artists/deezer-related";

afterEach(() => vi.unstubAllGlobals());
function mockFetch(handler: (url: string) => unknown) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, json: async () => handler(String(url)) })));
}

describe("deezer related", () => {
  it("resolves an artist id by name (first search hit)", async () => {
    mockFetch((u) => u.includes("/search/artist") ? { data: [{ id: 27, name: "Daft Punk" }] } : {});
    expect(await deezerResolveArtistId("Daft Punk")).toBe(27);
  });
  it("returns null when no artist found", async () => {
    mockFetch(() => ({ data: [] }));
    expect(await deezerResolveArtistId("Nobody")).toBeNull();
  });
  it("returns related artist names", async () => {
    mockFetch((u) => u.includes("/artist/27/related") ? { data: [{ id: 1, name: "Justice" }, { id: 2, name: "Cassius" }] } : {});
    expect(await deezerRelatedNames(27)).toEqual(["Justice", "Cassius"]);
  });
  it("returns [] when related data is absent (miss)", async () => {
    mockFetch(() => ({}));
    expect(await deezerRelatedNames(27)).toEqual([]);
  });
  it("degrades to null on a Deezer error-envelope response (quota)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mockFetch(() => ({ error: { code: 4, message: "Quota limit exceeded" } }));
    expect(await deezerResolveArtistId("Daft Punk")).toBeNull();
  });
  it("degrades to [] on a Deezer error-envelope response for related", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mockFetch(() => ({ error: { code: 4, message: "Quota limit exceeded" } }));
    expect(await deezerRelatedNames(27)).toEqual([]);
  });
});
