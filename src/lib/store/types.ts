export type BpmSource = "deezer-isrc" | "deezer-search" | "getsongbpm";

export interface BpmCacheEntry {
  trackId: string;
  bpm: number;
  source: BpmSource;
  matchedTitle: string;
  matchedArtist: string;
  confidence: number; // 0..1
  fetchedAt: string; // ISO
}

export interface GenerationRecord {
  id: string;
  createdAt: string;
  params: {
    startBpm: number;
    endBpm: number;
    targetMinutes: number;
    sources: string[];
  };
  trackIds: string[];
  playlistId: string;
  fidelity: { maxDeviation: number; avgDeviation: number; widenedCount: number };
}

/**
 * Pluggable BPM cache + generation history store.
 *
 * READ-ONLY CONTRACT: Returned `BpmCacheEntry` / `GenerationRecord` objects must
 * be treated as read-only. Callers must not mutate them — adapters may return
 * shared references (e.g. the seed map or KV-deserialized objects) rather than
 * defensive copies.
 */
export interface Store {
  getBpm(trackId: string): Promise<BpmCacheEntry | null>;
  getManyBpm(trackIds: string[]): Promise<Record<string, BpmCacheEntry>>;
  putBpm(entry: BpmCacheEntry): Promise<void>;
  putGeneration(record: GenerationRecord): Promise<void>;
  listGenerations(): Promise<GenerationRecord[]>;
  /** true when history is durably persisted (KV configured) */
  readonly persistent: boolean;
}
