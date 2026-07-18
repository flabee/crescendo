import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { tokenFromSession, type SessionLike } from "@/lib/spotify/session";
import { SpotifyClient } from "@/lib/spotify/client";
import { resolveSimilarity } from "@/lib/similarity/similarity-service";
import { apiError } from "@/lib/api/http";

export const maxDuration = 60;

const Body = z.object({
  seedTrackId: z.string().min(1),
  candidateTrackIds: z.array(z.string().min(1)).max(200),
});

export async function POST(req: Request) {
  try {
    const token = tokenFromSession((await auth()) as SessionLike | null);
    const { seedTrackId, candidateTrackIds } = Body.parse(await req.json());

    const client = new SpotifyClient(token);
    const result = await resolveSimilarity(seedTrackId, candidateTrackIds, { spotify: client });

    return NextResponse.json(result);
  } catch (e) {
    return apiError(e);
  }
}
