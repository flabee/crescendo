import { describe, it, expect, vi } from "vitest";
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

  it("isolates a throwing dep: one failing artist does not sink the expansion", async () => {
    const deps = {
      resolveId: async (n: string) => {
        if (n === "B") throw new Error("boom");
        return n === "Seed" ? 10 : 99;
      },
      related: async (id: number) => (id === 10 ? ["B", "C"] : ["Z"]),
      lastfm: async () => [],
    };
    // Seed -> B, C. Hop 2 resolves B (throws -> treated as null, no relations)
    // and C (id 99 -> ["Z"]). Expansion must still complete without rejecting.
    const g = await buildGraph("Seed", { hops: 2, deps });
    expect(g.map((n) => n.name).sort()).toEqual(["B", "C", "Seed", "Z"]);
  });

  it("does not duplicate the seed when its related list references itself", async () => {
    const deps = {
      resolveId: async () => 10,
      related: async () => ["Seed", "B"], // seed self-reference
      lastfm: async () => [],
    };
    const g = await buildGraph("Seed", { hops: 1, deps });
    expect(g.map((n) => n.name).sort()).toEqual(["B", "Seed"]);
  });

  it("still contributes Last.fm names when the seed resolves to no Deezer id", async () => {
    const deps = {
      resolveId: async () => null,
      related: async () => ["never"],
      lastfm: async () => ["X"],
    };
    const g = await buildGraph("Seed", { hops: 1, deps });
    expect(g.map((n) => n.name).sort()).toEqual(["Seed", "X"]);
  });

  it("returns [] for a blank seed (no node, no lookups)", async () => {
    const resolveId = vi.fn(async () => 10);
    const deps = { resolveId, related: async () => ["B"], lastfm: async () => [] };
    expect(await buildGraph("   ", { hops: 1, deps })).toEqual([]);
    expect(resolveId).not.toHaveBeenCalled();
  });

  it("caps the total collected set at maxNodes", async () => {
    const deps = {
      resolveId: async () => 10,
      related: async () => ["A", "B", "C", "D", "E"],
      lastfm: async () => [],
    };
    const g = await buildGraph("Seed", { hops: 1, deps, maxNodes: 3 });
    expect(g.length).toBe(3);
    expect(g[0].name).toBe("Seed"); // seed always kept
  });
});
