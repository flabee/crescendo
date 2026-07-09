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

  it("picks the highest-confidence search candidate, not the first", async () => {
    mockFetch((url) => {
      if (url.includes("/search/track")) {
        return {
          data: [
            { bpm: 100, title: "Totally Different Song", artist: { name: "Artist" } },
            { bpm: 128, title: "Song", artist: { name: "Artist" } },
          ],
        };
      }
      return {};
    });
    const res = await lookupDeezer({ id: "s1", title: "Song", artist: "Artist" });
    expect(res).toMatchObject({ bpm: 128, source: "deezer-search" });
  });

  it("throws when Deezer returns an error envelope (HTTP 200 with error body)", async () => {
    mockFetch((url) => {
      if (url.includes("/track/isrc:USRC")) return { error: { code: 4, message: "Quota limit exceeded" } };
      return {};
    });
    await expect(lookupDeezer({ id: "s1", title: "Song", artist: "Artist", isrc: "USRC" })).rejects.toThrow(
      /Quota limit exceeded/,
    );
  });

  it("rounds a fractional bpm to the nearest integer", async () => {
    mockFetch((url) => {
      if (url.includes("/track/isrc:USRC")) return { bpm: 148.19, title: "Song", artist: { name: "Artist" } };
      throw new Error("should not reach search");
    });
    const res = await lookupDeezer({ id: "s1", title: "Song", artist: "Artist", isrc: "USRC" });
    expect(res).toMatchObject({ bpm: 148, source: "deezer-isrc" });
  });

  it("strips embedded double-quotes from title/artist in the search query", async () => {
    let seen = "";
    mockFetch((url) => {
      if (url.includes("/search/track")) {
        seen = url;
        return { data: [] };
      }
      return {};
    });
    await lookupDeezer({ id: "s1", title: 'Say "Hello"', artist: "A" });
    // Decode the query and confirm the field grouping isn't corrupted by an inner quote.
    const decoded = decodeURIComponent(seen);
    expect(decoded).toContain('track:"Say Hello"');
    expect(decoded).not.toContain('"Hello""');
  });
});
