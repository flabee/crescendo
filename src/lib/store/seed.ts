import type { BpmCacheEntry } from "./types";
import seedData from "../../../data/bpm-cache.json";

export function loadSeed(): BpmCacheEntry[] {
  return seedData as BpmCacheEntry[];
}
