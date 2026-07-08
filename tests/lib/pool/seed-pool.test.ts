import { describe, it, expect } from "vitest";
import { buildSeedPool } from "@/lib/pool/seed-pool";
import type { SeedPoolDeps } from "@/lib/pool/seed-pool";
import type { SpotifyTrack } from "@/lib/spotify/types";

const tk = (id: string, artist: string, isrc = `I_${id}`): SpotifyTrack => ({ id, title: id, artist, durationMs: 60000, isrc });

describe("buildSeedPool", () => {
  it("gathers Spotify top-tracks for each graph artist, dedupes, and marks familiarity", async () => {
    const deps: SeedPoolDeps = {
      buildGraph: async () => [{ name: "SeedArt" }, { name: "SimA" }, { name: "SimB" }],
      searchArtists: async (n: string) => [{ id: `sp_${n}`, name: n }],
      artistTopTracks: async (id: string) => [tk(`${id}_1`, id.replace("sp_", ""))],
      familiarArtists: async () => new Set(["sima"]), // lowercased
    };
    const out = await buildSeedPool({ seedArtist: "SeedArt", hops: 1 }, deps);
    expect(out.candidates.map((c) => c.id).sort()).toEqual(["sp_SeedArt_1", "sp_SimA_1", "sp_SimB_1"]);
    expect(out.familiar.has("sima")).toBe(true);
  });

  it("prefers an exact-name Spotify artist match over the first hit", async () => {
    const deps: SeedPoolDeps = {
      buildGraph: async () => [{ name: "Real Name" }],
      searchArtists: async () => [
        { id: "wrong", name: "Real Name Tribute" },
        { id: "right", name: "Real Name" },
      ],
      artistTopTracks: async (id: string) => [tk(`${id}_1`, "Real Name")],
      familiarArtists: async () => new Set<string>(),
    };
    const out = await buildSeedPool({ seedArtist: "Real Name", hops: 1 }, deps);
    expect(out.candidates.map((c) => c.id)).toEqual(["right_1"]);
  });

  it("skips graph artists that resolve to no Spotify artist, and isolates a failing artist", async () => {
    const deps: SeedPoolDeps = {
      buildGraph: async () => [{ name: "Has" }, { name: "None" }, { name: "Boom" }],
      searchArtists: async (n: string) => {
        if (n === "None") return [];
        if (n === "Boom") throw new Error("spotify 500");
        return [{ id: `sp_${n}`, name: n }];
      },
      artistTopTracks: async (id: string) => [tk(`${id}_1`, "Has")],
      familiarArtists: async () => new Set<string>(),
    };
    const out = await buildSeedPool({ seedArtist: "Has", hops: 1 }, deps);
    expect(out.candidates.map((c) => c.id)).toEqual(["sp_Has_1"]);
  });

  it("dedupes the union across different graph artists sharing an ISRC", async () => {
    const deps: SeedPoolDeps = {
      buildGraph: async () => [{ name: "ArtistOne" }, { name: "ArtistTwo" }],
      searchArtists: async (n: string) => [{ id: `sp_${n}`, name: n }],
      // Two different artists whose top-tracks share the same ISRC.
      artistTopTracks: async (id: string) => [tk(`${id}_1`, id, "SHARED_ISRC")],
      familiarArtists: async () => new Set<string>(),
    };
    const out = await buildSeedPool({ seedArtist: "ArtistOne", hops: 1 }, deps);
    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0].id).toBe("sp_ArtistOne_1");
  });
});
