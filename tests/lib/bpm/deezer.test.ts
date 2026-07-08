import { describe, it, expect, vi, afterEach } from "vitest";
import { lookupDeezer } from "@/lib/bpm/deezer";

function mockFetch(handler: (url: string) => unknown) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => ({
    ok: true,
    json: async () => handler(String(url)),
  })));
}

afterEach(() => vi.unstubAllGlobals());

describe("lookupDeezer", () => {
  it("uses ISRC endpoint first and returns bpm with confidence 1", async () => {
    mockFetch((url) => {
      if (url.includes("/track/isrc:USRC")) return { bpm: 123, title: "Song", artist: { name: "Artist" } };
      throw new Error("should not reach search");
    });
    const res = await lookupDeezer({ id: "s1", title: "Song", artist: "Artist", isrc: "USRC" });
    expect(res).toMatchObject({ bpm: 123, source: "deezer-isrc", confidence: 1 });
  });

  it("ignores ISRC hit with bpm 0 and falls through to search", async () => {
    mockFetch((url) => {
      if (url.includes("/track/isrc:USRC")) return { bpm: 0, title: "Song", artist: { name: "Artist" } };
      if (url.includes("/search/track")) return { data: [{ bpm: 128, title: "Song", artist: { name: "Artist" } }] };
      return {};
    });
    const res = await lookupDeezer({ id: "s1", title: "Song", artist: "Artist", isrc: "USRC" });
    expect(res).toMatchObject({ bpm: 128, source: "deezer-search" });
  });

  it("returns null when nothing has a usable bpm", async () => {
    mockFetch(() => ({ data: [] }));
    const res = await lookupDeezer({ id: "s1", title: "X", artist: "Y" });
    expect(res).toBeNull();
  });
});
