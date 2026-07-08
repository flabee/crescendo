import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { tokenFromSession, type SessionLike } from "@/lib/spotify/session";
import { getStore } from "@/lib/store";
import { toCurveTracks } from "@/lib/pool/curve-map";
import { fillCurve } from "@/lib/curve/fill";
import type { CurveTrack } from "@/lib/curve/types";
import { apiError } from "@/lib/api/http";

export const maxDuration = 60;

const TrackSchema = z.object({
  id: z.string(),
  title: z.string(),
  artist: z.string(),
  durationMs: z.number(),
  isrc: z.string().optional(),
});

const Body = z.object({
  seed: TrackSchema,
  candidates: z.array(TrackSchema).max(500),
  startBpm: z.number().min(30).max(300),
  endBpm: z.number().min(30).max(300),
  targetMinutes: z.number().min(1).max(600),
  familiar: z.array(z.string()).max(3000),
});

export async function POST(req: Request) {
  try {
    tokenFromSession((await auth()) as SessionLike | null); // auth gate
    const { seed, candidates, startBpm, endBpm, targetMinutes, familiar } =
      Body.parse(await req.json());

    const store = await getStore();
    const bpmById = await store.getManyBpm([seed.id, ...candidates.map((c) => c.id)]);

    const seedEntry = bpmById[seed.id];
    if (!seedEntry) {
      return NextResponse.json(
        { error: "Could not determine seed BPM — enrich the seed first" },
        { status: 400 },
      );
    }
    const seedCurve: CurveTrack = {
      id: seed.id,
      bpm: seedEntry.bpm,
      durationMs: seed.durationMs,
    };

    const candidateCurve = toCurveTracks(candidates, bpmById);

    // BPM hard-filter: only keep candidates within ±15 of the requested range.
    const lo = Math.min(startBpm, endBpm) - 15;
    const hi = Math.max(startBpm, endBpm) + 15;
    const filtered = candidateCurve.filter((t) => t.bpm >= lo && t.bpm <= hi);

    // id -> {title, artist} lookup (candidates + seed) for response mapping.
    const byId = new Map<string, { title: string; artist: string }>();
    for (const c of candidates) byId.set(c.id, { title: c.title, artist: c.artist });
    byId.set(seed.id, { title: seed.title, artist: seed.artist });

    const fam = new Set(familiar.map((s) => s.toLowerCase()));
    const preferScore = (t: CurveTrack) =>
      fam.has((byId.get(t.id)?.artist ?? "").toLowerCase()) ? 1 : 0;

    const result = fillCurve({
      tracks: filtered,
      startBpm,
      endBpm,
      targetMinutes,
      pinnedFirst: seedCurve,
      preferScore,
    });

    const tracks = result.tracks.map((ft) => {
      const meta = byId.get(ft.track.id);
      return {
        id: ft.track.id,
        title: meta?.title ?? "",
        artist: meta?.artist ?? "",
        bpm: ft.track.bpm,
        target: Math.round(ft.target),
        deviation: Math.round(ft.deviation),
      };
    });

    return NextResponse.json({
      tracks,
      achievedMinutes: Math.round(result.achievedMs / 60000),
      poolSize: candidates.length,
      matchedSize: candidateCurve.length,
      filteredSize: filtered.length,
      fidelity: result.fidelity,
      suggestWiden: result.achievedMs < targetMinutes * 60000,
      seedOutOfRange: seedEntry.bpm < lo || seedEntry.bpm > hi,
    });
  } catch (e) {
    return apiError(e);
  }
}
