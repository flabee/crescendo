import type { CurveTrack } from "../curve/types";
import type { BpmCacheEntry } from "../store/types";

export function toCurveTracks(
  tracks: Array<{ id: string; durationMs: number }>,
  bpmById: Record<string, BpmCacheEntry>,
): CurveTrack[] {
  const out: CurveTrack[] = [];
  for (const t of tracks) {
    const entry = bpmById[t.id];
    if (entry) out.push({ id: t.id, bpm: entry.bpm, durationMs: t.durationMs });
  }
  return out;
}
