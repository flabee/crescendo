import type { CurveInput, CurveTrack, FillResult, FilledTrack } from "./types";

export function targetBpmAt(
  elapsedMs: number,
  startBpm: number,
  endBpm: number,
  targetMs: number,
): number {
  if (targetMs <= 0) return startBpm;
  const frac = Math.min(elapsedMs / targetMs, 1);
  return startBpm + (endBpm - startBpm) * frac;
}
