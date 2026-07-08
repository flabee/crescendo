import { describe, it, expect } from "vitest";
import { targetBpmAt, fillCurve } from "@/lib/curve/fill";

const t = (id: string, bpm: number, min: number): { id: string; bpm: number; durationMs: number } =>
  ({ id, bpm, durationMs: min * 60_000 });

describe("targetBpmAt", () => {
  const targetMs = 60_000; // 1 minute
  it("returns startBpm at elapsed 0", () => {
    expect(targetBpmAt(0, 100, 128, targetMs)).toBe(100);
  });
  it("returns endBpm at elapsed == targetMs", () => {
    expect(targetBpmAt(targetMs, 100, 128, targetMs)).toBe(128);
  });
  it("interpolates linearly at the midpoint", () => {
    expect(targetBpmAt(30_000, 100, 128, targetMs)).toBe(114);
  });
  it("supports descending ramps (wind-down)", () => {
    expect(targetBpmAt(30_000, 128, 100, targetMs)).toBe(114);
  });
});

describe("fillCurve", () => {
  it("picks tracks tracking the ramp and stops once the target duration is reached", () => {
    const tracks = [t("a", 100, 1), t("b", 114, 1), t("c", 128, 1), t("d", 100, 1)];
    const res = fillCurve({ tracks, startBpm: 100, endBpm: 128, targetMinutes: 2 });
    // targets: 0min -> 100 picks a; after 1min -> 114 picks b; elapsed now == 2min, loop stops.
    expect(res.tracks.map((x) => x.track.id)).toEqual(["a", "b"]);
    expect(res.achievedMs).toBe(2 * 60_000);
  });

  it("overshoots rather than undershoots when durations do not divide evenly", () => {
    // 1.5-min tracks, 2-min target: after a (1.5min) elapsed < target, so b is added, crossing to 3min.
    const tracks = [t("a", 100, 1.5), t("b", 100, 1.5)];
    const res = fillCurve({ tracks, startBpm: 100, endBpm: 100, targetMinutes: 2 });
    expect(res.tracks).toHaveLength(2);
    expect(res.achievedMs).toBe(3 * 60_000);
  });

  it("is deterministic: ties break by lowest id", () => {
    const tracks = [t("z", 100, 1), t("a", 100, 1)];
    const res = fillCurve({ tracks, startBpm: 100, endBpm: 100, targetMinutes: 1 });
    expect(res.tracks[0].track.id).toBe("a");
  });

  it("widens tolerance when nothing is within +/-3 and records widenedCount", () => {
    const tracks = [t("a", 100, 1), t("far", 140, 1)];
    const res = fillCurve({ tracks, startBpm: 100, endBpm: 100, targetMinutes: 2, tolerance: 3 });
    expect(res.tracks.map((x) => x.track.id)).toEqual(["a", "far"]);
    expect(res.fidelity.widenedCount).toBe(1); // "far" required widening past 3
  });

  it("uses uncapped nearest when even MAX_WIDEN misses", () => {
    const tracks = [t("a", 100, 1), t("way", 400, 1)];
    const res = fillCurve({ tracks, startBpm: 100, endBpm: 100, targetMinutes: 2 });
    expect(res.tracks.map((x) => x.track.id)).toEqual(["a", "way"]);
  });

  it("stops when tracks run out even if under target", () => {
    const tracks = [t("a", 100, 1)];
    const res = fillCurve({ tracks, startBpm: 100, endBpm: 100, targetMinutes: 10 });
    expect(res.tracks).toHaveLength(1);
    expect(res.achievedMs).toBe(60_000);
  });

  it("returns empty result for empty pool", () => {
    const res = fillCurve({ tracks: [], startBpm: 100, endBpm: 128, targetMinutes: 5 });
    expect(res.tracks).toEqual([]);
    expect(res.achievedMs).toBe(0);
    expect(res.fidelity.maxDeviation).toBe(0);
  });

  it("selects a mid-range stretch track and records it as widened (tolerance is a metric only)", () => {
    // Only reachable track sits at deviation 10 from a flat 100-BPM target:
    // outside base tolerance 3 but still selected, and counted as a stretch.
    const tracks = [t("a", 110, 1)];
    const res = fillCurve({ tracks, startBpm: 100, endBpm: 100, targetMinutes: 2, tolerance: 3 });
    expect(res.tracks.map((x) => x.track.id)).toEqual(["a"]);
    expect(res.fidelity.widenedCount).toBe(1);
    expect(res.tracks[0].deviation).toBeCloseTo(10);
  });

  it("returns empty result when targetMinutes is 0", () => {
    const tracks = [t("a", 100, 1), t("b", 114, 1)];
    const res = fillCurve({ tracks, startBpm: 100, endBpm: 128, targetMinutes: 0 });
    expect(res.tracks).toEqual([]);
    expect(res.achievedMs).toBe(0);
    expect(res.fidelity.maxDeviation).toBe(0);
    expect(res.fidelity.avgDeviation).toBe(0);
    expect(res.fidelity.widenedCount).toBe(0);
  });

  it("terminates on a zero-duration track and selects it exactly once", () => {
    // elapsed never advances, so termination relies on the used.size guard.
    const tracks = [t("a", 100, 0)];
    const res = fillCurve({ tracks, startBpm: 100, endBpm: 100, targetMinutes: 10 });
    expect(res.tracks.map((x) => x.track.id)).toEqual(["a"]);
    expect(res.achievedMs).toBe(0);
  });

  it("never selects a NaN-bpm track when a valid track exists", () => {
    // NaN-bpm tracks are silently skipped; the pool is pre-filtered upstream.
    const tracks = [t("bad", NaN, 1), t("good", 100, 1)];
    const res = fillCurve({ tracks, startBpm: 100, endBpm: 100, targetMinutes: 1 });
    expect(res.tracks.map((x) => x.track.id)).toEqual(["good"]);
  });
});

describe("fillCurve seed + familiarity", () => {
  const t = (id: string, bpm: number, min: number) => ({ id, bpm, durationMs: min * 60_000 });

  it("places pinnedFirst as track #1 and consumes its duration", () => {
    const seed = t("seed", 100, 1);
    const res = fillCurve({ tracks: [t("a", 114, 1)], startBpm: 100, endBpm: 128, targetMinutes: 2, pinnedFirst: seed });
    expect(res.tracks[0].track.id).toBe("seed");
    expect(res.tracks.map((x) => x.track.id)).toEqual(["seed", "a"]);
  });

  it("does not re-select the pinned track later", () => {
    const seed = t("seed", 100, 1);
    const res = fillCurve({ tracks: [seed, t("b", 100, 1)], startBpm: 100, endBpm: 100, targetMinutes: 3, pinnedFirst: seed });
    const ids = res.tracks.map((x) => x.track.id);
    expect(ids.filter((i) => i === "seed")).toHaveLength(1);
  });

  it("prefers higher preferScore among tracks within tolerance", () => {
    const res = fillCurve({
      tracks: [t("other", 101, 1), t("fam", 101, 1)],
      startBpm: 100, endBpm: 100, targetMinutes: 1,
      preferScore: (tr) => (tr.id === "fam" ? 1 : 0),
    });
    expect(res.tracks[0].track.id).toBe("fam");
  });

  it("preference does NOT override BPM proximity outside tolerance", () => {
    const res = fillCurve({
      tracks: [t("near", 100, 1), t("fam", 130, 1)],
      startBpm: 100, endBpm: 100, targetMinutes: 1, tolerance: 3,
      preferScore: (tr) => (tr.id === "fam" ? 100 : 0),
    });
    expect(res.tracks[0].track.id).toBe("near");
  });

  it("returns exactly [seed] with an empty pool and terminates", () => {
    const seed = t("seed", 100, 1);
    const res = fillCurve({ tracks: [], startBpm: 100, endBpm: 128, targetMinutes: 5, pinnedFirst: seed });
    expect(res.tracks.map((x) => x.track.id)).toEqual(["seed"]);
    expect(res.achievedMs).toBe(seed.durationMs);
  });

  it("returns just [seed] when the pinned duration already meets/exceeds the target", () => {
    const seed = t("seed", 100, 3); // 3 min pinned, 2 min target
    const res = fillCurve({ tracks: [t("a", 114, 1)], startBpm: 100, endBpm: 128, targetMinutes: 2, pinnedFirst: seed });
    expect(res.tracks.map((x) => x.track.id)).toEqual(["seed"]);
    expect(res.achievedMs).toBe(seed.durationMs);
  });

  it("uses preferScore as the secondary key on the stretch (global-nearest) path", () => {
    // Both tracks sit at deviation 30 from target (outside tol 3): equal-deviation
    // stretch, so preferScore breaks the tie in the global-nearest fallback.
    const res = fillCurve({
      tracks: [t("plain", 130, 1), t("fam", 130, 1)],
      startBpm: 100, endBpm: 100, targetMinutes: 1, tolerance: 3,
      preferScore: (tr) => (tr.id === "fam" ? 1 : 0),
    });
    expect(res.tracks[0].track.id).toBe("fam");
    expect(res.fidelity.widenedCount).toBe(1);
  });
});
