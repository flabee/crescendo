import type { BpmCacheEntry } from "./types";
import seedData from "../../../data/bpm-cache.json";

export function loadSeed(): BpmCacheEntry[] {
  // The `as BpmCacheEntry[]` cast assumes trusted in-repo data; there is no runtime validation.
  return seedData as BpmCacheEntry[];
}
