import { describe, it, expect, vi } from "vitest";
import { SpotifyClient } from "@/lib/spotify/client";

function seqFetch(responses: Array<{ status?: number; headers?: Record<string, string>; body: unknown }>) {
  let i = 0;
  return vi.fn(async () => {
    const r = responses[Math.min(i++, responses.length - 1)];
    return {
      ok: (r.status ?? 200) < 400,
      status: r.status ?? 200,
      headers: { get: (k: string) => (r.headers ?? {})[k.toLowerCase()] ?? null },
      json: async () => r.body,
    };
  });
}

describe("SpotifyClient", () => {
  it("normalizes liked tracks and follows pagination", async () => {
    const fetchMock = seqFetch([
      { body: { items: [{ track: { id: "1", name: "S1", duration_ms: 200000, artists: [{ name: "A1" }], external_ids: { isrc: "X1" } } }], next: "https://api.spotify.com/next" } },
      { body: { items: [{ track: { id: "2", name: "S2", duration_ms: 210000, artists: [{ name: "A2" }], external_ids: {} } }], next: null } },
    ]);
    const client = new SpotifyClient("tok", fetchMock as never);
    const tracks = await client.getLikedTracks();
    expect(tracks).toEqual([
      { id: "1", title: "S1", artist: "A1", durationMs: 200000, isrc: "X1" },
      { id: "2", title: "S2", artist: "A2", durationMs: 210000, isrc: undefined },
    ]);
  });

  it("retries after a 429 respecting Retry-After", async () => {
    const fetchMock = seqFetch([
      { status: 429, headers: { "retry-after": "0" }, body: {} },
      { body: { items: [], next: null } },
    ]);
    const client = new SpotifyClient("tok", fetchMock as never);
    const tracks = await client.getLikedTracks();
    expect(tracks).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
