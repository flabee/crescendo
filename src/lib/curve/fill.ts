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

const WIDEN_STEPS = [3, 5, 8, 12, 20];

function nextWiden(tol: number): number | null {
  const idx = WIDEN_STEPS.indexOf(tol);
  if (idx === -1) {
    // tol not a known step: jump to the first step strictly greater than it
    const next = WIDEN_STEPS.find((s) => s > tol);
    return next ?? null;
  }
  return idx + 1 < WIDEN_STEPS.length ? WIDEN_STEPS[idx + 1] : null;
}

function nearestWithin(
  tracks: CurveTrack[],
  used: Set<string>,
  target: number,
  tol: number,
): CurveTrack | null {
  let best: CurveTrack | null = null;
  let bestDev = Infinity;
  for (const tr of tracks) {
    if (used.has(tr.id)) continue;
    const dev = Math.abs(tr.bpm - target);
    if (dev > tol) continue;
    if (dev < bestDev || (dev === bestDev && best !== null && tr.id < best.id)) {
      best = tr;
      bestDev = dev;
    }
  }
  return best;
}

function globalNearest(
  tracks: CurveTrack[],
  used: Set<string>,
  target: number,
): CurveTrack | null {
  return nearestWithin(tracks, used, target, Infinity);
}

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
    let tol = baseTol;
    let pick = nearestWithin(tracks, used, target, tol);
    let widened = false;
    while (pick === null) {
      const next = nextWiden(tol);
      if (next === null) break;
      tol = next;
      widened = true;
      pick = nearestWithin(tracks, used, target, tol);
    }
    if (pick === null) pick = globalNearest(tracks, used, target);
    if (pick === null) break;
    if (widened) widenedCount++;
    result.push({ track: pick, target, deviation: Math.abs(pick.bpm - target) });
    used.add(pick.id);
    elapsed += pick.durationMs;
  }

  const deviations = result.map((r) => r.deviation);
  return {
    tracks: result,
    achievedMs: elapsed,
    fidelity: {
      maxDeviation: deviations.length ? Math.max(...deviations) : 0,
      avgDeviation: deviations.length
        ? deviations.reduce((a, b) => a + b, 0) / deviations.length
        : 0,
      widenedCount,
    },
  };
}
