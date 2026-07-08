import type { SpotifyTrack } from "../spotify/types";

export function dedupeTracks(tracks: SpotifyTrack[]): SpotifyTrack[] {
  const seenIds = new Set<string>();
  const seenIsrc = new Set<string>();
  const out: SpotifyTrack[] = [];
  for (const t of tracks) {
    if (seenIds.has(t.id)) continue;
    if (t.isrc && seenIsrc.has(t.isrc)) continue;
    seenIds.add(t.id);
    if (t.isrc) seenIsrc.add(t.isrc);
    out.push(t);
  }
  return out;
}
