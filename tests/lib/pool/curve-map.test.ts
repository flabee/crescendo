import { describe, it, expect } from "vitest";
import { toCurveTracks } from "@/lib/pool/curve-map";
import type { BpmCacheEntry } from "@/lib/store/types";

const bpm = (id: string, b: number): BpmCacheEntry => ({ trackId: id, bpm: b, source: "deezer-isrc", matchedTitle: id, matchedArtist: "a", confidence: 1, fetchedAt: "x" });

describe("toCurveTracks", () => {
  it("keeps only tracks that have a bpm entry, mapping bpm + duration", () => {
    const tracks = [{ id: "1", durationMs: 60000 }, { id: "2", durationMs: 70000 }];
    const out = toCurveTracks(tracks, { 1: bpm("1", 120) });
    expect(out).toEqual([{ id: "1", bpm: 120, durationMs: 60000 }]);
  });
});
