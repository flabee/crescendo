import type { ArtistNode } from "./types";
import { deezerResolveArtistId, deezerRelatedNames } from "./deezer-related";
import { lastfmSimilar } from "@/lib/lastfm/client";

export interface GraphDeps {
  resolveId: (name: string) => Promise<number | null>;
  related: (id: number) => Promise<string[]>;
  lastfm: (name: string) => Promise<string[]>;
}

const defaultDeps: GraphDeps = {
  resolveId: deezerResolveArtistId,
  related: deezerRelatedNames,
  lastfm: lastfmSimilar,
};

export async function buildGraph(
  seedArtist: string,
  opts: { hops: number; deps?: GraphDeps },
): Promise<ArtistNode[]> {
  const deps = opts.deps ?? defaultDeps;
  const seen = new Map<string, string>(); // lowercased -> display name
  const add = (name: string) => {
    const k = name.toLowerCase();
    if (!seen.has(k)) seen.set(k, name);
  };
  add(seedArtist);

  let frontier = [seedArtist];
  for (let hop = 0; hop < opts.hops; hop++) {
    const next: string[] = [];
    for (const name of frontier) {
      const id = await deps.resolveId(name);
      const related = id ? await deps.related(id) : [];
      const similar = await deps.lastfm(name);
      for (const n of [...related, ...similar]) {
        const k = n.toLowerCase();
        if (!seen.has(k)) {
          add(n);
          next.push(n);
        }
      }
    }
    frontier = next;
    if (frontier.length === 0) break;
  }
  return [...seen.values()].map((name) => ({ name }));
}
