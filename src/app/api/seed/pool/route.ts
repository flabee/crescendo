import { NextResponse } from "next/server";
import { z } from "zod";
import { buildSeedPool } from "@/lib/pool/seed-pool";
import { buildGraph } from "@/lib/artists/graph";
import { deezerArtistTracks } from "@/lib/deezer/artist-tracks";
import { apiError } from "@/lib/api/http";

export const maxDuration = 60;

const Body = z.object({
  seedArtist: z.string().min(1),
  hops: z.number().int().min(1).max(2).default(1),
});

export async function POST(req: Request) {
  try {
    const { seedArtist, hops } = Body.parse(await req.json());
    // Pool sourced entirely from Deezer (keyless): graph, tracks, and BPM.
    // Zero Spotify search calls — Spotify search is rate-limited to uselessness
    // on this app. Familiarity ranking is deferred (empty set for now).
    const result = await buildSeedPool(
      { seedArtist, hops },
      {
        buildGraph: (name, h) => buildGraph(name, { hops: h, maxNodes: 4 }),
        artistTracks: (name) => deezerArtistTracks(name, 8),
        familiarArtists: async () => new Set<string>(),
      },
    );
    return NextResponse.json({
      candidates: result.candidates.map((t) => ({
        id: t.id,
        title: t.title,
        artist: t.artist,
        isrc: t.isrc,
        durationMs: t.durationMs,
        bpm: t.bpm,
      })),
      familiar: [...result.familiar],
      graphSize: result.graphSize,
    });
  } catch (e) {
    return apiError(e);
  }
}
