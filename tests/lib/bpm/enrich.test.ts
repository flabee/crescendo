import { describe, it, expect, vi, afterEach } from "vitest";
import { enrichTracks } from "@/lib/bpm/enrich";
import { MemoryStore } from "@/lib/store/memory-store";
import type { TrackRef } from "@/lib/bpm/types";

const refs: TrackRef[] = [
  { id: "cached", title: "C", artist: "A", isrc: "I1" },
  { id: "deezer", title: "D", artist: "A", isrc: "I2" },
  { id: "gsb", title: "G", artist: "A" },
  { id: "miss", title: "M", artist: "A" },
];

describe("enrichTracks", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns cache hits without calling sources, and persists new results", async () => {
    const store = new MemoryStore([
      { trackId: "cached", bpm: 111, source: "deezer-isrc", matchedTitle: "C", matchedArtist: "A", confidence: 1, fetchedAt: "x" },
    ]);
    const deezer = vi.fn(async (r: TrackRef) =>
      r.id === "deezer" ? { bpm: 122, source: "deezer-isrc" as const, matchedTitle: "D", matchedArtist: "A", confidence: 1 } : null,
    );
    const gsb = vi.fn(async (r: TrackRef) =>
      r.id === "gsb" ? { bpm: 133, source: "getsongbpm" as const, matchedTitle: "G", matchedArtist: "A", confidence: 0.9 } : null,
    );

    const out = await enrichTracks(refs, store, { deezer, gsb, now: () => "2026-07-08T00:00:00Z" });

    expect(deezer).not.toHaveBeenCalledWith(expect.objectContaining({ id: "cached" }));
    expect(out.matched.map((m) => m.trackId).sort()).toEqual(["cached", "deezer", "gsb"]);
    expect(out.unmatched).toEqual(["miss"]);
    // gsb only called when deezer returned null
    expect(gsb).toHaveBeenCalledWith(expect.objectContaining({ id: "gsb" }));
    expect(gsb).not.toHaveBeenCalledWith(expect.objectContaining({ id: "deezer" }));
    // newly matched persisted
    expect((await store.getBpm("deezer"))?.bpm).toBe(122);
  });

  it("continues to gsb when deezer throws", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const store = new MemoryStore();
    const ref: TrackRef = { id: "t1", title: "T", artist: "A" };
    const deezer = vi.fn(async () => {
      throw new Error("network down");
    });
    const gsb = vi.fn(async (r: TrackRef) =>
      r.id === "t1" ? { bpm: 140, source: "getsongbpm" as const, matchedTitle: "T", matchedArtist: "A", confidence: 0.8 } : null,
    );

    const out = await enrichTracks([ref], store, { deezer, gsb, now: () => "2026-07-08T00:00:00Z" });

    expect(gsb).toHaveBeenCalledWith(expect.objectContaining({ id: "t1" }));
    expect(out.matched.map((m) => m.trackId)).toEqual(["t1"]);
    expect(out.matched[0].bpm).toBe(140);
    expect(out.unmatched).toEqual([]);
    // persisted
    expect((await store.getBpm("t1"))?.bpm).toBe(140);
  });

  it("rejects a below-threshold deezer result: track unmatched and not cached", async () => {
    const store = new MemoryStore();
    const ref: TrackRef = { id: "low", title: "L", artist: "A" };
    const deezer = vi.fn(async () => ({
      bpm: 120,
      source: "deezer-search" as const,
      matchedTitle: "Wrong",
      matchedArtist: "A",
      confidence: 0.3,
    }));
    const gsb = vi.fn(async () => null);

    const out = await enrichTracks([ref], store, { deezer, gsb, now: () => "2026-07-08T00:00:00Z" });

    expect(out.matched).toEqual([]);
    expect(out.unmatched).toEqual(["low"]);
    // below-threshold match must NOT be persisted (cache-first would make it permanent)
    expect(await store.getBpm("low")).toBeNull();
  });

  it("falls through to gsb when the deezer result is below threshold", async () => {
    const store = new MemoryStore();
    const ref: TrackRef = { id: "t1", title: "T", artist: "A" };
    const deezer = vi.fn(async () => ({
      bpm: 120,
      source: "deezer-search" as const,
      matchedTitle: "Wrong",
      matchedArtist: "A",
      confidence: 0.3,
    }));
    const gsb = vi.fn(async () => ({
      bpm: 150,
      source: "getsongbpm" as const,
      matchedTitle: "T",
      matchedArtist: "A",
      confidence: 0.9,
    }));

    const out = await enrichTracks([ref], store, { deezer, gsb, now: () => "2026-07-08T00:00:00Z" });

    expect(gsb).toHaveBeenCalledWith(expect.objectContaining({ id: "t1" }));
    expect(out.matched.map((m) => m.trackId)).toEqual(["t1"]);
    expect(out.matched[0]).toMatchObject({ bpm: 150, source: "getsongbpm" });
    expect((await store.getBpm("t1"))?.bpm).toBe(150);
  });

  it("marks track unmatched when both sources throw, without affecting other tracks", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const store = new MemoryStore();
    const failRef: TrackRef = { id: "fail", title: "F", artist: "A" };
    const okRef: TrackRef = { id: "ok", title: "O", artist: "A" };
    const deezer = vi.fn(async (r: TrackRef) => {
      if (r.id === "fail") throw new Error("deezer boom");
      return r.id === "ok" ? { bpm: 155, source: "deezer-search" as const, matchedTitle: "O", matchedArtist: "A", confidence: 0.95 } : null;
    });
    const gsb = vi.fn(async (r: TrackRef) => {
      if (r.id === "fail") throw new Error("gsb boom");
      return null;
    });

    const out = await enrichTracks([failRef, okRef], store, { deezer, gsb, now: () => "2026-07-08T00:00:00Z" });

    expect(out.unmatched).toEqual(["fail"]);
    expect(out.matched.map((m) => m.trackId)).toEqual(["ok"]);
    expect(out.matched[0].bpm).toBe(155);
    // ok track persisted, fail track not
    expect((await store.getBpm("ok"))?.bpm).toBe(155);
    expect(await store.getBpm("fail")).toBeNull();
    // failures are logged for observability (not swallowed silently)
    expect(warn).toHaveBeenCalled();
  });
});
