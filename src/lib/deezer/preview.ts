import type { TrackRef } from "@/lib/bpm/types";
import { titleArtistConfidence } from "@/lib/bpm/match";
import { fetchJson } from "@/lib/bpm/http";

const BASE = "https://api.deezer.com";

export interface DeezerPreviewResult {
  previewUrl: string;
  // Carried through from `ref.isrc` (Spotify's external_ids.isrc), not from
  // Deezer — Deezer's search results omit isrc (only the full `/track/{id}`
  // resource has it), and track_id is the table's real cache key regardless.
  isrc?: string;
  matchedTitle: string;
  matchedArtist: string;
  confidence: number;
}

interface DeezerTrack {
  preview?: string;
  title?: string;
  artist?: { name?: string };
}

/**
 * Deezer signals quota/errors as HTTP 200 with an `{ "error": {...} }` body.
 * Throw so the caller treats it as a failure rather than a clean "no preview" miss.
 */
function throwOnDeezerError(json: unknown): void {
  const err = (json as { error?: { code?: number; message?: string } } | null)?.error;
  if (err) {
    throw new Error(
      `Deezer API error: ${err.message ?? "unknown"}${err.code != null ? ` (code ${err.code})` : ""}`,
    );
  }
}

/**
 * Resolve a track to its Deezer 30s preview URL. Same matching strategy as
 * bpm/deezer.ts's lookupDeezer (ISRC first, then title+artist search scored by
 * dice-coefficient confidence) but extracts `preview` instead of `bpm`.
 */
export async function lookupDeezerPreview(ref: TrackRef): Promise<DeezerPreviewResult | null> {
  if (ref.isrc) {
    const t = await fetchJson<DeezerTrack>(
      `${BASE}/track/isrc:${encodeURIComponent(ref.isrc)}`,
      throwOnDeezerError,
    );
    if (t?.preview) {
      return {
        previewUrl: t.preview,
        isrc: ref.isrc,
        matchedTitle: t.title ?? ref.title,
        matchedArtist: t.artist?.name ?? ref.artist,
        confidence: 1,
      };
    }
  }

  // Strip embedded double-quotes so a title like Say "Hello" cannot break the
  // track:"..." artist:"..." field grouping.
  const title = ref.title.replace(/"/g, "");
  const artist = ref.artist.replace(/"/g, "");
  const q = encodeURIComponent(`track:"${title}" artist:"${artist}"`);
  const search = await fetchJson<{ data?: DeezerTrack[] }>(
    `${BASE}/search/track?q=${q}`,
    throwOnDeezerError,
  );

  let best: { hit: DeezerTrack; confidence: number } | null = null;
  for (const hit of search?.data ?? []) {
    if (!hit.preview) continue;
    const confidence = titleArtistConfidence(
      ref.title,
      ref.artist,
      hit.title ?? "",
      hit.artist?.name ?? "",
    );
    if (!best || confidence > best.confidence) best = { hit, confidence };
  }

  if (best?.hit.preview) {
    return {
      previewUrl: best.hit.preview,
      isrc: ref.isrc,
      matchedTitle: best.hit.title ?? ref.title,
      matchedArtist: best.hit.artist?.name ?? ref.artist,
      confidence: best.confidence,
    };
  }
  return null;
}
