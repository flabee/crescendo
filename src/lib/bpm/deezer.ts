import type { BpmLookupResult, TrackRef } from "./types";
import { titleArtistConfidence } from "./match";

const BASE = "https://api.deezer.com";

interface DeezerTrack {
  bpm?: number;
  title?: string;
  artist?: { name?: string };
}

async function getJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url);
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export async function lookupDeezer(ref: TrackRef): Promise<BpmLookupResult | null> {
  // 1. ISRC (most reliable)
  if (ref.isrc) {
    const t = await getJson<DeezerTrack>(`${BASE}/track/isrc:${encodeURIComponent(ref.isrc)}`);
    if (t && typeof t.bpm === "number" && t.bpm > 0) {
      return {
        bpm: t.bpm,
        source: "deezer-isrc",
        matchedTitle: t.title ?? ref.title,
        matchedArtist: t.artist?.name ?? ref.artist,
        confidence: 1,
      };
    }
  }
  // 2. title + artist search
  const q = encodeURIComponent(`track:"${ref.title}" artist:"${ref.artist}"`);
  const search = await getJson<{ data?: DeezerTrack[] }>(`${BASE}/search/track?q=${q}`);
  const hit = search?.data?.find((d) => typeof d.bpm === "number" && d.bpm > 0);
  if (hit && typeof hit.bpm === "number") {
    return {
      bpm: hit.bpm,
      source: "deezer-search",
      matchedTitle: hit.title ?? ref.title,
      matchedArtist: hit.artist?.name ?? ref.artist,
      confidence: titleArtistConfidence(ref.title, ref.artist, hit.title ?? "", hit.artist?.name ?? ""),
    };
  }
  return null;
}
