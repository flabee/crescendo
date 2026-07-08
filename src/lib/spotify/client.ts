import type { PlaylistSummary, SpotifyTrack } from "./types";

type FetchLike = typeof fetch;
const API = "https://api.spotify.com/v1";

interface RawTrack {
  id: string;
  name: string;
  duration_ms: number;
  artists: Array<{ name: string }>;
  external_ids?: { isrc?: string };
}

function normalize(t: RawTrack): SpotifyTrack {
  return {
    id: t.id,
    title: t.name,
    artist: t.artists?.[0]?.name ?? "",
    durationMs: t.duration_ms,
    isrc: t.external_ids?.isrc,
  };
}

export class SpotifyClient {
  constructor(private token: string, private fetchImpl: FetchLike = fetch) {}

  private async req<T>(url: string, init?: RequestInit): Promise<T> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await this.fetchImpl(url, {
        ...init,
        headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
      });
      if (res.status === 429) {
        const retry = Number(res.headers.get("retry-after") ?? "1");
        await new Promise((r) => setTimeout(r, retry * 1000));
        continue;
      }
      if (!res.ok) throw new Error(`Spotify ${res.status}: ${url}`);
      return (await res.json()) as T;
    }
    throw new Error(`Spotify rate-limited after retries: ${url}`);
  }

  /** Follow `next` pagination, extracting tracks with `pick`. */
  private async paginate(startUrl: string, pick: (item: unknown) => RawTrack | null): Promise<SpotifyTrack[]> {
    const out: SpotifyTrack[] = [];
    let url: string | null = startUrl;
    while (url) {
      const page: { items: unknown[]; next: string | null } = await this.req<{ items: unknown[]; next: string | null }>(url);
      for (const item of page.items) {
        const raw = pick(item);
        if (raw?.id) out.push(normalize(raw));
      }
      url = page.next;
    }
    return out;
  }

  getLikedTracks(): Promise<SpotifyTrack[]> {
    return this.paginate(`${API}/me/tracks?limit=50`, (i) => (i as { track: RawTrack }).track);
  }

  getTopTracks(range: "short_term" | "medium_term" | "long_term" = "medium_term"): Promise<SpotifyTrack[]> {
    return this.paginate(`${API}/me/top/tracks?limit=50&time_range=${range}`, (i) => i as RawTrack);
  }

  getPlaylistTracks(playlistId: string): Promise<SpotifyTrack[]> {
    return this.paginate(`${API}/playlists/${playlistId}/tracks?limit=100`, (i) => (i as { track: RawTrack | null }).track);
  }

  searchTracks(query: string, limit = 50): Promise<SpotifyTrack[]> {
    const url = `${API}/search?type=track&limit=${limit}&q=${encodeURIComponent(query)}`;
    return this.req<{ tracks: { items: RawTrack[] } }>(url).then((r) => r.tracks.items.filter((t) => t?.id).map(normalize));
  }

  async getUserPlaylists(): Promise<PlaylistSummary[]> {
    const out: PlaylistSummary[] = [];
    let url: string | null = `${API}/me/playlists?limit=50`;
    while (url) {
      const page: { items: Array<{ id: string; name: string; tracks: { total: number } }>; next: string | null } =
        await this.req<{ items: Array<{ id: string; name: string; tracks: { total: number } }>; next: string | null }>(url);
      for (const p of page.items) out.push({ id: p.id, name: p.name, trackCount: p.tracks.total });
      url = page.next;
    }
    return out;
  }

  async getCurrentUserId(): Promise<string> {
    const me = await this.req<{ id: string }>(`${API}/me`);
    return me.id;
  }

  async createPlaylist(userId: string, name: string, description: string): Promise<string> {
    const res = await this.req<{ id: string }>(`${API}/users/${userId}/playlists`, {
      method: "POST",
      body: JSON.stringify({ name, description, public: false }),
    });
    return res.id;
  }

  async addTracks(playlistId: string, trackIds: string[]): Promise<void> {
    for (let i = 0; i < trackIds.length; i += 100) {
      const uris = trackIds.slice(i, i + 100).map((id) => `spotify:track:${id}`);
      await this.req(`${API}/playlists/${playlistId}/tracks`, { method: "POST", body: JSON.stringify({ uris }) });
    }
  }
}
