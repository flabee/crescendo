import { describe, it, expect } from "vitest";
import { buildSeedPool } from "@/lib/pool/seed-pool";
import type { SeedPoolDeps } from "@/lib/pool/seed-pool";
import type { SpotifyTrack } from "@/lib/spotify/types";

const tk = (id: string, artist: string, isrc = `I_${id}`): SpotifyTrack => ({ id, title: id, artist, durationMs: 60000, isrc });

describe("buildSeedPool", () => {
  it("gathers tracks for each graph artist, dedupes, and marks familiarity", async () => {
    const deps: SeedPoolDeps = {
      buildGraph: async () => [{ name: "SeedArt" }, { name: "SimA" }, { name: "SimB" }],
      artistTracks: async (n: string) => [tk(`${n}_1`, n)],
      familiarArtists: async () => new Set(["sima"]), // lowercased
    };
    const out = await buildSeedPool({ seedArtist: "SeedArt", hops: 1 }, deps);
    expect(out.candidates.map((c) => c.id).sort()).toEqual(["SeedArt_1", "SimA_1", "SimB_1"]);
    expect(out.familiar.has("sima")).toBe(true);
    // graphSize reflects the number of nodes buildGraph returned.
    expect(out.graphSize).toBe(3);
  });

  it("isolates a failing artist — other artists still contribute", async () => {
    const deps: SeedPoolDeps = {
      buildGraph: async () => [{ name: "Has" }, { name: "Boom" }, { name: "Also" }],
      artistTracks: async (n: string) => {
        if (n === "Boom") throw new Error("spotify 500");
        return [tk(`${n}_1`, n)];
      },
      familiarArtists: async () => new Set<string>(),
    };
    const out = await buildSeedPool({ seedArtist: "Has", hops: 1 }, deps);
    expect(out.candidates.map((c) => c.id).sort()).toEqual(["Also_1", "Has_1"]);
  });

  it("dedupes the union across different graph artists sharing an ISRC", async () => {
    const deps: SeedPoolDeps = {
      buildGraph: async () => [{ name: "ArtistOne" }, { name: "ArtistTwo" }],
      // Two different artists whose tracks share the same ISRC.
      artistTracks: async (n: string) => [tk(`${n}_1`, n, "SHARED_ISRC")],
      familiarArtists: async () => new Set<string>(),
    };
    const out = await buildSeedPool({ seedArtist: "ArtistOne", hops: 1 }, deps);
    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0].id).toBe("ArtistOne_1");
  });

  it("defaults to an empty familiarity set when familiarArtists throws", async () => {
    const deps: SeedPoolDeps = {
      buildGraph: async () => [{ name: "SeedArt" }],
      artistTracks: async (n: string) => [tk(`${n}_1`, n)],
      familiarArtists: async () => {
        throw new Error("spotify 403: /me/top/artists");
      },
    };
    const out = await buildSeedPool({ seedArtist: "SeedArt", hops: 1 }, deps);
    expect(out.candidates.map((c) => c.id)).toEqual(["SeedArt_1"]);
    expect(out.familiar.size).toBe(0);
  });
});
