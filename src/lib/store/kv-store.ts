import type { BpmCacheEntry, GenerationRecord, Store } from "./types";

// The subset of the @vercel/kv client we depend on (keeps it testable).
export interface KvClient {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<unknown>;
  mget<T>(...keys: string[]): Promise<(T | null)[]>;
  lpush(key: string, value: unknown): Promise<unknown>;
  lrange<T>(key: string, start: number, stop: number): Promise<T[]>;
}

const BPM_KEY = (id: string) => `bpm:${id}`;
const GEN_LIST = "generations";

export class KvStore implements Store {
  readonly persistent = true;
  private seed: Map<string, BpmCacheEntry>;

  constructor(private kv: KvClient, seed: BpmCacheEntry[] = []) {
    this.seed = new Map(seed.map((e) => [e.trackId, e]));
  }

  async getBpm(trackId: string): Promise<BpmCacheEntry | null> {
    const hit = await this.kv.get<BpmCacheEntry>(BPM_KEY(trackId));
    return hit ?? this.seed.get(trackId) ?? null;
  }

  async getManyBpm(trackIds: string[]): Promise<Record<string, BpmCacheEntry>> {
    if (trackIds.length === 0) return {};
    const hits = await this.kv.mget<BpmCacheEntry>(...trackIds.map(BPM_KEY));
    const out: Record<string, BpmCacheEntry> = {};
    trackIds.forEach((id, i) => {
      const e = hits[i] ?? this.seed.get(id);
      if (e) out[id] = e;
    });
    return out;
  }

  async putBpm(entry: BpmCacheEntry): Promise<void> {
    await this.kv.set(BPM_KEY(entry.trackId), entry);
  }

  async putGeneration(record: GenerationRecord): Promise<void> {
    await this.kv.lpush(GEN_LIST, record);
  }

  async listGenerations(): Promise<GenerationRecord[]> {
    return this.kv.lrange<GenerationRecord>(GEN_LIST, 0, -1);
  }
}
