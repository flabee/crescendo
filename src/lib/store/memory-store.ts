import type { BpmCacheEntry, GenerationRecord, Store } from "./types";

export class MemoryStore implements Store {
  readonly persistent = false;
  private bpm = new Map<string, BpmCacheEntry>();
  private generations: GenerationRecord[] = [];

  constructor(seed: BpmCacheEntry[] = []) {
    for (const e of seed) this.bpm.set(e.trackId, e);
  }

  async getBpm(trackId: string): Promise<BpmCacheEntry | null> {
    return this.bpm.get(trackId) ?? null;
  }

  async getManyBpm(trackIds: string[]): Promise<Record<string, BpmCacheEntry>> {
    const out: Record<string, BpmCacheEntry> = {};
    for (const id of trackIds) {
      const e = this.bpm.get(id);
      if (e) out[id] = e;
    }
    return out;
  }

  async putBpm(entry: BpmCacheEntry): Promise<void> {
    this.bpm.set(entry.trackId, entry);
  }

  async putGeneration(record: GenerationRecord): Promise<void> {
    this.generations.unshift(record);
  }

  async listGenerations(): Promise<GenerationRecord[]> {
    return [...this.generations];
  }
}
