import { describe, it, expect } from "vitest";
import { targetBpmAt } from "@/lib/curve/fill";
import { fillCurve } from "@/lib/curve/fill";

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
});
