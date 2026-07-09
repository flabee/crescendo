import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { tokenFromSession, type SessionLike } from "@/lib/spotify/session";
import { SpotifyClient } from "@/lib/spotify/client";
import { buildSeedPool } from "@/lib/pool/seed-pool";
import { buildGraph } from "@/lib/artists/graph";
import { familiaritySet } from "@/lib/pool/familiarity";
import { apiError } from "@/lib/api/http";

export const maxDuration = 60;

const Body = z.object({
  seedArtist: z.string().min(1),
  hops: z.number().int().min(1).max(2).default(1),
});

export async function POST(req: Request) {
  try {
    const token = tokenFromSession((await auth()) as SessionLike | null);
    const { seedArtist, hops } = Body.parse(await req.json());
    const client = new SpotifyClient(token);
    const result = await buildSeedPool(
      { seedArtist, hops },
      {
        buildGraph: (name, h) => buildGraph(name, { hops: h, maxNodes: 4 }),
        artistTracks: async (name) => {
          const q = name.replace(/["\\]/g, " ").trim();
          if (!q) return [];
          const tracks = await client.searchTracks(q, 20);
          const n = q.toLowerCase();
          const onArtist = tracks.filter(
            (t) => t.artist.toLowerCase().includes(n) || n.includes(t.artist.toLowerCase()),
          );
          return onArtist.length ? onArtist : tracks.slice(0, 10);
        },
        familiarArtists: async () => familiaritySet(await client.getTopArtists()),
      },
    );
    return NextResponse.json({
      candidates: result.candidates.map((t) => ({
        id: t.id,
        title: t.title,
        artist: t.artist,
        isrc: t.isrc,
        durationMs: t.durationMs,
      })),
      familiar: [...result.familiar],
      graphSize: result.graphSize,
    });
  } catch (e) {
    return apiError(e);
  }
}
