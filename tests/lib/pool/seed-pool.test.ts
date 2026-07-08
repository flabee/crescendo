import { describe, it, expect } from "vitest";
import { buildSeedPool } from "@/lib/pool/seed-pool";
import type { SpotifyTrack } from "@/lib/spotify/types";

const tk = (id: string, artist: string): SpotifyTrack => ({ id, title: id, artist, durationMs: 60000, isrc: `I_${id}` });

describe("buildSeedPool", () => {
  it("gathers Spotify top-tracks for each graph artist, dedupes, and marks familiarity", async () => {
    const deps = {
      buildGraph: async () => [{ name: "SeedArt" }, { name: "SimA" }, { name: "SimB" }],
      searchArtists: async (n: string) => [{ id: `sp_${n}`, name: n }],
      artistTopTracks: async (id: string) => [tk(`${id}_1`, id.replace("sp_", ""))],
      familiarArtists: async () => new Set(["sima"]), // lowercased
    };
    const out = await buildSeedPool(
      { seedArtist: "SeedArt", hops: 1 },
      deps as never,
    );
    expect(out.candidates.map((c) => c.id).sort()).toEqual(["sp_SeedArt_1", "sp_SimA_1", "sp_SimB_1"]);
    expect(out.familiar.has("sima")).toBe(true);
  });

  it("prefers an exact-name Spotify artist match over the first hit", async () => {
    const deps = {
      buildGraph: async () => [{ name: "Real Name" }],
      searchArtists: async () => [
        { id: "wrong", name: "Real Name Tribute" },
        { id: "right", name: "Real Name" },
      ],
      artistTopTracks: async (id: string) => [tk(`${id}_1`, "Real Name")],
      familiarArtists: async () => new Set<string>(),
    };
    const out = await buildSeedPool({ seedArtist: "Real Name", hops: 1 }, deps as never);
    expect(out.candidates.map((c) => c.id)).toEqual(["right_1"]);
  });

  it("skips graph artists that resolve to no Spotify artist, and isolates a failing artist", async () => {
    const deps = {
      buildGraph: async () => [{ name: "Has" }, { name: "None" }, { name: "Boom" }],
      searchArtists: async (n: string) => {
        if (n === "None") return [];
        if (n === "Boom") throw new Error("spotify 500");
        return [{ id: `sp_${n}`, name: n }];
      },
      artistTopTracks: async (id: string) => [tk(`${id}_1`, "Has")],
      familiarArtists: async () => new Set<string>(),
    };
    const out = await buildSeedPool({ seedArtist: "Has", hops: 1 }, deps as never);
    expect(out.candidates.map((c) => c.id)).toEqual(["sp_Has_1"]);
  });
});
