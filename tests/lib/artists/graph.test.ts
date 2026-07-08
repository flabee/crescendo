import { describe, it, expect } from "vitest";
import { buildGraph } from "@/lib/artists/graph";

describe("buildGraph", () => {
  it("expands 1 hop from the seed artist and includes the seed", async () => {
    const deps = {
      resolveId: async (n: string) => (n === "Seed" ? 10 : n === "B" ? 11 : 12),
      related: async (id: number) => (id === 10 ? ["B", "C"] : []),
      lastfm: async () => [],
    };
    const g = await buildGraph("Seed", { hops: 1, deps });
    expect(g.map((n) => n.name).sort()).toEqual(["B", "C", "Seed"]);
  });
  it("unions last.fm names when provided, de-duplicated case-insensitively", async () => {
    const deps = {
      resolveId: async () => 10,
      related: async () => ["B"],
      lastfm: async () => ["b", "D"], // 'b' dupes 'B'
    };
    const g = await buildGraph("Seed", { hops: 1, deps });
    expect(g.map((n) => n.name).sort()).toEqual(["B", "D", "Seed"]);
  });
  it("expands to 2 hops when requested", async () => {
    const deps = {
      resolveId: async (n: string) => ({ Seed: 10, B: 11 } as Record<string, number>)[n] ?? 99,
      related: async (id: number) => (id === 10 ? ["B"] : id === 11 ? ["E"] : []),
      lastfm: async () => [],
    };
    const g = await buildGraph("Seed", { hops: 2, deps });
    expect(g.map((n) => n.name).sort()).toEqual(["B", "E", "Seed"]);
  });
});
