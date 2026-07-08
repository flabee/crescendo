import { describe, it, expect } from "vitest";
import { MemoryStore } from "@/lib/store/memory-store";
import { KvStore } from "@/lib/store/kv-store";
import type { BpmCacheEntry, GenerationRecord, Store } from "@/lib/store/types";

// Minimal in-memory fake of the @vercel/kv surface KvStore uses.
function fakeKv() {
  const data = new Map<string, unknown>();
  return {
    async get<T>(key: string): Promise<T | null> {
      return (data.get(key) as T) ?? null;
    },
    async set(key: string, value: unknown): Promise<void> {
      data.set(key, value);
    },
    async mget<T>(...keys: string[]): Promise<(T | null)[]> {
      return keys.map((k) => (data.get(k) as T) ?? null);
    },
    async lpush(key: string, value: unknown): Promise<void> {
      const arr = (data.get(key) as unknown[]) ?? [];
      arr.unshift(value);
      data.set(key, arr);
    },
    async lrange<T>(key: string, start: number, stop: number): Promise<T[]> {
      const arr = (data.get(key) as T[]) ?? [];
      return stop === -1 ? arr.slice(start) : arr.slice(start, stop + 1);
    },
  };
}

const entry = (trackId: string, bpm: number): BpmCacheEntry => ({
  trackId, bpm, source: "deezer-isrc", matchedTitle: "t", matchedArtist: "a", confidence: 1, fetchedAt: "2026-07-08T00:00:00Z",
});

const gen = (id: string): GenerationRecord => ({
  id, createdAt: "2026-07-08T00:00:00Z", params: { startBpm: 100, endBpm: 128, targetMinutes: 30, sources: ["liked"] }, trackIds: ["s1"], playlistId: "p1", fidelity: { maxDeviation: 0, avgDeviation: 0, widenedCount: 0 },
});

// Every Store adapter must satisfy identical semantics.
const adapters: Array<[string, (seed: BpmCacheEntry[]) => Store]> = [
  ["MemoryStore", (seed) => new MemoryStore(seed)],
  ["KvStore", (seed) => new KvStore(fakeKv() as never, seed)],
];

describe.each(adapters)("Store contract: %s", (_name, make) => {
  it("seeds from provided entries and reads them back", async () => {
    const store = make([entry("s1", 120)]);
    expect((await store.getBpm("s1"))?.bpm).toBe(120);
  });

  it("returns null for a miss", async () => {
    const store = make([]);
    expect(await store.getBpm("nope")).toBeNull();
  });

  it("writes and reads back a bpm entry", async () => {
    const store = make([]);
    await store.putBpm(entry("s2", 90));
    expect((await store.getBpm("s2"))?.bpm).toBe(90);
  });

  it("getManyBpm returns a map of hits only", async () => {
    const store = make([entry("s1", 120)]);
    const map = await store.getManyBpm(["s1", "miss"]);
    expect(map.s1.bpm).toBe(120);
    expect(map.miss).toBeUndefined();
    expect(Object.keys(map)).toEqual(["s1"]);
  });

  it("getManyBpm([]) returns an empty object", async () => {
    const store = make([entry("s1", 120)]);
    expect(await store.getManyBpm([])).toEqual({});
  });

  it("lists generations newest-first", async () => {
    const store = make([]);
    await store.putGeneration(gen("g1"));
    await store.putGeneration(gen("g2"));
    const list = await store.listGenerations();
    expect(list.map((g) => g.id)).toEqual(["g2", "g1"]);
  });
});
