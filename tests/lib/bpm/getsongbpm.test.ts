import { describe, it, expect, vi, afterEach } from "vitest";
import { lookupGetSongBpm } from "@/lib/bpm/getsongbpm";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GETSONGBPM_API_KEY;
});

function mockFetch(json: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => json })));
}

describe("lookupGetSongBpm", () => {
  it("returns null when no API key is configured", async () => {
    delete process.env.GETSONGBPM_API_KEY;
    const res = await lookupGetSongBpm({ id: "s1", title: "T", artist: "A" });
    expect(res).toBeNull();
  });

  it("parses tempo from a search hit", async () => {
    process.env.GETSONGBPM_API_KEY = "k";
    mockFetch({ search: [{ tempo: "140", song_title: "T", artist: { name: "A" } }] });
    const res = await lookupGetSongBpm({ id: "s1", title: "T", artist: "A" });
    expect(res).toMatchObject({ bpm: 140, source: "getsongbpm" });
  });

  it("returns null on empty search", async () => {
    process.env.GETSONGBPM_API_KEY = "k";
    mockFetch({ search: [] });
    const res = await lookupGetSongBpm({ id: "s1", title: "T", artist: "A" });
    expect(res).toBeNull();
  });
});
