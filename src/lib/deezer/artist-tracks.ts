import { fetchJson } from "@/lib/bpm/http";
import type { SpotifyTrack } from "@/lib/spotify/types";

const BASE = "https://api.deezer.com";

interface DeezerSearchItem {
  id: number;
  title: string;
  artist?: { name?: string };
  duration?: number;
}

interface DeezerFullTrack {
  isrc?: string;
  bpm?: number;
}

/**
 * Deezer signals quota/errors as HTTP 200 with an `{ error: {...} }` body.
 * Throw so the caller's try/catch treats it as a failure (skipped) rather than
 * a clean miss.
 */
function throwOnDeezerError(json: unknown): void {
  if (json && typeof json === "object" && "error" in json) {
    throw new Error("deezer error");
  }
}

/**
 * Fetch an artist's top tracks from Deezer (keyless), carrying ISRC + BPM.
 *
 * The `/search/track` list lacks isrc/bpm, so we resolve each hit via
 * `/track/${id}`. Tracks without an ISRC are skipped (we need it as the stable
 * id downstream). Many Deezer tracks report `bpm: 0` (unknown) — that's kept as
 * 0 (the curve step excludes them later). Per-track calls are paced ~120ms to
 * stay under Deezer's ~50/5s keyless limit. Individual failures are isolated.
 */
export async function deezerArtistTracks(
  artistName: string,
  limit = 8,
): Promise<SpotifyTrack[]> {
  const name = artistName.replace(/["\\]/g, " ").trim();
  if (!name) return [];

  let list: DeezerSearchItem[];
  try {
    const q = `artist:"${name}"`;
    const search = await fetchJson<{ data?: DeezerSearchItem[] }>(
      `${BASE}/search/track?q=${encodeURIComponent(q)}&limit=${limit}`,
      throwOnDeezerError,
    );
    list = search?.data ?? [];
  } catch (err) {
    console.warn(`deezerArtistTracks search failed for "${artistName}":`, err);
    return [];
  }

  const results: SpotifyTrack[] = [];
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    // Pace the per-track calls (except before the first) to stay under the
    // keyless ~50/5s limit.
    if (i > 0) await new Promise((r) => setTimeout(r, 120));
    try {
      const full = await fetchJson<DeezerFullTrack>(
        `${BASE}/track/${item.id}`,
        throwOnDeezerError,
      );
      const isrc = full?.isrc;
      if (!isrc) continue; // need a stable id downstream
      results.push({
        id: isrc,
        title: item.title,
        artist: item.artist?.name ?? "",
        durationMs: (item.duration ?? 0) * 1000,
        isrc,
        bpm: Math.round(full?.bpm ?? 0),
      });
    } catch (err) {
      console.warn(`deezerArtistTracks track ${item.id} failed:`, err);
    }
  }
  return results;
}
