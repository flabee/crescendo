import { describe, it, expect } from "vitest";
import { MemoryStore } from "@/lib/store/memory-store";
import type { BpmCacheEntry } from "@/lib/store/types";

const entry = (trackId: string, bpm: number): BpmCacheEntry => ({
  trackId,
  bpm,
  source: "deezer-isrc",
  matchedTitle: "t",
  matchedArtist: "a",
  confidence: 1,
  fetchedAt: "2026-07-08T00:00:00Z",
});

describe("MemoryStore", () => {
  it("seeds from provided entries and reads them back", async () => {
    const store = new MemoryStore([entry("s1", 120)]);
    expect(await store.getBpm("s1")).toEqual(entry("s1", 120));
  });
  it("returns null for a miss", async () => {
    const store = new MemoryStore([]);
    expect(await store.getBpm("nope")).toBeNull();
  });
  it("writes and reads back a bpm entry", async () => {
    const store = new MemoryStore([]);
    await store.putBpm(entry("s2", 90));
    expect(await store.getBpm("s2")).toEqual(entry("s2", 90));
  });
  it("getManyBpm returns a map of hits only", async () => {
    const store = new MemoryStore([entry("s1", 120)]);
    const map = await store.getManyBpm(["s1", "miss"]);
    expect(map).toEqual({ s1: entry("s1", 120) });
  });
  it("saves and lists generations newest-first", async () => {
    const store = new MemoryStore([]);
    await store.putGeneration({ id: "g1", createdAt: "2026-07-08T00:00:00Z", params: { startBpm: 100, endBpm: 128, targetMinutes: 30, sources: ["liked"] }, trackIds: ["s1"], playlistId: "p1", fidelity: { maxDeviation: 0, avgDeviation: 0, widenedCount: 0 } });
    const list = await store.listGenerations();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe("g1");
  });
});
