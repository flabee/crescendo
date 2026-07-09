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
      text: async () => (typeof r.body === "string" ? r.body : JSON.stringify(r.body)),
    };
  });
}

function rawTrack(id: string, extra: Record<string, unknown> = {}) {
  return { id, name: `S${id}`, duration_ms: 200000, artists: [{ name: `A${id}` }], external_ids: {}, ...extra };
}

// Parsed JSON body for the Nth fetch call.
function bodyOf(mock: ReturnType<typeof vi.fn>, call: number): Record<string, unknown> {
  const init = mock.mock.calls[call][1] as RequestInit;
  return JSON.parse(init.body as string);
}

// URL of the Nth fetch call.
function urlOf(mock: ReturnType<typeof vi.fn>, call: number): string {
  return mock.mock.calls[call][0] as string;
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

  describe("addTracks", () => {
    it("does not call fetch for an empty id list", async () => {
      const fetchMock = seqFetch([{ body: {} }]);
      const client = new SpotifyClient("tok", fetchMock as never);
      await client.addTracks("pl", []);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("sends exactly one request for 100 ids with spotify:track uris", async () => {
      const fetchMock = seqFetch([{ body: {} }]);
      const client = new SpotifyClient("tok", fetchMock as never);
      const ids = Array.from({ length: 100 }, (_, i) => `id${i}`);
      await client.addTracks("pl", ids);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(urlOf(fetchMock, 0)).toBe("https://api.spotify.com/v1/playlists/pl/tracks");
      const uris = bodyOf(fetchMock, 0).uris as string[];
      expect(uris).toHaveLength(100);
      expect(uris[0]).toBe("spotify:track:id0");
      expect(uris[99]).toBe("spotify:track:id99");
    });

    it("batches 101 ids into two requests of 100 then 1", async () => {
      const fetchMock = seqFetch([{ body: {} }]);
      const client = new SpotifyClient("tok", fetchMock as never);
      const ids = Array.from({ length: 101 }, (_, i) => `id${i}`);
      await client.addTracks("pl", ids);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(bodyOf(fetchMock, 0).uris as string[]).toHaveLength(100);
      const second = bodyOf(fetchMock, 1).uris as string[];
      expect(second).toEqual(["spotify:track:id100"]);
    });
  });

  describe("createPlaylist", () => {
    it("POSTs to /users/<id>/playlists with the right body and returns id", async () => {
      const fetchMock = seqFetch([{ body: { id: "new-pl" } }]);
      const client = new SpotifyClient("tok", fetchMock as never);
      const id = await client.createPlaylist("user1", "My List", "desc");
      expect(id).toBe("new-pl");
      expect(urlOf(fetchMock, 0)).toBe("https://api.spotify.com/v1/users/user1/playlists");
      expect(bodyOf(fetchMock, 0)).toEqual({ name: "My List", description: "desc", public: false });
    });
  });

  describe("getUserPlaylists", () => {
    it("paginates and maps to PlaylistSummary", async () => {
      const fetchMock = seqFetch([
        { body: { items: [{ id: "p1", name: "One", tracks: { total: 5 } }], next: "https://api.spotify.com/next" } },
        { body: { items: [{ id: "p2", name: "Two", tracks: { total: 12 } }], next: null } },
      ]);
      const client = new SpotifyClient("tok", fetchMock as never);
      const playlists = await client.getUserPlaylists();
      expect(playlists).toEqual([
        { id: "p1", name: "One", trackCount: 5 },
        { id: "p2", name: "Two", trackCount: 12 },
      ]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe("searchTracks", () => {
    it("reads nested tracks.items, filters idless entries, normalizes", async () => {
      const fetchMock = seqFetch([
        { body: { tracks: { items: [rawTrack("1", { external_ids: { isrc: "I1" } }), { name: "no id" }, rawTrack("2")] } } },
      ]);
      const client = new SpotifyClient("tok", fetchMock as never);
      const tracks = await client.searchTracks("hello world");
      expect(tracks).toEqual([
        { id: "1", title: "S1", artist: "A1", durationMs: 200000, isrc: "I1" },
        { id: "2", title: "S2", artist: "A2", durationMs: 200000, isrc: undefined },
      ]);
      expect(urlOf(fetchMock, 0)).toContain("q=hello%20world");
    });
  });

  describe("getTopTracks", () => {
    it("includes the time_range param", async () => {
      const fetchMock = seqFetch([{ body: { items: [rawTrack("1")], next: null } }]);
      const client = new SpotifyClient("tok", fetchMock as never);
      await client.getTopTracks("short_term");
      expect(urlOf(fetchMock, 0)).toContain("time_range=short_term");
    });
  });

  describe("getPlaylistTracks", () => {
    it("skips null tracks", async () => {
      const fetchMock = seqFetch([
        { body: { items: [{ track: rawTrack("1") }, { track: null }, { track: rawTrack("2") }], next: null } },
      ]);
      const client = new SpotifyClient("tok", fetchMock as never);
      const tracks = await client.getPlaylistTracks("pl");
      expect(tracks.map((t) => t.id)).toEqual(["1", "2"]);
    });
  });

  describe("getCurrentUserId", () => {
    it("returns me.id", async () => {
      const fetchMock = seqFetch([{ body: { id: "me123" } }]);
      const client = new SpotifyClient("tok", fetchMock as never);
      expect(await client.getCurrentUserId()).toBe("me123");
      expect(urlOf(fetchMock, 0)).toBe("https://api.spotify.com/v1/me");
    });
  });

  describe("retry / error handling", () => {
    it("throws after 3 consecutive 429s", async () => {
      const fetchMock = seqFetch([{ status: 429, headers: { "retry-after": "0" }, body: {} }]);
      const client = new SpotifyClient("tok", fetchMock as never);
      await expect(client.getLikedTracks()).rejects.toThrow();
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("throws immediately on a non-retryable 404", async () => {
      const fetchMock = seqFetch([{ status: 404, body: {} }]);
      const client = new SpotifyClient("tok", fetchMock as never);
      await expect(client.getLikedTracks()).rejects.toThrow(/404/);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("survives a garbage Retry-After header and then succeeds", async () => {
      const fetchMock = seqFetch([
        { status: 429, headers: { "retry-after": "abc" }, body: {} },
        { body: { items: [], next: null } },
      ]);
      const client = new SpotifyClient("tok", fetchMock as never);
      const tracks = await client.getLikedTracks();
      expect(tracks).toEqual([]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("retries transient 5xx (503 then 200)", async () => {
      const fetchMock = seqFetch([
        { status: 503, body: {} },
        { body: { items: [], next: null } },
      ]);
      const client = new SpotifyClient("tok", fetchMock as never);
      const tracks = await client.getLikedTracks();
      expect(tracks).toEqual([]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
