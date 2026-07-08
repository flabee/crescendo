import { describe, it, expect } from "vitest";
import { dedupeTracks } from "@/lib/pool/dedupe";
import type { SpotifyTrack } from "@/lib/spotify/types";

const mk = (id: string, isrc?: string): SpotifyTrack => ({ id, title: "t", artist: "a", durationMs: 1000, isrc });

describe("dedupeTracks", () => {
  it("removes duplicate Spotify ids, keeping first occurrence", () => {
    const out = dedupeTracks([mk("1"), mk("2"), mk("1")]);
    expect(out.map((t) => t.id)).toEqual(["1", "2"]);
  });
  it("collapses different ids that share an ISRC", () => {
    const out = dedupeTracks([mk("1", "ISRC_A"), mk("2", "ISRC_A")]);
    expect(out.map((t) => t.id)).toEqual(["1"]);
  });
  it("keeps tracks without ISRC distinct", () => {
    const out = dedupeTracks([mk("1"), mk("2")]);
    expect(out).toHaveLength(2);
  });
});
