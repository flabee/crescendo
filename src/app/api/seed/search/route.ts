import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { tokenFromSession, type SessionLike } from "@/lib/spotify/session";
import { SpotifyClient } from "@/lib/spotify/client";
import { apiError } from "@/lib/api/http";

export const maxDuration = 30;

const Body = z.object({ q: z.string().min(1).max(200) });

export async function POST(req: Request) {
  try {
    const token = tokenFromSession((await auth()) as SessionLike | null);
    const { q } = Body.parse(await req.json());
    const tracks = await new SpotifyClient(token).searchTracks(q, 10);
    return NextResponse.json({ tracks });
  } catch (e) {
    return apiError(e);
  }
}
