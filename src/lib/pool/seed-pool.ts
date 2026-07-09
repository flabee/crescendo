import type { SpotifyTrack } from "../spotify/types";
import type { ArtistNode } from "../artists/types";
import { dedupeTracks } from "./dedupe";

export interface SeedPoolDeps {
  /** Thin adapter over the real `buildGraph(seedArtist, {hops})` — the generate route wraps it, so this `(seedArtist, hops)` shape is intentional, not a mismatch. */
  buildGraph: (seedArtist: string, hops: number) => Promise<ArtistNode[]>;
  artistTracks: (artistName: string) => Promise<SpotifyTrack[]>;
  familiarArtists: () => Promise<Set<string>>;
}

export interface SeedPoolResult {
  candidates: SpotifyTrack[];
  familiar: Set<string>;
  /** Number of artist nodes in the related-artist graph (diagnostic — confirms the graph populated). */
  graphSize: number;
}

export async function buildSeedPool(
  input: { seedArtist: string; hops: number },
  deps: SeedPoolDeps,
): Promise<SeedPoolResult> {
  const graph = await deps.buildGraph(input.seedArtist, input.hops);

  // A restricted /me/top/artists (403) must not break pool building — default
  // to an empty familiarity set on error.
  let familiar: Set<string>;
  try {
    familiar = await deps.familiarArtists();
  } catch (e) {
    console.warn("seed-pool: familiarArtists failed, defaulting to empty set", e);
    familiar = new Set<string>();
  }

  const all: SpotifyTrack[] = [];
  for (let i = 0; i < graph.length; i++) {
    const node = graph[i];
    try {
      all.push(...(await deps.artistTracks(node.name)));
    } catch (e) {
      // isolate a failing artist — one artist's failure must not sink the pool
      console.warn("seed-pool: skipping artist", node.name, e);
    }
    // Pace the per-artist searches ~250ms apart (except after the last) to stay
    // under Spotify's burst throttle and avoid 429 spikes during a Generate.
    if (i < graph.length - 1) {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  return { candidates: dedupeTracks(all), familiar, graphSize: graph.length };
}
