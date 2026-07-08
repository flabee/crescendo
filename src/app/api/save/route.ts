import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { tokenFromSession } from "@/lib/spotify/session";
import { SpotifyClient } from "@/lib/spotify/client";
import { getStore } from "@/lib/store";

export const maxDuration = 60;

const Body = z.object({
  name: z.string().min(1).max(100),
  trackIds: z.array(z.string()).min(1),
  params: z.object({
    startBpm: z.number(),
    endBpm: z.number(),
    targetMinutes: z.number(),
    seedTitle: z.string(),
  }),
  fidelity: z.object({
    maxDeviation: z.number(),
    avgDeviation: z.number(),
    widenedCount: z.number(),
  }),
});

export async function POST(req: Request) {
  try {
    const token = tokenFromSession((await auth()) as never);
    const { name, trackIds, params, fidelity } = Body.parse(await req.json());

    const client = new SpotifyClient(token);
    const userId = await client.getCurrentUserId();
    const description = `Crescendo: seed "${params.seedTitle}", ${params.startBpm}->${params.endBpm} BPM over ${params.targetMinutes}min`;
    const playlistId = await client.createPlaylist(userId, name, description);
    await client.addTracks(playlistId, trackIds);

    const store = await getStore();
    if (store.persistent) {
      await store.putGeneration({
        id: playlistId,
        createdAt: new Date().toISOString(),
        params: {
          startBpm: params.startBpm,
          endBpm: params.endBpm,
          targetMinutes: params.targetMinutes,
          sources: ["seed"],
        },
        trackIds,
        playlistId,
        fidelity,
      });
    }

    return NextResponse.json({
      playlistId,
      url: "https://open.spotify.com/playlist/" + playlistId,
      historySaved: store.persistent,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
