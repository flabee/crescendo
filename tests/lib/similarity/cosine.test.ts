import { describe, it, expect } from "vitest";
import { cosineSimilarity, rankBySimilarity } from "@/lib/similarity/cosine";

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("returns -1 for opposite vectors", () => {
    expect(cosineSimilarity([1, 2, 3], [-1, -2, -3])).toBeCloseTo(-1);
  });

  it("is invariant to vector magnitude (only direction matters)", () => {
    const a = [1, 2, 3];
    const scaled = [10, 20, 30];
    const b = [3, 2, 1];
    expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(scaled, b));
  });

  it("returns 0 when either vector is all zeros", () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
    expect(cosineSimilarity([1, 2, 3], [0, 0, 0])).toBe(0);
  });

  it("throws on mismatched vector lengths", () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow(/length mismatch/i);
  });
});

describe("rankBySimilarity", () => {
  it("orders candidates from most to least similar to the seed", () => {
    const seed = [1, 0, 0];
    const candidates = [
      { item: "opposite", vector: [-1, 0, 0] },
      { item: "identical", vector: [1, 0, 0] },
      { item: "orthogonal", vector: [0, 1, 0] },
    ];
    const ranked = rankBySimilarity(seed, candidates);
    expect(ranked.map((r) => r.item)).toEqual(["identical", "orthogonal", "opposite"]);
    expect(ranked[0].score).toBeCloseTo(1);
    expect(ranked[1].score).toBeCloseTo(0);
    expect(ranked[2].score).toBeCloseTo(-1);
  });

  it("handles an empty candidate list", () => {
    expect(rankBySimilarity([1, 0], [])).toEqual([]);
  });

  it("keeps ties in input order (stable sort)", () => {
    const seed = [1, 1];
    // Identical vectors -> identical floating-point score, a true exact tie
    // (distinct-but-proportional vectors can differ in the last bit from
    // sqrt() rounding, which isn't what this test is checking).
    const candidates = [
      { item: "a", vector: [2, 2] },
      { item: "b", vector: [2, 2] },
    ];
    const ranked = rankBySimilarity(seed, candidates);
    expect(ranked.map((r) => r.item)).toEqual(["a", "b"]);
    expect(ranked[0].score).toBe(ranked[1].score);
  });
});
