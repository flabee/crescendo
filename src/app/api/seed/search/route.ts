import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { tokenFromSession } from "@/lib/spotify/session";
import { SpotifyClient } from "@/lib/spotify/client";

export const maxDuration = 30;

const Body = z.object({ q: z.string().min(1) });

export async function POST(req: Request) {
  try {
    const token = tokenFromSession((await auth()) as never);
    const { q } = Body.parse(await req.json());
    const tracks = await new SpotifyClient(token).searchTracks(q, 10);
    return NextResponse.json({ tracks });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
