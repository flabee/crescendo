import type { CurveInput, CurveShape, CurveTrack, FillResult, FilledTrack } from "./types";

export function targetBpmAt(
  elapsedMs: number,
  startBpm: number,
  endBpm: number,
  targetMs: number,
  shape: CurveShape = "ramp",
): number {
  const f = targetMs <= 0 ? 0 : Math.min(elapsedMs / targetMs, 1);
  const delta = endBpm - startBpm;
  switch (shape) {
    case "flat":
      // Hold the start BPM for the whole set; end is ignored.
      return startBpm;
    case "ease": {
      // Ease-in-out (symmetric): slow at both ends, quick through the middle.
      // f=0.5 lands exactly on the linear midpoint, so ease shares endpoints
      // and midpoint with the ramp.
      const p = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
      return startBpm + delta * p;
    }
    case "dip": {
      // Linear baseline minus a sine valley: dips below the line through the
      // middle and returns to the exact endpoints (sin(0)=sin(pi)=0).
      const lin = startBpm + delta * f;
      const depth = Math.max(8, Math.abs(delta) * 0.5);
      return lin - depth * Math.sin(Math.PI * f);
    }
    case "ramp":
    default:
      // Unchanged linear interpolation.
      return startBpm + delta * f;
  }
}

// Scan all unused tracks for the one with minimum deviation from `target`.
// Used only as the stretch fallback when nothing sits within tolerance.
// Deterministic ranking: deviation asc, then preferScore desc, then lowest id.
// NaN-bpm tracks are silently skipped (dev is NaN, and every comparison against
// NaN is false), which is acceptable because the pool is pre-filtered to matched
// tracks upstream.
function nearestUnused(
  tracks: CurveTrack[],
  used: Set<string>,
  target: number,
  prefer: (t: CurveTrack) => number,
): CurveTrack | null {
  let best: CurveTrack | null = null;
  let bestDev = Infinity;
  let bestPref = -Infinity;
  for (const tr of tracks) {
    if (used.has(tr.id)) continue;
    const dev = Math.abs(tr.bpm - target);
    const pref = prefer(tr);
    if (
      dev < bestDev ||
      (dev === bestDev && pref > bestPref) ||
      (dev === bestDev && pref === bestPref && best !== null && tr.id < best.id)
    ) {
      best = tr;
      bestDev = dev;
      bestPref = pref;
    }
  }
  return best;
}

// Best unused track within `tol` of `target`, ranked by (preferScore desc,
// deviation asc, id asc). Returns null when nothing fits — the caller then
// stretches via `nearestUnused`. NaN-bpm tracks are excluded because `dev <= tol`
// is false for NaN.
function bestInTolerance(
  tracks: CurveTrack[],
  used: Set<string>,
  target: number,
  tol: number,
  prefer: (t: CurveTrack) => number,
): CurveTrack | null {
  let best: CurveTrack | null = null;
  let bestPref = -Infinity,
    bestDev = Infinity;
  for (const tr of tracks) {
    if (used.has(tr.id)) continue;
    const dev = Math.abs(tr.bpm - target);
    if (!(dev <= tol)) continue;
    const pref = prefer(tr);
    if (
      pref > bestPref ||
      (pref === bestPref && dev < bestDev) ||
      (pref === bestPref && dev === bestDev && best !== null && tr.id < best.id)
    ) {
      best = tr;
      bestPref = pref;
      bestDev = dev;
    }
  }
  return best;
}

// True when at least one track in the pool has not yet been used. Equivalent to
// `used.size < tracks.length` for the no-pinned path (where `used` only ever
// holds pool ids), but stays correct when a pinnedFirst track outside the pool
// has been added to `used`.
function hasUnusedPool(tracks: CurveTrack[], used: Set<string>): boolean {
  for (const tr of tracks) {
    if (!used.has(tr.id)) return true;
  }
  return false;
}

// Greedy time-proportional fill with two-tier selection. Each slot first looks
// for the best track WITHIN tolerance, ranked by (preferScore desc, deviation
// asc, id asc) — this is where familiarity ("familiar" artists) breaks ties
// without ever overriding BPM proximity. Only when nothing sits within tolerance
// does it stretch to the global nearest-unused track (`nearestUnused`), counted
// in `widenedCount`. `pinnedFirst`, when supplied, is placed as slot #1 (its BPM
// is expected to match `startBpm`) and consumes its own duration; it is added to
// `used` so it is never re-selected. `tolerance` defaults to 3. With no options
// (`preferScore` constant 0, no `pinnedFirst`) this reproduces the prior
// behaviour: nearest within tolerance, else global nearest.
export function fillCurve(input: CurveInput): FillResult {
  const { tracks, startBpm, endBpm, targetMinutes } = input;
  const baseTol = input.tolerance ?? 3;
  const targetMs = targetMinutes * 60_000;
  const prefer = input.preferScore ?? (() => 0);
  const shape = input.shape ?? "ramp";

  const used = new Set<string>();
  const result: FilledTrack[] = [];
  let elapsed = 0;
  let widenedCount = 0;

  if (input.pinnedFirst) {
    // The pinned seed is a user choice, not an algorithmic stretch: its deviation
    // contributes to maxDeviation/avgDeviation but intentionally does NOT increment widenedCount.
    const pinned = input.pinnedFirst;
    result.push({
      track: pinned,
      target: startBpm,
      deviation: Math.abs(pinned.bpm - startBpm),
    });
    used.add(pinned.id);
    elapsed = pinned.durationMs;
  }

  while (elapsed < targetMs && hasUnusedPool(tracks, used)) {
    const target = targetBpmAt(elapsed, startBpm, endBpm, targetMs, shape);
    const pick =
      bestInTolerance(tracks, used, target, baseTol, prefer) ??
      nearestUnused(tracks, used, target, prefer);
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
