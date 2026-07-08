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

const DEFAULT_MAX_NODES = 60;

/** Run a dep call defensively: a throwing dep degrades to the fallback for that node. */
async function safe<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.warn(`buildGraph: ${label} failed:`, err);
    return fallback;
  }
}

export async function buildGraph(
  seedArtist: string,
  opts: { hops: number; deps?: GraphDeps; maxNodes?: number },
): Promise<ArtistNode[]> {
  if (!seedArtist.trim()) return [];

  const deps = opts.deps ?? defaultDeps;
  const maxNodes = opts.maxNodes ?? DEFAULT_MAX_NODES;
  const seen = new Map<string, string>(); // lowercased -> display name
  const add = (name: string): boolean => {
    if (seen.size >= maxNodes) return false;
    const k = name.toLowerCase();
    if (!seen.has(k)) seen.set(k, name);
    return true;
  };
  add(seedArtist);

  let frontier = [seedArtist];
  for (let hop = 0; hop < opts.hops; hop++) {
    if (seen.size >= maxNodes) break;
    const next: string[] = [];
    for (const name of frontier) {
      const id = await safe(`resolveId("${name}")`, () => deps.resolveId(name), null);
      const related = id ? await safe(`related(${id})`, () => deps.related(id), []) : [];
      const similar = await safe(`lastfm("${name}")`, () => deps.lastfm(name), []);
      for (const n of [...related, ...similar]) {
        const k = n.toLowerCase();
        if (!seen.has(k)) {
          if (!add(n)) break; // maxNodes reached
          next.push(n);
        }
      }
    }
    frontier = next;
    if (frontier.length === 0) break;
  }
  return [...seen.values()].map((name) => ({ name }));
}
