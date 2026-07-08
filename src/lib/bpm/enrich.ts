import type { Store, BpmCacheEntry } from "../store/types";
import type { BpmLookupResult, TrackRef } from "./types";
import { lookupDeezer } from "./deezer";
import { lookupGetSongBpm } from "./getsongbpm";

export interface EnrichDeps {
  deezer?: (ref: TrackRef) => Promise<BpmLookupResult | null>;
  gsb?: (ref: TrackRef) => Promise<BpmLookupResult | null>;
  now?: () => string;
}

export interface EnrichOutput {
  matched: BpmCacheEntry[];
  unmatched: string[];
}

/**
 * Minimum match confidence required to accept + cache a result. ISRC matches
 * carry confidence 1 so they always pass; only fuzzy deezer-search / getsongbpm
 * matches can be rejected. Because cache-first makes matches permanent, a weak
 * low-confidence match must never be persisted.
 */
export const MIN_CONFIDENCE = 0.5;

/**
 * Run a source lookup defensively:
 * - A thrown error (network failure, timeout, quota error) is logged and treated
 *   as "no result" (null) so one track's failure never aborts the batch.
 * - A result below MIN_CONFIDENCE is rejected (treated as no result) so the
 *   caller falls through to the next source and never caches a weak match.
 */
async function tryLookup(
  fn: (ref: TrackRef) => Promise<BpmLookupResult | null>,
  ref: TrackRef,
  label: string,
): Promise<BpmLookupResult | null> {
  try {
    const result = await fn(ref);
    if (result && result.confidence < MIN_CONFIDENCE) return null;
    return result;
  } catch (err) {
    console.warn(`[enrich] ${label} lookup failed for track "${ref.id}":`, err);
    return null;
  }
}

export async function enrichTracks(
  refs: TrackRef[],
  store: Store,
  deps: EnrichDeps = {},
): Promise<EnrichOutput> {
  const deezer = deps.deezer ?? lookupDeezer;
  const gsb = deps.gsb ?? lookupGetSongBpm;
  const now = deps.now ?? (() => new Date().toISOString());

  const cached = await store.getManyBpm(refs.map((r) => r.id));
  const matched: BpmCacheEntry[] = [];
  const unmatched: string[] = [];

  for (const ref of refs) {
    if (cached[ref.id]) {
      matched.push(cached[ref.id]);
      continue;
    }
    // Deezer first; if it yields no result (null, throws, or below-threshold),
    // fall through to gsb.
    const result = (await tryLookup(deezer, ref, "deezer")) ?? (await tryLookup(gsb, ref, "getsongbpm"));
    if (!result) {
      unmatched.push(ref.id);
      continue;
    }
    const entry: BpmCacheEntry = {
      trackId: ref.id,
      bpm: result.bpm,
      source: result.source,
      matchedTitle: result.matchedTitle,
      matchedArtist: result.matchedArtist,
      confidence: result.confidence,
      fetchedAt: now(),
    };
    await store.putBpm(entry);
    matched.push(entry);
  }

  return { matched, unmatched };
}
