import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { tokenFromSession, type SessionLike } from "@/lib/spotify/session";
import { SpotifyClient } from "@/lib/spotify/client";
import { apiError } from "@/lib/api/http";

export const maxDuration = 60;

const Body = z.object({
  isrcs: z.array(z.string()).max(60),
});

export async function POST(req: Request) {
  try {
    const token = tokenFromSession((await auth()) as SessionLike | null);
    const { isrcs } = Body.parse(await req.json());

    // Pool tracks are ISRC-keyed, so resolve each ISRC to a real Spotify track
    // URI via `search?q=isrc:…`. Generated sets are small; pacing ~300ms between
    // lookups keeps us under the Spotify rate limit. One client reused across
    // the loop. Aligned to input order; a miss/error becomes null.
    const client = new SpotifyClient(token);
    const uris: (string | null)[] = [];
    for (let i = 0; i < isrcs.length; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, 300));
      try {
        const hits = await client.searchTracks(`isrc:${isrcs[i]}`, 1);
        const id = hits[0]?.id;
        uris.push(id ? `spotify:track:${id}` : null);
      } catch {
        uris.push(null);
      }
    }

    return NextResponse.json({ uris });
  } catch (e) {
    return apiError(e);
  }
}
