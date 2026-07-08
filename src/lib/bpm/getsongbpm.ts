import type { BpmLookupResult, TrackRef } from "./types";
import { titleArtistConfidence } from "./match";
import { fetchJson } from "./http";

const BASE = "https://api.getsong.co";

interface GsbHit {
  tempo?: string;
  song_title?: string;
  artist?: { name?: string };
}

export async function lookupGetSongBpm(ref: TrackRef): Promise<BpmLookupResult | null> {
  const key = process.env.GETSONGBPM_API_KEY;
  if (!key) return null;
  const lookup = encodeURIComponent(`song:${ref.title} artist:${ref.artist}`);
  const json = await fetchJson<{ search?: GsbHit[] }>(
    `${BASE}/search/?api_key=${key}&type=both&lookup=${lookup}`,
  );
  if (!json) return null;
  const hit = json.search?.find((h) => h.tempo && Number(h.tempo) > 0);
  if (!hit || !hit.tempo) return null;
  return {
    bpm: Number(hit.tempo),
    source: "getsongbpm",
    matchedTitle: hit.song_title ?? ref.title,
    matchedArtist: hit.artist?.name ?? ref.artist,
    confidence: titleArtistConfidence(ref.title, ref.artist, hit.song_title ?? "", hit.artist?.name ?? ""),
  };
}
