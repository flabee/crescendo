import { describe, it, expect, vi } from "vitest";
import { SpotifyClient } from "@/lib/spotify/client";

function jsonFetch(body: unknown) {
  return vi.fn(async () => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => body }));
}

describe("SpotifyClient artist methods", () => {
  it("searchArtists returns id+name from the artists.items shape", async () => {
    const f = jsonFetch({ artists: { items: [{ id: "art1", name: "Boards of Canada" }] } });
    const c = new SpotifyClient("t", f as never);
    expect(await c.searchArtists("boards of canada")).toEqual([{ id: "art1", name: "Boards of Canada" }]);
  });
  it("getArtistTopTracks normalizes tracks (with market param)", async () => {
    const f = jsonFetch({ tracks: [{ id: "1", name: "S", duration_ms: 1000, artists: [{ name: "A" }], external_ids: { isrc: "X" } }] });
    const c = new SpotifyClient("t", f as never);
    const out = await c.getArtistTopTracks("art1");
    expect(out).toEqual([{ id: "1", title: "S", artist: "A", durationMs: 1000, isrc: "X" }]);
    expect(String((f.mock.calls[0] as unknown[])[0])).toContain("market=");
  });
  it("getTopArtists returns names across pages", async () => {
    const f = jsonFetch({ items: [{ id: "a1", name: "Aphex Twin" }], next: null });
    const c = new SpotifyClient("t", f as never);
    expect(await c.getTopArtists()).toEqual([{ id: "a1", name: "Aphex Twin" }]);
  });
});
