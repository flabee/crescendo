import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { tokenFromSession } from "@/lib/spotify/session";
import { getStore } from "@/lib/store";
import { enrichTracks } from "@/lib/bpm/enrich";
import type { TrackRef } from "@/lib/bpm/types";

export const maxDuration = 60;

const Body = z.object({
  tracks: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        artist: z.string(),
        isrc: z.string().optional(),
      }),
    )
    .max(50),
});

export async function POST(req: Request) {
  try {
    tokenFromSession((await auth()) as never); // auth gate
    const { tracks } = Body.parse(await req.json());
    const store = await getStore();
    const out = await enrichTracks(tracks as TrackRef[], store);
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
