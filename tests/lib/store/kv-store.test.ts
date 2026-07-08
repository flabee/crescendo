import { describe, it, expect } from "vitest";
import { KvStore } from "@/lib/store/kv-store";
import type { BpmCacheEntry } from "@/lib/store/types";

// Minimal in-memory fake of the @vercel/kv surface KvStore uses.
function fakeKv() {
  const data = new Map<string, unknown>();
  return {
    data,
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

// Shared Store semantics are exercised in contract.test.ts; these cover the
// KV-specific behavior: the persistent flag and the KV-over-seed layering.
describe("KvStore", () => {
  it("is persistent", () => {
    expect(new KvStore(fakeKv() as never, []).persistent).toBe(true);
  });

  it("prefers KV value over seed on read", async () => {
    const kv = fakeKv();
    const store = new KvStore(kv as never, [entry("s1", 100)]);
    await store.putBpm(entry("s1", 120));
    expect((await store.getBpm("s1"))?.bpm).toBe(120);
  });

  it("falls back to seed when KV misses", async () => {
    const store = new KvStore(fakeKv() as never, [entry("s1", 100)]);
    expect((await store.getBpm("s1"))?.bpm).toBe(100);
  });

  it("getManyBpm merges KV hits over seed", async () => {
    const kv = fakeKv();
    const store = new KvStore(kv as never, [entry("s1", 100), entry("s2", 90)]);
    await store.putBpm(entry("s2", 95));
    const map = await store.getManyBpm(["s1", "s2", "miss"]);
    expect(map.s1.bpm).toBe(100);
    expect(map.s2.bpm).toBe(95);
    expect(map.miss).toBeUndefined();
  });
});
