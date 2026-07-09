import type { ArtistRef, PlaylistSummary, SpotifyTrack } from "./types";

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
    const maxAttempts = 3;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const res = await this.fetchImpl(url, {
        ...init,
        headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
      });
      // Retry rate limits (429) and transient server errors (5xx). Other
      // non-ok statuses (e.g. 4xx) are not retryable and throw immediately.
      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt < maxAttempts - 1) {
        // Sanitize Retry-After: default to 1s if missing/garbage/negative,
        // then cap at 4s so a rate-limited call fails fast (never hangs the
        // 60s Vercel function) — worst case ~8s across the retry budget.
        const raw = Number(res.headers.get("retry-after") ?? "1");
        const secs = Number.isFinite(raw) && raw >= 0 ? raw : 1;
        const delayMs = Math.min(secs, 4) * 1000;
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Spotify ${res.status}: ${url}${body ? " — " + body.slice(0, 300) : ""}`);
      }
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

  async searchTracks(query: string, limit = 50): Promise<SpotifyTrack[]> {
    const url = `${API}/search?type=track&limit=${limit}&q=${encodeURIComponent(query)}`;
    const r = await this.req<{ tracks: { items: RawTrack[] } }>(url);
    return r.tracks.items.filter((t) => t?.id).map(normalize);
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

  async searchArtists(name: string, limit = 5): Promise<ArtistRef[]> {
    const url = `${API}/search?type=artist&limit=${limit}&q=${encodeURIComponent(name)}`;
    const r = await this.req<{ artists: { items: Array<{ id: string; name: string }> } }>(url);
    return r.artists.items.filter((a) => a?.id).map((a) => ({ id: a.id, name: a.name }));
  }

  getArtistTopTracks(artistId: string, market = "US"): Promise<SpotifyTrack[]> {
    return this.req<{ tracks: RawTrack[] }>(`${API}/artists/${artistId}/top-tracks?market=${market}`)
      .then((r) => r.tracks.filter((t) => t?.id).map(normalize));
  }

  async getTopArtists(range: "short_term" | "medium_term" | "long_term" = "medium_term"): Promise<ArtistRef[]> {
    const out: ArtistRef[] = [];
    let url: string | null = `${API}/me/top/artists?limit=50&time_range=${range}`;
    while (url) {
      const page: { items: Array<{ id: string; name: string }>; next: string | null } =
        await this.req<{ items: Array<{ id: string; name: string }>; next: string | null }>(url);
      for (const a of page.items) if (a?.id) out.push({ id: a.id, name: a.name });
      url = page.next;
    }
    return out;
  }
}
