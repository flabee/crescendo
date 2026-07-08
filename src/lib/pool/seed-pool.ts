import type { SpotifyTrack } from "../spotify/types";
import type { ArtistNode } from "../artists/types";
import { dedupeTracks } from "./dedupe";

export interface SeedPoolDeps {
  buildGraph: (seedArtist: string, hops: number) => Promise<ArtistNode[]>;
  searchArtists: (name: string) => Promise<Array<{ id: string; name: string }>>;
  artistTopTracks: (spotifyArtistId: string) => Promise<SpotifyTrack[]>;
  familiarArtists: () => Promise<Set<string>>;
}

export interface SeedPoolResult {
  candidates: SpotifyTrack[];
  familiar: Set<string>;
}

export async function buildSeedPool(
  input: { seedArtist: string; hops: number },
  deps: SeedPoolDeps,
): Promise<SeedPoolResult> {
  const graph = await deps.buildGraph(input.seedArtist, input.hops);
  const familiar = await deps.familiarArtists();

  const all: SpotifyTrack[] = [];
  for (const node of graph) {
    try {
      const hits = await deps.searchArtists(node.name);
      if (hits.length === 0) continue;
      const exact = hits.find((h) => h.name.toLowerCase() === node.name.toLowerCase()) ?? hits[0];
      const tracks = await deps.artistTopTracks(exact.id);
      all.push(...tracks);
    } catch (e) {
      console.warn(`seed-pool: skipping artist "${node.name}":`, e);
      // isolate a failing artist — one artist's failure must not sink the pool
    }
  }
  return { candidates: dedupeTracks(all), familiar };
}
