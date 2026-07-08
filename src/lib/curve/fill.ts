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

// Scan all unused tracks for the one with minimum deviation from `target`.
// Deterministic: ties break by lowest id. NaN-bpm tracks are silently skipped
// (dev is NaN, and every comparison against NaN is false), which is acceptable
// because the pool is pre-filtered to matched tracks upstream.
function nearestUnused(
  tracks: CurveTrack[],
  used: Set<string>,
  target: number,
): CurveTrack | null {
  let best: CurveTrack | null = null;
  let bestDev = Infinity;
  for (const tr of tracks) {
    if (used.has(tr.id)) continue;
    const dev = Math.abs(tr.bpm - target);
    if (dev < bestDev || (dev === bestDev && best !== null && tr.id < best.id)) {
      best = tr;
      bestDev = dev;
    }
  }
  return best;
}

// Greedy time-proportional fill. Selection is ALWAYS nearest-unused to the
// ramp's target BPM (deterministic tie-break by lowest id). `tolerance`
// (default 3) is purely a fidelity metric: `widenedCount` counts the slots
// whose chosen track fell outside the base tolerance (i.e. where the curve had
// to be "stretched" to reach an available track) — it never affects selection.
export function fillCurve(input: CurveInput): FillResult {
  const { tracks, startBpm, endBpm, targetMinutes } = input;
  const baseTol = input.tolerance ?? 3;
  const targetMs = targetMinutes * 60_000;

  const used = new Set<string>();
  const result: FilledTrack[] = [];
  let elapsed = 0;
  let widenedCount = 0;

  while (elapsed < targetMs && used.size < tracks.length) {
    const target = targetBpmAt(elapsed, startBpm, endBpm, targetMs);
    const pick = nearestUnused(tracks, used, target);
    if (pick === null) break;
    const deviation = Math.abs(pick.bpm - target);
    if (deviation > baseTol) widenedCount++;
    result.push({ track: pick, target, deviation });
    used.add(pick.id);
    elapsed += pick.durationMs;
  }

  const deviations = result.map((r) => r.deviation);
  return {
    tracks: result,
    achievedMs: elapsed,
    fidelity: {
      maxDeviation: deviations.length
        ? deviations.reduce((a, b) => Math.max(a, b), 0)
        : 0,
      avgDeviation: deviations.length
        ? deviations.reduce((a, b) => a + b, 0) / deviations.length
        : 0,
      widenedCount,
    },
  };
}
