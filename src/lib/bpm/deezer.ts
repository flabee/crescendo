import type { BpmLookupResult, TrackRef } from "./types";
import { titleArtistConfidence } from "./match";
import { fetchJson } from "./http";

const BASE = "https://api.deezer.com";

interface DeezerTrack {
  bpm?: number;
  title?: string;
  artist?: { name?: string };
}

interface DeezerError {
  error?: { code?: number; message?: string };
}

/**
 * Deezer signals quota/errors as HTTP 200 with an `{ "error": {...} }` body.
 * Throw so the orchestrator treats it as a failure (logged / retryable) rather
 * than a clean "no BPM" miss that would get cached as unmatched.
 */
function throwOnDeezerError(json: unknown): void {
  const err = (json as DeezerError | null)?.error;
  if (err) {
    throw new Error(
      `Deezer API error: ${err.message ?? "unknown"}${err.code != null ? ` (code ${err.code})` : ""}`,
    );
  }
}

export async function lookupDeezer(ref: TrackRef): Promise<BpmLookupResult | null> {
  // 1. ISRC (most reliable)
  if (ref.isrc) {
    const t = await fetchJson<DeezerTrack>(
      `${BASE}/track/isrc:${encodeURIComponent(ref.isrc)}`,
      throwOnDeezerError,
    );
    if (t && typeof t.bpm === "number" && t.bpm > 0) {
      return {
        bpm: Math.round(t.bpm),
        source: "deezer-isrc",
        matchedTitle: t.title ?? ref.title,
        matchedArtist: t.artist?.name ?? ref.artist,
        confidence: 1,
      };
    }
  }
  // 2. title + artist search. Strip embedded double-quotes so a title like
  //    Say "Hello" cannot break the track:"..." artist:"..." field grouping.
  const title = ref.title.replace(/"/g, "");
  const artist = ref.artist.replace(/"/g, "");
  const q = encodeURIComponent(`track:"${title}" artist:"${artist}"`);
  const search = await fetchJson<{ data?: DeezerTrack[] }>(
    `${BASE}/search/track?q=${q}`,
    throwOnDeezerError,
  );

  // Score every candidate with a usable bpm and keep the highest confidence
  // (ties resolve to the earlier candidate).
  let best: { hit: DeezerTrack; confidence: number } | null = null;
  for (const hit of search?.data ?? []) {
    if (typeof hit.bpm !== "number" || hit.bpm <= 0) continue;
    const confidence = titleArtistConfidence(
      ref.title,
      ref.artist,
      hit.title ?? "",
      hit.artist?.name ?? "",
    );
    if (!best || confidence > best.confidence) best = { hit, confidence };
  }

  if (best && typeof best.hit.bpm === "number") {
    return {
      bpm: Math.round(best.hit.bpm),
      source: "deezer-search",
      matchedTitle: best.hit.title ?? ref.title,
      matchedArtist: best.hit.artist?.name ?? ref.artist,
      confidence: best.confidence,
    };
  }
  return null;
}
