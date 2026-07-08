import { describe, it, expect } from "vitest";
import { targetBpmAt } from "@/lib/curve/fill";

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
