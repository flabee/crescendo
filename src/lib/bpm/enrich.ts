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
 * Run a source lookup defensively: a thrown error (network failure, timeout,
 * bad response) is treated as "no result" (null) so one track's failure never
 * aborts the batch.
 */
async function tryLookup(
  fn: (ref: TrackRef) => Promise<BpmLookupResult | null>,
  ref: TrackRef,
): Promise<BpmLookupResult | null> {
  try {
    return await fn(ref);
  } catch {
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
    // Deezer first; if it yields no result (null OR throws), fall through to gsb.
    const result = (await tryLookup(deezer, ref)) ?? (await tryLookup(gsb, ref));
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
